'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { AdsterraClickAd } from './AdsterraClickAd';
import { AdsterraPopunder } from './AdsterraPopunder';
import { isRouteExcluded } from '@/lib/adsterra';
import { ADSTERRA } from '@/lib/config';

/**
 * The one place that decides whether any advertising code exists on a page.
 *
 * Inside the admin panel nothing ad-related is *mounted at all* — no vendor
 * script, no click listener, no gate attribute, no globals. Each mechanism
 * already refuses to act on /admin, but that is a decision made at runtime by
 * code that is nonetheless present. Not mounting removes the question: on
 * /admin there is nothing to go wrong, including immediately after a
 * client-side navigation into it, when unmounting also removes the click
 * listener the public pages installed.
 */
export function AdsMount() {
  const pathname = usePathname();
  const blocked = isRouteExcluded(pathname, ADSTERRA.neverRoutes);

  // Unmounting stops our code running, but the vendor's layer and the gate
  // attribute are plain DOM left over from the public page we navigated from.
  // If that attribute still said "on", the layer would remain clickable over
  // the admin UI. Force it shut whenever we are on a blocked route.
  useEffect(() => {
    if (blocked) document.documentElement.dataset.popunder = 'off';
  }, [blocked, pathname]);

  if (blocked) return null;

  return (
    <>
      <AdsterraPopunder />
      <AdsterraClickAd />
    </>
  );
}
