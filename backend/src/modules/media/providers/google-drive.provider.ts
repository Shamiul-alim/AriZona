import { Injectable, Logger } from '@nestjs/common';
import { MediaProvider } from '@prisma/client';
import { google, drive_v3 } from 'googleapis';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { AppConfigService } from 'src/config/app-config.service';
import {
  MediaFileInfo,
  MediaNotFoundError,
  MediaProviderAdapter,
  MediaProviderNotConfiguredError,
  MediaRef,
  MediaStreamResult,
  OpenStreamOptions,
} from './media-provider.interface';

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

/**
 * Streams Google Drive files through the official Drive v3 API.
 *
 * WHY A PROXY RATHER THAN AN IFRAME
 * ---------------------------------
 * Drive's /preview iframe cannot be controlled by our code: no currentTime, no
 * quality switching, no mid-roll ad insertion, no progress tracking. Rather
 * than ship buttons that only look functional, this provider calls
 * `files.get?alt=media` — a documented endpoint that honours HTTP Range — and
 * relays the bytes with correct 206/Content-Range headers. The browser then
 * sees an ordinary seekable video source and every player feature works for
 * real.
 *
 * WHAT THIS DOES *NOT* DO
 * -----------------------
 * No scraping, no `uc?export=download` confirm-token tricks, no undocumented
 * endpoints, and no attempt to bypass any Drive access control. Files must be
 * shared with the configured identity through normal Drive permissions.
 *
 * KNOWN LIMITS (documented in docs/GOOGLE_DRIVE.md)
 * ------------------------------------------------
 *  * Drive enforces per-file and per-project download quotas. It is a file
 *    store, not a CDN — fine for launch and low traffic, not for scale.
 *  * A progressive MP4 carries a single audio track, so alternative audio is
 *    modelled as a separate MediaSource rather than an in-container track.
 *  * There is no adaptive bitrate. Quality switching selects a different file
 *    and the player restores the playback position across the swap.
 */
@Injectable()
export class GoogleDriveProvider implements MediaProviderAdapter {
  readonly provider = MediaProvider.GOOGLE_DRIVE;
  readonly proxied = true;

  private readonly logger = new Logger(GoogleDriveProvider.name);
  private client: drive_v3.Drive | null = null;
  private clientPromise: Promise<drive_v3.Drive> | null = null;

  /** fileId -> metadata. Drive metadata is immutable enough to cache freely. */
  private readonly metaCache = new Map<string, { info: MediaFileInfo; at: number }>();
  private static readonly META_TTL_MS = 30 * 60 * 1000;

  constructor(private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    const drive = this.config.values.drive;
    if (!drive.enabled) return false;
    if (drive.authMode === 'service_account') {
      return Boolean(drive.serviceAccountFile || drive.serviceAccountJsonBase64);
    }
    return Boolean(drive.clientId && drive.clientSecret && drive.refreshToken);
  }

  async probe(ref: MediaRef): Promise<MediaFileInfo> {
    const fileId = this.requireFileId(ref);

    const cached = this.metaCache.get(fileId);
    if (cached && Date.now() - cached.at < GoogleDriveProvider.META_TTL_MS) {
      return cached.info;
    }

    const drive = await this.getClient();
    try {
      const response = await drive.files.get({
        fileId,
        fields: 'id,name,size,mimeType,videoMediaMetadata(durationMillis,width,height)',
        supportsAllDrives: true,
      });

      const data = response.data;
      const info: MediaFileInfo = {
        sizeBytes: data.size ? Number(data.size) : null,
        mimeType: data.mimeType ?? 'video/mp4',
        name: data.name ?? undefined,
      };
      this.metaCache.set(fileId, { info, at: Date.now() });
      return info;
    } catch (error) {
      throw this.translate(error, fileId);
    }
  }

