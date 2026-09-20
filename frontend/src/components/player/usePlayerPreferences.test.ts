import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES, usePlayerPreferences } from './usePlayerPreferences';

const STORAGE_KEY = 'anizora.player.preferences';

describe('usePlayerPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts from the defaults when nothing is stored', async () => {
    const { result } = renderHook(() => usePlayerPreferences());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it('persists an update to localStorage', async () => {
    const { result } = renderHook(() => usePlayerPreferences());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.update({ volume: 0.4, quality: '720p' }));

    expect(result.current.preferences.volume).toBe(0.4);
    expect(result.current.preferences.quality).toBe('720p');

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.volume).toBe(0.4);
    expect(stored.quality).toBe('720p');
  });

  it('rehydrates a previously stored preference', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: 0.25, subtitleLanguage: 'bn' }));

    const { result } = renderHook(() => usePlayerPreferences());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.preferences.volume).toBe(0.25);
    expect(result.current.preferences.subtitleLanguage).toBe('bn');
    // Absent keys still fall back to the defaults.
    expect(result.current.preferences.playbackRate).toBe(DEFAULT_PREFERENCES.playbackRate);
  });

  it('merges subtitle styling rather than replacing the whole object', async () => {
    const { result } = renderHook(() => usePlayerPreferences());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.updateSubtitleStyle({ size: 'large' }));

    expect(result.current.preferences.subtitleStyle.size).toBe('large');
    // Untouched styling keys survive.
    expect(result.current.preferences.subtitleStyle.color).toBe(DEFAULT_PREFERENCES.subtitleStyle.color);
    expect(result.current.preferences.subtitleStyle.offsetPercent).toBe(
      DEFAULT_PREFERENCES.subtitleStyle.offsetPercent,
    );
  });

  it('defaults subtitles to no background box', () => {
    expect(DEFAULT_PREFERENCES.subtitleStyle.backgroundOpacity).toBe(0);
    expect(DEFAULT_PREFERENCES.subtitleStyle.edge).toBe('outline-shadow');
  });

  it('drops version-1 subtitle styles so the transparent default applies', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ volume: 0.5, subtitleStyle: { fontSize: 100, background: 'medium', color: '#ffffff' } }),
    );
    const { result } = renderHook(() => usePlayerPreferences());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.preferences.volume).toBe(0.5);
    expect(result.current.preferences.subtitleStyle).toEqual(DEFAULT_PREFERENCES.subtitleStyle);
  });

  it('keeps a saved version-2 style across reloads and clamps bad values', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        subtitleStyle: { size: 'xl', color: '#ffe14d', backgroundOpacity: 7, offsetPercent: 18, edge: 'bogus' },
      }),
    );
    const { result } = renderHook(() => usePlayerPreferences());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    const style = result.current.preferences.subtitleStyle;
    expect(style.size).toBe('xl');
    expect(style.color).toBe('#ffe14d');
    expect(style.backgroundOpacity).toBe(1);
    expect(style.offsetPercent).toBe(18);
    expect(style.edge).toBe(DEFAULT_PREFERENCES.subtitleStyle.edge);
  });

  it('falls back to defaults when stored JSON is corrupt', async () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');

    const { result } = renderHook(() => usePlayerPreferences());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it('survives localStorage being unavailable', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const { result } = renderHook(() => usePlayerPreferences());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    // The session must keep working in memory even if nothing can be persisted.
    act(() => result.current.update({ volume: 0.7 }));
    expect(result.current.preferences.volume).toBe(0.7);

    spy.mockRestore();
  });

  it('clears stored preferences on reset', async () => {
    const { result } = renderHook(() => usePlayerPreferences());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.update({ volume: 0.1 }));
    act(() => result.current.reset());

    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
