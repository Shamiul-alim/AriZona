'use client';

import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { qs } from '@/lib/api';
import { authFetch } from '@/lib/auth-store';
import type { PaginationMeta } from '@/lib/types';
import { formatCount, formatRelativeTime, formatTime } from '@/lib/utils';
import { AdminHeader, Badge, Button, EmptyState, Pager, TableSkeleton, adminInput } from '@/components/admin/ui';

interface AdminEpisodeRow {
  id: string;
  number: number;
  title: string | null;
  thumbnailUrl: string | null;
  publishStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  hasSub: boolean;
  hasDub: boolean;
  viewCount: number;
  durationSeconds: number | null;
  updatedAt: string;
  anime: { id: string; slug: string; titleEnglish: string; posterUrl: string | null };
  sourceCount: number;
  subtitleCount: number;
}

function EpisodesInner() {
  const params = useSearchParams();
  const animeId = params.get('animeId') ?? '';

  const [rows, setRows] = useState<AdminEpisodeRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authFetch<{ data: AdminEpisodeRow[]; meta: PaginationMeta }>(
        `/admin/episodes${qs({ animeId: animeId || undefined, search: debounced || undefined, page, limit: 25 })}`,
      );
      setRows(result.data);
      setMeta(result.meta);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [animeId, debounced, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const archive = async (row: AdminEpisodeRow) => {
    if (!window.confirm(`Archive episode ${row.number} of “${row.anime.titleEnglish}”?`)) return;
    try {
      await authFetch(`/admin/episodes/${row.id}`, { method: 'DELETE' });
      void load();
    } catch {
      /* keep the row */
    }
  };

  return (
    <div>
      <AdminHeader
        title="Episodes"
        description={animeId ? 'Filtered to one title.' : 'Every episode across the catalogue.'}
      >
        {animeId ? (
          <Link href="/admin/episodes">
            <Button variant="secondary">Clear filter</Button>
          </Link>
        ) : null}
        <Link href={`/admin/episodes/new${animeId ? `?animeId=${animeId}` : ''}`}>
          <Button>+ New episode</Button>
        </Link>
      </AdminHeader>

      <div className="card-surface mb-4 p-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search episode titles…"
          aria-label="Search episodes"
          className={adminInput}
        />
      </div>

      {loading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <div className="card-surface">
          <EmptyState title="No episodes found" body="Create the first episode, or clear your filters." />
        </div>
      ) : (
        <div className="card-surface overflow-hidden">
          <ul className="divide-y divide-line-soft">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-3 p-3">
                <span className="relative h-12 w-20 shrink-0 overflow-hidden rounded bg-surface-2">
                  {row.thumbnailUrl ? (
                    <Image src={row.thumbnailUrl} alt="" fill sizes="80px" className="object-cover" />
                  ) : row.anime.posterUrl ? (
                    <Image src={row.anime.posterUrl} alt="" fill sizes="80px" className="object-cover opacity-50" />
                  ) : null}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/admin/episodes/${row.id}`}
                      className="truncate text-[13.5px] font-semibold text-ink transition hover:text-brand-bright"
                    >
                      EP {row.number}
                      {row.title ? ` · ${row.title}` : ''}
                    </Link>
                    <Badge tone={row.publishStatus === 'PUBLISHED' ? 'ok' : row.publishStatus === 'DRAFT' ? 'warn' : 'neutral'}>
                      {row.publishStatus}
                    </Badge>
                    {row.hasSub ? <Badge tone="info">SUB</Badge> : null}
                    {row.hasDub ? <Badge tone="info">DUB</Badge> : null}
                    {row.sourceCount === 0 ? <Badge tone="danger">No source</Badge> : null}
                  </div>

                  <p className="mt-0.5 truncate text-[11.5px] text-ink-faint">
                    <Link href={`/admin/anime/${row.anime.id}`} className="transition hover:text-ink-muted">
                      {row.anime.titleEnglish}
                    </Link>
                    {' · '}
                    {row.sourceCount} {row.sourceCount === 1 ? 'source' : 'sources'} · {row.subtitleCount} subtitles ·{' '}
                    {formatCount(row.viewCount)} views
                    {row.durationSeconds ? ` · ${formatTime(row.durationSeconds)}` : ''}
                  </p>
                  <p className="text-[11px] text-ink-faint">Updated {formatRelativeTime(row.updatedAt)}</p>
                </div>

                <div className="flex shrink-0 gap-1.5">
                  <Link href={`/watch/${row.anime.slug}/ep-${row.number}`} target="_blank">
                    <Button variant="ghost" size="sm">
                      View
                    </Button>
                  </Link>
                  <Link href={`/admin/episodes/${row.id}`}>
                    <Button variant="secondary" size="sm">
                      Edit
                    </Button>
                  </Link>
                  <Button variant="ghost" size="sm" onClick={() => void archive(row)}>
                    Archive
                  </Button>
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

export default function AdminEpisodesPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <EpisodesInner />
    </Suspense>
  );
}
