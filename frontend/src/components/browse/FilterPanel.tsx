'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import type { GenreRef } from '@/lib/types';
import { cn } from '@/lib/utils';

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
  const [query, setQuery] = useState(params.get('q') ?? '');

  useEffect(() => {
    apiFetch<GenreRef[]>('/genres')
      .then(setGenres)
      .catch(() => setGenres([]));
  }, []);

  useEffect(() => {
    setQuery(params.get('q') ?? '');
  }, [params]);

  const current = useMemo(() => {
    const read = (key: string) => params.get(key) ?? '';
    const readList = (key: string) => (params.get(key) ? params.get(key)!.split(',').filter(Boolean) : []);
    return {
      genres: readList('genres'),
      type: readList('type'),
      status: readList('status'),
      ageRating: readList('ageRating'),
      source: readList('source'),
      season: read('season'),
      year: read('year'),
      language: read('language'),
      sort: read('sort') || 'default',
      minEpisodes: read('minEpisodes'),
      maxEpisodes: read('maxEpisodes'),
      hideInList: read('hideInList') === 'true',
    };
  }, [params]);

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
      router.push(`/browse?${next.toString()}`);
    },
    [params, router],
  );

  const toggleInList = useCallback(
    (key: string, value: string, list: string[]) => {
      push({ [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] });
    },
    [push],
  );

  const activeCount =
    current.genres.length +
    current.type.length +
    current.status.length +
    current.ageRating.length +
    current.source.length +
    (current.season ? 1 : 0) +
    (current.year ? 1 : 0) +
    (current.language ? 1 : 0) +
    (current.minEpisodes ? 1 : 0) +
    (current.maxEpisodes ? 1 : 0) +
    (current.hideInList ? 1 : 0);

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

        <select
          value={current.sort}
          onChange={(e) => push({ sort: e.target.value === 'default' ? undefined : e.target.value })}
          aria-label="Sort by"
          className="h-10 rounded-lg border border-line-soft bg-base px-3 text-[13px] text-ink outline-none focus:border-brand/60"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={cn(
            'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-[13px] font-semibold transition',
            expanded || activeCount > 0
              ? 'bg-brand text-white'
              : 'border border-line-soft bg-base text-ink-soft hover:text-ink',
          )}
        >
          Filters
          {activeCount > 0 ? (
            <span className="rounded-full bg-white/25 px-1.5 text-[11px] font-bold">{activeCount}</span>
          ) : null}
        </button>

        {activeCount > 0 || params.get('q') ? (
          <button
            type="button"
            onClick={() => router.push('/browse')}
            className="h-10 rounded-lg px-3 text-[13px] font-medium text-ink-muted transition hover:text-danger"
          >
            Reset
          </button>
        ) : null}
      </div>

      {expanded ? (
        <div className="space-y-5 border-t border-line-soft p-4">
          <Group title="Genre">
            <div className="flex flex-wrap gap-1.5">
              {genres.map((genre) => (
                <Chip
                  key={genre.slug}
                  active={current.genres.includes(genre.slug)}
                  onClick={() => toggleInList('genres', genre.slug, current.genres)}
                >
                  {genre.name}
                </Chip>
              ))}
            </div>
          </Group>

          <div className="grid gap-5 md:grid-cols-2">
            <Group title="Type">
              <div className="flex flex-wrap gap-1.5">
                {TYPES.map((t) => (
                  <Chip key={t} active={current.type.includes(t)} onClick={() => toggleInList('type', t, current.type)}>
                    {label(t)}
                  </Chip>
                ))}
              </div>
            </Group>

            <Group title="Status">
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((s) => (
                  <Chip
                    key={s}
                    active={current.status.includes(s)}
                    onClick={() => toggleInList('status', s, current.status)}
                  >
                    {label(s)}
                  </Chip>
                ))}
              </div>
            </Group>

            <Group title="Season">
              <div className="flex flex-wrap gap-1.5">
                {SEASONS.map((s) => (
                  <Chip key={s} active={current.season === s} onClick={() => push({ season: current.season === s ? undefined : s })}>
                    {label(s)}
                  </Chip>
                ))}
              </div>
            </Group>

            <Group title="Year">
              <select
                value={current.year}
                onChange={(e) => push({ year: e.target.value || undefined })}
                aria-label="Release year"
                className="h-9 w-full rounded-lg border border-line-soft bg-base px-3 text-[13px] text-ink outline-none focus:border-brand/60"
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
                    active={current.language === l}
                    onClick={() => push({ language: current.language === l ? undefined : l })}
                  >
                    {l === 'SUB' ? 'Subbed' : 'Dubbed'}
                  </Chip>
                ))}
              </div>
            </Group>

            <Group title="Age rating">
              <div className="flex flex-wrap gap-1.5">
                {RATINGS.map((r) => (
                  <Chip
                    key={r}
                    active={current.ageRating.includes(r)}
                    onClick={() => toggleInList('ageRating', r, current.ageRating)}
                  >
                    {label(r)}
                  </Chip>
                ))}
              </div>
            </Group>

            <Group title="Source">
              <div className="flex flex-wrap gap-1.5">
                {SOURCES.map((s) => (
                  <Chip
                    key={s}
                    active={current.source.includes(s)}
                    onClick={() => toggleInList('source', s, current.source)}
                  >
                    {label(s)}
                  </Chip>
                ))}
              </div>
            </Group>

            <Group title="Episode count">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder="Min"
                  defaultValue={current.minEpisodes}
                  onBlur={(e) => push({ minEpisodes: e.target.value || undefined })}
                  aria-label="Minimum episodes"
                  className="h-9 w-full rounded-lg border border-line-soft bg-base px-3 text-[13px] text-ink outline-none focus:border-brand/60"
                />
                <span className="text-ink-faint">–</span>
                <input
                  type="number"
                  min={1}
                  placeholder="Max"
                  defaultValue={current.maxEpisodes}
                  onBlur={(e) => push({ maxEpisodes: e.target.value || undefined })}
                  aria-label="Maximum episodes"
                  className="h-9 w-full rounded-lg border border-line-soft bg-base px-3 text-[13px] text-ink outline-none focus:border-brand/60"
                />
              </div>
            </Group>
          </div>

          {isAuthenticated ? (
            <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-soft">
              <input
                type="checkbox"
                checked={current.hideInList}
                onChange={(e) => push({ hideInList: e.target.checked })}
                className="h-4 w-4 rounded border-line bg-base accent-[var(--color-brand)]"
              />
              Hide titles already on my list
            </label>
          ) : null}
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
