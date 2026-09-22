'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { isRouteExcluded, isStaff } from '@/lib/adsterra';
import { useAuthStore } from '@/lib/auth-store';
import { ADSTERRA, type BannerSize } from '@/lib/config';
import { cn } from '@/lib/utils';

/**
 * An Adsterra display banner.
 *
 * WHY EACH BANNER GETS ITS OWN FRAME
 * ----------------------------------
 * The vendor loader reads a global `atOptions`, deletes it, and inserts its
 * creative next to `document.currentScript`. Two banners loading at the same
 * time on one page would race for that single global. Rendering every unit in
 * its own `srcdoc` document gives each one a private `window`, so they cannot
 * collide however many are on a page or however routes change.
 *
 * WHY THERE IS NO LAYOUT SHIFT
 * ----------------------------
 * The box is sized to the exact creative dimensions before anything loads —
 * by CSS for the responsive variant, so the right height is reserved on the
 * very first paint, server-rendered. The frame is only created once the slot
 * is near the viewport, so banners below the fold cost nothing at load and
 * never compete with the page's main content.
 */

const DIMENSIONS: Record<BannerSize, { w: number; h: number }> = {
  '728x90': { w: 728, h: 90 },
  '468x60': { w: 468, h: 60 },
  '320x50': { w: 320, h: 50 },
  '300x250': { w: 300, h: 250 },
  '160x300': { w: 160, h: 300 },
};

function frameDocument(key: string, w: number, h: number): string {
  // The key is validated to 32 hex characters, so nothing here is injectable.
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}</style></head><body>' +
    `<script>atOptions={'key':'${key}','format':'iframe','height':${h},'width':${w},'params':{}};<\/script>` +
    `<script src="${ADSTERRA.banners.host}/${key}/invoke.js"><\/script>` +
    '</body></html>'
  );
}

function BannerFrame({ size }: { size: BannerSize }) {
  const key = ADSTERRA.banners.units[size];
  const { w, h } = DIMENSIONS[size];
  if (!/^[0-9a-f]{32}$/.test(key)) return null;
  return (
    <iframe
      title="Advertisement"
      width={w}
      height={h}
      scrolling="no"
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      className="block border-0"
      style={{ width: w, height: h }}
      srcDoc={frameDocument(key, w, h)}
    />
  );
}

export type BannerLayout = 'leaderboard' | 'rectangle' | 'skyscraper';

/**
 * Which creative each layout uses at each breakpoint. The heights are fixed
 * classes so the server-rendered box already has the final size.
 */
const LAYOUTS: Record<BannerLayout, { box: string; pick: () => BannerSize }> = {
  // 728x90 on desktop, 468x60 on tablets, 320x50 on phones.
  leaderboard: {
    box: 'h-[50px] min-[480px]:h-[60px] md:h-[90px]',
    pick: () =>
      window.matchMedia('(min-width: 768px)').matches
        ? '728x90'
        : window.matchMedia('(min-width: 480px)').matches
          ? '468x60'
          : '320x50',
  },
  rectangle: { box: 'h-[250px]', pick: () => '300x250' },
  skyscraper: { box: 'h-[300px]', pick: () => '160x300' },
};

interface AdsterraBannerProps {
  layout: BannerLayout;
  className?: string;
}

export function AdsterraBanner({ layout, className }: AdsterraBannerProps) {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role ?? null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<BannerSize | null>(null);

  const { box, pick } = LAYOUTS[layout];
  const allowed =
    ADSTERRA.banners.enabled && !isRouteExcluded(pathname, ADSTERRA.banners.excludedRoutes) && !isStaff(role);

  useEffect(() => {
    if (!allowed || size) return;
    const el = boxRef.current;
    if (!el) return;
    // Create the frame only when the slot is about to be seen.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSize(pick());
          observer.disconnect();
        }
      },
      { rootMargin: '300px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [allowed, size, pick]);

  if (!allowed) return null;

  return (
    <aside className={cn('w-full', className)} aria-label="Advertisement">
      <p className="mb-1 text-center text-[10px] uppercase tracking-wider text-ink-faint">Advertisement</p>
      <div ref={boxRef} className={cn('flex w-full items-center justify-center overflow-hidden', box)}>
        {size ? <BannerFrame size={size} /> : null}
      </div>
    </aside>
  );
}
