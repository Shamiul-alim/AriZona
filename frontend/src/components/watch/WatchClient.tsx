'use client';

import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { authFetch, useAuthStore } from '@/lib/auth-store';
import type { AdsConfig, AnimeCard, EpisodeProgress, EpisodeSummary, WatchPayload } from '@/lib/types';
import { cn, formatCount, typeLabel } from '@/lib/utils';
import { AdSlot } from '@/components/ads/AdSlot';
import { AnimeRail } from '@/components/anime/AnimeRail';
import { EpisodeList } from '@/components/anime/EpisodeList';
import { SectionHeader } from '@/components/anime/SectionHeader';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import type { VideoAdConfig } from '@/components/player/useImaAds';
import { ReportDialog } from './ReportDialog';

interface WatchClientProps {
  payload: WatchPayload;
  episodes: EpisodeSummary[];
  recommendations: AnimeCard[];
}

/** How often playback position is persisted while watching. */
const PROGRESS_INTERVAL_MS = 15_000;

export function WatchClient({ payload, episodes, recommendations }: WatchClientProps) {
  const router = useRouter();
  const authStatus = useAuthStore((s) => s.status);
  const isAuthenticated = authStatus === 'authenticated';

  const [theatre, setTheatre] = useState(false);
  const [lightsOff, setLightsOff] = useState(false);
  const [adConfig, setAdConfig] = useState<VideoAdConfig | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportContext, setReportContext] = useState<Record<string, unknown>>({});

  const { anime, episode, navigation, playback, downloads } = payload;

  useEffect(() => {
    apiFetch<AdsConfig>('/ads/config')
      .then((config) => {
        setAdConfig(config.video.enabled ? { ...config.video, enabled: true } : null);
      })
      .catch(() => setAdConfig(null));
  }, []);

  // Records that the episode was opened, for the profile activity feed.
  useEffect(() => {
    if (!isAuthenticated) return;
    void authFetch('/watch-history/open', { method: 'POST', body: { episodeId: episode.id } }).catch(() => undefined);
  }, [isAuthenticated, episode.id]);

  // --- Saved position (the database is the source of truth) ---------------

  const [resume, setResume] = useState<{ episodeId: string; progress: EpisodeProgress | null } | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    authFetch<{ progress: EpisodeProgress | null }>(`/watch-history/progress/${episode.id}`)
      .then((res) => {
        if (!cancelled) setResume({ episodeId: episode.id, progress: res.progress });
      })
      .catch(() => {
        // Without saved progress the episode simply starts from the beginning.
        if (!cancelled) setResume({ episodeId: episode.id, progress: null });
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, episode.id]);

  // Guests have nothing to resume; signed-in viewers wait for the lookup.
  const resumeReady =
    authStatus === 'anonymous' || (isAuthenticated && resume?.episodeId === episode.id);
  const resumeProgress = isAuthenticated && resume?.episodeId === episode.id ? resume.progress : null;

  // --- Saving progress -------------------------------------------------------

  /** Latest position reported by the player, tagged with its episode. */
  const latestProgress = useRef<{ episodeId: string; position: number; duration: number }>({
    episodeId: episode.id,
    position: 0,
    duration: 0,
  });
  const lastSavedAt = useRef(0);

  const saveProgress = useCallback(
    (options: { keepalive?: boolean; force?: boolean } = {}) => {
      const { episodeId, position, duration } = latestProgress.current;
      // A position of 0 is only written deliberately (Start Over), never from
      // the player's initial or mid-swap reading.
      if (!isAuthenticated || (!options.force && position < 2)) return;
      lastSavedAt.current = Date.now();
      void authFetch('/watch-history/progress', {
        method: 'POST',
        body: {
          episodeId,
          positionSeconds: Math.floor(position),
          durationSeconds: Math.floor(duration) || undefined,
        },
        keepalive: options.keepalive,
      }).catch(() => undefined);
    },
    [isAuthenticated],
  );

  // New episode: start a fresh record so the previous one is never overwritten.
  useEffect(() => {
    latestProgress.current = { episodeId: episode.id, position: 0, duration: 0 };
    lastSavedAt.current = Date.now();
  }, [episode.id]);

  const handleProgress = useCallback(
    (position: number, duration: number) => {
      latestProgress.current = { episodeId: episode.id, position, duration };
      if (Date.now() - lastSavedAt.current >= PROGRESS_INTERVAL_MS) saveProgress();
    },
    [episode.id, saveProgress],
  );

  /** Pause and end are saved immediately rather than on the next tick. */
  const handleCheckpoint = useCallback(
    (position: number, duration: number) => {
      latestProgress.current = { episodeId: episode.id, position, duration };
      saveProgress();
    },
    [episode.id, saveProgress],
  );

  const handleStartOver = useCallback(() => {
    latestProgress.current = { episodeId: episode.id, position: 0, duration: latestProgress.current.duration };
    saveProgress({ force: true });
    setResume({ episodeId: episode.id, progress: null });
  }, [episode.id, saveProgress]);

  // Flush when the tab is hidden, the page is left, or the episode changes, so
  // resume is accurate even between the periodic saves.
  useEffect(() => {
    const flush = () => saveProgress({ keepalive: true });
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [saveProgress, episode.id]);

  const goToEpisode = useCallback(
    (number: number) => router.push(`/watch/${anime.slug}/ep-${number}`),
    [router, anime.slug],
  );

  const openReport = useCallback((context: Record<string, unknown>) => {
    setReportContext(context);
    setReportOpen(true);
  }, []);

  const hasSources = playback.sources.length > 0;

  return (
    <>
      {/* Lights-off dimmer sits beneath the player but above everything else. */}
      {lightsOff ? (
        <div
          className="fixed inset-0 z-30 bg-black/88 transition-opacity"
          onClick={() => setLightsOff(false)}
          aria-hidden="true"
        />
      ) : null}

      <div className={cn('mx-auto px-4 py-5 md:px-6', theatre ? 'max-w-[1800px]' : 'max-w-[1600px]')}>
        {/* Breadcrumb */}
        <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-faint" aria-label="Breadcrumb">
          <Link href="/" className="transition hover:text-ink-soft">
            Home
          </Link>
          <span>/</span>
          <Link href={`/anime/${anime.slug}`} className="transition hover:text-ink-soft">
            {anime.titleEnglish}
          </Link>
          <span>/</span>
          <span className="text-ink-soft">Episode {episode.number}</span>
        </nav>

        <div className={cn('grid gap-6', theatre ? '' : 'xl:grid-cols-[minmax(0,1fr)_22rem]')}>
          <div className="min-w-0">
            <AdSlot placementKey="watch_above_player" format="leaderboard" className="mb-4" />

            <div className={cn('relative', lightsOff && 'z-40')}>
              {hasSources ? (
                <VideoPlayer
                  payload={payload}
                  adConfig={adConfig}
                  theatreMode={theatre}
                  lightsOff={lightsOff}
                  onToggleTheatre={() => setTheatre((v) => !v)}
                  onToggleLights={() => setLightsOff((v) => !v)}
                  onNextEpisode={navigation.next ? () => goToEpisode(navigation.next!.number) : undefined}
                  onPreviousEpisode={
                    navigation.previous ? () => goToEpisode(navigation.previous!.number) : undefined
                  }
                  onProgress={handleProgress}
                  onProgressCheckpoint={handleCheckpoint}
                  onStartOver={handleStartOver}
                  resume={resumeProgress}
                  resumeReady={resumeReady}
                  onReport={openReport}
                />
              ) : (
                <div className="grid aspect-video place-items-center rounded-xl border border-line bg-surface px-6 text-center">
                  <div>
                    <p className="text-[14px] font-semibold text-ink">No playable source yet</p>
                    <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-ink-muted">
                      This episode has no media configured. An administrator needs to add a source in the admin panel.
                    </p>
                    <button
                      type="button"
                      onClick={() => openReport({ reason: 'no source configured' })}
                      className="mt-4 rounded-lg border border-line px-4 py-2 text-[13px] font-semibold text-ink-soft transition hover:bg-white/8"
                    >
                      Report this
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Title + episode controls */}
            <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-[1.15rem] font-bold leading-snug text-ink md:text-[1.35rem]">
                  {anime.titleEnglish}
                </h1>
                <p className="mt-0.5 text-[13.5px] text-ink-muted">
                  Episode {episode.number}
                  {episode.title ? ` · ${episode.title}` : ''}
                  {episode.isFiller ? ' · Filler' : ''}
                </p>
                <p className="mt-1 text-[12px] text-ink-faint">
                  {formatCount(episode.viewCount)} views · {typeLabel(anime.type)}
                  {anime.releaseYear ? ` · ${anime.releaseYear}` : ''}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {navigation.previous ? (
                  <button
                    type="button"
                    onClick={() => goToEpisode(navigation.previous!.number)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12.5px] font-semibold text-ink-soft transition hover:bg-surface-2 hover:text-ink"
                  >
                    ← Prev
                  </button>
                ) : null}
                {navigation.next ? (
                  <button
                    type="button"
                    onClick={() => goToEpisode(navigation.next!.number)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12.5px] font-semibold text-white transition hover:bg-brand-bright"
                  >
                    Next →
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setTheatre((v) => !v)}
                  className={cn(
                    'hidden h-9 items-center rounded-lg px-3 text-[12.5px] font-semibold transition md:inline-flex',
                    theatre ? 'bg-brand text-white' : 'border border-line bg-surface text-ink-soft hover:text-ink',
                  )}
                >
                  Theatre
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openReport({
                      source: playback.sources.find((s) => s.id === playback.defaultSourceId)?.label,
                      positionSeconds: Math.round(latestProgress.current.position),
                    })
                  }
                  className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-[12.5px] font-semibold text-ink-soft transition hover:border-danger/50 hover:text-danger"
                >
                  Report
                </button>
              </div>
            </div>

            {/* SUB / DUB + server picker, mirrored outside the player */}
            {hasSources ? <SourceSummary payload={payload} /> : null}

            {downloads.length > 0 ? (
              <div className="card-surface mt-4 p-3.5">
                <h2 className="mb-2 text-[13px] font-semibold text-ink">Download</h2>
                <div className="flex flex-wrap gap-2">
                  {downloads.map((download) => (
                    <a
                      key={download.id}
                      href={download.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-[12.5px] font-medium text-ink-soft transition hover:bg-surface-3 hover:text-ink"
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M12 4v11m0 0 4-4m-4 4-4-4M4 19h16" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {download.label} · {download.quality} · {download.kind}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            <AdSlot placementKey="watch_below_player" format="leaderboard" className="mt-5" />

            {/* Episode list moves inline in theatre mode */}
            {theatre && episodes.length > 0 ? (
              <div className="mt-6">
                <SectionHeader title="Episodes" subtitle={`${episodes.length} available`} />
                <EpisodeList animeSlug={anime.slug} episodes={episodes} currentEpisode={episode.number} />
              </div>
            ) : null}

            {recommendations.length > 0 ? (
              <div className="mt-8">
                <SectionHeader title="You might also like" />
                <AnimeRail items={recommendations} />
              </div>
            ) : null}

            <div className="mt-10">
              <CommentsSection episodeId={episode.id} animeSlug={anime.slug} title="Episode discussion" />
            </div>

            <AdSlot placementKey="watch_below_comments" format="leaderboard" className="mt-8" />
          </div>

          {/* Sidebar */}
          {!theatre ? (
            <aside className="space-y-6">
              <div className="card-surface overflow-hidden">
                <div className="flex gap-3 p-3.5">
                  {anime.posterUrl ? (
                    <Link href={`/anime/${anime.slug}`} className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                      <Image src={anime.posterUrl} alt="" fill sizes="80px" className="object-cover" />
                    </Link>
                  ) : null}
                  <div className="min-w-0">
                    <Link
                      href={`/anime/${anime.slug}`}
                      className="clamp-2 text-[13.5px] font-semibold text-ink transition hover:text-brand-bright"
                    >
                      {anime.titleEnglish}
                    </Link>
                    {anime.score > 0 ? (
                      <p className="mt-1 text-[12px] font-bold text-gold">★ {anime.score.toFixed(2)}</p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {anime.genres.slice(0, 3).map((genre) => (
                        <Link
                          key={genre.slug}
                          href={`/genres/${genre.slug}`}
                          className="rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-ink-muted transition hover:text-ink"
                        >
                          {genre.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
                {anime.synopsis ? (
                  <p className="clamp-3 border-t border-line-soft px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-muted">
                    {anime.synopsis}
                  </p>
                ) : null}
              </div>

              {episodes.length > 0 ? (
                <div>
                  <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wider text-ink-faint">Episodes</h2>
                  <EpisodeList
                    animeSlug={anime.slug}
                    episodes={episodes}
                    currentEpisode={episode.number}
                    compact
                  />
                </div>
              ) : null}

              <AdSlot placementKey="watch_sidebar" format="rectangle" />
            </aside>
          ) : null}
        </div>
      </div>

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="EPISODE"
        targetId={episode.id}
        context={reportContext}
      />
    </>
  );
}

/** Read-only summary of what is available, mirroring the player's selectors. */
function SourceSummary({ payload }: { payload: WatchPayload }) {
  const { sources } = payload.playback;
  const subs = sources.filter((s) => s.kind === 'SUB');
  const dubs = sources.filter((s) => s.kind === 'DUB');

  return (
    <div className="card-surface mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 p-3.5 text-[12.5px]">
      <span className="text-ink-faint">Available:</span>

      {subs.length > 0 ? (
        <span className="flex items-center gap-1.5">
          <span className="rounded bg-accent/90 px-1.5 py-0.5 text-[10px] font-bold text-[#04221f]">SUB</span>
          <span className="text-ink-soft">
            {subs[0].qualities.length > 0
              ? subs[0].qualities.map((q) => q.label).join(' · ')
              : subs[0].isHls
                ? 'Adaptive'
                : '—'}
          </span>
        </span>
      ) : null}

      {dubs.length > 0 ? (
        <span className="flex items-center gap-1.5">
          <span className="rounded bg-hot/90 px-1.5 py-0.5 text-[10px] font-bold text-white">DUB</span>
          <span className="text-ink-soft">
            {dubs[0].qualities.length > 0 ? dubs[0].qualities.map((q) => q.label).join(' · ') : '—'}
          </span>
        </span>
      ) : null}

      {sources[0]?.subtitles.length ? (
        <span className="flex items-center gap-1.5">
          <span className="text-ink-faint">Subtitles:</span>
          <span className="text-ink-soft">{sources[0].subtitles.map((s) => s.label).join(', ')}</span>
        </span>
      ) : null}

      <span className="text-ink-faint">
        {sources.length} {sources.length === 1 ? 'server' : 'servers'}
      </span>

      <span className="ml-auto hidden text-ink-faint lg:block">
        Change quality, audio and subtitles from the gear icon in the player.
      </span>
    </div>
  );
}
