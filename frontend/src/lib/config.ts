/**
 * Runtime configuration.
 *
 * Server components talk to the backend over the internal Docker network,
 * browsers use the public URL. Getting these the wrong way round is the classic
 * containerised-Next.js bug, so they are resolved in exactly one place.
 */

export const isServer = typeof window === 'undefined';

export const PUBLIC_API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(/\/$/, '');

const INTERNAL_API_URL = (process.env.INTERNAL_API_URL ?? PUBLIC_API_URL).replace(/\/$/, '');

/** Base URL appropriate to wherever this code is currently executing. */
export function apiBase(): string {
  return isServer ? INTERNAL_API_URL : PUBLIC_API_URL;
}

export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'AniZora';
/**
 * Absolute public origin, used for metadataBase, canonical links and Open
 * Graph tags. Guaranteed to be a valid absolute URL.
 *
 * `??` is not enough here: an environment variable that exists but is EMPTY is
 * a string, so it slips past the nullish check and produces `new URL('')`,
 * which throws ERR_INVALID_URL and fails the production build. Hosts create
 * empty variables easily, so every candidate is trimmed and validated.
 *
 * Vercel injects VERCEL_URL (the deployment host, without a scheme)
 * automatically, so a deployment works without anyone hardcoding its URL.
 */
function resolveSiteUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_VERCEL_URL,
    process.env.VERCEL_URL,
  ];

  for (const raw of candidates) {
    const value = raw?.trim();
    if (!value) continue;
    // VERCEL_URL has no scheme; everything else usually does.
    const absolute = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      return new URL(absolute).origin;
    } catch {
      // Malformed value: try the next candidate rather than failing the build.
    }
  }

  return 'http://localhost:3000';
}

export const SITE_URL = resolveSiteUrl();
export const SITE_TAGLINE = 'Stream anime in stunning quality';

export const ADS = {
  enabled: process.env.NEXT_PUBLIC_ADS_ENABLED === 'true',
  client: process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID ?? '',
  testMode: process.env.NEXT_PUBLIC_ADSENSE_TEST_MODE !== 'false',
};

export const VIDEO_ADS = {
  enabled: process.env.NEXT_PUBLIC_VIDEO_ADS_ENABLED === 'true',
  vastTagUrl: process.env.NEXT_PUBLIC_IMA_VAST_TAG_URL ?? '',
};

/**
 * Adsterra popunder.
 *
 * Deliberately the popunder format and nothing else: it renders no markup on
 * the page, and the advert opens in its own window on a qualifying click while
 * AniZora stays open. `popunderSrc` is the invoke script URL from the Adsterra
 * dashboard — it is account-specific, so it is configuration, never source.
 *
 * These are NEXT_PUBLIC_* values inlined at build time (the same as the
 * AdSense settings above), so changing them needs a frontend rebuild.
 */
/**
 * Accepts either a bare URL or the whole `<script src="…"></script>` snippet
 * that the ad dashboard hands you.
 *
 * Pasting the entire tag is the obvious thing to do, and it fails silently:
 * the value lands in `script.src`, the browser resolves it as a relative path,
 * and the request 404s with no error anywhere. Extracting the URL costs one
 * regex and removes a whole class of "the ads just don't work" reports.
 * Anything that is not an http(s) URL is discarded rather than requested.
 */
export function adScriptUrl(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) return '';
  const fromTag = /src\s*=\s*["']([^"']+)["']/i.exec(value);
  const candidate = (fromTag ? fromTag[1] : value).trim();
  // Protocol-relative URLs are common in ad snippets.
  const absolute = candidate.startsWith('//') ? `https:${candidate}` : candidate;
  try {
    const url = new URL(absolute);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

/** Positive number, or the fallback. Empty strings are not nullish, so `??` is not enough. */
export function positiveNumber(raw: string | undefined, fallback: number): number {
  const value = Number(raw?.trim());
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const ADSTERRA = {
  enabled: process.env.NEXT_PUBLIC_ADSTERRA_ENABLED === 'true',
  popunderSrc: adScriptUrl(process.env.NEXT_PUBLIC_ADSTERRA_POPUNDER_SRC),
  /** Hours before the same browser may arm the popunder again. */
  frequencyHours: positiveNumber(process.env.NEXT_PUBLIC_ADSTERRA_FREQUENCY_HOURS, 12),
};

/**
 * Media URLs arrive from the API already signed and absolute. When the backend
 * is addressed internally (SSR inside Docker) those URLs still point at the
 * public origin, which is correct — the browser is what fetches them.
 */
export function absoluteMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${PUBLIC_API_URL.replace(/\/api$/, '')}/${url.replace(/^\/+/, '')}`;
}
