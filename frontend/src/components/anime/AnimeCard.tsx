import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import type { AnimeCard as AnimeCardType } from '@/lib/types';
import { cn, formatDuration, typeLabel } from '@/lib/utils';

interface AnimeCardProps {
  anime: AnimeCardType;
  /** Shows the episode badges and score overlay. Off for compact rails. */
  detailed?: boolean;
  priority?: boolean;
  className?: string;
}

/**
 * Catalogue card.
 *
 * The hover outline lives on the padded <article>, not on the poster. Putting
 * it on the poster meant it only ever framed the artwork — the title and
 * metadata sat outside it — and it shared an element with `overflow-hidden`,
 * which is what the zooming image needs. A ring is painted outside the border
 * box (it is a box-shadow), so it also needs breathing room inside any
 * scrolling ancestor; the padding here supplies it and the rails add their own.
 *
 * The ring is always present and only changes colour on hover, so nothing
 * reflows: box-shadows take no layout space at all.
 */
export function AnimeCard({ anime, detailed = true, priority = false, className }: AnimeCardProps) {
  return (
    <Link
      href={`/anime/${anime.slug}`}
      className={cn('group/card block focus:outline-none', className)}
      aria-label={anime.title}
    >
      <article className="relative rounded-2xl p-2 ring-1 ring-transparent transition-[background-color,box-shadow] duration-300 group-hover/card:bg-surface-2/50 group-hover/card:ring-brand/70 group-hover/card:shadow-[0_10px_34px_-16px_rgb(124_92_255/0.75)] group-focus-visible/card:bg-surface-2/50 group-focus-visible/card:ring-accent">
        <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-surface-2 ring-1 ring-line-soft/70">
          {anime.posterUrl ? (
            <Image
              src={anime.posterUrl}
              alt=""
              fill
              sizes="(max-width: 640px) 45vw, (max-width: 1024px) 25vw, 16vw"
              priority={priority}
              className="object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/card:scale-[1.07]"
            />
          ) : (
            <div className="grid h-full place-items-center text-[11px] text-ink-faint">No artwork</div>
          )}

          {/* Bottom scrim, deepens on hover so the badges stay readable. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent opacity-90 transition-opacity group-hover/card:opacity-100" />

          {detailed ? (
            <>
              <div className="absolute left-2.5 top-2.5 flex flex-col gap-1.5">
                {anime.score > 0 ? (
                  <span className="rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-bold text-gold backdrop-blur-sm">
                    ★ {anime.score.toFixed(1)}
                  </span>
                ) : null}
              </div>

              <span className="absolute right-2.5 top-2.5 rounded-md bg-brand/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
                {typeLabel(anime.type)}
              </span>

              <div className="absolute inset-x-2.5 bottom-2.5 flex flex-wrap items-center gap-1.5">
                {anime.subCount > 0 ? (
                  <Badge tone="sub" label="SUB" value={anime.subCount} />
                ) : null}
                {anime.dubCount > 0 ? <Badge tone="dub" label="DUB" value={anime.dubCount} /> : null}
                {anime.totalEpisodes && anime.subCount === 0 && anime.dubCount === 0 ? (
                  <Badge tone="neutral" label="EP" value={anime.totalEpisodes} />
                ) : null}
              </div>
            </>
          ) : null}

          {/* Hover play affordance */}
          <span className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-300 group-hover/card:opacity-100">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-brand/95 shadow-[0_0_28px_-4px_rgb(124_92_255/0.9)]">
              <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-5 w-5 text-white" aria-hidden="true">
                <path d="M7.5 4.8a1 1 0 0 1 1.52-.85l9.2 6.2a1 1 0 0 1 0 1.7l-9.2 6.2a1 1 0 0 1-1.52-.85V4.8Z" />
              </svg>
            </span>
          </span>
        </div>

        <div className="px-0.5 pb-0.5 pt-2.5">
          <h3 className="clamp-2 text-[13px] font-semibold leading-snug text-ink transition-colors group-hover/card:text-brand-bright">
            {anime.title}
          </h3>
          {detailed ? (
            <p className="mt-1.5 truncate text-[11.5px] text-ink-faint">
              {[anime.releaseYear, typeLabel(anime.type), formatDuration(anime.durationMinutes)]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
        </div>
      </article>
    </Link>
  );
}

function Badge({ tone, label, value }: { tone: 'sub' | 'dub' | 'neutral'; label: string; value: number }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold backdrop-blur-sm',
        tone === 'sub' && 'bg-accent/90 text-[#04221f]',
        tone === 'dub' && 'bg-hot/90 text-white',
        tone === 'neutral' && 'bg-white/20 text-ink',
      )}
    >
      {label} {value}
    </span>
  );
}

/** Mirrors the card's padding so grids do not jump when content arrives. */
export function AnimeCardSkeleton() {
  return (
    <div className="rounded-2xl p-2">
      <div className="skeleton aspect-[2/3] rounded-lg" />
      <div className="skeleton mt-2.5 h-3.5 w-11/12 rounded" />
      <div className="skeleton mt-1.5 h-3 w-2/3 rounded" />
    </div>
  );
}
