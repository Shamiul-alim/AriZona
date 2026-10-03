import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
vi.mock('./api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { loadGenres, resetGenreCache } from './genres';

describe('loadGenres', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    resetGenreCache();
  });

  it('asks the API once however many callers there are', async () => {
    // The header menu and the browse filter panel both mount on /browse and
    // each used to fetch this list independently.
    apiFetch.mockResolvedValue([{ name: 'Comedy', slug: 'comedy' }]);

    const [a, b] = await Promise.all([loadGenres(), loadGenres()]);

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/genres');
    expect(a).toEqual([{ name: 'Comedy', slug: 'comedy' }]);
    expect(b).toBe(a);
  });

  it('reuses the result for a caller that mounts later', async () => {
    apiFetch.mockResolvedValue([{ name: 'Action', slug: 'action' }]);

    await loadGenres();
    await loadGenres();

    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('does not remember a failure, so the next mount tries again', async () => {
    // Caching the rejection would leave the genre menu empty for the rest of
    // the session after one bad response.
    apiFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(loadGenres()).rejects.toThrow('offline');

    apiFetch.mockResolvedValue([{ name: 'Drama', slug: 'drama' }]);
    await expect(loadGenres()).resolves.toEqual([{ name: 'Drama', slug: 'drama' }]);
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
