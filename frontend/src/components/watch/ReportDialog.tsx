'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { authFetch, useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

const EPISODE_REASONS = [
  { value: 'VIDEO_BROKEN', label: 'Video does not play' },
  { value: 'WRONG_EPISODE', label: 'Wrong episode' },
  { value: 'AUDIO_NOT_SYNCED', label: 'Audio out of sync' },
  { value: 'SUBTITLE_NOT_SYNCED', label: 'Subtitles out of sync' },
  { value: 'INCORRECT_TIMESTAMPS', label: 'Intro/outro markers are wrong' },
  { value: 'SOURCE_UNAVAILABLE', label: 'Source unavailable' },
  { value: 'OTHER', label: 'Something else' },
];

const CONTENT_REASONS = [
  { value: 'INAPPROPRIATE_CONTENT', label: 'Inappropriate content' },
  { value: 'SPAM', label: 'Spam' },
  { value: 'OTHER', label: 'Something else' },
];

interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  targetType: 'EPISODE' | 'ANIME' | 'COMMENT' | 'COMMUNITY_POST' | 'COMMUNITY_COMMENT' | 'USER';
  targetId: string;
  context?: Record<string, unknown>;
}

export function ReportDialog({ open, onClose, targetType, targetId, context }: ReportDialogProps) {
  const isAuthenticated = useAuthStore((s) => s.status === 'authenticated');
  const reasons = targetType === 'EPISODE' ? EPISODE_REASONS : CONTENT_REASONS;

  const [kind, setKind] = useState(reasons[0].value);
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setKind(reasons[0].value);
      setMessage('');
      setState('idle');
      setError(null);
    }
  }, [open, reasons]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState('sending');
    setError(null);

    try {
      // Reports work for signed-out viewers too — a broken episode should be
      // reportable by anyone who hits it.
      const send = isAuthenticated ? authFetch : apiFetch;
      await send('/reports', {
        method: 'POST',
        body: { targetType, targetId, kind, message: message.trim() || undefined, context },
      });
      setState('sent');
    } catch (e) {
      setState('error');
      setError(e instanceof Error ? e.message : 'Could not send your report.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Report a problem"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {state === 'sent' ? (
          <div className="p-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-ok/15">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-ok" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="mt-3 text-[15px] font-bold text-ink">Report sent</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
              Thanks — a moderator will look into it. You do not need to report it again.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-lg bg-brand px-4 py-2.5 text-[13.5px] font-semibold text-white transition hover:bg-brand-bright"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="flex items-center justify-between border-b border-line-soft px-5 py-3.5">
              <h2 className="text-[15px] font-bold text-ink">Report a problem</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition hover:bg-white/8 hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 p-5">
              <fieldset>
                <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
                  What is wrong?
                </legend>
                <div className="space-y-1">
                  {reasons.map((reason) => (
                    <label
                      key={reason.value}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition',
                        kind === reason.value ? 'bg-brand/15 text-ink' : 'text-ink-soft hover:bg-white/5',
                      )}
                    >
                      <input
                        type="radio"
                        name="kind"
                        value={reason.value}
                        checked={kind === reason.value}
                        onChange={() => setKind(reason.value)}
                        className="h-3.5 w-3.5 accent-[var(--color-brand)]"
                      />
                      {reason.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor="report-message" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
                  Details (optional)
                </label>
                <textarea
                  id="report-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
                  rows={3}
                  placeholder="Anything that would help us reproduce it — a timestamp, which quality, which server…"
                  className="w-full resize-y rounded-lg border border-line-soft bg-base px-3 py-2 text-[13px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
                />
              </div>

              {context && Object.keys(context).length > 0 ? (
                <p className="rounded-lg bg-base px-3 py-2 text-[11.5px] leading-relaxed text-ink-faint">
                  Playback details will be attached automatically:{' '}
                  {Object.entries(context)
                    .filter(([, v]) => v !== undefined && v !== null)
                    .map(([k, v]) => `${k}=${String(v)}`)
                    .join(', ')}
                </p>
              ) : null}

              {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}
            </div>

            <div className="flex gap-2 border-t border-line-soft px-5 py-3.5">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-line px-4 py-2.5 text-[13.5px] font-semibold text-ink-soft transition hover:bg-white/6"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={state === 'sending'}
                className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-[13.5px] font-semibold text-white transition hover:bg-brand-bright disabled:opacity-60"
              >
                {state === 'sending' ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
