import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { AgeRating, AnimeStatus, AnimeType } from './types';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** 3661 -> "1:01:01", 125 -> "2:05". Used by the player and duration badges. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatCount(value: number | null | undefined): string {
  const n = value ?? 0;
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function formatRelativeTime(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const units: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, 'minute'],
    [3600, 'hour'],
    [86400, 'day'],
    [604800, 'week'],
    [2592000, 'month'],
    [31536000, 'year'],
  ];

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  let divisor = 1;
  let unit: Intl.RelativeTimeFormatUnit = 'second';

  for (const [threshold, candidate] of units) {
    if (seconds < threshold) break;
    divisor = threshold;
    unit = candidate;
  }

  const scale: Record<string, number> = {
    minute: 60,
    hour: 3600,
    day: 86400,
    week: 604800,
    month: 2592000,
    year: 31536000,
  };
  void divisor;
  return formatter.format(-Math.floor(seconds / (scale[unit] ?? 60)), unit);
}

export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return '—';
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const TYPE_LABELS: Record<AnimeType, string> = {
  TV: 'TV',
  MOVIE: 'Movie',
  OVA: 'OVA',
  ONA: 'ONA',
  SPECIAL: 'Special',
  TV_SHORT: 'TV Short',
  TV_SPECIAL: 'TV Special',
  MUSIC: 'Music',
  OTHER: 'Other',
};

export function typeLabel(type: AnimeType): string {
  return TYPE_LABELS[type] ?? type;
}

const STATUS_LABELS: Record<AnimeStatus, string> = {
  ONGOING: 'Airing',
  COMPLETED: 'Finished',
  UPCOMING: 'Upcoming',
  HIATUS: 'On hiatus',
  CANCELLED: 'Cancelled',
};

export function statusLabel(status: AnimeStatus): string {
  return STATUS_LABELS[status] ?? status;
}

const RATING_LABELS: Record<AgeRating, string> = {
  G: 'G',
  PG: 'PG',
  PG_13: 'PG-13',
  R_17: 'R-17',
  R_PLUS: 'R+',
  RX: 'Rx',
};

export function ratingLabel(rating: AgeRating | null | undefined): string | null {
  return rating ? (RATING_LABELS[rating] ?? rating) : null;
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[\s_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Picks the title matching the viewer's language preference. */
export function displayTitle(
  anime: { titleEnglish: string; titleJapanese?: string | null },
  preference: 'ENGLISH' | 'JAPANESE' = 'ENGLISH',
): string {
  if (preference === 'JAPANESE' && anime.titleJapanese) return anime.titleJapanese;
  return anime.titleEnglish;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Trailing-edge throttle — used for player progress reporting. */
export function throttle<T extends (...args: never[]) => void>(fn: T, waitMs: number): T {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return ((...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = waitMs - (now - last);

    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...args);
      }, remaining);
    }
  }) as T;
}
