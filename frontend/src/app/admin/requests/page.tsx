'use client';

import { useCallback, useEffect, useState } from 'react';
import { qs } from '@/lib/api';
import { authFetch } from '@/lib/auth-store';
import type { PaginationMeta } from '@/lib/types';
import { cn, formatRelativeTime } from '@/lib/utils';
import { AdminHeader, Badge, Button, EmptyState, Pager, TableSkeleton, adminInput } from '@/components/admin/ui';

type RequestStatus = 'PENDING' | 'REVIEWING' | 'APPROVED' | 'AVAILABLE' | 'REJECTED';

interface RequestRow {
  id: string;
  title: string;
  titleJapanese: string | null;
  malUrl: string | null;
  anilistUrl: string | null;
  message: string | null;
  status: RequestStatus;
  adminNote: string | null;
  createdAt: string;
  user: { id: string; username: string; email: string } | null;
  fulfilledAnime: { slug: string; titleEnglish: string } | null;
}

const STATUSES: Array<{ value: RequestStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'REVIEWING', label: 'Reviewing' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'REJECTED', label: 'Rejected' },
];

const TONE: Record<RequestStatus, 'warn' | 'info' | 'ok' | 'neutral' | 'danger'> = {
  PENDING: 'warn',
  REVIEWING: 'info',
  APPROVED: 'info',
  AVAILABLE: 'ok',
  REJECTED: 'danger',
};

export default function AdminRequestsPage() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [counts, setCounts] = useState<Record<RequestStatus, number> | null>(null);
  const [status, setStatus] = useState<RequestStatus | ''>('PENDING');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authFetch<{ data: RequestRow[]; meta: PaginationMeta }>(
        `/anime-requests${qs({ status: status || undefined, page, limit: 20 })}`,
      );
      setRows(result.data);
      setMeta(result.meta);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void authFetch<Record<RequestStatus, number>>('/anime-requests/counts')
      .then(setCounts)
      .catch(() => undefined);
  }, [rows]);

  const update = async (request: RequestRow, next: RequestStatus) => {
    try {
      await authFetch(`/anime-requests/${request.id}`, {
        method: 'PATCH',
        body: { status: next, adminNote: notes[request.id]?.trim() || undefined },
      });
      void load();
    } catch {
      /* leave the row */
    }
  };

  return (
    <div>
      <AdminHeader
        title="Anime requests"
        description="Requests are processed by hand. Marking one Available awards the requester Mana."
      />

      <div className="rail mb-4 flex gap-1.5 overflow-x-auto">
        {STATUSES.map((option) => (
          <button
            key={option.value || 'all'}
            type="button"
            onClick={() => {
              setStatus(option.value);
              setPage(1);
            }}
            aria-pressed={status === option.value}
            className={cn(
              'shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-medium transition',
              status === option.value
                ? 'bg-brand text-white'
                : 'bg-surface text-ink-muted ring-1 ring-line-soft hover:bg-surface-2 hover:text-ink',
            )}
          >
            {option.label}
            {counts && option.value ? <span className="ml-1.5 text-[11px] opacity-70">{counts[option.value]}</span> : null}
          </button>
        ))}
      </div>

      {loading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <div className="card-surface">
          <EmptyState title="Nothing in the queue" body="No requests match this filter." />
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((request) => (
            <article key={request.id} className="card-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TONE[request.status]}>{request.status}</Badge>
                <span className="text-[11.5px] text-ink-faint">{formatRelativeTime(request.createdAt)}</span>
              </div>

              <h2 className="mt-1.5 text-[14.5px] font-bold text-ink">{request.title}</h2>
              {request.titleJapanese ? (
                <p className="text-[12.5px] text-ink-muted">{request.titleJapanese}</p>
              ) : null}

              {request.message ? (
                <p className="mt-2 rounded-lg bg-base px-3 py-2 text-[13px] leading-relaxed text-ink-soft">
                  {request.message}
                </p>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-3 text-[11.5px]">
                {request.malUrl ? (
                  <a href={request.malUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-bright hover:underline">
                    MyAnimeList ↗
                  </a>
                ) : null}
                {request.anilistUrl ? (
                  <a href={request.anilistUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-bright hover:underline">
                    AniList ↗
                  </a>
                ) : null}
                <span className="text-ink-faint">
                  {request.user ? `Requested by ${request.user.username}` : 'Requested anonymously'}
                </span>
              </div>

              {request.fulfilledAnime ? (
                <p className="mt-2 text-[12.5px] text-ok">Fulfilled by “{request.fulfilledAnime.titleEnglish}”</p>
              ) : null}

              {request.adminNote ? (
                <p className="mt-2 rounded-lg bg-brand/10 px-3 py-2 text-[12.5px] text-ink-soft">
                  Note: {request.adminNote}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={notes[request.id] ?? ''}
                  onChange={(e) => setNotes((previous) => ({ ...previous, [request.id]: e.target.value }))}
                  placeholder="Note (optional)…"
                  aria-label="Admin note"
                  className={`${adminInput} min-w-40 flex-1`}
                />
                <Button size="sm" variant="secondary" onClick={() => void update(request, 'REVIEWING')}>
                  Reviewing
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void update(request, 'APPROVED')}>
                  Approve
                </Button>
                <Button size="sm" onClick={() => void update(request, 'AVAILABLE')}>
                  Mark available
                </Button>
                <Button size="sm" variant="danger" onClick={() => void update(request, 'REJECTED')}>
                  Reject
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Pager page={meta?.page ?? 1} totalPages={meta?.totalPages ?? 1} onChange={setPage} />
    </div>
  );
}
