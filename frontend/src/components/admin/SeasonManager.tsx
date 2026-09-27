'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { qs } from '@/lib/api';
import { authFetch, useAuthStore } from '@/lib/auth-store';
import { Badge, Banner, Button, Card, Label, TableSkeleton, adminInput } from '@/components/admin/ui';

interface SeasonRow {
  id: string;
  number: number;
  title: string | null;
  posterUrl: string | null;
  episodeCount: number;
}

/**
 * Season management for one anime, as a card that sits inside the anime edit
 * page — seasons belong to an anime, so they are managed where that anime is.
 *
 * Nothing here is a second source of truth: it drives the same idempotent
 * endpoints the importer uses, so creating "Season 1" when it already exists
 * updates it rather than adding a duplicate.
 *
 * A season cannot be attached to an anime that has no id yet, so before the
 * first save the card explains that instead of pretending to work and building
 * a client-side queue that could half-apply.
 */
export function SeasonManager({ animeId }: { animeId?: string }) {
  const canDelete = useAuthStore((s) => s.user?.role) === 'SUPER_ADMIN';

  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [loading, setLoading] = useState(Boolean(animeId));
  const [state, setState] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SeasonRow | null>(null);
  const [number, setNumber] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!animeId) return;
    setLoading(true);
    try {
      setSeasons(await authFetch<SeasonRow[]>(`/admin/anime/${animeId}/seasons`));
    } catch {
      setSeasons([]);
      setState({ tone: 'error', text: 'Could not load the seasons for this title.' });
    } finally {
      setLoading(false);
    }
  }, [animeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeForm = () => {
    setOpen(false);
    setEditing(null);
    setNumber('');
    setTitle('');
  };

  const startCreate = () => {
    setEditing(null);
    // Suggest the next number, which is what an admin adding a season wants.
    setNumber(String(Math.max(0, ...seasons.map((s) => s.number)) + 1));
    setTitle('');
    setOpen(true);
    setState(null);
  };

  const startEdit = (season: SeasonRow) => {
    setEditing(season);
    setNumber(String(season.number));
    setTitle(season.title ?? '');
    setOpen(true);
    setState(null);
  };

  const save = async () => {
    if (!animeId) return;
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
        await authFetch('/admin/seasons', {
          method: 'POST',
          body: { animeId, number: parsed, title: title.trim() || undefined },
        });
        setState({ tone: 'ok', text: `Season ${parsed} saved.` });
      }
      closeForm();
      await load();
    } catch (error) {
      setState({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save the season.' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (season: SeasonRow) => {
    const warning =
      season.episodeCount > 0
        ? `Delete season ${season.number}? Its ${season.episodeCount} episode(s) are kept and simply become unassigned.`
        : `Delete season ${season.number}?`;
    if (!window.confirm(warning)) return;
    try {
      const result = await authFetch<{ detachedEpisodes: number }>(`/admin/seasons/${season.id}`, { method: 'DELETE' });
      setState({
        tone: 'ok',
        text:
          result.detachedEpisodes > 0
            ? `Season deleted. ${result.detachedEpisodes} episode(s) are now unassigned.`
            : 'Season deleted.',
      });
      await load();
    } catch (error) {
      setState({ tone: 'error', text: error instanceof Error ? error.message : 'Could not delete the season.' });
    }
  };

  if (!animeId) {
    return (
      <Card title="Seasons" description="Group this title's episodes into seasons.">
        <p className="text-[13px] leading-relaxed text-ink-muted">
          Save the anime first to add seasons — a season has to belong to an existing title.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Seasons" description="Group this title's episodes into seasons. Episodes keep their own numbering.">
      {state ? (
        <div className="mb-3">
          <Banner state={state} />
        </div>
      ) : null}

      {loading ? (
        <TableSkeleton rows={2} />
      ) : seasons.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-ink-muted">
          No seasons yet. This title presents its episodes as one list, which is fine for a single-season series.
        </p>
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
                <Link href={`/admin/episodes${qs({ animeId })}`}>
                  <Button variant="secondary" size="sm" type="button">
                    Episodes
                  </Button>
                </Link>
                <Button variant="secondary" size="sm" type="button" onClick={() => startEdit(season)}>
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

      {open ? (
        <div className="mt-4 rounded-lg border border-line-soft bg-base/60 p-4">
          <p className="mb-3 text-[12.5px] font-semibold text-ink-soft">
            {editing ? `Edit season ${editing.number}` : 'New season'}
          </p>
          <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <label className="block">
              <Label required>Number</Label>
              <input
                type="number"
                min={0}
                step={1}
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className={adminInput}
              />
            </label>
            <label className="block">
              <Label hint="Optional, e.g. “DATE A LIVE II (2014)”.">Title</Label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Season title"
                className={adminInput}
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {/* type=button throughout: this card lives inside the anime <form>
                and must never submit it. */}
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save season' : 'Add season'}
            </Button>
            <Button type="button" variant="ghost" onClick={closeForm}>
              Cancel
            </Button>
          </div>
          {!editing ? (
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
              A number that already exists updates that season instead of creating a second one.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-4">
          <Button type="button" variant="secondary" size="sm" onClick={startCreate}>
            + Add season
          </Button>
        </div>
      )}

      {!canDelete && seasons.length > 0 ? (
        <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
          Deleting a season needs a super admin. Episodes are never deleted with it — they become unassigned.
        </p>
      ) : null}
    </Card>
  );
}
