import { describe, expect, it } from 'vitest';
import { nextPreference, preferenceState } from './preferences';

describe('preferenceState', () => {
  it('reports each of the three states', () => {
    expect(preferenceState('comedy', ['comedy'], [])).toBe('prefer');
    expect(preferenceState('comedy', [], ['comedy'])).toBe('avoid');
    expect(preferenceState('comedy', ['action'], ['horror'])).toBe('off');
  });
});

describe('nextPreference', () => {
  it('adds a value in prefer mode', () => {
    expect(nextPreference('prefer', 'comedy', [], [])).toEqual({ preferred: ['comedy'], avoided: [] });
  });

  it('adds a value in avoid mode', () => {
    expect(nextPreference('avoid', 'comedy', [], [])).toEqual({ preferred: [], avoided: ['comedy'] });
  });

  it('clears a value pressed again in the same direction', () => {
    expect(nextPreference('prefer', 'comedy', ['comedy'], [])).toEqual({ preferred: [], avoided: [] });
    expect(nextPreference('avoid', 'comedy', [], ['comedy'])).toEqual({ preferred: [], avoided: [] });
  });

  it('moves a liked value to avoided rather than holding both', () => {
    expect(nextPreference('avoid', 'comedy', ['comedy', 'action'], [])).toEqual({
      preferred: ['action'],
      avoided: ['comedy'],
    });
  });

  it('moves an avoided value to liked rather than holding both', () => {
    expect(nextPreference('prefer', 'comedy', [], ['comedy', 'horror'])).toEqual({
      preferred: ['comedy'],
      avoided: ['horror'],
    });
  });

  it('never leaves a value in both directions, whatever the starting point', () => {
    // The invariant the results depend on, checked over every combination.
    const starts: Array<[string[], string[]]> = [
      [[], []],
      [['comedy'], []],
      [[], ['comedy']],
      [['comedy', 'action'], ['horror']],
      [['action'], ['comedy', 'horror']],
    ];
    for (const mode of ['prefer', 'avoid'] as const) {
      for (const [preferred, avoided] of starts) {
        const result = nextPreference(mode, 'comedy', preferred, avoided);
        const inBoth = result.preferred.filter((v) => result.avoided.includes(v));
        expect(inBoth).toEqual([]);
      }
    }
  });

  it('leaves other values untouched', () => {
    const result = nextPreference('prefer', 'comedy', ['action'], ['horror', 'ecchi']);
    expect(result.preferred).toEqual(['action', 'comedy']);
    expect(result.avoided).toEqual(['horror', 'ecchi']);
  });
});
