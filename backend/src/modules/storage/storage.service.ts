import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from 'cloudinary';
import { imageSize } from 'image-size';
import { randomToken } from 'src/common/utils/crypto.util';
import { AppConfigService } from 'src/config/app-config.service';

export type UploadKind = 'poster' | 'banner' | 'thumbnail' | 'avatar' | 'subtitle';

export interface StoredFile {
  url: string;
  path: string;
  sizeBytes: number;
  mimeType: string;
}

/** Whitelist per upload kind — the extension alone is never trusted. */
const ALLOWED: Record<UploadKind, string[]> = {
  poster: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  banner: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  thumbnail: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  avatar: ['image/jpeg', 'image/png', 'image/webp'],
  subtitle: ['text/vtt', 'text/plain', 'application/x-subrip', 'application/octet-stream'],
};

/**
 * Shape rules per image kind. A poster that is actually a wide screenshot, or a
 * banner that is a portrait, would be cropped badly everywhere it is shown, so
 * it is rejected at upload with a message saying what is expected.
 */
const DIMENSIONS: Partial<Record<UploadKind, { minWidth: number; minHeight: number; shape: 'portrait' | 'landscape' | 'any'; hint: string }>> = {
  poster: { minWidth: 300, minHeight: 420, shape: 'portrait', hint: 'a portrait image, about 2:3 (e.g. 600×900)' },
  banner: { minWidth: 960, minHeight: 300, shape: 'landscape', hint: 'a wide image (e.g. 1600×600 or 1920×1080)' },
  thumbnail: { minWidth: 320, minHeight: 180, shape: 'landscape', hint: 'a 16:9 image (e.g. 1280×720)' },
  avatar: { minWidth: 64, minHeight: 64, shape: 'any', hint: 'at least 64×64' },
};

const EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'text/vtt': '.vtt',
  'application/x-subrip': '.srt',
};

