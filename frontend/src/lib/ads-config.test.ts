import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
vi.mock('./api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { loadAdsConfig, resetAdsConfigCache } from './ads-config';

describe('loadAdsConfig', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    resetAdsConfigCache();
  });

  it('asks the API once however many slots are on the page', async () => {
    // The watch page used to fetch this separately from every AdSlot, so the
    // one page where playback latency matters most paid for it twice.
    apiFetch.mockResolvedValue({ display: [], video: { enabled: false } });

    const [a, b, c] = await Promise.all([loadAdsConfig(), loadAdsConfig(), loadAdsConfig()]);

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/ads/config');
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('resolves to no adverts when the request fails', async () => {
    // An advert that cannot be configured should be absent, not an error every
    // caller has to handle.
    apiFetch.mockRejectedValue(new Error('offline'));

    await expect(loadAdsConfig()).resolves.toEqual({ display: [], video: { enabled: false } });
  });

  it('reuses the answer for a slot that mounts later', async () => {
    apiFetch.mockResolvedValue({ display: [{ key: 'home_top' }], video: { enabled: false } });
    await loadAdsConfig();
    await loadAdsConfig();
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
