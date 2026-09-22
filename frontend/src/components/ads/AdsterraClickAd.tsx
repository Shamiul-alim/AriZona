'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { clickAdTarget, isPlainPrimaryClick, mayOpenClickAd } from '@/lib/adsterra';
import { adOpenedInThisGesture, lastAdAt, markAdOpened } from '@/lib/ad-runtime';
import { ADSTERRA } from '@/lib/config';
import { useAuthStore } from '@/lib/auth-store';

/**
 * Direct Link click ad.
 *
 * On an ordinary navigation click — an anime card, a poster, a title, a genre,
 * a search result, pagination, a nav item — the Adsterra Direct Link opens in
 * another tab, and the click itself is left completely alone, so AniZora
 * navigates exactly as it would have.
 *
 * WHY IT DIFFERS FROM THE REFERENCE SITES
 * ---------------------------------------
 * fojik.site was measured opening an advertiser tab on every single click with
 * no cooldown, and the movie link never opened (4 clicks, 4 ads, 0
 * navigations). Here the navigation always survives, because we never call
 * preventDefault and never intercept the anchor, and the rate is limited to
 * one ad per cooldown.
 *
 * WHY IT CANNOT COLLIDE WITH THE POPUNDER
 * ---------------------------------------
 * The popunder fires on mousedown, this fires on the click that follows a few
 * tens of milliseconds later. Both record every advertiser window in
 * `lib/ad-runtime`, and this one refuses to open if anything already opened in
 * the same gesture — so one interaction can never produce two ads.
 *
 * This adds no overlay and no markup: the player, and everything else, keeps
 * receiving its own events exactly as before.
 */
export function AdsterraClickAd() {
  const pathname = usePathname();
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.user?.role ?? null);
  const { enabled, url, cooldownSeconds, excludedRoutes } = ADSTERRA.clickAd;

  // Read through a ref so the listener is attached once and never duplicated
  // across client-side navigations.
  const state = useRef({ pathname, status, role });
  state.current = { pathname, status, role };

  useEffect(() => {
    if (!enabled || !url) return;
    const cooldownMs = cooldownSeconds * 1000;

    const onClick = (event: MouseEvent) => {
      if (!isPlainPrimaryClick(event)) return;
      const { pathname: route, status: sessionStatus, role: currentRole } = state.current;
      const now = Date.now();

      const allowed = mayOpenClickAd({
        enabled,
        pathname: route,
        status: sessionStatus,
        role: currentRole,
        excludedRoutes,
        lastClickAdAt: lastAdAt('click') || null,
        cooldownMs,
        now,
        adAlreadyOpenedInGesture: adOpenedInThisGesture(now),
      });
      if (!allowed) return;

      const target = clickAdTarget(event.target as Element | null);
      if (!target.eligible) return;

      // `noopener` keeps the advertiser page from touching this window (no
      // window.opener, so it cannot navigate AniZora). It also means the call
      // returns null by specification, so there is no handle to test: record
      // the attempt either way. A popup that a browser refuses therefore costs
      // one cooldown, which is the right way round — far better than treating
      // "no handle" as "nothing happened" and opening one on every click.
      window.open(url, '_blank', 'noopener');
      markAdOpened('click', now);
    };

    // Bubble phase, after the application's own handlers, and without ever
    // stopping propagation or preventing the default action.
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [enabled, url, cooldownSeconds, excludedRoutes]);

  // Opt-in diagnostics, shared shape with the popunder report.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const last = lastAdAt('click');
    const nextAt = last ? last + cooldownSeconds * 1000 : 0;
    const report = {
      placement: 'clickAd',
      enabled,
      url: url || null,
      route: pathname,
      routeExcluded: excludedRoutes.some((p) => pathname === p || pathname.startsWith(`${p}/`)),
      staffExcluded: Boolean(role && role !== 'USER'),
      sessionStatus: status,
      cooldownSeconds,
      lastClickAdAt: last ? new Date(last).toISOString() : null,
      nextEligibleAt: nextAt > Date.now() ? new Date(nextAt).toISOString() : 'now',
    };
    (window as unknown as { __anizoraClickAd?: unknown }).__anizoraClickAd = report;
    try {
      if (new URLSearchParams(window.location.search).has('addebug')) console.info('[anizora:clickad]', report);
    } catch {
      /* ignore */
    }
  }, [enabled, url, pathname, status, role, cooldownSeconds, excludedRoutes]);

  return null;
}
