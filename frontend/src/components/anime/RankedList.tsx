import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import type { AnimeCard } from '@/lib/types';
import { cn, formatCount, typeLabel } from '@/lib/utils';

/** Numbered ranking list used for Top Anime and Most Viewed. */
export function RankedList({ items }: { items: AnimeCard[] }) {
  if (items.length === 0) {
    return <p className="px-1 py-6 text-center text-[13px] text-ink-faint">Nothing ranked yet.</p>;
  }

  return (
    <ol className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line-soft bg-surface/50">
      {items.map((anime, index) => (
        <li key={anime.id}>
          <Link href={`/anime/${anime.slug}`} className="group/row flex items-center gap-3 px-3 py-2.5 transition hover:bg-white/5">
            <span
              className={cn(
                'w-6 shrink-0 text-center text-[15px] font-extrabold tabular-nums',
                index === 0 && 'text-gold',
                index === 1 && 'text-ink-soft',
                index === 2 && 'text-[#c98b5e]',
                index > 2 && 'text-ink-faint',
              )}
            >
              {index + 1}
            </span>

            <span className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md bg-surface-2">
              {anime.posterUrl ? (
                <Image src={anime.posterUrl} alt="" fill sizes="40px" className="object-cover" />
              ) : null}
            </span>

            <span className="min-w-0 flex-1">
              <span className="clamp-2 block text-[13px] font-semibold leading-snug text-ink transition-colors group-hover/row:text-brand-bright">
                {anime.title}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
                <span>{typeLabel(anime.type)}</span>
                {anime.subCount > 0 ? (
                  <span className="rounded bg-accent/85 px-1 py-px text-[9.5px] font-bold text-[#04221f]">
                    SUB {anime.subCount}
                  </span>
                ) : null}
                {anime.dubCount > 0 ? (
                  <span className="rounded bg-hot/85 px-1 py-px text-[9.5px] font-bold text-white">
                    DUB {anime.dubCount}
                  </span>
                ) : null}
              </span>
            </span>

            <span className="shrink-0 text-right">
              {anime.score > 0 ? (
                <span className="block text-[12px] font-bold text-gold">★ {anime.score.toFixed(1)}</span>
              ) : null}
              <span className="block text-[10.5px] text-ink-faint">{formatCount(anime.viewCount)} views</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
