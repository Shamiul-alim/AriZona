'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { authFetch, useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

interface RatingSummary {
  average: number;
  count: number;
  distribution: Record<string, number>;
  myRating: number | null;
}

export function RatingWidget({ slug }: { slug: string }) {
  const router = useRouter();
  const { status } = useAuthStore();
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = status === 'authenticated' ? authFetch<RatingSummary> : apiFetch<RatingSummary>;
    void load(`/anime/${slug}/rating`)
      .then(setSummary)
      .catch(() => undefined);
  }, [slug, status]);

  const submit = async (score: number) => {
    if (status !== 'authenticated') {
      router.push(`/auth/login?next=/anime/${slug}`);
      return;
    }
    setBusy(true);
    try {
      // Withdraw when the user clicks the score they already gave.
      if (summary?.myRating === score) {
        await authFetch(`/anime/${slug}/rating`, { method: 'DELETE' });
      } else {
        await authFetch(`/anime/${slug}/rating`, { method: 'PUT', body: { score } });
      }
      const fresh = await authFetch<RatingSummary>(`/anime/${slug}/rating`);
      setSummary(fresh);
    } catch {
      // Leave the previous state visible rather than blanking the widget.
    } finally {
      setBusy(false);
    }
  };

  if (!summary) {
    return <div className="skeleton h-24 rounded-xl" />;
  }

  const active = hover ?? summary.myRating ?? 0;
  const maxBucket = Math.max(1, ...Object.values(summary.distribution));

  return (
    <div className="card-surface p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[1.8rem] font-extrabold leading-none text-gold">
          {summary.average > 0 ? summary.average.toFixed(2) : '—'}
        </span>
        <span className="text-[12px] text-ink-faint">
          from {summary.count.toLocaleString()} {summary.count === 1 ? 'rating' : 'ratings'}
        </span>
      </div>

      <div
        className="mt-3 flex flex-wrap gap-1"
        onMouseLeave={() => setHover(null)}
        role="radiogroup"
        aria-label="Rate this anime out of 10"
      >
        {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => (
          <button
            key={score}
            type="button"
            disabled={busy}
            role="radio"
            aria-checked={summary.myRating === score}
            aria-label={`${score} out of 10`}
            onMouseEnter={() => setHover(score)}
            onFocus={() => setHover(score)}
            onClick={() => void submit(score)}
            className={cn(
              'h-8 w-8 rounded-lg text-[12.5px] font-bold transition disabled:opacity-50',
              score <= active
                ? 'bg-gold text-[#2a1c00]'
                : 'bg-surface-2 text-ink-muted hover:bg-surface-3 hover:text-ink',
            )}
          >
            {score}
          </button>
        ))}
      </div>

      <p className="mt-2 text-[12px] text-ink-faint">
        {summary.myRating
          ? `You rated this ${summary.myRating}/10 — click again to withdraw.`
          : status === 'authenticated'
            ? 'Click a number to rate.'
            : 'Sign in to rate this title.'}
      </p>

      {summary.count > 0 ? (
        <div className="mt-3 space-y-1">
          {Array.from({ length: 10 }, (_, i) => 10 - i).map((score) => {
            const value = summary.distribution[String(score)] ?? 0;
            return (
              <div key={score} className="flex items-center gap-2">
                <span className="w-4 text-right text-[10.5px] tabular-nums text-ink-faint">{score}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand to-gold"
                    style={{ width: `${(value / maxBucket) * 100}%` }}
                  />
                </div>
                <span className="w-7 text-right text-[10.5px] tabular-nums text-ink-faint">{value}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