  async openStream(ref: MediaRef, options: OpenStreamOptions): Promise<MediaStreamResult> {
    const fileId = this.requireFileId(ref);
    const drive = await this.getClient();
    const info = await this.probe(ref);

    // The Range header is forwarded untouched; Drive answers 206 with its own
    // Content-Range, which we relay so the browser's seek bar stays accurate.
    const headers: Record<string, string> = {};
    if (options.range) headers.Range = options.range;

    try {
      const response = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream', headers, signal: options.signal },
      );

      const upstream = response.data as unknown as Readable;
      const status = response.status === 206 ? 206 : 200;

      const out: Record<string, string> = {
        'Content-Type': info.mimeType || 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=0, no-store',
      };

      const contentRange = headerOf(response.headers, 'content-range');
      const contentLength = headerOf(response.headers, 'content-length');
      if (contentRange) out['Content-Range'] = contentRange;
      if (contentLength) out['Content-Length'] = contentLength;
      else if (status === 200 && info.sizeBytes) out['Content-Length'] = String(info.sizeBytes);

      return { stream: upstream, status, headers: out };
    } catch (error) {
      throw this.translate(error, fileId);
    }
  }

  /**
   * Accepts a bare file ID or any of the Drive share-URL shapes, so the admin
   * can paste whatever Drive gave them.
   */
  static extractFileId(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;

    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,
      /[?&]id=([a-zA-Z0-9_-]+)/,
      /\/d\/([a-zA-Z0-9_-]+)/,
      /\/open\?id=([a-zA-Z0-9_-]+)/,
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(trimmed);
      if (match) return match[1];
    }
    return null;
  }

  private requireFileId(ref: MediaRef): string {
    if (!ref.driveFileId) {
      throw new MediaProviderNotConfiguredError(this.provider, 'no Drive file ID is set on this variant');
    }
    return ref.driveFileId;
  }

  private async getClient(): Promise<drive_v3.Drive> {
    if (this.client) return this.client;
    if (!this.clientPromise) {
      this.clientPromise = this.buildClient().then((client) => {
        this.client = client;
        return client;
      });
    }
    return this.clientPromise;
  }

  private async buildClient(): Promise<drive_v3.Drive> {
    const cfg = this.config.values.drive;

    if (!cfg.enabled) {
      throw new MediaProviderNotConfiguredError(this.provider, 'GOOGLE_DRIVE_ENABLED is false');
    }

    // `google.auth.*` is used rather than importing from google-auth-library
    // directly: googleapis bundles its own copy of that package, and mixing the
    // two produces incompatible structural types.
    if (cfg.authMode === 'service_account') {
      const credentials = await this.loadServiceAccount();
      const auth = new google.auth.GoogleAuth({ credentials, scopes: DRIVE_SCOPES });
      this.logger.log(`Drive client ready (service account: ${credentials.client_email})`);
      return google.drive({ version: 'v3', auth });
    }

    if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken) {
      throw new MediaProviderNotConfiguredError(
        this.provider,
        'GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET and GOOGLE_DRIVE_REFRESH_TOKEN are all required in oauth mode',
      );
    }
    const oauth = new google.auth.OAuth2({ clientId: cfg.clientId, clientSecret: cfg.clientSecret });
    oauth.setCredentials({ refresh_token: cfg.refreshToken });
    this.logger.log('Drive client ready (OAuth refresh token)');
    return google.drive({ version: 'v3', auth: oauth });
  }

  private async loadServiceAccount(): Promise<{ client_email: string; private_key: string }> {
    const cfg = this.config.values.drive;
    let raw: string;

    if (cfg.serviceAccountJsonBase64) {
      raw = Buffer.from(cfg.serviceAccountJsonBase64, 'base64').toString('utf8');
    } else if (cfg.serviceAccountFile) {
      try {
        raw = await readFile(cfg.serviceAccountFile, 'utf8');
      } catch {
        throw new MediaProviderNotConfiguredError(
          this.provider,
          `could not read the service-account key at ${cfg.serviceAccountFile}`,
        );
      }
    } else {
      throw new MediaProviderNotConfiguredError(
        this.provider,
        'set GOOGLE_SERVICE_ACCOUNT_FILE or GOOGLE_SERVICE_ACCOUNT_JSON_BASE64',
      );
    }

    try {
      const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
      if (!parsed.client_email || !parsed.private_key) {
        throw new Error('missing client_email/private_key');
      }
      return { client_email: parsed.client_email, private_key: parsed.private_key };
    } catch (error) {
      throw new MediaProviderNotConfiguredError(
        this.provider,
        `the service-account key is not valid JSON (${(error as Error).message})`,
      );
    }
  }

  private translate(error: unknown, fileId: string): Error {
    const status = (error as { code?: number; status?: number })?.code ?? (error as { status?: number })?.status;

    if (status === 404) {
      return new MediaNotFoundError(
        `Drive file ${fileId} was not found, or it has not been shared with the configured account`,
      );
    }
    if (status === 403) {
      return new MediaNotFoundError(
        `Drive denied access to ${fileId}. Share the file with the service account, or check the download quota.`,
      );
    }
    if (error instanceof MediaProviderNotConfiguredError || error instanceof MediaNotFoundError) {
      return error;
    }
    this.logger.error(`Drive request failed for ${fileId}: ${(error as Error).message}`);
    return error as Error;
  }
}

function headerOf(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;
  const record = headers as Record<string, unknown> & { get?: (k: string) => string | null };
  if (typeof record.get === 'function') {
    return record.get(name) ?? undefined;
  }
  const value = record[name] ?? record[name.toLowerCase()];
  if (Array.isArray(value)) return String(value[0]);
  return value === undefined ? undefined : String(value);
}
