'use client';

import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
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
  const selectId = useId();
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>(compact ? 'list' : 'list');
  const [rangeStart, setRangeStart] = useState(0);

  /**
   * Seasons come from the episodes themselves, so the list needs no second
   * request. A title with no season records yields an empty array and
   * everything below behaves exactly as it did before seasons existed.
   */
  const seasons = useMemo(() => {
    const byId = new Map<string, { id: string; number: number; title: string | null; count: number }>();
    for (const ep of episodes) {
      if (!ep.seasonId) continue;
      const existing = byId.get(ep.seasonId);
      if (existing) existing.count += 1;
      else byId.set(ep.seasonId, { id: ep.seasonId, number: ep.seasonNumber ?? 0, title: ep.seasonTitle, count: 1 });
    }
    return [...byId.values()].sort((a, b) => a.number - b.number);
  }, [episodes]);

  /** Episodes that belong to no season still have to be reachable. */
  const unassigned = useMemo(() => episodes.filter((ep) => !ep.seasonId), [episodes]);

  // On the watch page the sidebar should open on the season being watched.
  const initialSeason =
    seasons.find((s) => episodes.some((ep) => ep.seasonId === s.id && ep.number === currentEpisode))?.id ??
    seasons[0]?.id ??
    null;
  /**
   * undefined  — no explicit choice yet, so follow the episode being watched
   * null       — the viewer collapsed the open season
   * an id      — the viewer expanded that season
   *
   * The three states have to stay distinct: treating "collapsed" as "unset"
   * would re-expand the first season the moment it was closed.
   */
  const [choice, setChoice] = useState<string | null | undefined>(undefined);
  const chosenExists = choice === null || (choice !== undefined && seasons.some((s) => s.id === choice));
  const activeSeasonId = choice !== undefined && chosenExists ? choice : initialSeason;

  /**
   * Only the chosen season is rendered — switching seasons is a state change,
   * not a navigation, and no hidden episode tree is kept in the DOM.
   */
  const inSeason = useMemo(() => {
    if (seasons.length === 0) return episodes;
    if (!activeSeasonId) return unassigned;
    const rows = episodes.filter((ep) => ep.seasonId === activeSeasonId);
    // A title that mixes seasoned and unseasoned episodes shows the strays
    // alongside the first season rather than hiding them.
    return activeSeasonId === seasons[0]?.id ? [...rows, ...unassigned].sort((a, b) => a.number - b.number) : rows;
  }, [episodes, seasons, activeSeasonId, unassigned]);

  const ranges = useMemo(() => {
    if (inSeason.length <= CHUNK_SIZE) return [];
    const result: Array<{ start: number; label: string }> = [];
    for (let i = 0; i < inSeason.length; i += CHUNK_SIZE) {
      const slice = inSeason.slice(i, i + CHUNK_SIZE);
      result.push({
        start: i,
        label: `${slice[0].seasonEpisodeNumber} – ${slice[slice.length - 1].seasonEpisodeNumber}`,
      });
    }
    return result;
  }, [inSeason]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = ranges.length > 0 && !term ? inSeason.slice(rangeStart, rangeStart + CHUNK_SIZE) : inSeason;

    if (!term) return base;
    return base.filter(
      (ep) =>
        String(ep.seasonEpisodeNumber).includes(term) ||
        String(ep.number).includes(term) ||
        (ep.title ?? '').toLowerCase().includes(term),
    );
  }, [inSeason, search, ranges.length, rangeStart]);

  /**
   * The episode list exactly as it was before seasons existed. It is defined
   * once and rendered either on its own (a title with no seasons) or inside
   * whichever season is expanded, so the season feature groups this UI rather
   * than replacing it.
   */
  const episodesBlock = (
    <>
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
                title={ep.title ?? `Episode ${ep.seasonEpisodeNumber}`}
                className={cn(
                  'grid h-10 place-items-center rounded-lg text-[13px] font-semibold transition',
                  currentEpisode === ep.number
                    ? 'bg-brand text-white'
                    : 'bg-surface-2 text-ink-soft hover:bg-surface-3 hover:text-ink',
                )}
              >
                {ep.seasonEpisodeNumber}
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
                      {ep.seasonEpisodeNumber}
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
                        {ep.title ?? `Episode ${ep.seasonEpisodeNumber}`}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
                        {ep.hasSub ? (
                          <span className="rounded bg-accent/85 px-1 py-px text-[9.5px] font-bold text-[#04221f]">SUB</span>
                        ) : null}
                        {ep.hasDub ? (
                          <span className="rounded bg-hot-deep px-1 py-px text-[9.5px] font-bold text-white">DUB</span>
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
    </>
  );

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
                  'pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center',
                  layout === option ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink',
                )}
              >
                {option === 'list' ? 'List' : 'Grid'}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Seasons stack one below another; the expanded one shows the ordinary
          episode list directly underneath its own row. One at a time, so the
          page never becomes a wall of every season's episodes, and only the
          expanded season is in the DOM at all. */}
      {seasons.length === 0 ? (
        episodesBlock
      ) : (
        <ul className="divide-y divide-line-soft">
          {seasons.map((season) => {
            const expanded = activeSeasonId === season.id;
            const panelId = `${selectId}-season-${season.id}`;
            return (
              <li key={season.id}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => {
                    // Collapsing the open season is allowed; it is a disclosure,
                    // not a required choice.
                    setChoice(expanded ? null : season.id);
                    setRangeStart(0);
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-3 text-left transition',
                    expanded ? 'bg-brand/10' : 'hover:bg-white/5',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-[13.5px] font-bold', expanded ? 'text-ink' : 'text-ink-soft')}>
                      Season {season.number}
                    </span>
                    {season.title ? (
                      <span className="clamp-2 mt-0.5 block text-[12px] text-ink-muted">{season.title}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[11.5px] text-ink-faint">
                    {season.count} {season.count === 1 ? 'Episode' : 'Episodes'}
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    className={cn(
                      'h-4 w-4 shrink-0 transition-transform duration-200',
                      expanded ? 'rotate-90 text-brand-bright' : 'text-ink-faint',
                    )}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.2}
                    aria-hidden="true"
                  >
                    <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <div id={panelId} hidden={!expanded}>
                  {expanded ? episodesBlock : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
