'use client';

import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { qs } from '@/lib/api';
import { authFetch } from '@/lib/auth-store';
import type { PaginationMeta } from '@/lib/types';
import { formatCount, formatRelativeTime, typeLabel } from '@/lib/utils';
import {
  AdminHeader,
  Badge,
  Button,
  EmptyState,
  Pager,
  TableSkeleton,
  adminInput,
  adminSelect,
} from '@/components/admin/ui';
import type { AnimeType } from '@/lib/types';

interface AdminAnimeRow {
  id: string;
  slug: string;
  titleEnglish: string;
  titleJapanese: string | null;
  posterUrl: string | null;
  type: AnimeType;
  status: string;
  publishStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  releaseYear: number | null;
  score: number;
  viewCount: number;
  isFeatured: boolean;
  deletedAt: string | null;
  updatedAt: string;
  episodeCount: number;
}

export default function AdminAnimePage() {
  const [rows, setRows] = useState<AdminAnimeRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [publishStatus, setPublishStatus] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authFetch<{ data: AdminAnimeRow[]; meta: PaginationMeta }>(
        `/admin/anime${qs({ q: debounced || undefined, publishStatus: publishStatus || undefined, page, limit: 20 })}`,
      );
      setRows(result.data);
      setMeta(result.meta);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [debounced, publishStatus, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debounced, publishStatus]);

  const archive = async (row: AdminAnimeRow) => {
    if (!window.confirm(`Archive “${row.titleEnglish}”? It will be hidden from the site but not deleted.`)) return;
    try {
      await authFetch(`/admin/anime/${row.id}`, { method: 'DELETE' });
      void load();
    } catch {
      /* leave the row */
    }
  };

  const restore = async (row: AdminAnimeRow) => {
    try {
      await authFetch(`/admin/anime/${row.id}/restore`, { method: 'POST' });
      void load();
    } catch {
      /* ignore */
    }
  };

  return (
    <div>
      <AdminHeader title="Anime" description="Every title in the catalogue, including drafts and archived entries.">
        <Link href="/admin/anime/new">
          <Button>+ New anime</Button>
        </Link>
      </AdminHeader>

      <div className="card-surface mb-4 flex flex-wrap gap-2 p-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title or slug…"
          aria-label="Search anime"
          className={`${adminInput} min-w-48 flex-1`}
        />
        <select
          value={publishStatus}
          onChange={(e) => setPublishStatus(e.target.value)}
          aria-label="Publish status"
          className={`${adminSelect} w-auto`}
        >
          <option value="">All statuses</option>
          <option value="PUBLISHED">Published</option>
          <option value="DRAFT">Draft</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <div className="card-surface">
          <EmptyState title="No titles found" body="Adjust your filters, or add the first anime." />
        </div>
      ) : (
        <div className="card-surface overflow-hidden">
          <ul className="divide-y divide-line-soft">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-3 p-3">
                <span className="relative h-16 w-11 shrink-0 overflow-hidden rounded bg-surface-2">
                  {row.posterUrl ? (
                    <Image src={row.posterUrl} alt="" fill sizes="44px" className="object-cover" />
                  ) : null}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/admin/anime/${row.id}`}
                      className="truncate text-[13.5px] font-semibold text-ink transition hover:text-brand-bright"
                    >
                      {row.titleEnglish}
                    </Link>
                    <Badge
                      tone={
                        row.publishStatus === 'PUBLISHED' ? 'ok' : row.publishStatus === 'DRAFT' ? 'warn' : 'neutral'
                      }
                    >
                      {row.publishStatus}
                    </Badge>
                    {row.isFeatured ? <Badge tone="info">Featured</Badge> : null}
                    {row.deletedAt ? <Badge tone="danger">Archived</Badge> : null}
                  </div>

                  <p className="mt-0.5 truncate text-[11.5px] text-ink-faint">
                    /{row.slug} · {typeLabel(row.type)} · {row.releaseYear ?? '—'} · {row.episodeCount} episodes ·{' '}
                    {formatCount(row.viewCount)} views · ★ {row.score.toFixed(1)}
                  </p>
                  <p className="text-[11px] text-ink-faint">Updated {formatRelativeTime(row.updatedAt)}</p>
                </div>

                <div className="flex shrink-0 gap-1.5">
                  <Link href={`/admin/episodes?animeId=${row.id}`}>
                    <Button variant="ghost" size="sm">
                      Episodes
                    </Button>
                  </Link>
                  <Link href={`/admin/anime/${row.id}`}>
                    <Button variant="secondary" size="sm">
                      Edit
                    </Button>
                  </Link>
                  {row.deletedAt ? (
                    <Button variant="ghost" size="sm" onClick={() => void restore(row)}>
                      Restore
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => void archive(row)}>
                      Archive
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Pager page={meta?.page ?? 1} totalPages={meta?.totalPages ?? 1} onChange={setPage} />
    </div>
  );
}
