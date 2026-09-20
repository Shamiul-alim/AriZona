import { MediaProvider } from '@prisma/client';
import { Readable } from 'node:stream';

/** Everything a provider needs to locate one physical file. */
export interface MediaRef {
  driveFileId?: string | null;
  directUrl?: string | null;
  mimeType?: string | null;
}

export interface MediaFileInfo {
  sizeBytes: number | null;
  mimeType: string;
  name?: string;
}

export interface OpenStreamOptions {
  /** Raw HTTP Range header forwarded verbatim from the browser. */
  range?: string;
  /** Aborts the upstream request when the client disconnects mid-seek. */
  signal?: AbortSignal;
}

export interface MediaStreamResult {
  stream: Readable;
  status: 200 | 206;
  headers: Record<string, string>;
}

/**
 * Contract every storage backend implements.
 *
 * Adding a new backend (S3, Bunny, self-hosted HLS) means writing one class
 * that satisfies this interface and registering it — no schema migration, no
 * controller change, no frontend change. This is what makes the
 * "my Drive -> client Drive -> CDN" migration path cheap.
 */
export interface MediaProviderAdapter {
  readonly provider: MediaProvider;

  /**
   * True when the media is streamed through our own backend, which is what
   * gives the player byte-accurate seeking and progress tracking.
   * False for HLS (the player fetches segments itself) and for EXTERNAL_EMBED
   * (we have no control at all).
   */
  readonly proxied: boolean;

  /** False when the operator has not supplied the required credentials yet. */
  isConfigured(): boolean;

  /** Size and MIME type, used to answer Range requests correctly. */
  probe(ref: MediaRef): Promise<MediaFileInfo>;

  openStream(ref: MediaRef, options: OpenStreamOptions): Promise<MediaStreamResult>;
}

export class MediaProviderNotConfiguredError extends Error {
  constructor(provider: MediaProvider, detail: string) {
    super(`Media provider ${provider} is not configured: ${detail}`);
    this.name = 'MediaProviderNotConfiguredError';
  }
}

export class MediaNotFoundError extends Error {
  constructor(message = 'The media file could not be found at its configured location') {
    super(message);
    this.name = 'MediaNotFoundError';
  }
}

/**
 * Parses a single-range `bytes=start-end` header against a known file size.
 * Returns null for an absent header, and throws for a syntactically valid but
 * unsatisfiable range so the caller can answer 416.
 */
export function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return null;

  let start: number;
  let end: number;

  if (rawStart === '') {
    // Suffix form: the last N bytes.
    const suffix = Number(rawEnd);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    throw new RangeError('Requested range is not satisfiable');
  }
  return { start, end };
}
