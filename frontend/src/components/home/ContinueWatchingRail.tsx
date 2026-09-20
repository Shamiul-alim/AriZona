'use client';

import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { authFetch, useAuthStore } from '@/lib/auth-store';
import type { ContinueWatchingItem } from '@/lib/types';
import { SectionHeader } from '@/components/anime/SectionHeader';

function remainingLabel(seconds: number | null): string | null {
  if (seconds == null) return null;
  if (seconds < 60) return 'Less than a minute left';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min left` : `${hours} h left`;
}

/**
 * "Continue Watching" for the signed-in viewer. Rendered client-side because
 * the homepage itself is cached for everyone; this row is per-user and is
 * re-fetched whenever the viewer comes back to the tab.
 */
export function ContinueWatchingRail() {
  const userId = useAuthStore((s) => (s.status === 'authenticated' ? s.user?.id : null));
  const [items, setItems] = useState<ContinueWatchingItem[] | null>(null);

  const load = useCallback(() => {
    if (!userId) return;
    authFetch<ContinueWatchingItem[]>('/watch-history/continue?limit=12')
      .then(setItems)
      .catch(() => setItems([]));
  }, [userId]);

  useEffect(() => {
    setItems(null);
    if (!userId) return;
    load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId, load]);

  if (!userId || !items || items.length === 0) return null;

  return (
    <section data-testid="continue-watching">
      <SectionHeader title="Continue Watching" href="/profile/history" linkLabel="History" />
      <div className="rail -m-2 flex snap-x snap-mandatory gap-3 overflow-x-auto p-2">
        {items.map((item) => (
          <ContinueCard key={item.anime.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function ContinueCard({ item }: { item: ContinueWatchingItem }) {
  const { anime, episode } = item;
  const image = episode.thumbnailUrl ?? anime.bannerUrl ?? anime.posterUrl;
  const isNext = item.state === 'next';
  const percent = Math.min(100, Math.max(0, item.percent));
  const remaining = remainingLabel(item.remainingSeconds);

  return (
    <Link
      href={`/watch/${anime.slug}/ep-${episode.number}`}
      data-testid="continue-card"
      className="group w-[72vw] shrink-0 snap-start sm:w-[44vw] md:w-[31vw] lg:w-[24vw] xl:w-[19vw]"
      aria-label={`${isNext ? 'Play' : 'Resume'} ${anime.titleEnglish} episode ${episode.number}`}
    >
      <div className="relative aspect-video overflow-hidden rounded-xl bg-surface-2 ring-1 ring-white/6 transition group-hover:ring-brand/60">
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            sizes="(min-width: 1280px) 19vw, (min-width: 1024px) 24vw, (min-width: 768px) 31vw, 72vw"
            className="object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />

        <span className="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-brand/95 shadow-[0_0_30px_-4px_rgb(124_92_255/0.9)]">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 text-white" fill="currentColor" aria-hidden="true">
              <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
            </svg>
          </span>
        </span>

        <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft backdrop-blur">
          {isNext ? 'Up next' : `EP ${episode.number}`}
        </span>

        <div className="absolute inset-x-0 bottom-0 px-2.5 pb-2.5">
          <p className="line-clamp-1 text-[13.5px] font-semibold text-ink">{anime.titleEnglish}</p>
          <p className="line-clamp-1 text-[11.5px] text-ink-muted">
            Episode {episode.number}
            {episode.title ? ` · ${episode.title}` : ''}
          </p>
        </div>

        {!isNext ? (
          <div
            className="absolute inset-x-0 bottom-0 h-1 bg-white/20"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="Watched"
          >
            <div className="h-full bg-brand-bright" style={{ width: `${percent}%` }} />
          </div>
        ) : null}
      </div>
      <p className="mt-1.5 px-0.5 text-[11.5px] text-ink-faint">
        {isNext ? 'Start next episode' : [`${percent}% watched`, remaining].filter(Boolean).join(' · ')}
      </p>
    </Link>
  );
}
