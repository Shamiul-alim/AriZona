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
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
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
export const ADSTERRA = {
  enabled: process.env.NEXT_PUBLIC_ADSTERRA_ENABLED === 'true',
  popunderSrc: process.env.NEXT_PUBLIC_ADSTERRA_POPUNDER_SRC ?? '',
  /** Hours before the same browser may arm the popunder again. */
  frequencyHours: Number(process.env.NEXT_PUBLIC_ADSTERRA_FREQUENCY_HOURS ?? '12'),
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
