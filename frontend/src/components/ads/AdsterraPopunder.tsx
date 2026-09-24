'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ADSTERRA } from '@/lib/config';
import { cooldownRemaining, isPopunderActive, popunderGateCss, shouldLoadPopunder } from '@/lib/adsterra';
import { useAuthStore } from '@/lib/auth-store';
import { lastAdAt, markAdOpened } from '@/lib/ad-runtime';

/**
 * The Adsterra popunder, integrated so that it monetises without breaking the
 * site. See `lib/adsterra.ts` for how the vendor script measurably behaves.
 *
 * What this component guarantees:
 *  1. The popunder is only allowed (<html data-popunder="on">) on eligible
 *     pages — never /auth, /admin or /watch, never for staff — and outside the
 *     cooldown. When it is not allowed, the vendor's full-page layer is hidden
 *     by CSS and any window it tries to open from a press is declined.
 *  2. When an advertiser window does open, the visitor's own click still
 *     happens: it is delivered to the element they actually pressed.
 *  3. After an impression the popunder stays off for the configured cooldown,
 *     then is allowed again. Adsterra's own cap applies on top; we never reset
 *     or work around it, and we never open or count an ad ourselves.
 */

/** One vendor script per document, however many route changes happen. */
let injected = false;

function readLastPop(): number | null {
  // Shared with the Direct Link click ad, so neither can fire twice on one
  // interaction; see lib/ad-runtime.ts.
  return lastAdAt('popunder') || null;
}

/** True for the vendor's layer link or anything inside it. */
function isVendorLayer(el: Element | null, key: string): boolean {
  return Boolean(el?.closest(`a[href*="${key}"]`));
}

/** Client-side navigation, provided by the mounted component. */
let navigate: ((href: string) => void) | null = null;

/** The element the visitor actually pressed, looking through the vendor layer. */
function elementBeneath(x: number, y: number, key: string): HTMLElement | null {
  const beneath = document
    .elementsFromPoint(x, y)
    .find(
      (el) =>
        el !== document.documentElement &&
        el !== document.body &&
        !isVendorLayer(el, key) &&
        !el.querySelector(`:scope > a[href*="${key}"]`),
    );
  return (beneath as HTMLElement | undefined) ?? null;
}

/** What the visitor was pointing at, captured while the coordinates are valid. */
interface Intent {
  href?: string;
  element?: HTMLElement;
}

/**
 * Resolves the press target IMMEDIATELY, at press time.
 *
 * This used to be done in the delayed step, which was wrong: between the press
 * and the recovery the page can reflow — lazily loaded images and ad frames
 * arrive and move content — so the coordinates could by then be over something
 * else entirely. Measured on production, that reliably cost one navigation per
 * run: the recovery clicked a <div> where the card had been.
 */
function resolveIntent(x: number, y: number, key: string): Intent | null {
  const pressed = elementBeneath(x, y, key);
  if (!pressed) return null;
  const anchor = pressed.closest<HTMLAnchorElement>('a[href]');
  if (anchor && anchor.origin === window.location.origin && anchor.target !== '_blank') {
    return { href: `${anchor.pathname}${anchor.search}${anchor.hash}` };
  }
  const control =
    pressed.closest<HTMLElement>('button, input, select, textarea, label, summary, [role="button"], [role="link"], a[href]') ??
    pressed;
  return { element: control };
}

/**
 * Makes sure the visitor's press does what they meant, after the vendor has
 * handled it. The vendor can swallow it three ways — its layer takes the
 * press, its new window steals focus so no click follows, or it cancels the
 * click so a Next.js <Link> declines to navigate — so rather than guess which
 * happened, check the outcome against the intent captured at press time.
 */
function deliverIntendedClick(intent: Intent | null, urlBefore: string, clickArrived: boolean): void {
  if (!intent) return;
  if (intent.href) {
    if (window.location.href === urlBefore) navigate?.(intent.href);
    return;
  }
  if (clickArrived || !intent.element) return;
  const control = intent.element;
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) {
    control.focus();
    return;
  }
  control.click();
}

/** Press events: the vendor opens its window on these, never on a plain click. */
const PRESS_EVENTS = new Set(['mousedown', 'pointerdown', 'touchstart', 'touchend', 'pointerup', 'mouseup']);

let openGateInstalled = false;
/** Called on every press-time open attempt by the vendor, allowed or declined. */
let onVendorAttempt: ((intent: Intent | null, opened: boolean) => void) | null = null;
/** The placement key, so the gate can resolve intent without React state. */
let placementKey = '';

/**
 * Gates `window.open` for press events.
 *
 * Measured behaviour: when its layer is hidden, the vendor falls back to a
 * document-wide `mousedown` handler that calls `window.open` on a press of
 * *any* element — our own links included — and the new window takes focus,
 * so the visitor's click never happens. Hiding the layer alone therefore
 * cannot keep ads off /auth or /watch, or enforce the cooldown.
 *
 * AniZora itself never calls `window.open` (its external links are plain
 * target="_blank" anchors), and legitimate click-throughs such as video ads
 * fire on `click`. So while the popunder is not allowed, a `window.open` made
 * during a press event is declined; nothing else is affected. We only ever
 * decline to show an ad — we never open one, or count one, ourselves.
 */
function installOpenGate(): void {
  if (openGateInstalled || typeof window === 'undefined') return;
  openGateInstalled = true;
  const nativeOpen = window.open.bind(window);
  window.open = function gatedOpen(...args: Parameters<typeof window.open>) {
    const event = window.event as (MouseEvent & { touches?: TouchList; changedTouches?: TouchList }) | undefined;
    const isPress = Boolean(event && PRESS_EVENTS.has(event.type));
    if (!isPress || !event) return nativeOpen(...args);
    const allowed = document.documentElement.dataset.popunder === 'on';
    const opened = allowed ? nativeOpen(...args) : null;
    const point = event.touches?.[0] ?? event.changedTouches?.[0] ?? event;
    onVendorAttempt?.(resolveIntent(point.clientX ?? 0, point.clientY ?? 0, placementKey), Boolean(opened));
    return opened;
  } as typeof window.open;
}

