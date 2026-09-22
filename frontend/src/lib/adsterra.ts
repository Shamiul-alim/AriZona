import type { UserRole } from './types';

/**
 * Pure rules for the Adsterra popunder. The component gathers inputs and
 * applies the answers; every decision is made here so it can be unit-tested.
 *
 * HOW THE VENDOR ACTUALLY BEHAVES (measured on production, Chrome and Edge)
 * -----------------------------------------------------------------------
 *  * It lays an invisible `position:fixed; z-index:2147483647` link over the
 *    whole viewport. The next click anywhere lands on that link, which opens
 *    the advertiser page — and the click never reaches the element underneath.
 *  * After an impression it re-arms by itself roughly 10–20 seconds later.
 *  * It stops arming after a handful of impressions, tracked in its own
 *    24-hour cookies on its ad-server domains. We cannot and do not touch that.
 *  * The layer lives for the whole document, so with client-side navigation it
 *    follows the visitor onto pages it was never meant to cover.
 *
 * So the script is loaded once, and what we control is whether its layer is
 * *allowed to be clickable* on the current page, at the current moment.
 */

export type SessionStatus = 'idle' | 'loading' | 'authenticated' | 'anonymous';

export function isRouteExcluded(pathname: string, excluded: readonly string[]): boolean {
  return excluded.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isStaff(role: UserRole | null): boolean {
  return Boolean(role && role !== 'USER');
}

export interface PopunderLoadContext {
  enabled: boolean;
  pathname: string;
  status: SessionStatus;
  role: UserRole | null;
  excludedRoutes: readonly string[];
  /** The vendor script is already in this document. */
  alreadyInjected: boolean;
}

/**
 * Whether to load the vendor script now. Loading is gated on an eligible
 * page so that a visit that never leaves /auth or /watch never loads it.
 */
export function shouldLoadPopunder(c: PopunderLoadContext): boolean {
  if (c.alreadyInjected || !c.enabled) return false;
  // Wait until the session is resolved, so staff are never armed by accident.
  if (c.status === 'idle' || c.status === 'loading') return false;
  if (isStaff(c.role)) return false;
  return !isRouteExcluded(c.pathname, c.excludedRoutes);
}

export interface PopunderActiveContext extends Omit<PopunderLoadContext, 'alreadyInjected'> {
  /** Epoch ms of the last popunder this browser opened, or null. */
  lastPopAt: number | null;
  cooldownMs: number;
  now: number;
}

/** Whether the vendor's click layer may be interactive right now. */
export function isPopunderActive(c: PopunderActiveContext): boolean {
  if (!c.enabled) return false;
  if (c.status === 'idle' || c.status === 'loading') return false;
  if (isStaff(c.role)) return false;
  if (isRouteExcluded(c.pathname, c.excludedRoutes)) return false;
  return cooldownRemaining(c.lastPopAt, c.cooldownMs, c.now) === 0;
}

/** Milliseconds until the next popunder may open; 0 when it may open now. */
export function cooldownRemaining(lastPopAt: number | null, cooldownMs: number, now: number): number {
  if (!Number.isFinite(cooldownMs) || cooldownMs <= 0) return 0;
  if (!lastPopAt || !Number.isFinite(lastPopAt) || lastPopAt <= 0) return 0;
  // A timestamp in the future (clock change) must not lock ads out forever.
  if (lastPopAt > now) return 0;
  return Math.max(0, lastPopAt + cooldownMs - now);
}

/**
 * CSS that hides the vendor's layer unless <html data-popunder="on">.
 *
 * Hidden-by-default means the layer can never cover a page during the moment
 * before our component has decided — including right after a client-side
 * navigation onto an excluded route. The selector keys on our own placement
 * key, which the vendor puts in the layer's link.
 */
export function popunderGateCss(placementKey: string): string {
  if (!/^[0-9a-f]{32}$/.test(placementKey)) return '';
  const link = `a[href*="${placementKey}"]`;
  return (
    `html:not([data-popunder="on"]) ${link},` +
    `html:not([data-popunder="on"]) div:has(> ${link})` +
    '{display:none!important;pointer-events:none!important}'
  );
}
