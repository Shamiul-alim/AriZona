'use client';

import { useCallback, useEffect, useState } from 'react';

export type SubtitleSize = 'small' | 'medium' | 'large' | 'xl';
export type SubtitleEdge = 'none' | 'outline' | 'shadow' | 'outline-shadow';

export interface SubtitleStyle {
  size: SubtitleSize;
  /** Text colour, any CSS hex colour. */
  color: string;
  /** Box colour behind the text. Only visible when opacity > 0. */
  backgroundColor: string;
  /** 0 = no box at all (the default). */
  backgroundOpacity: number;
  edge: SubtitleEdge;
  /**
   * Distance of the subtitle baseline from the bottom of the picture, as a
   * percentage of the player height. The renderer additionally keeps cues
   * clear of the control bar while it is visible.
   */
  offsetPercent: number;
}

export interface PlayerPreferences {
  volume: number;
  muted: boolean;
  playbackRate: number;
  /** Quality label such as "1080p", or "auto" for ABR/highest available. */
  quality: string;
  /** Subtitle language tag, or "off". */
  subtitleLanguage: string;
  /** Audio language tag, e.g. "ja" / "en". */
  audioLanguage: string;
  kind: 'SUB' | 'DUB';
  autoplayNext: boolean;
  autoSkipIntro: boolean;
  theatreMode: boolean;
  subtitleStyle: SubtitleStyle;
}

const STORAGE_KEY = 'anizora.player.preferences';
/**
 * Bumped when the stored shape changes. Version 1 stored subtitle styles with a
 * 60% black box as the default; those styles are reset once so the new
 * transparent default actually reaches existing viewers.
 */
const STORAGE_VERSION = 2;

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  size: 'medium',
  color: '#ffffff',
  backgroundColor: '#000000',
  backgroundOpacity: 0,
  edge: 'outline-shadow',
  offsetPercent: 7,
};

export const DEFAULT_PREFERENCES: PlayerPreferences = {
  volume: 1,
  muted: false,
  playbackRate: 1,
  quality: 'auto',
  subtitleLanguage: 'en',
  audioLanguage: 'ja',
  kind: 'SUB',
  autoplayNext: true,
  autoSkipIntro: false,
  theatreMode: false,
  subtitleStyle: DEFAULT_SUBTITLE_STYLE,
};

function sanitiseStyle(raw: Partial<SubtitleStyle> | undefined): SubtitleStyle {
  const style = { ...DEFAULT_SUBTITLE_STYLE, ...raw };
  const clamp = (n: unknown, min: number, max: number, fallback: number) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  return {
    size: (['small', 'medium', 'large', 'xl'] as const).includes(style.size) ? style.size : 'medium',
    color: /^#[0-9a-f]{6}$/i.test(style.color) ? style.color : DEFAULT_SUBTITLE_STYLE.color,
    backgroundColor: /^#[0-9a-f]{6}$/i.test(style.backgroundColor)
      ? style.backgroundColor
      : DEFAULT_SUBTITLE_STYLE.backgroundColor,
    backgroundOpacity: clamp(style.backgroundOpacity, 0, 1, 0),
    edge: (['none', 'outline', 'shadow', 'outline-shadow'] as const).includes(style.edge)
      ? style.edge
      : DEFAULT_SUBTITLE_STYLE.edge,
    offsetPercent: clamp(style.offsetPercent, 0, 40, DEFAULT_SUBTITLE_STYLE.offsetPercent),
  };
}

function read(): PlayerPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<PlayerPreferences> & { version?: number };
    const style = parsed.version === STORAGE_VERSION ? sanitiseStyle(parsed.subtitleStyle) : DEFAULT_SUBTITLE_STYLE;
    return { ...DEFAULT_PREFERENCES, ...parsed, subtitleStyle: style };
  } catch {
    // Private mode, blocked storage, or corrupt JSON — defaults are fine.
    return DEFAULT_PREFERENCES;
  }
}

function write(preferences: PlayerPreferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...preferences, version: STORAGE_VERSION }));
  } catch {
    // Storage may be unavailable; the session still works in memory.
  }
}

/**
 * Player settings persisted per browser.
 *
 * Signed-in users additionally get their audio/subtitle language stored on the
 * account (see /users/me/preferences) so it follows them across devices; this
 * hook is the local mirror and the guest fallback.
 */
export function usePlayerPreferences() {
  const [preferences, setPreferences] = useState<PlayerPreferences>(DEFAULT_PREFERENCES);
  const [hydrated, setHydrated] = useState(false);

  // Read after mount so server and client markup match on first paint.
  useEffect(() => {
    setPreferences(read());
    setHydrated(true);
  }, []);

  const update = useCallback((patch: Partial<PlayerPreferences>) => {
    setPreferences((previous) => {
      const next = { ...previous, ...patch };
      write(next);
      return next;
    });
  }, []);

  const updateSubtitleStyle = useCallback((patch: Partial<SubtitleStyle>) => {
    setPreferences((previous) => {
      const next = { ...previous, subtitleStyle: sanitiseStyle({ ...previous.subtitleStyle, ...patch }) };
      write(next);
      return next;
    });
  }, []);

  const resetSubtitleStyle = useCallback(() => {
    setPreferences((previous) => {
      const next = { ...previous, subtitleStyle: DEFAULT_SUBTITLE_STYLE };
      write(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignored */
    }
  }, []);

  return { preferences, hydrated, update, updateSubtitleStyle, resetSubtitleStyle, reset };
}

export const SUBTITLE_SIZES: Array<{ value: SubtitleSize; label: string; scale: number }> = [
  { value: 'small', label: 'Small', scale: 0.8 },
  { value: 'medium', label: 'Medium', scale: 1 },
  { value: 'large', label: 'Large', scale: 1.25 },
  { value: 'xl', label: 'Extra large', scale: 1.55 },
];

export const SUBTITLE_COLOURS = [
  { label: 'White', value: '#ffffff' },
  { label: 'Yellow', value: '#ffe14d' },
  { label: 'Cyan', value: '#5ce1e6' },
  { label: 'Green', value: '#7cfc9a' },
  { label: 'Pink', value: '#ff9ec4' },
  { label: 'Orange', value: '#ffb454' },
];

export const SUBTITLE_POSITIONS = [
  { label: 'Lower', value: 2 },
  { label: 'Default', value: DEFAULT_SUBTITLE_STYLE.offsetPercent },
  { label: 'Higher', value: 18 },
];

export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
