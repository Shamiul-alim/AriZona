'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authFetch, useAuthStore } from '@/lib/auth-store';
import type { WatchStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS: Array<{ value: WatchStatus; label: string }> = [
  { value: 'WATCHING', label: 'Watching' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PLAN_TO_WATCH', label: 'Plan to Watch' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'DROPPED', label: 'Dropped' },
];

interface WatchlistControlsProps {
  slug: string;
  initialStatus: WatchStatus | null;
  initialFavorite: boolean;
}

export function WatchlistControls({ slug, initialStatus, initialFavorite }: WatchlistControlsProps) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.status === 'authenticated');

  const [status, setStatus] = useState<WatchStatus | null>(initialStatus);
  const [favorite, setFavorite] = useState(initialFavorite);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requireAuth = () => {
    if (!isAuthenticated) {
      router.push(`/auth/login?next=/anime/${slug}`);
      return false;
    }
    return true;
  };

  const changeStatus = async (next: WatchStatus | null) => {
    if (!requireAuth()) return;
    setBusy(true);
    setError(null);
    const previous = status;
    setStatus(next);
    setOpen(false);

    try {
      if (next === null) {
        await authFetch(`/watchlist/${slug}`, { method: 'DELETE' });
      } else {
        await authFetch(`/watchlist/${slug}`, { method: 'PUT', body: { status: next } });
      }
    } catch {
      setStatus(previous);
      setError('Could not update your list. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const toggleFavorite = async () => {
    if (!requireAuth()) return;
    setBusy(true);
    setError(null);
    const previous = favorite;
    setFavorite(!previous);

    try {
      const result = await authFetch<{ isFavorite: boolean }>(`/favorites/${slug}/toggle`, { method: 'POST' });
      setFavorite(result.isFavorite);
    } catch {
      setFavorite(previous);
      setError('Could not update your favourites.');
    } finally {
      setBusy(false);
    }
  };

  const activeLabel = STATUS_OPTIONS.find((o) => o.value === status)?.label;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => (requireAuth() ? setOpen((v) => !v) : undefined)}
            disabled={busy}
            aria-expanded={open}
            className={cn(
              'inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold transition disabled:opacity-60',
              status ? 'bg-brand text-white hover:bg-brand-bright' : 'border border-line bg-surface text-ink hover:bg-surface-2',
            )}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 4h12v16l-6-4-6 4V4Z" strokeLinejoin="round" />
            </svg>
            {activeLabel ?? 'Add to List'}
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.4}>
              <path d="m6 9 6 6 6-6" strokeLinecap="round" />
            </svg>
          </button>

          {open ? (
            <div className="absolute left-0 top-12 z-30 w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-2xl">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => void changeStatus(option.value)}
                  className={cn(
                    'block w-full px-3.5 py-2 text-left text-[13px] transition hover:bg-white/6',
                    status === option.value ? 'font-semibold text-accent' : 'text-ink-soft',
                  )}
                >
                  {option.label}
                </button>
              ))}
              {status ? (
                <>
                  <div className="my-1 h-px bg-white/8" />
                  <button
                    type="button"
                    onClick={() => void changeStatus(null)}
                    className="block w-full px-3.5 py-2 text-left text-[13px] text-danger transition hover:bg-white/6"
                  >
                    Remove from list
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => void toggleFavorite()}
          disabled={busy}
          aria-pressed={favorite}
          title={favorite ? 'Remove from favourites' : 'Add to favourites'}
          className={cn(
            'inline-flex h-10 w-10 items-center justify-center rounded-xl transition disabled:opacity-60',
            favorite ? 'bg-hot text-white' : 'border border-line bg-surface text-ink-soft hover:bg-surface-2',
          )}
        >
          <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill={favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.9}>
            <path d="M12 20.4 4.6 13a4.8 4.8 0 0 1 6.8-6.8l.6.6.6-.6A4.8 4.8 0 0 1 19.4 13Z" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}
