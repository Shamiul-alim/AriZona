'use client';

import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeaturedEntry } from '@/lib/types';
import { cn, formatDuration, statusLabel, typeLabel } from '@/lib/utils';

const ROTATE_MS = 8000;
/** Shortest horizontal travel counted as a swipe rather than a stray tap. */
const SWIPE_PX = 40;

/**
 * Honours the OS "reduce motion" setting without an animation library.
 * The slider used to pull this from framer-motion, which cost the homepage a
 * large client bundle for two crossfades that CSS does natively.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

export function HeroSlider({ entries }: { entries: FeaturedEntry[] }) {
  const touchX = useRef<number | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Bumped by any manual move so the autoplay timer below restarts: without it
  // a click could be followed by an automatic slide a moment later, which reads
  // as the arrow having jumped two.
  const [manualNonce, setManualNonce] = useState(0);
  const reduceMotion = usePrefersReducedMotion();

  const wrap = useCallback((next: number, length: number) => ((next % length) + length) % length, []);

  /** Jump to an absolute slide — what the dots do. */
  const go = useCallback(
    (next: number) => {
      if (entries.length === 0) return;
      setIndex(wrap(next, entries.length));
      setManualNonce((n) => n + 1);
    },
    [entries.length, wrap],
  );

  /**
   * Move by one, relative to whatever is showing now.
   *
   * Derived inside the updater rather than from the rendered `index`, so two
   * fast clicks advance two slides instead of both computing from the same
   * stale value and landing on the same one.
   */
  const step = useCallback(
    (delta: number) => {
      if (entries.length === 0) return;
      setIndex((i) => wrap(i + delta, entries.length));
      setManualNonce((n) => n + 1);
    },
    [entries.length, wrap],
  );

  useEffect(() => {
    if (paused || entries.length <= 1 || reduceMotion) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % entries.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [paused, entries.length, reduceMotion, manualNonce]);

  if (entries.length === 0) return null;

  const entry = entries[index];
  const anime = entry.anime;

  return (
    <section
      className="group relative h-[clamp(26rem,62vh,36rem)] w-full overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const from = touchX.current;
        touchX.current = null;
        if (from === null) return;
        const dx = (e.changedTouches[0]?.clientX ?? from) - from;
        // Far enough to be a swipe rather than a tap that drifted.
        if (Math.abs(dx) >= SWIPE_PX) step(dx < 0 ? 1 : -1);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          step(1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          step(-1);
        }
      }}
      aria-roledescription="carousel"
      aria-label="Featured anime"
    >
      {/* Every backdrop is layered and crossfaded with a CSS transition, which
          keeps the previous slide visible while the next fades in — the same
          effect the animation library provided. */}
      {entries.map((item, i) => {
        const src = item.backdropUrl ?? item.anime.bannerUrl ?? item.anime.posterUrl;
        if (!src) return null;
        return (
          <div
            key={item.id}
            aria-hidden={i !== index}
            className={cn(
              'absolute inset-0 transition-[opacity,transform] duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
              i === index ? 'scale-100 opacity-100' : 'scale-[1.06] opacity-0',
            )}
          >
            <Image
              src={src}
              alt=""
              fill
              priority={i === 0}
              sizes="100vw"
              className="object-cover object-center"
            />
          </div>
        );
      })}

      {/* Scrims: vertical for text legibility, horizontal to blend into the page. */}
      <div className="absolute inset-0 bg-gradient-to-t from-void via-void/70 to-void/20" />
      <div className="absolute inset-0 bg-gradient-to-r from-void via-void/55 to-transparent" />

      <div className="relative mx-auto flex h-full max-w-[1600px] items-end px-4 pb-14 md:px-6 md:pb-16">
        <div key={entry.id} className="animate-hero-rise flex max-w-2xl items-end gap-5">
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
                  <span className="rounded bg-hot-deep px-1.5 py-0.5 text-[10px] font-bold text-white">
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
        </div>
      </div>

      {/* Manual navigation. The dots remain the way to jump to a specific
          slide; these move one at a time and wrap, like the autoplay does. */}
      {entries.length > 1 ? (
        <>
          <SliderArrow direction="prev" onClick={() => step(-1)} />
          <SliderArrow direction="next" onClick={() => step(1)} />
        </>
      ) : null}

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
                'relative h-1.5 rounded-full transition-all duration-300',
                // The dot stays 6px; the tappable box around it does not.
                "before:absolute before:-inset-x-2 before:-inset-y-[19px] before:content-['']",
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

/**
 * One previous/next control.
 *
 * Sits clear of the slide's text and buttons: vertically centred at the very
 * edges, where the copy never reaches. Always visible on a touch pointer, where
 * there is no hover to reveal it.
 */
function SliderArrow({ direction, onClick }: { direction: 'prev' | 'next'; onClick: () => void }) {
  const isPrev = direction === 'prev';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isPrev ? 'Previous featured title' : 'Next featured title'}
      className={cn(
        'absolute top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full',
        'border border-white/15 bg-black/45 text-ink backdrop-blur transition',
        'hover:bg-black/70 hover:text-white',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright',
        // Out of the way on a desktop until the slider is hovered or focused,
        // but never hidden from a keyboard or a touch screen.
        'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100',
        'pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:opacity-100',
        isPrev ? 'left-2 md:left-4' : 'right-2 md:right-4',
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={isPrev ? 'm15 18-6-6 6-6' : 'm9 6 6 6-6 6'} />
      </svg>
    </button>
  );
}
