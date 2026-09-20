'use client';

import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '@/lib/auth-store';
import type { PaginationMeta } from '@/lib/types';
import { formatRelativeTime, formatTime } from '@/lib/utils';

interface HistoryEntry {
  anime: { slug: string; titleEnglish: string; posterUrl: string | null };
  episode: { id: string; number: number; title: string | null; thumbnailUrl: string | null };
  positionSeconds: number;
  percent: number;
  completed: boolean;
  lastWatchedAt: string;
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authFetch<{ data: HistoryEntry[]; meta: PaginationMeta }>(
        `/watch-history?page=${page}&limit=25`,
      );
      setEntries(result.data);
      setMeta(result.meta);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  const removeOne = async (episodeId: string) => {
    try {
      await authFetch(`/watch-history?episodeId=${episodeId}`, { method: 'DELETE' });
      setEntries((previous) => previous.filter((e) => e.episode.id !== episodeId));
    } catch {
      /* keep the row */
    }
  };

  const clearAll = async () => {
    setClearing(true);
    try {
      await authFetch('/watch-history', { method: 'DELETE' });
      setEntries([]);
      setMeta(null);
    } catch {
      /* ignore */
    } finally {
      setClearing(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-muted">
          {meta ? `${meta.total.toLocaleString()} episodes watched` : 'Your watch history'}
        </p>
        {entries.length > 0 ? (
          <button
            type="button"
            onClick={() => void clearAll()}
            disabled={clearing}
            className="rounded-lg border border-line px-3.5 py-2 text-[12.5px] font-semibold text-ink-muted transition hover:border-danger/50 hover:text-danger disabled:opacity-50"
          >
            {clearing ? 'Clearing…' : 'Clear history'}
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="skeleton h-20 rounded-xl" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="card-surface grid place-items-center px-6 py-16 text-center">
          <p className="text-[14px] font-medium text-ink-soft">No watch history yet</p>
          <p className="mt-1 max-w-sm text-[13px] text-ink-faint">
            Episodes you watch while signed in will appear here so you can pick up where you left off.
          </p>
        </div>
      ) : (
        <ul className="card-surface divide-y divide-line-soft overflow-hidden">
          {entries.map((entry) => (
            <li key={entry.episode.id} className="group/h flex items-center gap-3 p-3">
              <Link
                href={`/watch/${entry.anime.slug}/ep-${entry.episode.number}`}
                className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-surface-2"
              >
                {entry.episode.thumbnailUrl ? (
                  <Image src={entry.episode.thumbnailUrl} alt="" fill sizes="96px" className="object-cover" />
                ) : null}
                <span className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                  <span className="block h-full bg-brand-bright" style={{ width: `${entry.percent}%` }} />
                </span>
              </Link>

              <div className="min-w-0 flex-1">
                <Link
                  href={`/anime/${entry.anime.slug}`}
                  className="clamp-1 block text-[13.5px] font-semibold text-ink transition hover:text-brand-bright"
                >
                  {entry.anime.titleEnglish}
                </Link>
                <p className="mt-0.5 truncate text-[12px] text-ink-muted">
                  Episode {entry.episode.number}
                  {entry.episode.title ? ` · ${entry.episode.title}` : ''}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  {entry.completed ? (
                    <span className="text-ok">Finished</span>
                  ) : (
                    `Stopped at ${formatTime(entry.positionSeconds)} (${entry.percent}%)`
                  )}
                  {' · '}
                  {formatRelativeTime(entry.lastWatchedAt)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void removeOne(entry.episode.id)}
                aria-label="Remove from history"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-faint opacity-0 transition hover:bg-white/8 hover:text-danger focus:opacity-100 group-hover/h:opacity-100"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {meta && meta.totalPages > 1 ? (
        <div className="mt-7 flex justify-center gap-2">
          <button
            type="button"
            disabled={!meta.hasPrevious}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg bg-surface px-4 py-2 text-[13px] font-semibold text-ink-soft ring-1 ring-line-soft transition hover:bg-surface-2 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="grid place-items-center px-3 text-[13px] text-ink-faint">
            {meta.page} / {meta.totalPages}
          </span>
          <button
            type="button"
            disabled={!meta.hasNext}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg bg-surface px-4 py-2 text-[13px] font-semibold text-ink-soft ring-1 ring-line-soft transition hover:bg-surface-2 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
