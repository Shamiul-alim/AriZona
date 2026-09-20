'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { qs } from '@/lib/api';
import { authFetch } from '@/lib/auth-store';
import type { PaginationMeta } from '@/lib/types';
import { cn, formatRelativeTime } from '@/lib/utils';
import { AdminHeader, Badge, Button, EmptyState, Pager, TableSkeleton, adminTextarea } from '@/components/admin/ui';

type ReportStatus = 'PENDING' | 'INVESTIGATING' | 'RESOLVED' | 'REJECTED';

interface ReportRow {
  id: string;
  targetType: string;
  targetId: string;
  kind: string;
  status: ReportStatus;
  message: string | null;
  context: Record<string, unknown> | null;
  adminNote: string | null;
  createdAt: string;
  user: { id: string; username: string; avatarUrl: string | null } | null;
  resolvedBy: { id: string; username: string } | null;
  target: { kind: string; label: string; href: string | null; author?: string } | null;
}

const STATUSES: Array<{ value: ReportStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'INVESTIGATING', label: 'Investigating' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'REJECTED', label: 'Rejected' },
];

const STATUS_TONE: Record<ReportStatus, 'warn' | 'info' | 'ok' | 'neutral'> = {
  PENDING: 'warn',
  INVESTIGATING: 'info',
  RESOLVED: 'ok',
  REJECTED: 'neutral',
};

function label(value: string): string {
  return value
    .split('_')
    .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
    .join(' ');
}

export default function AdminReportsPage() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [counts, setCounts] = useState<Record<ReportStatus, number> | null>(null);
  const [status, setStatus] = useState<ReportStatus | ''>('PENDING');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authFetch<{ data: ReportRow[]; meta: PaginationMeta }>(
        `/reports${qs({ status: status || undefined, page, limit: 20 })}`,
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
    void authFetch<Record<ReportStatus, number>>('/reports/counts')
      .then(setCounts)
      .catch(() => undefined);
  }, [rows]);

  const resolve = async (report: ReportRow, next: ReportStatus) => {
    try {
      await authFetch(`/reports/${report.id}`, {
        method: 'PATCH',
        body: { status: next, adminNote: note.trim() || undefined },
      });
      setNote('');
      setExpanded(null);
      void load();
    } catch {
      /* leave the row */
    }
  };

  return (
    <div>
      <AdminHeader title="Reports" description="Problems flagged by viewers. Pending items are shown first." />

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
          <EmptyState title="Nothing to review" body="No reports match this filter." />
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((report) => (
            <article key={report.id} className="card-surface overflow-hidden">
              <div className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONE[report.status]}>{label(report.status)}</Badge>
                  <Badge tone="neutral">{label(report.kind)}</Badge>
                  <Badge tone="neutral">{label(report.targetType)}</Badge>
                  <span className="text-[11.5px] text-ink-faint">{formatRelativeTime(report.createdAt)}</span>
                </div>

                <div className="mt-2">
                  {report.target ? (
                    report.target.href ? (
                      <Link
                        href={report.target.href}
                        target="_blank"
                        className="text-[13.5px] font-semibold text-ink transition hover:text-brand-bright"
                      >
                        {report.target.label} ↗
                      </Link>
                    ) : (
                      <p className="text-[13.5px] font-semibold text-ink">{report.target.label}</p>
                    )
                  ) : (
                    <p className="text-[13.5px] italic text-ink-faint">The reported item no longer exists.</p>
                  )}
                  {report.target?.author ? (
                    <p className="text-[11.5px] text-ink-faint">by {report.target.author}</p>
                  ) : null}
                </div>

                {report.message ? (
                  <p className="mt-2 rounded-lg bg-base px-3 py-2 text-[13px] leading-relaxed text-ink-soft">
                    {report.message}
                  </p>
                ) : null}

                {report.context && Object.keys(report.context).length > 0 ? (
                  <p className="mt-2 text-[11.5px] text-ink-faint">
                    Context:{' '}
                    {Object.entries(report.context)
                      .filter(([, v]) => v !== null && v !== undefined)
                      .map(([k, v]) => `${k}=${String(v)}`)
                      .join(' · ')}
                  </p>
                ) : null}

                <p className="mt-2 text-[11.5px] text-ink-faint">
                  Reported by {report.user?.username ?? 'a signed-out visitor'}
                  {report.resolvedBy ? ` · handled by ${report.resolvedBy.username}` : ''}
                </p>

                {report.adminNote ? (
                  <p className="mt-2 rounded-lg bg-brand/10 px-3 py-2 text-[12.5px] text-ink-soft">
                    Note: {report.adminNote}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2 border-t border-line-soft px-4 py-3">
                {expanded === report.id ? (
                  <div className="w-full space-y-2">
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value.slice(0, 1000))}
                      rows={2}
                      placeholder="Optional note for the record…"
                      className={adminTextarea}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void resolve(report, 'RESOLVED')}>
                        Mark resolved
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void resolve(report, 'INVESTIGATING')}>
                        Investigating
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => void resolve(report, 'REJECTED')}>
                        Reject
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setExpanded(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setExpanded(report.id);
                      setNote(report.adminNote ?? '');
                    }}
                  >
                    Handle
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <Pager page={meta?.page ?? 1} totalPages={meta?.totalPages ?? 1} onChange={setPage} />
    </div>
  );
}
