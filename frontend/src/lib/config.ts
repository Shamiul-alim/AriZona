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

/** Comma-separated route prefixes, e.g. "/auth,/admin". */
export function routeList(raw: string | undefined, fallback: string[]): string[] {
  const items = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('/'));
  return items.length > 0 ? items : fallback;
}

/** The placement key an Adsterra script URL carries in its file name. */
export function placementKeyFromSrc(src: string): string {
  const match = /([0-9a-f]{32})(?:\.js|\/invoke\.js)?(?:[?#].*)?$/i.exec(src);
  return match ? match[1].toLowerCase() : '';
}

/** "false" switches a feature off; anything else inherits the master switch. */
function flag(raw: string | undefined, inherit: boolean): boolean {
  return inherit && raw?.trim().toLowerCase() !== 'false';
}

const adsterraEnabled = process.env.NEXT_PUBLIC_ADSTERRA_ENABLED === 'true';
const popunderSrc = adScriptUrl(process.env.NEXT_PUBLIC_ADSTERRA_POPUNDER_SRC);
/**
 * Adsterra Direct Link. Like the placement keys below it is public
 * configuration: it is a plain URL that every visitor's browser is given.
 */
const directLinkUrl = adScriptUrl(
  process.env.NEXT_PUBLIC_ADSTERRA_DIRECT_LINK ??
    'https://www.profitableratecpmnetwork.com/v08ttshhc?key=421f36ed2d60a1f02cba30d7db040223',
);

/**
 * The single place that decides what advertising runs where.
 *
 * Placement keys and script URLs below necessarily ship to every browser (they
 * are visible in page source on any site that runs them), so they are public
 * configuration, not secrets.
 */
export const ADSTERRA = {
  /** Master switch. Nothing Adsterra-related loads when this is off. */
  enabled: adsterraEnabled,

  /**
   * Routes where no advertising code is mounted at all — not the vendor
   * script, not the click listener, not a banner. The admin panel is a tool,
   * never a surface for ads, and this is enforced before any per-mechanism
   * rule gets a chance to be wrong.
   */
  neverRoutes: routeList(process.env.NEXT_PUBLIC_ADS_NEVER_ROUTES, ['/admin']),

  popunder: {
    enabled: flag(process.env.NEXT_PUBLIC_ADSTERRA_POPUNDER_ENABLED, adsterraEnabled) && Boolean(popunderSrc),
    src: popunderSrc,
    key: placementKeyFromSrc(popunderSrc),
    /**
     * Minimum gap between two popunders in one browser, in seconds.
     *
     * At the default of 5s this is no longer the limiting factor: Adsterra
     * re-arms roughly 10–20 seconds after an impression and stops after a few
     * per day (its own cookies), so the vendor's pace governs. Raise it to
     * space ads out further — the visitor's own click always still lands
     * either way.
     */
    cooldownSeconds: positiveNumber(
      process.env.NEXT_PUBLIC_ADSTERRA_POPUNDER_COOLDOWN_SECONDS,
      // The older minutes setting still wins if it is the one that is set.
      positiveNumber(process.env.NEXT_PUBLIC_ADSTERRA_POPUNDER_COOLDOWN_MINUTES, 0) * 60 || 5,
    ),
    /**
     * Where the popunder must never be clickable. /watch is excluded because the
     * vendor's click layer covers the whole viewport — including the video
     * player — and cannot be told to leave the controls alone.
     */
    excludedRoutes: routeList(process.env.NEXT_PUBLIC_ADSTERRA_POPUNDER_EXCLUDED_ROUTES, ['/auth', '/admin', '/watch']),
  },

  /**
   * Direct Link click ad — a second mechanism, independent of the popunder.
   *
   * On an ordinary navigation click the Direct Link opens in another tab and
   * the click is left alone, so the visitor still reaches the page they asked
   * for. The two mechanisms share `lib/ad-runtime.ts`, so a single interaction
   * can never produce both a popunder and a click ad.
   */
  clickAd: {
    enabled:
      flag(process.env.NEXT_PUBLIC_ADSTERRA_CLICK_AD_ENABLED, adsterraEnabled) && Boolean(directLinkUrl),
    url: directLinkUrl,
    /** Minimum gap between two click ads in one browser, in seconds. */
    cooldownSeconds: positiveNumber(process.env.NEXT_PUBLIC_ADSTERRA_CLICK_AD_COOLDOWN_SECONDS, 5),
    /**
     * /watch is NOT excluded: the click ad adds no overlay and never sees a
     * click inside the player, because the whole `.player-root` subtree is
     * refused in `clickAdTarget`. Add it here to switch the watch page off.
     */
    excludedRoutes: routeList(process.env.NEXT_PUBLIC_ADSTERRA_CLICK_AD_EXCLUDED_ROUTES, ['/auth', '/admin']),
  },

  /**
   * Fixed-size display banners (Adsterra "iframe" format). Each renders inside
   * its own isolated frame, so the vendor's shared `atOptions` global can never
   * be overwritten by a neighbouring slot.
   */
  banners: {
    enabled: flag(process.env.NEXT_PUBLIC_ADSTERRA_BANNERS_ENABLED, adsterraEnabled),
    host: 'https://www.highrevenueformat.com',
    units: {
      '728x90': 'b3a1975cf66d76519eb6ab201dfa5ca9',
      '468x60': '187123d40d9a9a228a802d21b9016bf6',
      '320x50': '71902749fb8e599898d1406f2c1682ad',
      '300x250': '51efabb604e2727dacfe91e27101d7e8',
      '160x300': '31d5087e8f4bdf66620f64d04037cceb',
    },
    excludedRoutes: ['/auth', '/admin'],
    /**
     * Which existing <AdSlot> positions carry a banner. Deliberately sparse —
     * at most two per page, never directly under the hero (it would compete
     * with the page's largest paint) and never above the video player.
     * Anything not listed here renders nothing.
     */
    slots: {
      // Homepage: one leaderboard mid-page, one rectangle in the wide sidebar.
      home_between_grids: 'leaderboard',
      watch_sidebar: 'rectangle',
      // Anime detail: one leaderboard above the episode list.
      anime_detail_episodes: 'leaderboard',
      // Watch page: below the episode information, never over the player.
      watch_below_player: 'leaderboard',
      // Catalogue pages: one leaderboard among the results.
      search_results: 'leaderboard',
      browse_in_grid: 'leaderboard',
    } as Record<string, 'leaderboard' | 'rectangle' | 'skyscraper'>,
  },
} as const;

export type BannerSize = keyof typeof ADSTERRA.banners.units;

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
