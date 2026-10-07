'use client';

import { useRouter, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { loadGenres } from '@/lib/genres';
import { nextPreference, preferenceState, type PreferenceMode, type PreferenceState } from '@/lib/preferences';
import { useAuthStore } from '@/lib/auth-store';
import type { GenreRef } from '@/lib/types';
import { cn } from '@/lib/utils';
import { selectFieldSm } from '@/components/ui/Select';
import { Dropdown } from '@/components/ui/Dropdown';

/**
 * The text-input twin of selectFieldSm: same height, border and surface, but no
 * chevron — these are numbers to type, not a list to choose from.
 */
const filterInputSm =
  'h-9 w-full rounded-lg border border-line-soft bg-base px-3 text-[13px] text-ink outline-none transition hover:border-line focus:border-brand/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 pointer-coarse:h-11';

/**
 * The filters the panel owns, in both directions.
 *
 * Sort, the text search, the A-Z letter and the page number are deliberately
 * absent: they live outside the panel and commit on their own, so applying the
 * panel must leave them alone rather than reset them.
 */
interface Filters {
  genres: string[];
  type: string[];
  status: string[];
  ageRating: string[];
  source: string[];
  avoidGenres: string[];
  avoidType: string[];
  avoidAgeRating: string[];
  avoidSource: string[];
  season: string;
  year: string;
  language: string;
  minEpisodes: string;
  maxEpisodes: string;
  hideInList: boolean;
}

const EMPTY_FILTERS: Filters = {
  genres: [], type: [], status: [], ageRating: [], source: [],
  avoidGenres: [], avoidType: [], avoidAgeRating: [], avoidSource: [],
  season: '', year: '', language: '', minEpisodes: '', maxEpisodes: '', hideInList: false,
};

/** The panel's filters as the URL currently has them. */
function readFilters(params: URLSearchParams | ReadonlyURLSearchParams): Filters {
  const read = (key: string) => params.get(key) ?? '';
  const readList = (key: string) => {
    const raw = params.get(key);
    return raw ? raw.split(',').filter(Boolean) : [];
  };
  return {
    genres: readList('genres'),
    type: readList('type'),
    status: readList('status'),
    ageRating: readList('ageRating'),
    source: readList('source'),
    avoidGenres: readList('avoidGenres'),
    avoidType: readList('avoidType'),
    avoidAgeRating: readList('avoidAgeRating'),
    avoidSource: readList('avoidSource'),
    season: read('season'),
    year: read('year'),
    language: read('language'),
    minEpisodes: read('minEpisodes'),
    maxEpisodes: read('maxEpisodes'),
    hideInList: read('hideInList') === 'true',
  };
}

/**
 * The same filters as query parameters, with the empty ones left out.
 *
 * One function for both writing the URL and comparing draft against applied, so
 * "has anything changed?" can never disagree with what applying would send.
 */
function serialiseFilters(filters: Filters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      if (value.length) out[key] = value.join(',');
    } else if (value === true) {
      out[key] = 'true';
    } else if (typeof value === 'string' && value !== '') {
      out[key] = value;
    }
  }
  return out;
}

/** How many filters a set holds, counting each selected value once. */
function countFilters(filters: Filters): number {
  return Object.values(filters).reduce<number>(
    (total, value) => total + (Array.isArray(value) ? value.length : value === true || (typeof value === 'string' && value !== '') ? 1 : 0),
    0,
  );
}

/**
 * The filters that express a taste, each paired with the parameter holding the
 * values to keep out.
 *
 * Only these four: they describe what a title *is*, so they can also describe
 * what someone never wants. Status is where a series is in its life rather than
 * a taste, and season, year, episode count and language are scalars whose
 * opposite is simply the other end of a range — "avoid 2019" is not a
 * preference anyone holds.
 */
const AVOID_KEY = {
  genres: 'avoidGenres',
  type: 'avoidType',
  ageRating: 'avoidAgeRating',
  source: 'avoidSource',
} as const;

type PreferenceKey = keyof typeof AVOID_KEY;

