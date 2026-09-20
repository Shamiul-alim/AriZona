'use client';

import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import type { FeaturedEntry } from '@/lib/types';
import { cn, formatDuration, statusLabel, typeLabel } from '@/lib/utils';

const ROTATE_MS = 8000;

export function HeroSlider({ entries }: { entries: FeaturedEntry[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  const go = useCallback(
    (next: number) => {
      if (entries.length === 0) return;
      setIndex(((next % entries.length) + entries.length) % entries.length);
    },
    [entries.length],
  );

  useEffect(() => {
    if (paused || entries.length <= 1 || reduceMotion) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % entries.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [paused, entries.length, reduceMotion]);

  if (entries.length === 0) return null;

  const entry = entries[index];
  const anime = entry.anime;
  const backdrop = entry.backdropUrl ?? anime.bannerUrl ?? anime.posterUrl;

  return (
    <section
      className="relative h-[clamp(26rem,62vh,36rem)] w-full overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured anime"
    >
      <AnimatePresence mode="sync">
        <motion.div
          key={entry.id}
          initial={{ opacity: 0, scale: reduceMotion ? 1 : 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0"
        >
          {backdrop ? (
            <Image
              src={backdrop}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-center"
            />
          ) : null}
        </motion.div>
      </AnimatePresence>

      {/* Scrims: vertical for text legibility, horizontal to blend into the page. */}
      <div className="absolute inset-0 bg-gradient-to-t from-void via-void/70 to-void/20" />
      <div className="absolute inset-0 bg-gradient-to-r from-void via-void/55 to-transparent" />

      <div className="relative mx-auto flex h-full max-w-[1600px] items-end px-4 pb-14 md:px-6 md:pb-16">
        <AnimatePresence mode="wait">
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 22 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -14 }}
            transition={{ duration: reduceMotion ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="flex max-w-2xl items-end gap-5"
          >
            {anime.posterUrl ? (
              <div className="relative hidden aspect-[2/3] w-32 shrink-0 overflow-hidden rounded-xl shadow-lift ring-1 ring-white/10 md:block lg:w-40">
                <Image src={anime.posterUrl} alt="" fill sizes="160px" className="object-cover" />
              </div>
            ) : null}

            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-bright ring-1 ring-brand/40">
                Featured
              </span>

              <h1 className="clamp-2 mt-3 text-[clamp(1.6rem,4.4vw,2.9rem)] font-extrabold leading-[1.08] text-ink">
                {entry.headline ?? anime.title}
              </h1>

              {entry.subtitle ? (
                <p className="mt-1.5 text-[13px] font-medium text-accent md:text-[14px]">{entry.subtitle}</p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12px] text-ink-soft">
                {anime.score > 0 ? <span className="font-bold text-gold">★ {anime.score.toFixed(1)}</span> : null}
                <Dot />
                <span>{typeLabel(anime.type)}</span>
                <Dot />
                <span>{statusLabel(anime.status)}</span>
                {anime.releaseYear ? (
                  <>
                    <Dot />
                    <span>{anime.releaseYear}</span>
                  </>
                ) : null}
                {anime.durationMinutes ? (
                  <>
                    <Dot />
                    <span>{formatDuration(anime.durationMinutes)}</span>
                  </>
                ) : null}
                {anime.subCount > 0 ? (
                  <span className="rounded bg-accent/90 px-1.5 py-0.5 text-[10px] font-bold text-[#04221f]">
                    SUB {anime.subCount}
                  </span>
                ) : null}
                {anime.dubCount > 0 ? (
                  <span className="rounded bg-hot/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    DUB {anime.dubCount}
                  </span>
                ) : null}
              </div>

              {anime.synopsis ? (
                <p className="clamp-3 mt-3 max-w-xl text-[13.5px] leading-relaxed text-ink-muted">{anime.synopsis}</p>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2.5">
                <Link
                  href={`/watch/${anime.slug}/ep-1`}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-[14px] font-semibold text-white shadow-[0_0_28px_-8px_rgb(124_92_255/0.9)] transition hover:bg-brand-bright hover:shadow-[0_0_36px_-6px_rgb(124_92_255/0.95)]"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                    <path d="M7.5 4.8a1 1 0 0 1 1.52-.85l9.2 6.2a1 1 0 0 1 0 1.7l-9.2 6.2a1 1 0 0 1-1.52-.85V4.8Z" />
                  </svg>
                  {entry.ctaLabel ?? 'Watch Now'}
                </Link>
                <Link
                  href={`/anime/${anime.slug}`}
                  className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-[14px] font-semibold text-ink backdrop-blur transition hover:bg-white/12"
                >
                  Details
                </Link>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Pagination */}
      {entries.length > 1 ? (
        <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 gap-2 md:left-auto md:right-8 md:translate-x-0">
          {entries.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show slide ${i + 1}`}
              aria-current={i === index}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === index ? 'w-7 bg-brand-bright' : 'w-1.5 bg-white/35 hover:bg-white/60',
              )}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Dot() {
  return <span className="text-ink-faint">·</span>;
}
