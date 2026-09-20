'use client';

import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { authFetch, useAuthStore } from '@/lib/auth-store';
import type { AnimeCard, WatchStatus } from '@/lib/types';
import { formatCount, formatRelativeTime, formatTime } from '@/lib/utils';

interface ManaProgress {
  mana: number;
  rank: { name: string; icon: string | null; color: string | null } | null;
  nextRank: { name: string; requiredMana: number; icon: string | null; color: string | null } | null;
  manaToNextRank: number;
  progressPercent: number;
}

interface ContinueEntry {
  anime: { slug: string; titleEnglish: string; titleJapanese: string | null; posterUrl: string | null; totalEpisodes: number | null };
  episode: { id: string; number: number; title: string | null; thumbnailUrl: string | null; durationSeconds: number | null };
  positionSeconds: number;
  percent: number;
  lastWatchedAt: string;
}

interface ManaTransaction {
  id: string;
  event: string;
  amount: number;
  reason: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<WatchStatus, string> = {
  WATCHING: 'Watching',
  COMPLETED: 'Completed',
  PLAN_TO_WATCH: 'Plan to Watch',
  ON_HOLD: 'On Hold',
  DROPPED: 'Dropped',
};

export default function ProfileOverviewPage() {
  const user = useAuthStore((s) => s.user);

  const [progress, setProgress] = useState<ManaProgress | null>(null);
  const [counts, setCounts] = useState<Record<WatchStatus, number> | null>(null);
  const [continueWatching, setContinueWatching] = useState<ContinueEntry[]>([]);
  const [transactions, setTransactions] = useState<ManaTransaction[]>([]);
  const [favorites, setFavorites] = useState<AnimeCard[]>([]);

  useEffect(() => {
    void authFetch<ManaProgress>('/mana/me').then(setProgress).catch(() => undefined);
    void authFetch<Record<WatchStatus, number>>('/watchlist/counts').then(setCounts).catch(() => undefined);
    void authFetch<ContinueEntry[]>('/watch-history/continue?limit=8').then(setContinueWatching).catch(() => undefined);
    void authFetch<{ data: ManaTransaction[] }>('/mana/me/history?limit=8')
      .then((r) => setTransactions(r.data))
      .catch(() => undefined);
    void authFetch<{ data: AnimeCard[] }>('/favorites?limit=8')
      .then((r) => setFavorites(r.data))
      .catch(() => undefined);
  }, []);

  if (!user) return null;

  return (
    <div className="space-y-8">
      {/* Identity */}
      <section className="card-surface overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-brand/30 via-surface-3 to-accent/20" />
        <div className="flex flex-wrap items-end gap-4 px-5 pb-5">
          <span className="relative -mt-10 h-20 w-20 shrink-0 overflow-hidden rounded-2xl ring-4 ring-surface">
            {user.avatarUrl ? (
              <Image src={user.avatarUrl} alt="" fill sizes="80px" className="object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center bg-surface-3 text-[1.6rem] font-bold text-ink">
                {user.username[0]?.toUpperCase()}
              </span>
            )}
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="text-[1.25rem] font-extrabold text-ink">{user.displayName ?? user.username}</h1>
            <p className="text-[12.5px] text-ink-faint">
              @{user.username} · joined {formatRelativeTime(user.createdAt)}
            </p>
          </div>

          <Link
            href={`/user/${user.username}`}
            className="rounded-lg border border-line px-3.5 py-2 text-[12.5px] font-semibold text-ink-soft transition hover:bg-white/6"
          >
            View public profile
          </Link>
        </div>

        {progress ? (
          <div className="border-t border-line-soft px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: progress.rank?.color ?? undefined }}>
                <span aria-hidden="true">{progress.rank?.icon}</span>
                {progress.rank?.name ?? 'Unranked'}
              </span>
              <span className="text-[13px] font-bold text-accent">{formatCount(progress.mana)} Mana</span>
            </div>

            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-[width] duration-700"
                style={{ width: `${progress.progressPercent}%` }}
              />
            </div>

            <p className="mt-1.5 text-[11.5px] text-ink-faint">
              {progress.nextRank
                ? `${formatCount(progress.manaToNextRank)} Mana to ${progress.nextRank.icon} ${progress.nextRank.name}`
                : 'Highest rank reached.'}
            </p>
          </div>
        ) : null}
      </section>

      {/* List counts */}
      {counts ? (
        <section>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-ink-faint">My list</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {(Object.keys(STATUS_LABELS) as WatchStatus[]).map((status) => (
              <Link
                key={status}
                href={`/profile/watchlist?status=${status}`}
                className="card-surface px-4 py-3.5 text-center transition hover:border-brand/40"
              >
                <span className="block text-[1.4rem] font-extrabold text-ink">{counts[status]}</span>
                <span className="mt-0.5 block text-[12px] text-ink-muted">{STATUS_LABELS[status]}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Continue watching */}
      {continueWatching.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">Continue watching</h2>
            <Link href="/profile/history" className="text-[12.5px] font-semibold text-brand-bright hover:underline">
              Full history →
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {continueWatching.map((entry) => (
              <Link
                key={entry.episode.id}
                href={`/watch/${entry.anime.slug}/ep-${entry.episode.number}`}
                className="group/c card-surface overflow-hidden transition hover:border-brand/40"
              >
                <span className="relative block aspect-video bg-surface-2">
                  {entry.episode.thumbnailUrl ? (
                    <Image
                      src={entry.episode.thumbnailUrl}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 100vw, 25vw"
                      className="object-cover transition-transform duration-500 group-hover/c:scale-105"
                    />
                  ) : null}
                  <span className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                    <span className="block h-full bg-brand-bright" style={{ width: `${entry.percent}%` }} />
                  </span>
                  <span className="absolute bottom-2 right-2 rounded bg-black/78 px-1.5 py-0.5 text-[10px] font-semibold text-ink">
                    {formatTime(entry.positionSeconds)}
                  </span>
                </span>
                <span className="block p-3">
                  <span className="clamp-2 block text-[13px] font-semibold text-ink">{entry.anime.titleEnglish}</span>
                  <span className="mt-0.5 block text-[11.5px] text-ink-faint">
                    Episode {entry.episode.number} · {entry.percent}% watched
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Favourites */}
        {favorites.length > 0 ? (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">Favourites</h2>
              <Link href="/profile/favorites" className="text-[12.5px] font-semibold text-brand-bright hover:underline">
                See all →
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-2.5">
              {favorites.slice(0, 8).map((anime) => (
                <Link key={anime.id} href={`/anime/${anime.slug}`} className="group/f">
                  <span className="relative block aspect-[2/3] overflow-hidden rounded-lg bg-surface-2 ring-1 ring-line-soft transition group-hover/f:ring-brand/60">
                    {anime.posterUrl ? (
                      <Image src={anime.posterUrl} alt="" fill sizes="120px" className="object-cover" />
                    ) : null}
                  </span>
                  <span className="clamp-2 mt-1.5 block text-[11.5px] text-ink-soft">{anime.title}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* Mana history */}
        {transactions.length > 0 ? (
          <section>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-ink-faint">Recent Mana</h2>
            <ul className="card-surface divide-y divide-line-soft overflow-hidden">
              {transactions.map((tx) => (
                <li key={tx.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <span
                    className={`shrink-0 text-[13px] font-bold tabular-nums ${
                      tx.amount >= 0 ? 'text-accent' : 'text-danger'
                    }`}
                  >
                    {tx.amount >= 0 ? '+' : ''}
                    {tx.amount}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-ink-soft">
                      {tx.reason ?? tx.event.toLowerCase().replace(/_/g, ' ')}
                    </span>
                    <span className="block text-[11px] text-ink-faint">{formatRelativeTime(tx.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
