'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '@/lib/auth-store';
import { Badge, Button, Card } from '@/components/admin/ui';
import { MediaWorkerStatus } from './MediaWorkerStatus';

type State = 'NOT_APPLICABLE' | 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

interface SourceStatus {
  id: string;
  label: string;
  isSingleMaster: boolean;
  autoTracks: boolean;
  /** Which quality the tracks were read from, once a worker has read one. */
  trackSource: string | null;
  trackSourcePreference: string | null;
  processingState: State;
  processingError: string | null;
  processedAt: string | null;
  qualities: string[];
  audio: Array<{ language: string; label: string; isDefault: boolean }>;
  subtitles: Array<{ language: string; label: string; isDefault: boolean }>;
}

const TONE: Record<State, 'ok' | 'warn' | 'danger' | 'info' | 'neutral'> = {
  READY: 'ok',
  PROCESSING: 'info',
  PENDING: 'warn',
  FAILED: 'danger',
  NOT_APPLICABLE: 'neutral',
};

/**
 * What each state means, said differently for the two kinds of source.
 *
 * The difference matters most when something goes wrong: a failed track scan
 * leaves an episode that plays perfectly, and calling that "failed" without
 * saying what failed would send someone looking for a problem with the video.
 */
const EXPLAIN: Record<State, { tracks: string; master: string }> = {
  READY: {
    tracks: 'Audio and subtitles have been read from your video and added to the player.',
    master: 'Everything the master implies has been built.',
  },
  PROCESSING: {
    tracks: 'A worker is reading your video for audio and subtitle streams. The video itself is untouched.',
    master: 'A worker has claimed this and is building it now.',
  },
  PENDING: {
    tracks: 'Your qualities are saved and playable. Audio and subtitle detection starts on its own.',
    master: 'Queued. A media worker takes it from here — nothing to run by hand.',
  },
  FAILED: {
    tracks: 'The video plays; only automatic track detection stopped. The cause is below, and it retries on its own.',
    master: 'The last attempt stopped. The cause is below; the worker retries on its next poll.',
  },
  NOT_APPLICABLE: {
    tracks: 'Automatic detection is off — the tracks below are whatever you entered yourself.',
    master: 'You supply each file, so there is nothing to process.',
  },
};

const QUALITY_LABEL: Record<string, string> = {
  Q_2160P: '4K',
  Q_1440P: '1440p',
  Q_1080P: '1080p',
  Q_720P: '720p',
  Q_480P: '480p',
  Q_360P: '360p',
};

/**
 * What has actually been built for this episode.
 *
 * The failure this replaces was silent: an episode with one quality and no
 * tracks looked identical to a finished one. Showing the state, the qualities
 * and the tracks means "only 1080p" is visible here rather than discovered by a
 * viewer.
 */
export function MediaProcessingStatus({ episodeId }: { episodeId?: string }) {
  const [rows, setRows] = useState<SourceStatus[]>([]);
  const [loading, setLoading] = useState(Boolean(episodeId));

  const load = useCallback(async () => {
    if (!episodeId) return;
    setLoading(true);
    try {
      setRows(await authFetch<SourceStatus[]>(`/admin/episodes/${episodeId}/media-status`));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [episodeId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Nothing to say until an episode exists and has a source being processed.
  if (!episodeId) return null;
  const processed = rows.filter((r) => r.isSingleMaster || r.autoTracks);
  if (!loading && processed.length === 0) return null;

  return (
    <Card title="Media processing" description="What the worker found in your video, and what it built.">
      <MediaWorkerStatus />

      {loading ? (
        <p className="mt-4 text-[13px] text-ink-muted">Checking…</p>
      ) : (
        <div className="mt-4 space-y-4">
          {processed.map((row) => (
            <div key={row.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13.5px] font-semibold text-ink">{row.label}</p>
                <Badge tone={TONE[row.processingState]}>{row.processingState.replace('_', ' ')}</Badge>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">
                {row.isSingleMaster
                  ? EXPLAIN[row.processingState].master
                  : EXPLAIN[row.processingState].tracks}
              </p>

              <dl className="mt-3 space-y-1.5 text-[12.5px]">
                <div className="flex gap-3">
                  <dt className="w-20 shrink-0 text-ink-faint">Video</dt>
                  <dd className="text-ink-soft">
                    {row.qualities.length > 0 ? (
                      <>
                        {row.qualities.map((q) => QUALITY_LABEL[q] ?? q).join(' · ')}
                        {row.isSingleMaster ? null : (
                          <span className="text-ink-faint"> — yours, never re-encoded</span>
                        )}
                      </>
                    ) : row.isSingleMaster ? (
                      '— nothing built yet'
                    ) : (
                      '— no quality files yet'
                    )}
                  </dd>
                </div>

                {row.isSingleMaster ? null : (
                  <div className="flex gap-3">
                    <dt className="w-20 shrink-0 text-ink-faint">Tracks from</dt>
                    <dd className="text-ink-soft">
                      {row.trackSource
                        ? QUALITY_LABEL[row.trackSource] ?? row.trackSource
                        : row.trackSourcePreference
                          ? `${QUALITY_LABEL[row.trackSourcePreference] ?? row.trackSourcePreference} (not read yet)`
                          : 'highest available (not read yet)'}
                    </dd>
                  </div>
                )}
                <div className="flex gap-3">
                  <dt className="w-20 shrink-0 text-ink-faint">Audio</dt>
                  <dd className="text-ink-soft">
                    {row.audio.length > 0
                      ? row.audio.map((a) => a.label).join(' · ')
                      : 'single track, played from the video itself'}
                  </dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-20 shrink-0 text-ink-faint">Subtitles</dt>
                  <dd className="text-ink-soft">
                    {row.subtitles.length > 0
                      ? row.subtitles.map((s) => s.label).join(' · ')
                      : 'none found — hardsubbed, absent, or a bitmap format'}
                  </dd>
                </div>
              </dl>

              {row.processingError ? (
                <p className="mt-3 whitespace-pre-wrap rounded-lg bg-danger/10 px-3 py-2 text-[12px] leading-relaxed text-danger">
                  {row.processingError}
                </p>
              ) : null}
            </div>
          ))}

          <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      )}
    </Card>
  );
}
