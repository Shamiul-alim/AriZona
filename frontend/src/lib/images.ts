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
