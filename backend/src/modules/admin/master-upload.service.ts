import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { google } from 'googleapis';
import type { Readable } from 'node:stream';
import { AppConfigService } from 'src/config/app-config.service';

/**
 * Stores a master video in Drive, streaming it straight through.
 *
 * The bytes are piped from the request into Drive's resumable upload and are
 * never buffered in memory or written to the API's disk — a 400MB master would
 * otherwise mean 400MB of RAM, or a temp file on a host that may not have the
 * space. Nothing about the file is trusted at this stage beyond its size; the
 * worker probes the actual contents with ffprobe before anything is built from
 * it.
 */
@Injectable()
export class MasterUploadService {
  private readonly logger = new Logger(MasterUploadService.name);

  /** Containers the pipeline handles. MKV matters: it is what carries multi-audio and soft subtitles. */
  private static readonly ALLOWED_EXTENSIONS = new Set(['mkv', 'mp4', 'm4v', 'mov', 'webm', 'ts', 'avi']);

  constructor(private readonly config: AppConfigService) {}

  /**
   * A filename safe to hand to a storage API.
   *
   * The original is used only to recover an extension; everything else is
   * derived from ids we control. A name never reaches a shell — FFmpeg is
   * invoked with an argument array — but a traversal sequence or a control
   * character has no business in a stored object name either.
   */
  static safeName(original: string, prefix: string): { name: string; extension: string } {
    const base = original.split(/[\\/]/).pop() ?? '';
    const match = /\.([A-Za-z0-9]{1,5})$/.exec(base);
    const extension = (match?.[1] ?? '').toLowerCase();
    if (!extension) {
      // Guessing a container here would only move the failure to ffprobe,
      // forty minutes later and with a worse error.
      throw new BadRequestException(
        `“${base}” has no file extension, so its container is unknown. Use one of: ${[...MasterUploadService.ALLOWED_EXTENSIONS].join(', ')}.`,
      );
    }
    if (!MasterUploadService.ALLOWED_EXTENSIONS.has(extension)) {
      throw new BadRequestException(
        `“${extension}” is not a supported master container. Use one of: ${[...MasterUploadService.ALLOWED_EXTENSIONS].join(', ')}.`,
      );
    }
    return { name: `${prefix}.${extension}`, extension };
  }

  /**
   * Uploads a stream and returns the Drive file id.
   *
   * Masters live in their own folder, which the rendition cache never evicts
   * from — losing a master would mean losing the ability to rebuild anything.
   */
  async store(stream: Readable, originalName: string, prefix: string): Promise<{ driveFileId: string; name: string }> {
    const drive = this.client();
    const { name } = MasterUploadService.safeName(originalName, prefix);
    const folder = await this.mastersFolder(drive);

    // Re-uploading the same episode replaces its master rather than leaving an
    // orphan behind.
    const existing = await drive.files.list({
      q: `name='${name.replace(/'/g, "\\'")}' and '${folder}' in parents and trashed=false`,
      fields: 'files(id)',
    });

    const created = await drive.files.create({
      requestBody: { name, parents: [folder] },
      media: { body: stream },
      fields: 'id,size',
    });
    const driveFileId = created.data.id!;

    // Readable by link so the worker's read-only client can fetch it. The
    // worker authenticates as a different identity, and this is what lets it.
    await drive.permissions.create({ fileId: driveFileId, requestBody: { role: 'reader', type: 'anyone' } });

    for (const stale of existing.data.files ?? []) {
      if (stale.id && stale.id !== driveFileId) {
        await drive.files.delete({ fileId: stale.id }).catch(() => undefined);
      }
    }

    this.logger.log(`Stored master ${name} (${Math.round(Number(created.data.size ?? 0) / 1024 ** 2)} MB)`);
    return { driveFileId, name };
  }

  private async mastersFolder(drive: ReturnType<typeof google.drive>): Promise<string> {
    const name = process.env.MASTERS_FOLDER ?? 'AniZora masters';
    const found = await drive.files.list({
      q: `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
    });
    if (found.data.files?.[0]?.id) return found.data.files[0].id;
    const made = await drive.files.create({
      requestBody: { name, mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    });
    return made.data.id!;
  }

  /**
   * Uploads are owned by the OAuth account, not the service account: a service
   * account has no Drive storage quota of its own, so anything it creates has
   * nowhere to live.
   */
  private client() {
    const drive = this.config.values.drive;
    if (!drive.clientId || !drive.clientSecret || !drive.refreshToken) {
      throw new ServiceUnavailableException(
        'Master upload needs GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET and GOOGLE_DRIVE_REFRESH_TOKEN. ' +
          'Paste an existing Drive link instead, or configure them — see docs/MEDIA_WORKER_DEPLOYMENT.md.',
      );
    }
    const auth = new google.auth.OAuth2(drive.clientId, drive.clientSecret);
    auth.setCredentials({ refresh_token: drive.refreshToken });
    return google.drive({ version: 'v3', auth });
  }
}
