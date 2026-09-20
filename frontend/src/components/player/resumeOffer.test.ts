import { describe, expect, it } from 'vitest';
import { resumeOffer } from './VideoPlayer';

const progress = (positionSeconds: number, durationSeconds: number | null, completed = false) => ({
  positionSeconds,
  durationSeconds,
  percent: durationSeconds ? Math.round((positionSeconds / durationSeconds) * 100) : 0,
  completed,
});

describe('resumeOffer', () => {
  it('offers the saved position mid-episode', () => {
    expect(resumeOffer(progress(342, 1440), null)).toBe(342);
  });

  it('does not prompt with nothing saved or near the beginning', () => {
    expect(resumeOffer(null, 1440)).toBeNull();
    expect(resumeOffer(progress(6, 1440), null)).toBeNull();
  });

  it('starts over when the episode is (nearly) finished', () => {
    expect(resumeOffer(progress(1400, 1440, true), null)).toBeNull();
    expect(resumeOffer(progress(1300, 1440), null)).toBeNull();
  });

  it('offers resume for a rewatch in progress of a completed episode', () => {
    expect(resumeOffer(progress(200, 1440, true), null)).toBe(200);
  });

  it('falls back to the episode duration when progress has none', () => {
    expect(resumeOffer(progress(1300, null), 1440)).toBeNull();
    expect(resumeOffer(progress(300, null), 1440)).toBe(300);
  });
});
