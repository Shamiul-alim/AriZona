import type { UserRole } from './types';

/**
 * Decides whether the Adsterra popunder may be armed for this page view.
 *
 * Kept as a pure function so every rule is unit-testable: the component only
 * gathers the inputs and injects the script when this says yes.
 */
export interface PopunderContext {
  enabled: boolean;
  /** Invoke script URL from the Adsterra dashboard. */
  scriptSrc: string;
  pathname: string;
  /** Auth store status; the session must be known before arming. */
  status: 'idle' | 'loading' | 'authenticated' | 'anonymous';
  role: UserRole | null;
  /** Epoch ms of the last arming in this browser, or null. */
  lastArmedAt: number | null;
  frequencyHours: number;
  now: number;
  /** Already injected during this page load. */
  alreadyInjected: boolean;
}

/** Areas where an advert must never interrupt the visitor. */
const EXCLUDED_ROUTES = [/^\/admin(\/|$)/, /^\/auth(\/|$)/];

export function shouldArmPopunder(context: PopunderContext): boolean {
  if (context.alreadyInjected) return false;
  if (!context.enabled || !context.scriptSrc) return false;
  if (EXCLUDED_ROUTES.some((pattern) => pattern.test(context.pathname))) return false;

  // Wait until the session is resolved, so staff are never armed by accident.
  if (context.status === 'idle' || context.status === 'loading') return false;
  // Moderators and admins run the site; they are never shown adverts.
  if (context.role && context.role !== 'USER') return false;

  return cooldownElapsed(context.lastArmedAt, context.frequencyHours, context.now);
}

export function cooldownElapsed(lastArmedAt: number | null, frequencyHours: number, now: number): boolean {
  if (!Number.isFinite(frequencyHours) || frequencyHours <= 0) return true;
  if (!lastArmedAt || !Number.isFinite(lastArmedAt) || lastArmedAt <= 0) return true;
  return now - lastArmedAt >= frequencyHours * 60 * 60 * 1000;
}
