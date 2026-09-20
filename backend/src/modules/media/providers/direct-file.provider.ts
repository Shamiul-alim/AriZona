import { Injectable, Logger } from '@nestjs/common';
import { MediaProvider } from '@prisma/client';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
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
  parseRange,
} from './media-provider.interface';

/**
 * Serves media from an HTTP(S) origin or from the local uploads directory.
 *
 * Doubles as the OBJECT_STORAGE adapter: an S3/R2/Bunny object is just an HTTPS
 * URL, so migrating off Drive later means writing storage URLs into
 * MediaVariant.directUrl and flipping the provider column — no code change.
 */
@Injectable()
export class DirectFileProvider implements MediaProviderAdapter {
  readonly provider = MediaProvider.DIRECT_FILE;
  readonly proxied = true;

  private readonly logger = new Logger(DirectFileProvider.name);

  constructor(private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    return true;
  }

  async probe(ref: MediaRef): Promise<MediaFileInfo> {
    const url = this.requireUrl(ref);

    if (isLocalPath(url)) {
      const path = this.resolveLocal(url);
      try {
        const stats = await stat(path);
        return { sizeBytes: stats.size, mimeType: ref.mimeType ?? guessMime(path) };
      } catch {
        throw new MediaNotFoundError(`Local media file not found: ${url}`);
      }
    }

    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) {
      throw new MediaNotFoundError(`Origin responded ${response.status} for ${url}`);
    }
    const length = response.headers.get('content-length');
    return {
      sizeBytes: length ? Number(length) : null,
      mimeType: response.headers.get('content-type') ?? ref.mimeType ?? 'video/mp4',
    };
  }

  async openStream(ref: MediaRef, options: OpenStreamOptions): Promise<MediaStreamResult> {
    const url = this.requireUrl(ref);
    return isLocalPath(url) ? this.streamLocal(url, ref, options) : this.streamRemote(url, ref, options);
  }

  private async streamLocal(url: string, ref: MediaRef, options: OpenStreamOptions): Promise<MediaStreamResult> {
    const path = this.resolveLocal(url);
    const info = await this.probe(ref);
    const size = info.sizeBytes ?? 0;
    const range = parseRange(options.range, size);

    const headers: Record<string, string> = {
      'Content-Type': info.mimeType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    };

    if (!range) {
      headers['Content-Length'] = String(size);
      return { stream: createReadStream(path), status: 200, headers };
    }

    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
    headers['Content-Length'] = String(range.end - range.start + 1);
    return {
      stream: createReadStream(path, { start: range.start, end: range.end }),
      status: 206,
      headers,
    };
  }

  private async streamRemote(url: string, ref: MediaRef, options: OpenStreamOptions): Promise<MediaStreamResult> {
    const requestHeaders: Record<string, string> = {};
    if (options.range) requestHeaders.Range = options.range;

    const response = await fetch(url, { headers: requestHeaders, signal: options.signal });
    if (!response.ok && response.status !== 206) {
      throw new MediaNotFoundError(`Origin responded ${response.status} for ${url}`);
    }
    if (!response.body) {
      throw new MediaNotFoundError(`Origin returned an empty body for ${url}`);
    }

    const headers: Record<string, string> = {
      'Content-Type': response.headers.get('content-type') ?? ref.mimeType ?? 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    };
    const contentRange = response.headers.get('content-range');
    const contentLength = response.headers.get('content-length');
    if (contentRange) headers['Content-Range'] = contentRange;
    if (contentLength) headers['Content-Length'] = contentLength;

    return {
      stream: Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      status: response.status === 206 ? 206 : 200,
      headers,
    };
  }

  private requireUrl(ref: MediaRef): string {
    if (!ref.directUrl) {
      throw new MediaProviderNotConfiguredError(this.provider, 'no direct URL is set on this variant');
    }
    return ref.directUrl;
  }

  /**
   * Local references are always resolved *inside* the uploads directory. A
   * `../` in the stored value can therefore never reach the wider filesystem.
   */
  private resolveLocal(url: string): string {
    const nodePath = require('node:path') as typeof import('node:path');
    const base = nodePath.resolve(this.config.values.storage.localPath);
    const relative = url.replace(/^\/?uploads\/?/, '').replace(/^\/+/, '');
    const resolved = nodePath.resolve(base, relative);
    if (!resolved.startsWith(base)) {
      this.logger.warn(`Blocked path traversal attempt: ${url}`);
      throw new MediaNotFoundError('Invalid media path');
    }
    return resolved;
  }
}

function isLocalPath(url: string): boolean {
  return !/^https?:\/\//i.test(url);
}

function guessMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    vtt: 'text/vtt',
    srt: 'application/x-subrip',
  };
  return (ext && map[ext]) || 'application/octet-stream';
}
