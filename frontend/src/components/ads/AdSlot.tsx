'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ADS, ADSTERRA } from '@/lib/config';
import { AdsterraBanner } from './AdsterraBanner';
import type { AdsConfig, DisplayPlacement } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Google AdSense display slot.
 *
 * Rules this component enforces, because ad UX is easy to get wrong:
 *  * Slots are reserved at a fixed height, so an ad loading (or failing to
 *    load) never shifts the page around it.
 *  * Every unit is labelled "Advertisement". Nothing is styled to resemble a
 *    button, a play control, or site navigation.
 *  * A placement that is disabled, or missing its publisher/slot ID, renders
 *    nothing at all in production.
 *
 * Placement configuration is fetched from the admin-managed API, so slots can
 * be switched on and off without a deploy.
 */

let configPromise: Promise<AdsConfig> | null = null;

function loadAdsConfig(): Promise<AdsConfig> {
  if (!configPromise) {
    configPromise = apiFetch<AdsConfig>('/ads/config').catch(() => ({
      display: [],
      video: { enabled: false as const },
    }));
  }
  return configPromise;
}

let scriptInjected = false;

function ensureAdSenseScript(client: string): void {
  if (scriptInjected || typeof document === 'undefined') return;
  if (document.querySelector('script[data-anizora-adsense]')) {
    scriptInjected = true;
    return;
  }
  const script = document.createElement('script');
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.setAttribute('data-anizora-adsense', 'true');
  document.head.appendChild(script);
  scriptInjected = true;
}

export type AdFormat = 'banner' | 'leaderboard' | 'rectangle' | 'sidebar' | 'in-feed';

const HEIGHTS: Record<AdFormat, string> = {
  banner: 'min-h-[90px]',
  leaderboard: 'min-h-[90px] md:min-h-[100px]',
  rectangle: 'min-h-[250px]',
  sidebar: 'min-h-[600px]',
  'in-feed': 'min-h-[120px]',
};

interface AdSlotProps {
  /** Placement key as configured in the admin panel, e.g. "watch_below_player". */
  placementKey: string;
  format?: AdFormat;
  className?: string;
}

export function AdSlot(props: AdSlotProps) {
  // Positions mapped to an Adsterra banner render it directly: its size is
  // known up front, so it needs no config round trip and never shifts layout.
  const layout = ADSTERRA.banners.enabled ? ADSTERRA.banners.slots[props.placementKey] : undefined;
  if (layout) return <AdsterraBanner layout={layout} className={props.className} />;
  return <AdSenseSlot {...props} />;
}

function AdSenseSlot({ placementKey, format = 'leaderboard', className }: AdSlotProps) {
  const [placement, setPlacement] = useState<DisplayPlacement | null>(null);
  const [resolved, setResolved] = useState(false);
  const insRef = useRef<HTMLModElement | null>(null);
  const pushedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void loadAdsConfig().then((config) => {
      if (cancelled) return;
      setPlacement(config.display.find((p) => p.key === placementKey) ?? null);
      setResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, [placementKey]);

  useEffect(() => {
    if (!placement?.adClient || !placement.adSlot || pushedRef.current) return;
    ensureAdSenseScript(placement.adClient);
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({});
      pushedRef.current = true;
    } catch {
      // A blocked or absent AdSense script is a normal outcome, not an error.
    }
  }, [placement]);

  // Nothing configured. In development we show a clearly-marked reservation so
  // layout can be checked; in production we render nothing at all.
  if (resolved && (!placement || !placement.adClient || !placement.adSlot)) {
    if (process.env.NODE_ENV === 'production') return null;
    return (
      <div
        className={cn(
          'grid place-items-center rounded-xl border border-dashed border-line text-center',
          HEIGHTS[format],
          className,
        )}
        aria-hidden="true"
      >
        <span className="px-4 text-[11px] leading-relaxed text-ink-faint">
          Ad placement <code className="text-ink-muted">{placementKey}</code>
          <br />
          Not configured — add your AdSense IDs in Admin → Ads
        </span>
      </div>
    );
  }

  if (!resolved) {
    // Reserving space here and then collapsing it when the placement turns out
    // to be unconfigured shifted every page in production. Only reserve where
    // an ad is actually configured to appear (development shows the outline).
    if (process.env.NODE_ENV === 'production') return null;
    return <div className={cn('rounded-xl', HEIGHTS[format], className)} aria-hidden="true" />;
  }

  return (
    <aside className={cn('w-full', className)} aria-label="Advertisement">
      <p className="mb-1 text-center text-[10px] uppercase tracking-wider text-ink-faint">Advertisement</p>
      <div className={cn('overflow-hidden rounded-xl', HEIGHTS[format])}>
        <ins
          ref={insRef}
          className="adsbygoogle block"
          style={{ display: 'block' }}
          data-ad-client={placement!.adClient!}
          data-ad-slot={placement!.adSlot!}
          data-ad-format={placement!.format ?? 'auto'}
          data-full-width-responsive={placement!.fullWidthResponsive ? 'true' : 'false'}
          {...(ADS.testMode ? { 'data-adtest': 'on' } : {})}
        />
      </div>
    </aside>
  );
}
