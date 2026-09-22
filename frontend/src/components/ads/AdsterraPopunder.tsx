'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { ADSTERRA } from '@/lib/config';
import { shouldArmPopunder } from '@/lib/adsterra';
import { useAuthStore } from '@/lib/auth-store';

/**
 * Loads the Adsterra **popunder** script.
 *
 * WHY THIS FORMAT
 * ---------------
 * The requirement was "nothing visible on the site, but an advert may open when
 * the visitor clicks". That is precisely what a popunder does: it renders no
 * markup, arms itself on the page, and on a qualifying click opens the advert
 * in its own window while AniZora stays open and usable. No link or button is
 * hijacked here and no redirect is written by us — the vendor script owns that
 * behaviour, which is what keeps this a supported integration rather than a
 * home-made redirect.
 *
 * FREQUENCY
 * ---------
 * Adsterra caps impressions itself, via a `pp_main_<placement>` cookie it sets
 * and the frequency configured on the placement. We therefore do NOT impose a
 * second cap by default. An earlier version marked this browser as "armed" the
 * moment the script tag was appended — before the vendor had decided whether to
 * show anything — which spent a 12-hour cooldown on every first page view and
 * meant the script was usually never loaded again. The marker is now written
 * only once the vendor script has actually loaded, and only matters at all if
 * an operator sets NEXT_PUBLIC_ADSTERRA_FREQUENCY_HOURS to impose an extra
 * ceiling of their own.
 *
 * Every rule about *when* it may arm lives in `shouldArmPopunder`, which is
 * unit-tested. This component only gathers the inputs and injects the script.
 * It renders nothing, and injects at most once per page load, so it cannot
 * stack popunders or loop.
 */

const STORAGE_KEY = 'anizora.adsterra.lastArmed';

/** Module scope: one injection per full page load, survives route changes. */
let injected = false;

function readLastArmed(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? Number(raw) : null;
  } catch {
    // Blocked storage: treat as never armed and rely on the per-load guard.
    return null;
  }
}

function markArmed(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* storage unavailable; the per-load guard still applies */
  }
}

/**
 * Opt-in diagnostics: add `?addebug=1` to any URL to have the decision printed
 * to the console and mirrored on `window.__anizoraAds`. Nothing is reported
 * unless asked for, and it carries no account or credential data — only the
 * placement URL, which is public in the page source anyway.
 */
function report(state: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  let wanted = false;
  try {
    wanted = new URLSearchParams(window.location.search).has('addebug');
  } catch {
    wanted = false;
  }
  (window as unknown as { __anizoraAds?: unknown }).__anizoraAds = state;
  if (wanted) console.info('[anizora:ads]', state);
}

export function AdsterraPopunder() {
  const pathname = usePathname();
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.user?.role ?? null);

  useEffect(() => {
    const lastArmedAt = readLastArmed();
    const context = {
      enabled: ADSTERRA.enabled,
      scriptSrc: ADSTERRA.popunderSrc,
      pathname,
      status,
      role,
      lastArmedAt,
      frequencyHours: ADSTERRA.frequencyHours,
      now: Date.now(),
      alreadyInjected: injected,
    };
    const allowed = shouldArmPopunder(context);

    /** One shape for every report, so the fields never disagree between them. */
    const describe = (extra: Record<string, unknown>) => ({
      adsEnabled: ADSTERRA.enabled,
      scriptConfigured: Boolean(ADSTERRA.popunderSrc),
      scriptUrl: ADSTERRA.popunderSrc || null,
      route: pathname,
      routeExcluded: /^\/(admin|auth)(\/|$)/.test(pathname),
      sessionStatus: status,
      staffExcluded: Boolean(role && role !== 'USER'),
      extraCooldownHours: ADSTERRA.frequencyHours || 'disabled (Adsterra decides)',
      lastLoadedAt: lastArmedAt ? new Date(lastArmedAt).toISOString() : null,
      alreadyInjectedThisPageLoad: injected,
      willInject: allowed,
      scriptLoaded: false,
      ...extra,
    });

    report(describe({}));

    if (!allowed) return;

    try {
      const script = document.createElement('script');
      script.src = ADSTERRA.popunderSrc;
      script.async = true;
      script.dataset.cfasync = 'false';
      script.referrerPolicy = 'no-referrer-when-downgrade';
      script.onload = () => {
        // Only now has the vendor actually taken over: record the load, so an
        // optional operator-imposed ceiling measures something real.
        markArmed();
        report(describe({ scriptLoaded: true }));
      };
      script.onerror = () => {
        // Blocked by an extension or a network failure. Never break the page,
        // and allow a retry on a later navigation rather than burning a slot.
        injected = false;
        report(describe({ scriptLoaded: false, blocked: true }));
      };
      document.body.appendChild(script);
      injected = true;
    } catch {
      injected = false;
    }
  }, [pathname, status, role]);

  return null;
}
