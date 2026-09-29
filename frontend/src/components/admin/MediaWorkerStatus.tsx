'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '@/lib/auth-store';
import { Badge } from '@/components/admin/ui';

interface WorkerRow {
  id: string;
  online: boolean;
  secondsSinceSeen: number;
  status: string;
  currentJobLabel: string | null;
  currentStep: string | null;
  version: string | null;
}

interface Presence {
  online: boolean;
  onlineWindowSeconds: number;
  workers: WorkerRow[];
}

/** "14 sec ago" reads better than a timestamp for something that updates constantly. */
function ago(seconds: number): string {
  if (seconds < 60) return `${seconds} sec ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hr ago`;
  return `${Math.round(seconds / 86400)} days ago`;
}

/** ENCODING_720P is the worker's word; this is the admin's. */
const STEP_WORDS: Record<string, string> = {
  DOWNLOADING_SOURCE: 'downloading the track source',
  DOWNLOADING: 'downloading the master',
  PROBING: 'reading the file',
  DETECTING_AUDIO: 'detecting audio',
  EXTRACTING_AUDIO: 'extracting audio',
  DETECTING_SUBTITLES: 'detecting subtitles',
  CONVERTING_SUBTITLES: 'converting subtitles',
  UPLOADING: 'uploading',
  REGISTERING: 'registering tracks',
};

function readableStep(step: string | null): string | null {
  if (!step) return null;
  if (STEP_WORDS[step]) return STEP_WORDS[step];
  const encoding = /^ENCODING_(\d+)P$/.exec(step);
  return encoding ? `encoding ${encoding[1]}p` : step.toLowerCase().replace(/_/g, ' ');
}

/**
 * Whether a media worker is listening.
 *
 * The worker runs on hardware the operator owns, which may legitimately be
 * switched off. Without this, a queued episode and a broken pipeline look
 * identical here — so an ordinary overnight wait gets read as a failure, and a
 * real failure gets shrugged off. Saying which one it is costs one line.
 */
export function MediaWorkerStatus({ pollMs = 20_000 }: { pollMs?: number }) {
  const [presence, setPresence] = useState<Presence | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setPresence(await authFetch<Presence>('/admin/media/worker-status'));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), pollMs);
    return () => clearInterval(timer);
  }, [load, pollMs]);

  if (failed || !presence) return null;

  const active = presence.workers.find((w) => w.online);

  if (!presence.online) {
    const last = presence.workers[0];
    return (
      <div className="rounded-lg border border-line-soft bg-surface-2/50 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="warn">Worker offline</Badge>
          {last ? <span className="text-[11.5px] text-ink-faint">Last seen {ago(last.secondsSinceSeen)}</span> : null}
        </div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-faint">
          Your video qualities are saved and already playable. Audio and subtitle detection starts automatically when
          a track worker comes online — nothing is lost and nothing needs re-saving.
        </p>
      </div>
    );
  }

  const step = readableStep(active?.currentStep ?? null);

  return (
    <div className="rounded-lg border border-line-soft bg-surface-2/50 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="ok">Worker online</Badge>
        <span className="text-[11.5px] text-ink-faint">Last seen {ago(active?.secondsSinceSeen ?? 0)}</span>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-faint">
        {active?.currentJobLabel ? (
          <>
            Working on <span className="text-ink-soft">{active.currentJobLabel}</span>
            {step ? ` — ${step}` : null}
          </>
        ) : (
          'Idle, watching the queue.'
        )}
      </p>
    </div>
  );
}
