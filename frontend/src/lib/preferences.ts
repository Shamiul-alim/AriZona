/** Which direction pressing a filter tag counts in. */
export type PreferenceMode = 'prefer' | 'avoid';

/** Where a value stands, whichever direction the panel is set to. */
export type PreferenceState = 'off' | 'prefer' | 'avoid';

export function preferenceState(value: string, preferred: string[], avoided: string[]): PreferenceState {
  if (preferred.includes(value)) return 'prefer';
  if (avoided.includes(value)) return 'avoid';
  return 'off';
}

/**
 * Both lists after pressing one value in one direction.
 *
 * Returning both is the point. A value may never sit in "liked" and "never
 * want" at once — the results would be asked to satisfy a contradiction — so
 * adding it to one direction removes it from the other in the same step, rather
 * than relying on two separate updates happening in the right order.
 *
 * Pressing a value it is already set to clears it, which is how a tag is
 * switched off without a second control.
 */
export function nextPreference(
  mode: PreferenceMode,
  value: string,
  preferred: string[],
  avoided: string[],
): { preferred: string[]; avoided: string[] } {
  const alreadySet = (mode === 'prefer' ? preferred : avoided).includes(value);
  const without = (list: string[]) => list.filter((entry) => entry !== value);
  const toggled = (list: string[]) => (alreadySet ? without(list) : [...list, value]);

  return {
    preferred: mode === 'prefer' ? toggled(preferred) : without(preferred),
    avoided: mode === 'avoid' ? toggled(avoided) : without(avoided),
  };
}
