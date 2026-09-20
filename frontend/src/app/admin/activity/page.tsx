'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '@/lib/auth-store';
import type { PaginationMeta } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils';
import { AdminHeader, EmptyState, Pager, TableSkeleton } from '@/components/admin/ui';

interface LogRow {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { username: string; avatarUrl: string | null; role: string } | null;
}

export default function AdminActivityPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authFetch<{ data: LogRow[]; meta: PaginationMeta }>(
        `/admin/activity-log?page=${page}&limit=40`,
      );
      setRows(result.data);
      setMeta(result.meta);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <AdminHeader title="Audit log" description="A record of sensitive administrative operations." />

      {loading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <div className="card-surface">
          <EmptyState
            title="Nothing logged yet"
            body="Sensitive admin operations are recorded here as they happen."
          />
        </div>
      ) : (
        <div className="card-surface overflow-hidden">
          <ul className="divide-y divide-line-soft">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-ink">{row.action}</span>
                  <span className="block text-[11.5px] text-ink-faint">
                    {row.user ? `${row.user.username} (${row.user.role.toLowerCase()})` : 'system'}
                    {row.entityType ? ` · ${row.entityType}` : ''}
                    {row.entityId ? ` ${row.entityId.slice(0, 8)}…` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-[11.5px] text-ink-faint">{formatRelativeTime(row.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Pager page={meta?.page ?? 1} totalPages={meta?.totalPages ?? 1} onChange={setPage} />
    </div>
  );
}
