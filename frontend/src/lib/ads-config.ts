import { apiFetch } from './api';
import type { AdsConfig } from './types';

/**
 * Advert placement configuration, fetched once per browser.
 *
 * Two independent consumers want it — every `AdSlot` on the page, and the watch
 * page for its video-ad settings — and the watch page asking separately meant
 * the same admin-managed config was fetched twice on the one page where getting
 * playback started quickly matters most. Sharing the in-flight promise means
 * whoever asks first pays and everyone else waits on the same answer.
 *
 * A failure resolves to "no adverts" rather than rejecting: an advert that
 * cannot be configured should be absent, not an error the page has to handle.
 */
let inFlight: Promise<AdsConfig> | null = null;

export function loadAdsConfig(): Promise<AdsConfig> {
  inFlight ??= apiFetch<AdsConfig>('/ads/config').catch(() => ({
    display: [],
    video: { enabled: false as const },
  }));
  return inFlight;
}

/** Drops the cached config. Exists for tests. */
export function resetAdsConfigCache(): void {
  inFlight = null;
}
