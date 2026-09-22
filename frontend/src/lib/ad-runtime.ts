/**
 * Shared, cross-mechanism advertising state.
 *
 * AniZora runs two click-driven mechanisms: the Adsterra popunder (the vendor
 * script, which acts on mousedown) and the Direct Link click ad (ours, which
 * acts on click). They must never both fire from one interaction, so both
 * record every advertiser window here and both consult it before opening one.
 *
 * Deliberately plain module state plus localStorage — no React — so the
 * popunder's `window.open` gate and the click-ad listener see exactly the same
 * facts, whatever order they run in.
 */

export type AdKind = 'popunder' | 'click';

const STORAGE_KEY: Record<AdKind, string> = {
  popunder: 'anizora.adsterra.lastPop',
  click: 'anizora.adsterra.lastClickAd',
};

/**
 * A mousedown and the click that follows it are one gesture. The popunder
 * fires on the mousedown; the click arrives a few tens of milliseconds later,
 * so anything inside this window belongs to the same interaction.
 */
export const SAME_GESTURE_MS = 1500;

const lastOpened: Record<AdKind, number> = { popunder: 0, click: 0 };

function read(kind: AdKind): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY[kind]);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    // Blocked storage: module state alone still spaces ads out in this tab.
    return 0;
  }
}

/** Epoch ms of the last advertiser window of this kind, or 0. */
export function lastAdAt(kind: AdKind): number {
  return Math.max(lastOpened[kind], read(kind));
}

/** Records an advertiser window this browser actually opened. */
export function markAdOpened(kind: AdKind, at = Date.now()): void {
  lastOpened[kind] = at;
  try {
    window.localStorage.setItem(STORAGE_KEY[kind], String(at));
  } catch {
    /* storage unavailable; module state still applies for this page load */
  }
}

/**
 * True when any mechanism already opened an advertiser window in the current
 * interaction. This is what stops one click producing two ads.
 */
export function adOpenedInThisGesture(now = Date.now()): boolean {
  const latest = Math.max(lastAdAt('popunder'), lastAdAt('click'));
  return latest > 0 && now - latest < SAME_GESTURE_MS;
}

/** Test seam: forget everything this module is holding in memory. */
export function resetAdRuntime(): void {
  lastOpened.popunder = 0;
  lastOpened.click = 0;
}
