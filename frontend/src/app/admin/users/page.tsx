'use client';

import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { qs } from '@/lib/api';
import { authFetch, useAuthStore } from '@/lib/auth-store';
import type { PaginationMeta, UserRole } from '@/lib/types';
import { formatCount, formatDate, formatRelativeTime } from '@/lib/utils';
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

type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'PENDING_VERIFICATION';

interface UserRow {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: UserRole;
  status: UserStatus;
  mana: number;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  suspendedUntil: string | null;
  rank: { name: string; color: string | null } | null;
  _count: { comments: number; communityPosts: number };
}

const ROLES: UserRole[] = ['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'];
const RANK_ORDER: Record<UserRole, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };

export default function AdminUsersPage() {
  const actor = useAuthStore((s) => s.user);

  const [rows, setRows] = useState<UserRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [manaAmount, setManaAmount] = useState('');
  const [manaReason, setManaReason] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authFetch<{ data: UserRow[]; meta: PaginationMeta }>(
        `/admin/users${qs({ q: debounced || undefined, role: role || undefined, status: status || undefined, page, limit: 20 })}`,
      );
      setRows(result.data);
      setMeta(result.meta);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [debounced, role, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeRole = async (user: UserRow, next: UserRole) => {
    try {
      await authFetch(`/admin/users/${user.id}/role`, { method: 'PATCH', body: { role: next } });
      void load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not change the role.');
    }
  };

  const changeStatus = async (user: UserRow, next: UserStatus) => {
    let reason: string | undefined;
    if (next === 'BANNED') {
      reason = window.prompt('Reason for the ban (shown to the user):') ?? undefined;
      if (reason === undefined) return;
    }
    try {
      await authFetch(`/admin/users/${user.id}/status`, { method: 'PATCH', body: { status: next, reason } });
      void load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not change the status.');
    }
  };

  const adjustMana = async (user: UserRow) => {
    const amount = Number(manaAmount);
    if (!Number.isFinite(amount) || amount === 0 || !manaReason.trim()) return;
    try {
      await authFetch(`/admin/users/${user.id}/mana`, {
        method: 'POST',
        body: { amount, reason: manaReason.trim() },
      });
      setManaAmount('');
      setManaReason('');
      setExpanded(null);
      void load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not adjust Mana.');
    }
  };

  const canActOn = (user: UserRow) =>
    actor && RANK_ORDER[actor.role] > RANK_ORDER[user.role] && actor.id !== user.id;

  return (
    <div>
      <AdminHeader
        title="Users"
        description="You can only modify accounts below your own level, and never your own."
      />

      <div className="card-surface mb-4 flex flex-wrap gap-2 p-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search username, email or display name…"
          aria-label="Search users"
          className={`${adminInput} min-w-48 flex-1`}
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" className={`${adminSelect} w-auto`}>
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r.replace('_', ' ')}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className={`${adminSelect} w-auto`}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="BANNED">Banned</option>
        </select>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <div className="card-surface">
          <EmptyState title="No users found" body="Adjust your filters." />
        </div>
      ) : (
        <div className="card-surface overflow-hidden">
          <ul className="divide-y divide-line-soft">
            {rows.map((user) => (
              <li key={user.id}>
                <div className="flex flex-wrap items-center gap-3 p-3">
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-2">
                    {user.avatarUrl ? (
                      <Image src={user.avatarUrl} alt="" fill sizes="40px" className="object-cover" />
                    ) : null}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/user/${user.username}`}
                        target="_blank"
                        className="truncate text-[13.5px] font-semibold text-ink transition hover:text-brand-bright"
                      >
                        {user.displayName ?? user.username}
                      </Link>
                      {user.role !== 'USER' ? <Badge tone="info">{user.role.replace('_', ' ')}</Badge> : null}
                      {user.status === 'BANNED' ? <Badge tone="danger">Banned</Badge> : null}
                      {user.status === 'SUSPENDED' ? <Badge tone="warn">Suspended</Badge> : null}
                      {!user.emailVerifiedAt ? <Badge tone="neutral">Unverified</Badge> : null}
                    </div>

                    <p className="truncate text-[11.5px] text-ink-faint">
                      @{user.username} · {user.email}
                    </p>
                    <p className="text-[11px] text-ink-faint">
                      {formatCount(user.mana)} Mana
                      {user.rank ? ` · ${user.rank.name}` : ''} · {user._count.comments} comments ·{' '}
                      {user._count.communityPosts} posts · joined {formatDate(user.createdAt)}
                      {user.lastLoginAt ? ` · last seen ${formatRelativeTime(user.lastLoginAt)}` : ''}
                    </p>
                  </div>

                  {canActOn(user) ? (
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {actor?.role === 'SUPER_ADMIN' ? (
                        <select
                          value={user.role}
                          onChange={(e) => void changeRole(user, e.target.value as UserRole)}
                          aria-label={`Role for ${user.username}`}
                          className={`${adminSelect} h-8 w-auto text-[12px]`}
                        >
                          {ROLES.filter((r) => RANK_ORDER[r] < RANK_ORDER[actor.role]).map((r) => (
                            <option key={r} value={r}>
                              {r.replace('_', ' ')}
                            </option>
                          ))}
                        </select>
                      ) : null}

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpanded(expanded === user.id ? null : user.id)}
                      >
                        Mana
                      </Button>

                      {user.status === 'ACTIVE' ? (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => void changeStatus(user, 'SUSPENDED')}>
                            Suspend
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => void changeStatus(user, 'BANNED')}>
                            Ban
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => void changeStatus(user, 'ACTIVE')}>
                          Reactivate
                        </Button>
                      )}
                    </div>
                  ) : (
                    <span className="shrink-0 text-[11.5px] text-ink-faint">
                      {actor?.id === user.id ? 'This is you' : 'Outranks you'}
                    </span>
                  )}
                </div>

                {expanded === user.id ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-line-soft bg-base/50 px-3 py-2.5">
                    <input
                      type="number"
                      value={manaAmount}
                      onChange={(e) => setManaAmount(e.target.value)}
                      placeholder="Amount (negative to deduct)"
                      aria-label="Mana amount"
                      className={`${adminInput} w-52`}
                    />
                    <input
                      value={manaReason}
                      onChange={(e) => setManaReason(e.target.value)}
                      placeholder="Reason (recorded in the audit trail)"
                      aria-label="Reason"
                      className={`${adminInput} min-w-40 flex-1`}
                    />
                    <Button size="sm" onClick={() => void adjustMana(user)}>
                      Apply
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setExpanded(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Pager page={meta?.page ?? 1} totalPages={meta?.totalPages ?? 1} onChange={setPage} />
    </div>
  );
}
