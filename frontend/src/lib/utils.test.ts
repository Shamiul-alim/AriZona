import { describe, expect, it, vi } from 'vitest';
import {
  clamp,
  cn,
  displayTitle,
  formatCount,
  formatDuration,
  formatTime,
  ratingLabel,
  statusLabel,
  throttle,
  titleCase,
  typeLabel,
} from './utils';

describe('formatTime', () => {
  it('formats under an hour as m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(599)).toBe('9:59');
  });

  it('formats an hour or more as h:mm:ss', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3661)).toBe('1:01:01');
    expect(formatTime(7322)).toBe('2:02:02');
  });

  it('truncates fractional seconds rather than rounding up', () => {
    expect(formatTime(59.9)).toBe('0:59');
  });

  it('handles invalid input without producing NaN', () => {
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(-10)).toBe('0:00');
    expect(formatTime(Infinity)).toBe('0:00');
  });
});

describe('formatDuration', () => {
  it('shows minutes below an hour', () => {
    expect(formatDuration(24)).toBe('24m');
  });

  it('shows hours and minutes above an hour', () => {
    expect(formatDuration(90)).toBe('1h 30m');
    expect(formatDuration(120)).toBe('2h');
  });

  it('shows a dash when unknown', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(undefined)).toBe('—');
  });
});

describe('formatCount', () => {
  it('leaves small numbers alone', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
  });

  it('abbreviates thousands', () => {
    expect(formatCount(1500)).toBe('1.5K');
    expect(formatCount(15000)).toBe('15K');
  });

  it('abbreviates millions', () => {
    expect(formatCount(2_500_000)).toBe('2.5M');
  });

  it('treats null as zero', () => {
    expect(formatCount(null)).toBe('0');
  });
});

describe('labels', () => {
  it('renders type labels readably', () => {
    expect(typeLabel('TV')).toBe('TV');
    expect(typeLabel('TV_SHORT')).toBe('TV Short');
    expect(typeLabel('MOVIE')).toBe('Movie');
  });

  it('renders status labels in viewer-facing language', () => {
    expect(statusLabel('ONGOING')).toBe('Airing');
    expect(statusLabel('COMPLETED')).toBe('Finished');
  });

  it('renders age ratings with their conventional punctuation', () => {
    expect(ratingLabel('PG_13')).toBe('PG-13');
    expect(ratingLabel('R_PLUS')).toBe('R+');
    expect(ratingLabel(null)).toBeNull();
  });

  it('title-cases underscored values', () => {
    expect(titleCase('LIGHT_NOVEL')).toBe('Light Novel');
  });
});

describe('displayTitle', () => {
  const anime = { titleEnglish: 'Crimson Vanguard', titleJapanese: 'クリムゾン' };

  it('defaults to English', () => {
    expect(displayTitle(anime)).toBe('Crimson Vanguard');
  });

  it('honours the Japanese preference', () => {
    expect(displayTitle(anime, 'JAPANESE')).toBe('クリムゾン');
  });

  it('falls back to English when no Japanese title exists', () => {
    expect(displayTitle({ titleEnglish: 'Only English' }, 'JAPANESE')).toBe('Only English');
  });
});

describe('clamp', () => {
  it('bounds a value to the given range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe('cn', () => {
  it('merges conflicting Tailwind classes, last one winning', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('drops falsy values', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c');
  });
});

describe('throttle', () => {
  it('runs immediately then suppresses until the window elapses', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const throttled = throttle(spy, 1000);

    throttled();
    throttled();
    throttled();
    expect(spy).toHaveBeenCalledTimes(1);

    // The trailing call fires once the window closes.
    vi.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
