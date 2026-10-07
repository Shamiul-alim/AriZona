import { describe, expect, it } from 'vitest';
import { BackendUnavailableError, createLoader } from './unavailable';

describe('createLoader', () => {
  it('returns values when everything loads', async () => {
    const loader = createLoader();
    const a = await loader.settle(Promise.resolve([1]), []);
    expect(a).toEqual([1]);
    expect(() => loader.assertAnythingLoaded()).not.toThrow();
  });

  it('falls back for one failing source and still renders', async () => {
    // One rail failing must not take the page down — that was always the point.
    const loader = createLoader();
    const ok = await loader.settle(Promise.resolve(['kept']), []);
    const bad = await loader.settle(Promise.reject(new Error('one rail')), ['fallback']);

    expect(ok).toEqual(['kept']);
    expect(bad).toEqual(['fallback']);
    expect(() => loader.assertAnythingLoaded()).not.toThrow();
    expect(loader.summary).toEqual({ attempted: 2, failed: 1 });
  });

  it('refuses the render when every source failed', async () => {
    // Everything failing is the API being unreachable, not an empty catalogue,
    // and a render that "succeeds" here is one Next will cache.
    const loader = createLoader();
    await loader.settle(Promise.reject(new Error('down')), []);
    await loader.settle(Promise.reject(new Error('down')), []);

    expect(() => loader.assertAnythingLoaded()).toThrow(BackendUnavailableError);
    expect(loader.summary).toEqual({ attempted: 2, failed: 2 });
  });

  it('treats a genuinely empty catalogue as success', async () => {
    const loader = createLoader();
    await loader.settle(Promise.resolve([]), []);
    expect(() => loader.assertAnythingLoaded()).not.toThrow();
  });

  it('does nothing when no source was attempted', async () => {
    expect(() => createLoader().assertAnythingLoaded()).not.toThrow();
  });

  it('carries the failures for logging without exposing them to the page', async () => {
    const loader = createLoader();
    await loader.settle(Promise.reject(new Error('first')), []);
    try {
      loader.assertAnythingLoaded();
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BackendUnavailableError);
      expect((error as BackendUnavailableError).failures).toHaveLength(1);
      expect((error as Error).message).not.toContain('first');
    }
  });
});
