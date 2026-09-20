'use client';

import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { EpisodeSummary } from '@/lib/types';
import { cn, formatTime } from '@/lib/utils';

interface EpisodeListProps {
  animeSlug: string;
  episodes: EpisodeSummary[];
  currentEpisode?: number | null;
  /** Compact list mode used in the watch page sidebar. */
  compact?: boolean;
}

/** Long series are chunked into ranges so the DOM stays small. */
const CHUNK_SIZE = 100;

export function EpisodeList({ animeSlug, episodes, currentEpisode, compact = false }: EpisodeListProps) {
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>(compact ? 'list' : 'list');
  const [rangeStart, setRangeStart] = useState(0);

  const ranges = useMemo(() => {
    if (episodes.length <= CHUNK_SIZE) return [];
    const result: Array<{ start: number; label: string }> = [];
    for (let i = 0; i < episodes.length; i += CHUNK_SIZE) {
      const slice = episodes.slice(i, i + CHUNK_SIZE);
      result.push({ start: i, label: `${slice[0].number} – ${slice[slice.length - 1].number}` });
    }
    return result;
  }, [episodes]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base =
      ranges.length > 0 && !term ? episodes.slice(rangeStart, rangeStart + CHUNK_SIZE) : episodes;

    if (!term) return base;
    return base.filter(
      (ep) => String(ep.number).includes(term) || (ep.title ?? '').toLowerCase().includes(term),
    );
  }, [episodes, search, ranges.length, rangeStart]);

  return (
    <div className="card-surface overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-3">
        <div className="relative min-w-40 flex-1">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find an episode…"
            aria-label="Search episodes"
            className="h-9 w-full rounded-lg border border-line-soft bg-base pl-8 pr-3 text-[13px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
          />
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-faint"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" strokeLinecap="round" />
          </svg>
        </div>

        {!compact ? (
          <div className="flex gap-1 rounded-lg bg-surface-2 p-0.5">
            {(['list', 'grid'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setLayout(option)}
                aria-pressed={layout === option}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[12px] font-medium transition',
                  layout === option ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink',
                )}
              >
                {option === 'list' ? 'List' : 'Grid'}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {ranges.length > 0 && !search ? (
        <div className="flex flex-wrap gap-1.5 border-b border-line-soft p-3">
          {ranges.map((range) => (
            <button
              key={range.start}
              type="button"
              onClick={() => setRangeStart(range.start)}
              className={cn(
                'rounded-lg px-2.5 py-1 text-[12px] font-semibold transition',
                rangeStart === range.start ? 'bg-brand text-white' : 'bg-surface-2 text-ink-soft hover:bg-surface-3',
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-ink-faint">No episodes match “{search}”.</p>
      ) : layout === 'grid' ? (
        <div className="grid max-h-[32rem] grid-cols-[repeat(auto-fill,minmax(3.2rem,1fr))] gap-1.5 overflow-y-auto p-3">
          {visible.map((ep) => (
            <Link
              key={ep.id}
              href={`/watch/${animeSlug}/ep-${ep.number}`}
              title={ep.title ?? `Episode ${ep.number}`}
              className={cn(
                'grid h-10 place-items-center rounded-lg text-[13px] font-semibold transition',
                currentEpisode === ep.number
                  ? 'bg-brand text-white'
                  : 'bg-surface-2 text-ink-soft hover:bg-surface-3 hover:text-ink',
              )}
            >
              {ep.number}
            </Link>
          ))}
        </div>
      ) : (
        <ul className={cn('divide-y divide-line-soft overflow-y-auto', compact ? 'max-h-[26rem]' : 'max-h-[40rem]')}>
          {visible.map((ep) => {
            const isCurrent = currentEpisode === ep.number;
            return (
              <li key={ep.id}>
                <Link
                  href={`/watch/${animeSlug}/ep-${ep.number}`}
                  className={cn(
                    'group/row flex items-center gap-3 px-3 py-2.5 transition',
                    isCurrent ? 'bg-brand/12' : 'hover:bg-white/5',
                  )}
                  aria-current={isCurrent}
                >
                  <span
                    className={cn(
                      'w-9 shrink-0 text-center text-[13px] font-bold tabular-nums',
                      isCurrent ? 'text-brand-bright' : 'text-ink-faint',
                    )}
                  >
                    {ep.number}
                  </span>

                  {!compact && ep.thumbnailUrl ? (
                    <span className="relative hidden h-12 w-20 shrink-0 overflow-hidden rounded-md bg-surface-2 sm:block">
                      <Image src={ep.thumbnailUrl} alt="" fill sizes="80px" className="object-cover" />
                    </span>
                  ) : null}

                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'clamp-2 block text-[13px] font-medium leading-snug',
                        isCurrent ? 'text-ink' : 'text-ink-soft group-hover/row:text-ink',
                      )}
                    >
                      {ep.title ?? `Episode ${ep.number}`}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
                      {ep.hasSub ? (
                        <span className="rounded bg-accent/85 px-1 py-px text-[9.5px] font-bold text-[#04221f]">SUB</span>
                      ) : null}
                      {ep.hasDub ? (
                        <span className="rounded bg-hot/85 px-1 py-px text-[9.5px] font-bold text-white">DUB</span>
                      ) : null}
                      {ep.isFiller ? (
                        <span className="rounded bg-warn/25 px-1 py-px text-[9.5px] font-bold text-warn">FILLER</span>
                      ) : null}
                      {ep.durationSeconds ? <span>{formatTime(ep.durationSeconds)}</span> : null}
                    </span>
                  </span>

                  {isCurrent ? (
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-brand-bright">
                      Now
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
