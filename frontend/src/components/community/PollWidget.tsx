'use client';

import { SmartImage as Image } from '@/components/ui/SmartImage';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authFetch, useAuthStore } from '@/lib/auth-store';
import type { PollData } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PollWidgetProps {
  poll: PollData;
  onVoted?: (poll: PollData) => void;
}

export function PollWidget({ poll, onVoted }: PollWidgetProps) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.status === 'authenticated');

  const [current, setCurrent] = useState(poll);
  const [selected, setSelected] = useState<string[]>(poll.myVotes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Results are revealed once the viewer has voted or the poll has closed —
  // showing them beforehand would bias the vote.
  const showResults = current.hasVoted || current.isClosed;

  const toggle = (optionId: string) => {
    if (current.isClosed) return;
    setSelected((previous) =>
      current.allowMultiple
        ? previous.includes(optionId)
          ? previous.filter((id) => id !== optionId)
          : [...previous, optionId]
        : [optionId],
    );
  };

  const submit = async () => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }
    if (selected.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      const result = await authFetch<PollData>(`/community/polls/${current.id}/vote`, {
        method: 'POST',
        body: { optionIds: selected },
      });
      setCurrent(result);
      setSelected(result.myVotes);
      onVoted?.(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record your vote.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-line-soft bg-base/60 p-4">
      <h2 className="text-[14.5px] font-bold text-ink">{current.question}</h2>
      <p className="mt-0.5 text-[11.5px] text-ink-faint">
        {current.totalVotes} {current.totalVotes === 1 ? 'vote' : 'votes'}
        {current.allowMultiple ? ' · multiple choices allowed' : ''}
        {current.isClosed ? ' · closed' : current.closesAt ? ` · closes ${new Date(current.closesAt).toLocaleDateString()}` : ''}
      </p>

      <div className="mt-3.5 space-y-2">
        {current.options.map((option) => {
          const isSelected = selected.includes(option.id);
          const isMine = current.myVotes.includes(option.id);

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => toggle(option.id)}
              disabled={current.isClosed}
              aria-pressed={isSelected}
              className={cn(
                'relative w-full overflow-hidden rounded-lg border px-3 py-2.5 text-left transition',
                isSelected || isMine
                  ? 'border-brand/60 bg-brand/10'
                  : 'border-line-soft bg-surface hover:border-line hover:bg-surface-2',
                current.isClosed && 'cursor-default',
              )}
            >
              {showResults ? (
                <span
                  className="absolute inset-y-0 left-0 bg-brand/18 transition-[width] duration-500"
                  style={{ width: `${option.percent}%` }}
                  aria-hidden="true"
                />
              ) : null}

              <span className="relative flex items-center gap-2.5">
                {option.anime?.posterUrl ? (
                  <span className="relative h-11 w-8 shrink-0 overflow-hidden rounded bg-surface-2">
                    <Image src={option.anime.posterUrl} alt="" fill sizes="32px" className="object-cover" />
                  </span>
                ) : (
                  <span
                    className={cn(
                      'grid h-4 w-4 shrink-0 place-items-center border transition',
                      current.allowMultiple ? 'rounded' : 'rounded-full',
                      isSelected || isMine ? 'border-brand bg-brand' : 'border-line',
                    )}
                  >
                    {isSelected || isMine ? (
                      <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3.5}>
                        <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </span>
                )}

                <span className="min-w-0 flex-1 text-[13.5px] font-medium text-ink">{option.text}</span>

                {showResults ? (
                  <span className="shrink-0 text-right">
                    <span className="block text-[13px] font-bold tabular-nums text-brand-bright">{option.percent}%</span>
                    <span className="block text-[10.5px] tabular-nums text-ink-faint">{option.voteCount}</span>
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {error ? <p className="mt-2 text-[12.5px] text-danger">{error}</p> : null}

      {!current.isClosed ? (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || selected.length === 0}
            className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-bright disabled:opacity-50"
          >
            {busy ? 'Saving…' : current.hasVoted ? 'Change vote' : 'Vote'}
          </button>
          {current.hasVoted ? <span className="text-[12px] text-ink-faint">You have voted.</span> : null}
        </div>
      ) : null}
    </div>
  );
}
