'use client';

import { useCallback, useEffect, useState } from 'react';
import { qs } from '@/lib/api';
import { authFetch } from '@/lib/auth-store';
import type { PaginationMeta } from '@/lib/types';
import { cn, formatRelativeTime } from '@/lib/utils';
import { AdminHeader, Badge, Button, EmptyState, Pager, TableSkeleton, adminInput } from '@/components/admin/ui';

type ContactStatus = 'NEW' | 'OPEN' | 'RESOLVED' | 'CLOSED';

interface MessageRow {
  id: string;
  name: string;
  email: string;
  subject: string;
  category: string;
  message: string;
  status: ContactStatus;
  adminNote: string | null;
  createdAt: string;
}

const STATUSES: Array<{ value: ContactStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'NEW', label: 'New' },
  { value: 'OPEN', label: 'Open' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

const TONE: Record<ContactStatus, 'warn' | 'info' | 'ok' | 'neutral'> = {
  NEW: 'warn',
  OPEN: 'info',
  RESOLVED: 'ok',
  CLOSED: 'neutral',
};

export default function AdminContactPage() {
  const [rows, setRows] = useState<MessageRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [counts, setCounts] = useState<Record<ContactStatus, number> | null>(null);
  const [status, setStatus] = useState<ContactStatus | ''>('NEW');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authFetch<{ data: MessageRow[]; meta: PaginationMeta }>(
        `/contact${qs({ status: status || undefined, page, limit: 20 })}`,
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
    void authFetch<Record<ContactStatus, number>>('/contact/counts')
      .then(setCounts)
      .catch(() => undefined);
  }, [rows]);

  const update = async (message: MessageRow, next: ContactStatus) => {
    try {
      await authFetch(`/contact/${message.id}`, {
        method: 'PATCH',
        body: { status: next, adminNote: notes[message.id]?.trim() || undefined },
      });
      void load();
    } catch {
      /* leave the row */
    }
  };

  return (
    <div>
      <AdminHeader title="Support inbox" description="Messages sent through the contact form." />

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
          <EmptyState title="Inbox empty" body="No messages match this filter." />
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((message) => (
            <article key={message.id} className="card-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TONE[message.status]}>{message.status}</Badge>
                <Badge tone="neutral">{message.category}</Badge>
                <span className="text-[11.5px] text-ink-faint">{formatRelativeTime(message.createdAt)}</span>
              </div>

              <h2 className="mt-1.5 text-[14.5px] font-bold text-ink">{message.subject}</h2>
              <p className="text-[12px] text-ink-faint">
                {message.name} ·{' '}
                <a href={`mailto:${message.email}`} className="text-brand-bright hover:underline">
                  {message.email}
                </a>
              </p>

              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-base px-3 py-2.5 text-[13px] leading-relaxed text-ink-soft">
                {message.message}
              </p>

              {message.adminNote ? (
                <p className="mt-2 rounded-lg bg-brand/10 px-3 py-2 text-[12.5px] text-ink-soft">
                  Note: {message.adminNote}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={notes[message.id] ?? ''}
                  onChange={(e) => setNotes((previous) => ({ ...previous, [message.id]: e.target.value }))}
                  placeholder="Internal note…"
                  aria-label="Internal note"
                  className={`${adminInput} min-w-40 flex-1`}
                />
                <a href={`mailto:${message.email}?subject=Re: ${encodeURIComponent(message.subject)}`}>
                  <Button size="sm" variant="secondary">
                    Reply by email
                  </Button>
                </a>
                <Button size="sm" variant="secondary" onClick={() => void update(message, 'OPEN')}>
                  Open
                </Button>
                <Button size="sm" onClick={() => void update(message, 'RESOLVED')}>
                  Resolve
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void update(message, 'CLOSED')}>
                  Close
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