/**
 * Storage abstraction.
 *
 * Only the local driver is implemented, which is all the platform needs to run.
 * Swapping to S3/R2 later means adding one branch here — nothing that stores a
 * URL elsewhere in the codebase has to change.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly config: AppConfigService) {}

  async onModuleInit(): Promise<void> {
    const { storage } = this.config.values;

    if (storage.driver === 'local') {
      await mkdir(this.baseDir(), { recursive: true });
      return;
    }

    if (storage.driver === 'cloudinary') {
      const { cloudName, apiKey, apiSecret } = storage.cloudinary;
      if (!cloudName || !apiKey || !apiSecret) {
        // Fail at boot rather than at the first upload, which would otherwise
        // only surface when an administrator tries to save an image.
        throw new Error(
          'STORAGE_DRIVER=cloudinary requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
        );
      }
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
      this.logger.log(`Uploads go to Cloudinary (cloud "${cloudName}", folder "${storage.cloudinary.folder}")`);
    }
  }

  async save(
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    kind: UploadKind,
  ): Promise<StoredFile> {
    const { storage } = this.config.values;

    if (file.size > storage.maxUploadBytes) {
      throw new BadRequestException(
        `File is too large. The limit is ${Math.round(storage.maxUploadBytes / 1024 / 1024)} MB.`,
      );
    }

    const mimeType = this.resolveMime(file, kind);
    if (!ALLOWED[kind].includes(mimeType)) {
      throw new BadRequestException(`${mimeType} is not an accepted file type for a ${kind}`);
    }

    this.assertDimensions(file.buffer, kind);

    if (storage.driver === 'cloudinary') {
      return this.saveToCloudinary(file, kind, mimeType);
    }

    if (storage.driver === 's3') {
      throw new BadRequestException(
        'STORAGE_DRIVER=s3 is configured but the S3 driver is not enabled in this build. Use STORAGE_DRIVER=local or cloudinary.',
      );
    }

    const ext = EXTENSION[mimeType] ?? extname(file.originalname).toLowerCase() ?? '';
    const name = `${Date.now().toString(36)}-${randomToken(8)}${ext}`;
    const relative = `${kind}s/${name}`;
    const target = join(this.baseDir(), relative);

    await mkdir(join(this.baseDir(), `${kind}s`), { recursive: true });
    await writeFile(target, file.buffer);

    return {
      url: `${this.config.values.storage.publicBaseUrl}/${relative}`,
      path: relative,
      sizeBytes: file.size,
      mimeType,
    };
  }

  /**
   * Uploads to Cloudinary, which is what hosted free tiers need: their
   * container filesystems are wiped on every deploy, so `local` would silently
   * lose every poster and banner.
   *
   * `path` holds Cloudinary's `public_id` rather than a filesystem path, which
   * is what lets `remove()` delete the real asset instead of leaking it.
   */
  private async saveToCloudinary(
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    kind: UploadKind,
    mimeType: string,
  ): Promise<StoredFile> {
    const { folder } = this.config.values.storage.cloudinary;
    // Subtitles are text, not images: Cloudinary stores those as `raw`.
    const isImage = kind !== 'subtitle';
    const ext = EXTENSION[mimeType] ?? extname(file.originalname).toLowerCase() ?? '';
    const base = `${Date.now().toString(36)}-${randomToken(8)}`;

    const options: UploadApiOptions = {
      folder: `${folder}/${kind}s`,
      // Images keep no extension: Cloudinary appends the delivered format.
      public_id: isImage ? base : `${base}${ext}`,
      resource_type: isImage ? 'image' : 'raw',
      overwrite: false,
      // The bytes have already been sniffed and validated above; do not let
      // Cloudinary infer a different type from the filename.
      use_filename: false,
      unique_filename: false,
    };

    const result = await new Promise<UploadApiResponse>((done, fail) => {
      const stream = cloudinary.uploader.upload_stream(options, (error, response) => {
        if (error || !response) fail(error ?? new Error('Cloudinary returned no response'));
        else done(response);
      });
      stream.end(file.buffer);
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Cloudinary upload failed: ${message}`);
      throw new BadRequestException('The image could not be stored. Please try again.');
    });

    return {
      url: result.secure_url,
      path: result.public_id,
      sizeBytes: result.bytes ?? file.size,
      mimeType,
    };
  }

  private assertDimensions(buffer: Buffer, kind: UploadKind): void {
    const rule = DIMENSIONS[kind];
    if (!rule) return;

    let width = 0;
    let height = 0;
    try {
      ({ width, height } = imageSize(buffer));
    } catch {
      throw new BadRequestException('Could not read the image dimensions. Is the file corrupt?');
    }

    if (width < rule.minWidth || height < rule.minHeight) {
      throw new BadRequestException(
        `Image is ${width}×${height}px, which is too small for a ${kind}. Use ${rule.hint}.`,
      );
    }
    if (rule.shape === 'portrait' && height <= width) {
      throw new BadRequestException(`A ${kind} must be taller than it is wide (got ${width}×${height}). Use ${rule.hint}.`);
    }
    if (rule.shape === 'landscape' && width <= height) {
      throw new BadRequestException(`A ${kind} must be wider than it is tall (got ${width}×${height}). Use ${rule.hint}.`);
    }
  }

  async remove(relativePath: string): Promise<void> {
    const { driver } = this.config.values.storage;

    if (driver === 'cloudinary') {
      // `relativePath` is the stored public_id. Raw assets carry their
      // extension and must be destroyed with a matching resource_type.
      const isRaw = /\.(vtt|srt)$/i.test(relativePath);
      try {
        await cloudinary.uploader.destroy(relativePath, { resource_type: isRaw ? 'raw' : 'image' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        this.logger.warn(`Could not delete ${relativePath} from Cloudinary: ${message}`);
      }
      return;
    }

    if (driver !== 'local') return;
    const base = this.baseDir();
    const target = resolve(base, relativePath.replace(/^\/+/, ''));
    // Never follow a stored path outside the uploads directory.
    if (!target.startsWith(base)) {
      this.logger.warn(`Refused to delete outside the uploads root: ${relativePath}`);
      return;
    }
    try {
      await unlink(target);
    } catch {
      this.logger.debug(`Could not delete ${relativePath} (already gone?)`);
    }
  }

  /**
   * Magic-byte sniffing. The browser-supplied Content-Type is advisory only, so
   * an image upload that is really a script is rejected here rather than being
   * served back later.
   */
  private resolveMime(file: { buffer: Buffer; mimetype: string }, kind: UploadKind): string {
    if (kind === 'subtitle') return file.mimetype || 'text/vtt';

    const b = file.buffer;
    if (b.length >= 12) {
      if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
      if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
      if (b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') {
        return 'image/webp';
      }
      if (b.subarray(4, 8).toString('ascii') === 'ftyp' && b.subarray(8, 12).toString('ascii').startsWith('avif')) {
        return 'image/avif';
      }
    }
    throw new BadRequestException('That file does not look like a supported image');
  }

  private baseDir(): string {
    return resolve(this.config.values.storage.localPath);
  }
}
