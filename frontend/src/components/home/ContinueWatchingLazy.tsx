'use client';

import dynamic from 'next/dynamic';

/**
 * Keeps the Continue Watching rail out of the initial bundle.
 *
 * The rail renders nothing at all for signed-out visitors — which is most of
 * them — and its data is fetched on the client after the session resolves, so
 * server rendering it gains nothing. Loading it separately means its code is
 * not parsed or hydrated as part of the first page load, where the homepage
 * spends its single longest main-thread task.
 *
 * `ssr: false` is only permitted inside a Client Component, which is the only
 * reason this wrapper exists.
 */
const Rail = dynamic(() => import('./ContinueWatchingRail').then((m) => m.ContinueWatchingRail), {
  ssr: false,
});

export function ContinueWatchingLazy() {
  return <Rail />;
}
