'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { qs } from '@/lib/api';
import { authFetch, useAuthStore } from '@/lib/auth-store';
import type { PaginationMeta } from '@/lib/types';
import {
  AdminHeader,
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  Label,
  TableSkeleton,
  adminInput,
} from '@/components/admin/ui';

interface AdminAnimeRow {
  id: string;
  slug: string;
  titleEnglish: string;
}

interface SeasonRow {
  id: string;
  number: number;
  title: string | null;
  posterUrl: string | null;
  episodeCount: number;
}

/**
 * Season management. The API behind it already existed for the importer; this
 * page is the human entry point to the same endpoints, so a season never has to
 * be created by running a script.
 *
 * Seasons only make sense under one anime, so the page is anime-first: pick a
 * title, then work on its seasons. That also means the season list can never
 * show a season belonging to a different anime, which is the mistake the API
 * rejects server-side.
 */
function SeasonsInner() {
  const role = useAuthStore((s) => s.user?.role);
  const canDelete = role === 'SUPER_ADMIN';

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [matches, setMatches] = useState<AdminAnimeRow[]>([]);
  const [anime, setAnime] = useState<AdminAnimeRow | null>(null);

  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const [number, setNumber] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<SeasonRow | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Anime picker. Nothing is requested until there is something to search for.
  useEffect(() => {
    if (debounced.length === 0) {
      setMatches([]);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const result = await authFetch<{ data: AdminAnimeRow[]; meta: PaginationMeta }>(
          `/admin/anime${qs({ q: debounced, limit: 8 })}`,
        );
        if (active) setMatches(result.data);
      } catch {
        if (active) setMatches([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [debounced]);

  const loadSeasons = useCallback(async (animeId: string) => {
    setLoading(true);
    try {
      setSeasons(await authFetch<SeasonRow[]>(`/admin/anime/${animeId}/seasons`));
    } catch {
      setSeasons([]);
      setState({ tone: 'error', text: 'Could not load seasons for this title.' });
    } finally {
      setLoading(false);
    }
  }, []);

  const pick = async (row: AdminAnimeRow) => {
    setAnime(row);
    setMatches([]);
    setSearch('');
    setState(null);
    setEditing(null);
    await loadSeasons(row.id);
  };

  const resetForm = () => {
    setEditing(null);
    setNumber('');
    setTitle('');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!anime) return;
    const parsed = Number(number);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setState({ tone: 'error', text: 'Season number must be a whole number of 0 or more.' });
      return;
    }
    setSaving(true);
    setState(null);
    try {
      if (editing) {
        await authFetch(`/admin/seasons/${editing.id}`, {
          method: 'PUT',
          body: { number: parsed, title: title.trim() || null },
        });
        setState({ tone: 'ok', text: `Season ${parsed} updated.` });
      } else {
        // Keyed on (anime, number) server-side, so submitting the same season
        // twice updates it instead of creating a duplicate.
        await authFetch('/admin/seasons', {
          method: 'POST',
          body: { animeId: anime.id, number: parsed, title: title.trim() || undefined },
        });
        setState({ tone: 'ok', text: `Season ${parsed} saved.` });
      }
      resetForm();
      await loadSeasons(anime.id);
    } catch (error) {
      setState({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save the season.' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (season: SeasonRow) => {
    if (!anime) return;
    const warning =
      season.episodeCount > 0
        ? `Delete season ${season.number}? Its ${season.episodeCount} episode(s) are kept and simply become unassigned.`
        : `Delete season ${season.number}?`;
    if (!window.confirm(warning)) return;
    try {
      const result = await authFetch<{ id: string; detachedEpisodes: number }>(`/admin/seasons/${season.id}`, {
        method: 'DELETE',
      });
      setState({
        tone: 'ok',
        text:
          result.detachedEpisodes > 0
            ? `Season deleted. ${result.detachedEpisodes} episode(s) are now unassigned.`
            : 'Season deleted.',
      });
      await loadSeasons(anime.id);
    } catch (error) {
      setState({ tone: 'error', text: error instanceof Error ? error.message : 'Could not delete the season.' });
    }
  };

  return (
    <div>
      <AdminHeader
        title="Seasons"
        description="Group a title's episodes into seasons. Episodes keep their own numbering; a season only decides how they are presented."
      />

      <Banner state={state} />

      <Card title="Title" description="Seasons belong to one anime, so pick that first.">
        {anime ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-ink">{anime.titleEnglish}</p>
              <p className="mt-0.5 text-[12px] text-ink-faint">{anime.slug}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/admin/episodes${qs({ animeId: anime.id })}`}>
                <Button variant="secondary" size="sm" type="button">
                  All episodes
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => {
                  setAnime(null);
                  setSeasons([]);
                  resetForm();
                  setState(null);
                }}
              >
                Change title
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <label>
              <Label>Search anime</Label>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Start typing a title…"
                className={adminInput}
              />
            </label>
            {matches.length > 0 ? (
              <ul className="mt-2 divide-y divide-line-soft rounded-lg border border-line-soft">
                {matches.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => void pick(row)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-white/5"
                    >
                      <span className="min-w-0 truncate text-[13.5px] text-ink-soft">{row.titleEnglish}</span>
                      <span className="shrink-0 text-[11.5px] text-ink-faint">{row.slug}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </Card>

      {anime ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card title="Seasons" description={`${seasons.length} season(s) on this title.`}>
            {loading ? (
              <TableSkeleton rows={3} />
            ) : seasons.length === 0 ? (
              <EmptyState
                title="No seasons yet"
                body="This title presents its episodes as one list. Add a season on the right to group them."
              />
            ) : (
              <ul className="divide-y divide-line-soft">
                {seasons.map((season) => (
                  <li key={season.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold text-ink">
                        Season {season.number}
                        {season.title ? <span className="font-normal text-ink-soft"> — {season.title}</span> : null}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-ink-faint">
                        {season.episodeCount} {season.episodeCount === 1 ? 'episode' : 'episodes'}
                      </p>
                    </div>
                    <Badge tone={season.episodeCount > 0 ? 'info' : 'neutral'}>
                      {season.episodeCount > 0 ? 'In use' : 'Empty'}
                    </Badge>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/admin/episodes${qs({ animeId: anime.id })}`}>
                        <Button variant="secondary" size="sm" type="button">
                          Episodes
                        </Button>
                      </Link>
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => {
                          setEditing(season);
                          setNumber(String(season.number));
                          setTitle(season.title ?? '');
                        }}
                      >
                        Edit
                      </Button>
                      {canDelete ? (
                        <Button variant="danger" size="sm" type="button" onClick={() => void remove(season)}>
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title={editing ? `Edit season ${editing.number}` : 'Add a season'}
            description={
              editing
                ? 'Renumbering onto a season that already exists is refused.'
                : 'Submitting a number that already exists updates that season rather than creating a second one.'
            }
          >
            <form onSubmit={save} className="space-y-4">
              <label className="block">
                <Label required hint="1 for the first season. Whole numbers only.">
                  Season number
                </Label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  required
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  className={adminInput}
                />
              </label>

              <label className="block">
                <Label hint="Optional. Shown next to the season, e.g. “DATE A LIVE II (2014)”.">Title</Label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Season title"
                  className={adminInput}
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Save changes' : 'Add season'}
                </Button>
                {editing ? (
                  <Button variant="ghost" type="button" onClick={resetForm}>
                    Cancel
                  </Button>
                ) : null}
              </div>

              {!canDelete ? (
                <p className="text-[11.5px] leading-relaxed text-ink-faint">
                  Deleting a season needs a super admin. Episodes are never deleted with it — they become unassigned.
                </p>
              ) : null}
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminSeasonsPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={6} />}>
      <SeasonsInner />
    </Suspense>
  );
}
