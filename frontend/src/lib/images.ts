import { PUBLIC_API_URL } from './config';

/**
 * Hosts whose images may be routed through the Next.js image optimizer.
 *
 * These mirror `remotePatterns` in next.config.ts: our own API/storage origins.
 * Everything else — an artwork URL an administrator pasted from a third-party
 * host — is loaded by the browser directly instead (see `SmartImage`). That is
 * deliberate: widening `remotePatterns` to every host would turn
 * `/_next/image?url=…` into an open image proxy that anyone could point at any
 * URL on the internet.
 */
function allowedHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const candidate of [PUBLIC_API_URL, process.env.NEXT_PUBLIC_STORAGE_URL]) {
    if (!candidate) continue;
    try {
      hosts.add(new URL(candidate).host);
    } catch {
      // A malformed origin simply contributes no host.
    }
  }
  return hosts;
}

const ALLOWED = allowedHosts();

/**
 * True when Next.js may optimize this source: our own relative `/uploads/...`
 * paths and our configured origins. False for foreign hosts, which must be
 * rendered unoptimized.
 */
export function isOptimizableSrc(src: string): boolean {
  if (!src) return false;
  if (src.startsWith('data:') || src.startsWith('blob:')) return false;
  if (src.startsWith('/')) return true;
  try {
    return ALLOWED.has(new URL(src).host);
  } catch {
    return false;
  }
}

/**
 * An optimizer URL for an image that cannot be a `next/image` element.
 *
 * A `<video poster>` is an attribute, not a component, so it bypasses
 * `next/image` entirely and the browser fetches whatever the API stored — a
 * 1.5MB banner, before the video has even been asked to play, on a page whose
 * whole job is to start playing quickly. Pointing the attribute at the
 * optimizer gives the same picture at a fraction of the bytes, in AVIF or WebP
 * where the browser supports it.
 *
 * Returns the source untouched when it is not ours to optimize, which keeps the
 * optimizer from being used as a proxy for arbitrary URLs.
 */
export function optimizedImageUrl(src: string | null | undefined, width = 1200, quality = 70): string | undefined {
  if (!src) return undefined;
  if (!isOptimizableSrc(src)) return src;
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
}
