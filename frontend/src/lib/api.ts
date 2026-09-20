import { apiBase, isServer } from './config';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  token?: string | null;
  /** Next.js fetch cache hints, only meaningful on the server. */
  revalidate?: number | false;
  tags?: string[];
}

/**
 * How long any single API call may take before it is aborted. Long enough for
 * an ordinary slow response, short enough that a sleeping backend fails fast
 * and fallbacks render instead of the platform killing the request.
 */
const API_TIMEOUT_MS = (() => {
  const configured = Number(process.env.API_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 20_000;
})();

function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return fallback;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, token, revalidate, tags, headers, ...rest } = options;

  const init: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } } = {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Server-side renders identify themselves so the API does not rate-limit
      // the whole audience as one IP. Never set in the browser bundle.
      ...(isServer && process.env.INTERNAL_API_TOKEN ? { 'x-internal-token': process.env.INTERNAL_API_TOKEN } : {}),
      ...(headers as Record<string, string> | undefined),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  if (revalidate !== undefined || tags) {
    init.next = { ...(revalidate !== undefined ? { revalidate } : {}), ...(tags ? { tags } : {}) };
  } else if (!rest.cache) {
    init.cache = 'no-store';
  }

  // A hosted API that has spun down (every free tier does) accepts the
  // connection and then stays silent, so a fetch with no timeout hangs
  // indefinitely: during a build the platform kills the whole route instead of
  // letting the caller's fallback run, and at runtime the request just stalls.
  // A timeout turns both cases into an ordinary error that the existing
  // .catch()/safe() fallbacks already handle.
  if (!init.signal && API_TIMEOUT_MS > 0) {
    init.signal = AbortSignal.timeout(API_TIMEOUT_MS);
  }

  const response = await fetch(`${apiBase()}${path}`, init);

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, extractMessage(parsed, response.statusText), parsed);
  }

  return parsed as T;
}

/**
 * Server-component helper: returns null instead of throwing when the resource
 * is missing, so a page can call `notFound()` rather than crashing the render.
 */
export async function apiFetchOrNull<T>(path: string, options: RequestOptions = {}): Promise<T | null> {
  try {
    return await apiFetch<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** Builds a query string, dropping empty values so URLs stay clean. */
export function qs(params: Record<string, string | number | boolean | string[] | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}