/**
 * Opt-in diagnostics: add `?addebug=1` to any URL to print each decision and
 * mirror it on `window.__anizoraAds`. Carries no account or credential data.
 */
function report(state: Record<string, unknown>): void {
  (window as unknown as { __anizoraAds?: unknown }).__anizoraAds = state;
  try {
    if (new URLSearchParams(window.location.search).has('addebug')) console.info('[anizora:ads]', state);
  } catch {
    /* ignore */
  }
}

export function AdsterraPopunder() {
  const pathname = usePathname();
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.user?.role ?? null);
  const { enabled, src, key, cooldownSeconds, excludedRoutes } = ADSTERRA.popunder;
  const cooldownMs = cooldownSeconds * 1000;

  // Read synchronously so the gate never opens for one render during a
  // cooldown. It is never rendered, so it cannot cause a hydration mismatch.
  const [lastPopAt, setLastPopAt] = useState<number | null>(() => (typeof window === 'undefined' ? null : readLastPop()));
  // Bumped when a cooldown ends, so the gate is re-evaluated at that moment.
  const [tick, setTick] = useState(0);

  // Hide the vendor layer by default, before anything else runs.
  useEffect(() => {
    if (!enabled) return;
    // Before the vendor script can take a reference to window.open.
    installOpenGate();
    const css = popunderGateCss(key);
    if (!css || document.getElementById('anizora-popunder-gate')) return;
    const style = document.createElement('style');
    style.id = 'anizora-popunder-gate';
    style.textContent = css;
    document.head.appendChild(style);
  }, [enabled, key]);

  // Load the vendor script once, on the first eligible page.
  useEffect(() => {
    if (!shouldLoadPopunder({ enabled, pathname, status, role, excludedRoutes, alreadyInjected: injected })) return;
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.cfasync = 'false';
    script.referrerPolicy = 'no-referrer-when-downgrade';
    script.onerror = () => {
      // Blocked by an extension or the network. Allow a retry later.
      injected = false;
    };
    document.body.appendChild(script);
    injected = true;
  }, [enabled, src, pathname, status, role, excludedRoutes]);

  // Open or close the gate for this page and moment.
  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    const active = isPopunderActive({ enabled, pathname, status, role, excludedRoutes, lastPopAt, cooldownMs, now });
    const remaining = cooldownRemaining(lastPopAt, cooldownMs, now);
    document.documentElement.dataset.popunder = active ? 'on' : 'off';

    report({
      placement: 'popunder',
      placementKey: key,
      route: pathname,
      routeExcluded: excludedRoutes.some((p) => pathname === p || pathname.startsWith(`${p}/`)),
      staffExcluded: Boolean(role && role !== 'USER'),
      sessionStatus: status,
      scriptInjected: injected,
      layerClickable: active,
      cooldownSeconds,
      lastPopAt: lastPopAt ? new Date(lastPopAt).toISOString() : null,
      nextEligibleAt: remaining > 0 ? new Date(now + remaining).toISOString() : 'now',
    });

    if (remaining > 0) {
      const timer = setTimeout(() => setTick((n) => n + 1), remaining + 50);
      return () => clearTimeout(timer);
    }
  }, [enabled, key, pathname, status, role, excludedRoutes, lastPopAt, cooldownMs, cooldownSeconds, tick]);

  useEffect(() => {
    navigate = (href) => router.push(href);
    return () => {
      navigate = null;
    };
  }, [router]);

  // A press that lands on the vendor's visible layer is recovered directly.
  // The window.open gate below covers the case where the vendor scripts the
  // window itself, but when its layer is armed the advert can open through the
  // layer anchor's own target="_blank" — no window.open, so nothing above
  // fires. Measured on production, that was the one click in twelve that kept
  // losing its navigation, always the first click after the layer re-armed.
  useEffect(() => {
    if (!enabled || !key) return;
    const onPress = (event: MouseEvent) => {
      if (!isVendorLayer(event.target as Element | null, key)) return;
      const urlBefore = window.location.href;
      const intent = resolveIntent(event.clientX, event.clientY, key);
      window.setTimeout(() => {
        if (window.location.href === urlBefore) deliverIntendedClick(intent, urlBefore, false);
      }, 500);
    };
    document.addEventListener('mousedown', onPress, true);
    return () => document.removeEventListener('mousedown', onPress, true);
  }, [enabled, key]);

  // Every time the vendor tries to open a window from a press: if it opened,
  // start the cooldown; either way, make sure the visitor's click still lands.
  useEffect(() => {
    if (!enabled || !key) return;
    let lastAttempt = 0;
    placementKey = key;
    onVendorAttempt = (intent, opened) => {
      const at = Date.now();
      if (opened) {
        markAdOpened('popunder', at);
        setLastPopAt(at);
        document.documentElement.dataset.popunder = 'off';
      }
      // One press can call window.open more than once; handle it once.
      if (at - lastAttempt < 1000) return;
      lastAttempt = at;
      const urlBefore = window.location.href;
      let clickArrived = false;
      const seen = () => {
        clickArrived = true;
      };
      document.addEventListener('click', seen, { capture: true, once: true });
      setTimeout(() => {
        document.removeEventListener('click', seen, { capture: true });
        deliverIntendedClick(intent, urlBefore, clickArrived);
      }, 450);
    };
    return () => {
      onVendorAttempt = null;
    };
  }, [enabled, key]);

  return null;
}