const TYPES = ['TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'TV_SHORT', 'TV_SPECIAL', 'MUSIC'];
const STATUSES = ['ONGOING', 'COMPLETED', 'UPCOMING', 'HIATUS', 'CANCELLED'];
const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
const RATINGS = ['G', 'PG', 'PG_13', 'R_17', 'R_PLUS', 'RX'];
const SOURCES = [
  'ORIGINAL',
  'MANGA',
  'LIGHT_NOVEL',
  'NOVEL',
  'VISUAL_NOVEL',
  'GAME',
  'WEB_MANGA',
  'FOUR_KOMA',
  'MUSIC',
  'OTHER',
];
const SORTS = [
  { value: 'default', label: 'Default' },
  { value: 'updated', label: 'Latest Updated' },
  { value: 'added', label: 'Latest Added' },
  { value: 'score', label: 'Score' },
  { value: 'name', label: 'Name A-Z' },
  { value: 'name_desc', label: 'Name Z-A' },
  { value: 'release', label: 'Release Date' },
  { value: 'views', label: 'Most Viewed' },
  { value: 'episodes', label: 'Episode Count' },
];

function label(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ')
    .replace('Pg 13', 'PG-13')
    .replace('R 17', 'R-17')
    .replace('R Plus', 'R+')
    .replace('Tv', 'TV')
    .replace('Ova', 'OVA')
    .replace('Ona', 'ONA');
}

/**
 * Every filter is mirrored into the URL query string, so a filtered view is
 * shareable, bookmarkable and survives a refresh — and the server can render
 * page 1 of it directly.
 */
export function FilterPanel({ years }: { years: number[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const isAuthenticated = useAuthStore((s) => s.status === 'authenticated');

  const [genres, setGenres] = useState<GenreRef[]>([]);
  const [expanded, setExpanded] = useState(false);
  // Which direction a press means. Deliberately not in the URL: it is how the
  // panel is being used right now, not part of what is being shown, and the
  // existing panel keeps its own open/closed state local in the same way.
  const [mode, setMode] = useState<PreferenceMode>('prefer');
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.get('q') ?? '');

  useEffect(() => {
    loadGenres()
      .then(setGenres)
      .catch(() => setGenres([]));
  }, []);

  useEffect(() => {
    setQuery(params.get('q') ?? '');
  }, [params]);

  /**
   * What the results currently reflect: the URL is the applied state.
   *
   * Keeping it there rather than in a store is what makes a refresh, the back
   * button, a shared link and the pagination links all agree without any of
   * them having to know about this component.
   */
  const applied = useMemo(() => readFilters(params), [params]);

  /**
   * What the panel is showing, which is allowed to run ahead of the results.
   *
   * Every chip used to push a new URL, and /browse is force-dynamic, so a
   * single press re-ran the page and fetched the catalogue again — five
   * preferences meant five requests and five grids, four of which nobody
   * wanted. Presses now land here and go nowhere until they are applied.
   */
  const [draft, setDraft] = useState(applied);

  // Re-seed whenever the applied state changes under us: a fresh load, the back
  // button, a pagination link, or an apply completing. Keyed on the serialised
  // form so an unrelated re-render cannot silently discard pending edits.
  // A string, deliberately: serialiseFilters returns a fresh object every
  // navigation, so depending on it directly re-seeded the draft on any URL
  // change at all — submitting a text search threw away selections the user had
  // not applied yet. Comparing the serialised form means the draft is only
  // replaced when the applied filters have actually changed.
  const appliedKey = useMemo(() => JSON.stringify(serialiseFilters(applied)), [applied]);
  useEffect(() => {
    setDraft(readFilters(params));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedKey]);

  /** Commits a patch to the URL immediately. For controls outside the panel. */
  const push = useCallback(
    (patch: Record<string, string | string[] | boolean | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === '' || value === false || (Array.isArray(value) && value.length === 0)) {
          next.delete(key);
        } else if (Array.isArray(value)) {
          next.set(key, value.join(','));
        } else {
          next.set(key, String(value));
        }
      }
      // Any filter change invalidates the current page number.
      next.delete('page');
      startTransition(() => router.push(`/browse?${next.toString()}`));
    },
    [params, router],
  );

  /** Edits the panel's own state. Deliberately makes no request. */
  const edit = useCallback((patch: Partial<Filters>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
  }, []);

  /** Sends the whole panel in one go — the only thing that refetches. */
  const applyDraft = useCallback(() => {
    const next = new URLSearchParams();
    // Everything the panel does not own is carried across untouched, so
    // applying filters never drops a search term or a sort order.
    for (const key of ['q', 'sort', 'letter', 'limit'] as const) {
      const value = params.get(key);
      if (value) next.set(key, value);
    }
    for (const [key, value] of Object.entries(serialiseFilters(draft))) next.set(key, value);
    startTransition(() => router.push(`/browse?${next.toString()}`));
  }, [draft, params, router]);

  const toggleInList = useCallback(
    (key: keyof Filters, value: string, list: string[]) => {
      edit({ [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] } as Partial<Filters>);
    },
    [edit],
  );

  /**
   * Presses a value in whichever direction the panel is currently in.
   *
   * Both lists are written on every press, which is what stops a value from
   * ever sitting in both: adding to one necessarily removes it from the other,
   * so "I like this" and "I never want this" cannot both be true and the
   * results can never be asked to satisfy a contradiction.
   */
  const togglePreference = useCallback(
    (key: PreferenceKey, value: string) => {
      const avoidKey = AVOID_KEY[key];
      const { preferred, avoided } = nextPreference(mode, value, draft[key], draft[avoidKey]);
      edit({ [key]: preferred, [avoidKey]: avoided } as Partial<Filters>);
    },
    [draft, mode, edit],
  );

  /** Where a value stands today, whichever mode the panel happens to be in. */
  const stateOf = useCallback(
    (key: PreferenceKey, value: string): PreferenceState =>
      preferenceState(value, draft[key], draft[AVOID_KEY[key]]),
    [draft],
  );

  const preferredCount = draft.genres.length + draft.type.length + draft.ageRating.length + draft.source.length;
  const avoidedCount =
    draft.avoidGenres.length + draft.avoidType.length + draft.avoidAgeRating.length + draft.avoidSource.length;

  /** Empties one direction and leaves the other alone. */
  const clearDirection = useCallback(
    (direction: PreferenceMode) => {
      edit(
        direction === 'prefer'
          ? { genres: [], type: [], ageRating: [], source: [] }
          : { avoidGenres: [], avoidType: [], avoidAgeRating: [], avoidSource: [] },
      );
    },
    [edit],
  );

  // What the badge reports is what the results reflect, not what is merely
  // selected: a count that moved on every press would say the filters were in
  // effect before they had been applied.
  const appliedCount = countFilters(applied);
  const draftCount = countFilters(draft);
    // "Has anything changed?" compares the two through the same serialiser that
  // writes the URL, so it can never disagree with what applying would send.
  const dirty = JSON.stringify(serialiseFilters(draft)) !== JSON.stringify(serialiseFilters(applied));


  return (
    <div className="card-surface overflow-hidden">
      <div className="flex flex-wrap items-center gap-2.5 p-3.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            push({ q: query.trim() || undefined });
          }}
          className="relative min-w-52 flex-1"
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by English, Japanese or alternative title…"
            aria-label="Search"
            className="h-10 w-full rounded-lg border border-line-soft bg-base pl-9 pr-3 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
          />
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" strokeLinecap="round" />
          </svg>
        </form>
        {/* Nine options and the most-used control on the page: worth the custom
            list so it opens into the site rather than system chrome. */}
        <Dropdown
          value={params.get('sort') || 'default'}
          options={SORTS}
          onChange={(next) => push({ sort: next === 'default' ? undefined : next })}
          label="Sort by"
          className="w-44 shrink-0"
        />

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={cn(
            'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-[13px] font-semibold transition',
            expanded || appliedCount > 0
              ? 'bg-brand text-white'
              : 'border border-line-soft bg-base text-ink-soft hover:text-ink',
          )}
        >
          Filters
          {appliedCount > 0 ? (
            <span className="rounded-full bg-white/25 px-1.5 text-[11px] font-bold">{appliedCount}</span>
          ) : null}
        </button>

        {appliedCount > 0 || draftCount > 0 || params.get('q') ? (
          <button
            type="button"
            onClick={() => {
              // Both halves: the selection in the panel and the applied URL.
              setDraft(EMPTY_FILTERS);
              setQuery('');
              startTransition(() => router.push('/browse'));
            }}
            className="h-10 rounded-lg px-3 text-[13px] font-medium text-ink-muted transition hover:text-danger"
          >
            Reset
          </button>
        ) : null}
      </div>

      {expanded ? (
        <div className="space-y-5 border-t border-line-soft p-4">
          {/* Which way a press counts, and what is currently set each way. */}
          <div className="rounded-lg border border-line-soft bg-base/60 p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Pressing a tag means</span>
              <div className="inline-flex rounded-lg border border-line-soft p-0.5" role="group" aria-label="What pressing a tag means">
                {(
                  [
                    { key: 'prefer', label: 'I like this' },
                    { key: 'avoid', label: "I don't want this" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={mode === option.key}
                    onClick={() => setMode(option.key)}
                    className={cn(
                      'rounded-[6px] px-2.5 py-1 text-[12.5px] font-semibold transition',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70',
                      mode === option.key
                        ? option.key === 'prefer'
                          ? 'bg-brand text-white'
                          : 'bg-danger/20 text-danger'
                        : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
              Tags you like narrow the results to titles that carry them. Tags you don’t want are left out of the
              results entirely, search included. A tag can only be one or the other, so choosing it on one side takes
              it off the other.
            </p>
            {preferredCount > 0 || avoidedCount > 0 ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11.5px]">
                {preferredCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => clearDirection('prefer')}
                    className="rounded-md bg-surface-2 px-2 py-1 font-medium text-ink-muted transition hover:text-ink"
                  >
                    Clear {preferredCount} liked
                  </button>
                ) : null}
                {avoidedCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => clearDirection('avoid')}
                    className="rounded-md bg-surface-2 px-2 py-1 font-medium text-ink-muted transition hover:text-danger"
                  >
                    Clear {avoidedCount} unwanted
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <Group title="Genre">
            <div className="flex flex-wrap gap-1.5">
              {genres.map((genre) => (
                <PreferenceChip
                  key={genre.slug}
                  name={genre.name}
                  state={stateOf('genres', genre.slug)}
                  onClick={() => togglePreference('genres', genre.slug)}
                />
              ))}
            </div>
          </Group>

          <div className="grid gap-5 md:grid-cols-2">
            <Group title="Type">
              <div className="flex flex-wrap gap-1.5">
                {TYPES.map((t) => (
                  <PreferenceChip
                    key={t}
                    name={label(t)}
                    state={stateOf('type', t)}
                    onClick={() => togglePreference('type', t)}
                  />
                ))}
              </div>
            </Group>

            <Group title="Status">
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((s) => (
                  <Chip
                    key={s}
                    active={draft.status.includes(s)}
                    onClick={() => toggleInList('status', s, draft.status)}
                  >
                    {label(s)}
                  </Chip>
                ))}
              </div>
            </Group>

            <Group title="Season">
              <div className="flex flex-wrap gap-1.5">
                {SEASONS.map((s) => (
                  <Chip key={s} active={draft.season === s} onClick={() => edit({ season: draft.season === s ? '' : s })}>
                    {label(s)}
                  </Chip>
                ))}
              </div>
            </Group>

            <Group title="Year">
              <select
                value={draft.year}
                onChange={(e) => edit({ year: e.target.value })}
                aria-label="Release year"
                className={selectFieldSm}
              >
                <option value="">Any year</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </Group>

            <Group title="Language">
              <div className="flex flex-wrap gap-1.5">
                {['SUB', 'DUB'].map((l) => (
                  <Chip
                    key={l}
                    active={draft.language === l}
                    onClick={() => edit({ language: draft.language === l ? '' : l })}
                  >
                    {l === 'SUB' ? 'Subbed' : 'Dubbed'}
                  </Chip>
                ))}
              </div>
            </Group>

            <Group title="Age rating">
              <div className="flex flex-wrap gap-1.5">
                {RATINGS.map((r) => (
                  <PreferenceChip
                    key={r}
                    name={label(r)}
                    state={stateOf('ageRating', r)}
                    onClick={() => togglePreference('ageRating', r)}
                  />
                ))}
              </div>
            </Group>

            <Group title="Source">
              <div className="flex flex-wrap gap-1.5">
                {SOURCES.map((s) => (
                  <PreferenceChip
                    key={s}
                    name={label(s)}
                    state={stateOf('source', s)}
                    onClick={() => togglePreference('source', s)}
                  />
                ))}
              </div>
            </Group>

            <Group title="Episode count">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder="Min"
                  value={draft.minEpisodes}
                  onChange={(e) => edit({ minEpisodes: e.target.value })}
                  aria-label="Minimum episodes"
                  className={filterInputSm}
                />
                <span className="text-ink-faint">–</span>
                <input
                  type="number"
                  min={1}
                  placeholder="Max"
                  value={draft.maxEpisodes}
                  onChange={(e) => edit({ maxEpisodes: e.target.value })}
                  aria-label="Maximum episodes"
                  className={filterInputSm}
                />
              </div>
            </Group>
          </div>

          {isAuthenticated ? (
            <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-soft">
              <input
                type="checkbox"
                checked={draft.hideInList}
                onChange={(e) => edit({ hideInList: e.target.checked })}
                className="h-4 w-4 rounded border-line bg-base accent-[var(--color-brand)]"
              />
              Hide titles already on my list
            </label>
          ) : null}

          {/* Nothing above this line has touched the results. This is what does. */}
          <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft bg-surface/95 px-4 py-3 backdrop-blur">
            <p aria-live="polite" className="text-[12px] text-ink-faint">
              {isPending
                ? 'Updating results…'
                : dirty
                  ? `${draftCount === 0 ? 'No filters' : `${draftCount} filter${draftCount === 1 ? '' : 's'}`} selected — not applied yet`
                  : appliedCount > 0
                    ? `Showing ${appliedCount} filter${appliedCount === 1 ? '' : 's'}`
                    : 'No filters applied'}
            </p>
            <div className="flex items-center gap-2">
              {draftCount > 0 ? (
                <button
                  type="button"
                  onClick={() => edit(EMPTY_FILTERS)}
                  disabled={isPending}
                  className="h-10 rounded-lg px-3 text-[13px] font-medium text-ink-muted transition hover:text-ink disabled:opacity-50"
                >
                  Clear selection
                </button>
              ) : null}
              <button
                type="button"
                onClick={applyDraft}
                // Disabled while a previous apply is in flight, so a second
                // press cannot start a second fetch of the same thing.
                disabled={isPending || !dirty}
                className={cn(
                  'inline-flex h-10 items-center gap-2 rounded-lg px-5 text-[13.5px] font-semibold transition',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70',
                  isPending || !dirty
                    ? 'cursor-not-allowed bg-surface-2 text-ink-faint'
                    : 'bg-brand text-white hover:bg-brand-bright',
                )}
              >
                {isPending ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                    Searching…
                  </>
                ) : (
                  'Search with these filters'
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{title}</h3>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition',
        active ? 'bg-brand text-white' : 'bg-surface-2 text-ink-soft hover:bg-surface-3 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

/**
 * A chip that can be wanted, unwanted, or neither.
 *
 * The three states carry a mark as well as a colour — a tick for wanted, a
 * crossed-out circle for unwanted — because a red chip and a purple one are the
 * same chip to anyone who cannot tell them apart. The state is also spelled out
 * in the accessible name, so it does not depend on seeing either.
 */
function PreferenceChip({
  name,
  state,
  onClick,
}: {
  name: string;
  state: PreferenceState;
  onClick: () => void;
}) {
  const described = state === 'prefer' ? `${name}, preferred` : state === 'avoid' ? `${name}, avoided` : name;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={described}
      title={described}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70',
        state === 'prefer' && 'bg-brand text-white',
        state === 'avoid' && 'bg-danger/15 text-danger ring-1 ring-danger/45 line-through decoration-danger/60',
        state === 'off' && 'bg-surface-2 text-ink-soft hover:bg-surface-3 hover:text-ink',
      )}
    >
      {state !== 'off' ? (
        <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" aria-hidden="true">
          {state === 'prefer' ? <path d="m5 13 4 4L19 7" /> : <path d="M5 5l14 14M19 5 5 19" />}
        </svg>
      ) : null}
      {name}
    </button>
  );
}
