'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { qs } from '@/lib/api';
import { authFetch } from '@/lib/auth-store';
import type { AnimeCard as AnimeCardType, PaginationMeta, WatchStatus } from '@/lib/types';
import { AnimeCard, AnimeCardSkeleton } from '@/components/anime/AnimeCard';
import { cn } from '@/lib/utils';

interface Entry {
  id: string;
  status: WatchStatus;
  progressEpisodes: number;
  updatedAt: string;
  anime: AnimeCardType;
}

const STATUSES: Array<{ value: WatchStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'WATCHING', label: 'Watching' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PLAN_TO_WATCH', label: 'Plan to Watch' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'DROPPED', label: 'Dropped' },
];

function WatchlistInner() {
  const router = useRouter();
  const params = useSearchParams();
  const status = (params.get('status') as WatchStatus | null) ?? 'ALL';
  const page = Number(params.get('page') ?? 1);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [counts, setCounts] = useState<Record<WatchStatus, number> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authFetch<{ data: Entry[]; meta: PaginationMeta }>(
        `/watchlist${qs({ status: status === 'ALL' ? undefined : status, page, limit: 24 })}`,
      );
      setEntries(result.data);
      setMeta(result.meta);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void authFetch<Record<WatchStatus, number>>('/watchlist/counts')
      .then(setCounts)
      .catch(() => undefined);
  }, []);

  const remove = async (slug: string) => {
    try {
      await authFetch(`/watchlist/${slug}`, { method: 'DELETE' });
      setEntries((previous) => previous.filter((e) => e.anime.slug !== slug));
    } catch {
      /* leave the row in place */
    }
  };

  const setStatus = (next: WatchStatus | 'ALL') => {
    router.push(`/profile/watchlist${next === 'ALL' ? '' : `?status=${next}`}`);
  };

  return (
    <div>
      <div className="rail mb-5 flex gap-1.5 overflow-x-auto">
        {STATUSES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setStatus(option.value)}
            aria-pressed={status === option.value}
            className={cn(
              'shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-medium transition',
              status === option.value
                ? 'bg-brand text-white'
                : 'bg-surface text-ink-muted ring-1 ring-line-soft hover:bg-surface-2 hover:text-ink',
            )}
          >
            {option.label}
            {counts && option.value !== 'ALL' ? (
              <span className="ml-1.5 text-[11px] opacity-70">{counts[option.value]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <AnimeCardSkeleton key={i} />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="card-surface grid place-items-center px-6 py-16 text-center">
          <p className="text-[14px] font-medium text-ink-soft">Nothing here yet</p>
          <p className="mt-1 max-w-sm text-[13px] text-ink-faint">
            Add titles from any anime page and they will show up here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {entries.map((entry) => (
            <div key={entry.id} className="group/w relative">
              <AnimeCard anime={entry.anime} />
              {entry.progressEpisodes > 0 ? (
                <p className="mt-0.5 text-[11px] text-accent">
                  {entry.progressEpisodes}
                  {entry.anime.totalEpisodes ? ` / ${entry.anime.totalEpisodes}` : ''} watched
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void remove(entry.anime.slug)}
                aria-label={`Remove ${entry.anime.title} from list`}
                className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg bg-black/72 text-ink-soft opacity-0 backdrop-blur-sm transition hover:bg-danger hover:text-white focus:opacity-100 group-hover/w:opacity-100"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2}>
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {meta && meta.totalPages > 1 ? (
        <div className="mt-7 flex justify-center gap-2">
          <button
            type="button"
            disabled={!meta.hasPrevious}
            onClick={() => router.push(`/profile/watchlist${qs({ status: status === 'ALL' ? undefined : status, page: page - 1 })}`)}
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
            onClick={() => router.push(`/profile/watchlist${qs({ status: status === 'ALL' ? undefined : status, page: page + 1 })}`)}
            className="rounded-lg bg-surface px-4 py-2 text-[13px] font-semibold text-ink-soft ring-1 ring-line-soft transition hover:bg-surface-2 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function WatchlistPage() {
  return (
    <Suspense fallback={<div className="skeleton h-96 rounded-xl" />}>
      <WatchlistInner />
    </Suspense>
  );
}
