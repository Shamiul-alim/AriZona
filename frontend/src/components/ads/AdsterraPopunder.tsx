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

export function AdsterraPopunder() {
  const pathname = usePathname();
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.user?.role ?? null);

  useEffect(() => {
    const allowed = shouldArmPopunder({
      enabled: ADSTERRA.enabled,
      scriptSrc: ADSTERRA.popunderSrc,
      pathname,
      status,
      role,
      lastArmedAt: readLastArmed(),
      frequencyHours: ADSTERRA.frequencyHours,
      now: Date.now(),
      alreadyInjected: injected,
    });
    if (!allowed) return;

    try {
      const script = document.createElement('script');
      script.src = ADSTERRA.popunderSrc;
      script.async = true;
      script.dataset.cfasync = 'false';
      script.referrerPolicy = 'no-referrer-when-downgrade';
      script.onerror = () => {
        // A blocked or failed script must never break the page; allow a retry
        // on a later navigation.
        injected = false;
      };
      document.body.appendChild(script);
      injected = true;
      markArmed();
    } catch {
      injected = false;
    }
  }, [pathname, status, role]);

  return null;
}
