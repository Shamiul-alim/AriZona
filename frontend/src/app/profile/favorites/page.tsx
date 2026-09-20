'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '@/lib/auth-store';
import type { AnimeCard as AnimeCardType, PaginationMeta } from '@/lib/types';
import { AnimeGrid, AnimeGridSkeleton } from '@/components/anime/AnimeGrid';

export default function FavoritesPage() {
  const [items, setItems] = useState<AnimeCardType[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void authFetch<{ data: AnimeCardType[]; meta: PaginationMeta }>(`/favorites?page=${page}&limit=28`)
      .then((result) => {
        setItems(result.data);
        setMeta(result.meta);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [page]);

  if (loading) return <AnimeGridSkeleton count={14} />;

  return (
    <div>
      <AnimeGrid items={items} emptyMessage="You have not favourited anything yet" />

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
