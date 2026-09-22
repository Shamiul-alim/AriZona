'use client';

import { SmartImage as Image } from '@/components/ui/SmartImage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  EpisodeProgress,
  ExternalAudioTrack,
  PlaybackSource,
  QualityOption,
  SubtitleOption,
  WatchPayload,
} from '@/lib/types';
import { cn, formatTime } from '@/lib/utils';
import { SettingsMenu } from './SettingsMenu';
import { SubtitleCues, SubtitleTrack } from './SubtitleLayer';
import { useExternalAudio } from './useExternalAudio';
import { useImaAds, type VideoAdConfig } from './useImaAds';
import { usePlayerPreferences } from './usePlayerPreferences';
import { useVideoPlayer } from './useVideoPlayer';
import {
  Back10Icon,
  ExitFullscreenIcon,
  Forward10Icon,
  FullscreenIcon,
  LightOffIcon,
  NextIcon,
  PauseIcon,
  PipIcon,
  PlayIcon,
  PrevIcon,
  ReplayIcon,
  SettingsIcon,
  SubtitlesIcon,
  TheatreIcon,
  VolumeHighIcon,
  VolumeLowIcon,
  VolumeMuteIcon,
  WarningIcon,
} from './icons';

interface VideoPlayerProps {
  payload: WatchPayload;
  adConfig: VideoAdConfig | null;
  theatreMode: boolean;
  lightsOff: boolean;
  onToggleTheatre: () => void;
  onToggleLights: () => void;
  onNextEpisode?: () => void;
  onPreviousEpisode?: () => void;
  onProgress?: (positionSeconds: number, durationSeconds: number) => void;
  /** Fired on pause and at the end, so progress is saved immediately. */
  onProgressCheckpoint?: (positionSeconds: number, durationSeconds: number) => void;
  /** The viewer chose Start Over: the saved position should be reset. */
  onStartOver?: () => void;
  /**
   * Saved position from the server for the signed-in viewer (null for none or
   * for guests). `resumeReady` is false while it is still being fetched.
   */
  resume?: EpisodeProgress | null;
  resumeReady?: boolean;
  onReport?: (context: Record<string, unknown>) => void;
}

const CONTROLS_HIDE_DELAY = 2800;

/** Must match the backend: below this a saved position is not worth resuming. */
const MIN_RESUME_SECONDS = 10;
/** At or past this fraction the episode is treated as finished. */
const COMPLETION_FRACTION = 0.9;

/**
 * The position to offer in the Resume / Start Over prompt, or null when the
 * episode should simply start from the beginning: nothing saved, only a few
 * seconds in, or already (nearly) finished.
 */
export function resumeOffer(progress: EpisodeProgress | null | undefined, fallbackDuration: number | null): number | null {
  if (!progress) return null;
  const position = progress.positionSeconds;
  if (position < MIN_RESUME_SECONDS) return null;
  const duration = progress.durationSeconds ?? fallbackDuration ?? 0;
  if (duration > 0 && position >= duration * COMPLETION_FRACTION) return null;
  return position;
}

export function VideoPlayer({
  payload,
  adConfig,
  theatreMode,
  lightsOff,
  onToggleTheatre,
  onToggleLights,
  onNextEpisode,
  onPreviousEpisode,
  onProgress,
  onProgressCheckpoint,
  onStartOver,
  resume = null,
  resumeReady = true,
  onReport,
}: VideoPlayerProps) {
  const { preferences, hydrated, update, updateSubtitleStyle, resetSubtitleStyle } = usePlayerPreferences();
  const { sources } = payload.playback;
  const { episode, navigation } = payload;

  const adContainerRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sourceId, setSourceId] = useState<string | null>(payload.playback.defaultSourceId);
  const [qualityId, setQualityId] = useState<string | null>(null);
  const [subtitleId, setSubtitleId] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [showNextOverlay, setShowNextOverlay] = useState(false);
  const [failedSourceIds, setFailedSourceIds] = useState<string[]>([]);
  const [introSkipped, setIntroSkipped] = useState(false);
  const [audioTrackId, setAudioTrackId] = useState<string | null>(null);
  /** Set while the audio sync is holding the video; shared by both hooks. */
  const audioHoldRef = useRef(false);

  const externalAudioTracks = useMemo(() => payload.playback.audioTracks ?? [], [payload.playback.audioTracks]);

  // Episode-level audio files: explicit choice, then the remembered language,
  // then the admin's default, then the first.
  const activeExternalAudio = useMemo<ExternalAudioTrack | null>(() => {
    if (externalAudioTracks.length === 0) return null;
    return (
      externalAudioTracks.find((t) => t.id === audioTrackId) ??
      externalAudioTracks.find((t) => t.language === preferences.audioLanguage) ??
      externalAudioTracks.find((t) => t.isDefault) ??
      externalAudioTracks[0]
    );
  }, [externalAudioTracks, audioTrackId, preferences.audioLanguage]);

  const resumeAt = resumeOffer(resume, episode.durationSeconds);

  const activeSource = useMemo(
    () => sources.find((s) => s.id === sourceId) ?? sources[0] ?? null,
    [sources, sourceId],
  );

  const activeQuality = useMemo<QualityOption | null>(() => {
    if (!activeSource || activeSource.isHls) return null;
    const byId = activeSource.qualities.find((q) => q.id === qualityId);
    if (byId) return byId;
    // Fall back to the remembered label, then the marked default, then the best.
    const byLabel = activeSource.qualities.find((q) => q.label === preferences.quality);
    return byLabel ?? activeSource.qualities.find((q) => q.isDefault) ?? activeSource.qualities[0] ?? null;
  }, [activeSource, qualityId, preferences.quality]);

  const activeSubtitle = useMemo<SubtitleOption | null>(() => {
    if (!activeSource) return null;
    if (subtitleId === 'off') return null;
    if (subtitleId) return activeSource.subtitles.find((s) => s.id === subtitleId) ?? null;
    if (preferences.subtitleLanguage === 'off') return null;
    return (
      activeSource.subtitles.find((s) => s.language === preferences.subtitleLanguage) ??
      activeSource.subtitles.find((s) => s.isDefault) ??
      activeSource.subtitles[0] ??
      null
    );
  }, [activeSource, subtitleId, preferences.subtitleLanguage]);

  const handleFatalError = useCallback(
    (message: string) => {
      // Try the next healthy source before surfacing an error to the viewer.
      if (activeSource) {
        setFailedSourceIds((previous) =>
          previous.includes(activeSource.id) ? previous : [...previous, activeSource.id],
        );
      }
      void message;
    },
    [activeSource],
  );

  const handleTimeUpdate = useCallback(
    (currentTime: number, duration: number) => {
      onProgress?.(currentTime, duration);
      checkMidRollRef.current?.(currentTime, duration);

      // Reveal the next-episode card during the outro, not at the hard end.
      if (navigation.next && episode.outroStart && duration > 0) {
        setShowNextOverlay(currentTime >= episode.outroStart && currentTime < duration - 1);
      }
    },
    [onProgress, navigation.next, episode.outroStart],
  );

  const handleEnded = useCallback(() => {
    const video = videoRef.current;
    if (video) onProgressCheckpoint?.(video.duration || video.currentTime, video.duration || 0);
    void playPostRollRef.current?.();
    if (preferences.autoplayNext && navigation.next) {
      onNextEpisode?.();
    }
    // videoRef is a stable ref object returned by useVideoPlayer below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.autoplayNext, navigation.next, onNextEpisode, onProgressCheckpoint]);

  const { videoRef, containerRef, state, actions } = useVideoPlayer({
    source: activeSource,
    quality: activeQuality,
    // The start position is chosen by the viewer in the resume prompt.
    initialTime: 0,
    initialVolume: preferences.volume,
    initialMuted: preferences.muted,
    initialRate: preferences.playbackRate,
    externalAudioActive: Boolean(activeExternalAudio),
    internalPauseRef: audioHoldRef,
    onEnded: handleEnded,
    onPause: onProgressCheckpoint,
    onTimeUpdate: handleTimeUpdate,
    onFatalError: handleFatalError,
  });

  const { audioRef, audioState } = useExternalAudio({
    videoRef,
    track: activeExternalAudio,
    volume: state.volume,
    muted: state.muted,
    holdRef: audioHoldRef,
  });

  const { adState, enabled: adsEnabled, playPreRoll, playPostRoll, checkMidRoll, skipAd, resetForNewContent } =
    useImaAds({
      config: adConfig,
      videoRef,
      containerRef,
      adContainerRef,
      onContentPause: () => videoRef.current?.pause(),
      onContentResume: () => {
        if (started) void videoRef.current?.play().catch(() => undefined);
      },
    });

  // Stable refs so the timeupdate callback does not need to be recreated.
  const checkMidRollRef = useRef(checkMidRoll);
  const playPostRollRef = useRef(playPostRoll);
  useEffect(() => {
    checkMidRollRef.current = checkMidRoll;
    playPostRollRef.current = playPostRoll;
  }, [checkMidRoll, playPostRoll]);

  // Reset per-episode state when the episode changes.
  useEffect(() => {
    setStarted(false);
    setShowNextOverlay(false);
    setIntroSkipped(false);
    setFailedSourceIds([]);
    setSourceId(payload.playback.defaultSourceId);
    setQualityId(null);
    setAudioTrackId(null);
    resetForNewContent();
  }, [episode.id, payload.playback.defaultSourceId, resetForNewContent]);

  // Automatic failover to the next working source.
  useEffect(() => {
    if (!activeSource || !failedSourceIds.includes(activeSource.id)) return;
    const replacement = sources.find((s) => !failedSourceIds.includes(s.id));
    if (replacement) {
      actions.captureForSwap();
      setSourceId(replacement.id);
      setQualityId(null);
    }
  }, [failedSourceIds, activeSource, sources, actions]);

  // Restore the remembered audio flavour once preferences have hydrated.
  useEffect(() => {
    if (!hydrated || sources.length === 0) return;
    const remembered = sources.find(
      (s) => s.kind === preferences.kind && s.audioLanguage === preferences.audioLanguage,
    );
    if (remembered && remembered.id !== sourceId) {
      setSourceId(remembered.id);
    }
    // Only runs on hydration, deliberately not on every preference change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Auto-skip intro, when the viewer has opted in and a marker exists.
  useEffect(() => {
    if (!preferences.autoSkipIntro || introSkipped) return;
    if (episode.introStart == null || episode.introEnd == null) return;
    if (state.currentTime >= episode.introStart && state.currentTime < episode.introEnd - 0.5) {
      setIntroSkipped(true);
      actions.seek(episode.introEnd);
    }
  }, [preferences.autoSkipIntro, introSkipped, episode.introStart, episode.introEnd, state.currentTime, actions]);

  // -- Controls visibility ---------------------------------------------------

  /** True while the pointer rests on the control bar — never hide under it. */
  const overControlsRef = useRef(false);
  /** Kind of pointer behind the last press, so a touch tap can mean "show controls". */
  const pointerTypeRef = useRef<string>('mouse');

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (state.phase === 'playing' && !settingsOpen && !overControlsRef.current) {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
    }
  }, [state.phase, settingsOpen]);

  useEffect(() => {
    revealControls();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [revealControls]);

  const handleToggleMute = useCallback(() => {
    actions.toggleMute();
    update({ muted: !state.muted });
  }, [actions, update, state.muted]);

  // -- Keyboard shortcuts ----------------------------------------------------

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Never hijack typing in a comment box or search field.
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) {
        return;
      }
      if (adState.playing) return;

      const handled = (fn: () => void) => {
        event.preventDefault();
        revealControls();
        fn();
      };

      switch (event.key.toLowerCase()) {
        case ' ':
        case 'k':
          return handled(actions.togglePlay);
        case 'arrowright':
          return handled(() => actions.skip(event.shiftKey ? 30 : 10));
        case 'arrowleft':
          return handled(() => actions.skip(event.shiftKey ? -30 : -10));
        case 'l':
          return handled(() => actions.skip(10));
        case 'j':
          return handled(() => actions.skip(-10));
        case 'arrowup':
          return handled(() => actions.setVolume(state.volume + 0.05));
        case 'arrowdown':
          return handled(() => actions.setVolume(state.volume - 0.05));
        case 'm':
          return handled(handleToggleMute);
        case 'f':
          return handled(() => void actions.toggleFullscreen());
        case 'p':
          return handled(() => void actions.togglePip());
        case 't':
          return handled(onToggleTheatre);
        case 'c':
          return handled(() => setSubtitleId(activeSubtitle ? 'off' : (activeSource?.subtitles[0]?.id ?? 'off')));
        case 'n':
          if (navigation.next) return handled(() => onNextEpisode?.());
          return;
        case 'escape':
          if (settingsOpen) return handled(() => setSettingsOpen(false));
          return;
        default:
          break;
      }

      // Number keys jump to that tenth of the episode.
      if (/^[0-9]$/.test(event.key) && state.duration > 0) {
        handled(() => actions.seek((Number(event.key) / 10) * state.duration));
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    actions,
    handleToggleMute,
    state.volume,
    state.duration,
    adState.playing,
    revealControls,
    onToggleTheatre,
    activeSubtitle,
    activeSource,
    navigation.next,
    onNextEpisode,
    settingsOpen,
  ]);

  // -- Handlers --------------------------------------------------------------

  const handleFirstPlay = useCallback(async (startSeconds = 0) => {
    setStarted(true);
    actions.startAt(startSeconds);
    if (adsEnabled) {
      // The pre-roll must be requested from inside the click handler, or the
      // browser will block the ad's own playback attempt.
      await playPreRoll();
    }
    void actions.play();
  }, [adsEnabled, playPreRoll, actions]);

  const handleSelectSource = useCallback(
    (source: PlaybackSource) => {
      if (source.id === activeSource?.id) return;
      actions.captureForSwap();
      setSourceId(source.id);
      setQualityId(null);
      update({ kind: source.kind, audioLanguage: source.audioLanguage });
    },
    [activeSource, actions, update],
  );

  const handleSelectQuality = useCallback(
    (quality: QualityOption | 'auto') => {
      if (activeSource?.isHls) {
        actions.setHlsLevel(quality === 'auto' ? -1 : Number(quality.id));
        update({ quality: quality === 'auto' ? 'auto' : quality.label });
        return;
      }
      if (quality === 'auto') return;
      actions.captureForSwap();
      setQualityId(quality.id);
      update({ quality: quality.label });
    },
    [activeSource, actions, update],
  );

  const handleSelectSubtitle = useCallback(
    (subtitle: SubtitleOption | null) => {
      setSubtitleId(subtitle?.id ?? 'off');
      update({ subtitleLanguage: subtitle?.language ?? 'off' });
    },
    [update],
  );

  const handleStartOver = useCallback(() => {
    onStartOver?.();
    void handleFirstPlay(0);
  }, [onStartOver, handleFirstPlay]);

  const handleSelectExternalAudio = useCallback(
    (track: ExternalAudioTrack) => {
      // Only the audio element changes source; the video keeps playing.
      setAudioTrackId(track.id);
      update({ audioLanguage: track.language });
    },
    [update],
  );

  const handleVolumeInput = useCallback(
    (value: number) => {
      actions.setVolume(value);
      update({ volume: value, muted: value === 0 });
    },
    [actions, update],
  );

  const handleRate = useCallback(
    (rate: number) => {
      actions.setPlaybackRate(rate);
      update({ playbackRate: rate });
    },
    [actions, update],
  );

  // -- Derived UI state ------------------------------------------------------

  const showSkipIntro =
    episode.introStart != null &&
    episode.introEnd != null &&
    state.currentTime >= episode.introStart &&
    state.currentTime < episode.introEnd;

  const showSkipOutro =
    episode.outroStart != null &&
    episode.outroEnd != null &&
    state.currentTime >= episode.outroStart &&
    state.currentTime < episode.outroEnd;

  const progressPercent = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
  const bufferedPercent = state.duration > 0 ? (state.buffered / state.duration) * 100 : 0;

  const allSourcesFailed = sources.length > 0 && failedSourceIds.length >= sources.length;

  // An embed source cannot be driven by our code, so we render it plainly
  // rather than dressing it in controls that would not work.
  if (activeSource?.provider === 'EXTERNAL_EMBED' && activeSource.embedUrl) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        <iframe
          src={activeSource.embedUrl}
          title={`${payload.anime.titleEnglish} episode ${episode.number}`}
          className="h-full w-full"
          allow="autoplay; fullscreen; encrypted-media"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation"
        />
        <p className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-1.5 text-center text-[11px] text-ink-muted">
          This source is an external embed, so quality, subtitle and progress controls are unavailable.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'player-root group relative w-full overflow-hidden bg-black',
        state.isFullscreen ? '' : 'aspect-video rounded-xl',
        lightsOff && 'ring-2 ring-brand/40',
        // Hide the cursor along with the controls while watching.
        started && !controlsVisible && state.phase === 'playing' && 'cursor-none',
      )}
      onPointerDown={(e) => {
        pointerTypeRef.current = e.pointerType;
      }}
      onPointerMove={(e) => {
        // A finger dragging across the screen is not "the mouse moved".
        if (e.pointerType !== 'touch') revealControls();
      }}
      onMouseLeave={() => state.phase === 'playing' && !settingsOpen && setControlsVisible(false)}
      onClick={() => {
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        // Touch has no hover, so a tap on the picture toggles the controls
        // (as in every mobile player) instead of pausing — play/pause is the
        // button in the bar.
        if (pointerTypeRef.current === 'touch' && started && !adState.playing) {
          if (controlsVisible && state.phase === 'playing') {
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            setControlsVisible(false);
          } else {
            revealControls();
          }
          return;
        }
        if (started && !adState.playing) actions.togglePlay();
      }}
      onDoubleClick={() => void actions.toggleFullscreen()}
    >
      <video
        ref={videoRef}
        className="h-full w-full bg-black"
        playsInline
        preload="metadata"
        poster={episode.thumbnailUrl ?? payload.anime.bannerUrl ?? undefined}
        crossOrigin="anonymous"
      >
        {/* Must be a child of <video> for the TextTrack API to pick it up. */}
        <SubtitleTrack track={activeSubtitle} />
      </video>

      {/* Separate audio-language file, kept in sync with the muted video. */}
      <audio ref={audioRef} preload="auto" className="hidden" data-testid="external-audio" />

      <SubtitleCues
        videoRef={videoRef}
        track={activeSubtitle}
        style={preferences.subtitleStyle}
        controlsVisible={controlsVisible}
      />

      {/* IMA renders its own creative into this layer. */}
      <div
        ref={adContainerRef}
        className={cn('absolute inset-0 z-30', adState.playing ? 'pointer-events-auto' : 'pointer-events-none')}
      />

      {/* --- Ad chrome ------------------------------------------------------ */}
      {adState.playing ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between p-3">
          <span className="pointer-events-none rounded-md bg-black/75 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink">
            Ad · {adState.remainingSeconds}s
          </span>
          {adState.skippable ? (
            <button
              type="button"
              disabled={!adState.canSkipNow}
              onClick={(e) => {
                e.stopPropagation();
                skipAd();
              }}
              className={cn(
                'pointer-events-auto rounded-md px-3 py-1.5 text-[12px] font-semibold transition',
                adState.canSkipNow
                  ? 'bg-white text-black hover:bg-white/90'
                  : 'cursor-not-allowed bg-black/70 text-ink-muted',
              )}
            >
              {adState.canSkipNow ? 'Skip ad' : 'Skip available soon'}
            </button>
          ) : null}
        </div>
      ) : null}

      {adState.loading ? (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/60">
          <span className="text-[13px] text-ink-soft">Loading advert…</span>
        </div>
      ) : null}

      {/* --- Poster / first play / resume prompt ---------------------------- */}
      {!started && !adState.playing ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-gradient-to-t from-black/85 via-black/40 to-black/60">
          {episode.thumbnailUrl ? (
            <Image src={episode.thumbnailUrl} alt="" fill sizes="100vw" className="-z-10 object-cover opacity-55" priority />
          ) : null}

          {resumeAt != null ? (
            <div
              role="dialog"
              aria-labelledby="resume-title"
              data-testid="resume-prompt"
              className="mx-4 w-full max-w-sm animate-fade-up rounded-2xl border border-white/12 bg-[rgb(10_10_19_/_0.92)] p-5 text-center shadow-2xl backdrop-blur-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                Episode {episode.number}
                {episode.title ? ` · ${episode.title}` : ''}
              </p>
              <p id="resume-title" className="mt-1.5 text-[15px] font-semibold text-ink">
                Resume watching from {formatTime(resumeAt)}?
              </p>
              {resume?.durationSeconds ? (
                <div className="mx-auto mt-3 h-1 w-40 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-brand-bright"
                    style={{ width: `${Math.min(100, (resumeAt / resume.durationSeconds) * 100)}%` }}
                  />
                </div>
              ) : null}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  autoFocus
                  onClick={() => void handleFirstPlay(resumeAt)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-brand-bright"
                >
                  <PlayIcon className="h-4 w-4" />
                  Resume
                </button>
                <button
                  type="button"
                  onClick={handleStartOver}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/18 px-4 py-2.5 text-[13px] font-semibold text-ink-soft transition hover:bg-white/10 hover:text-ink"
                >
                  <ReplayIcon className="h-4 w-4" />
                  Start Over
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={!resumeReady}
              onClick={(e) => {
                e.stopPropagation();
                void handleFirstPlay(0);
              }}
              className="flex flex-col items-center gap-3 disabled:cursor-wait"
              aria-label="Play episode"
            >
              <span className="animate-pulse-ring grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full bg-brand/95 shadow-[0_0_40px_-6px_rgb(124_92_255/0.9)] transition group-hover:scale-105">
                {resumeReady ? (
                  <PlayIcon className="ml-1 h-8 w-8 text-white" />
                ) : (
                  <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
                )}
              </span>
              <span className="text-center">
                <span className="block text-sm font-semibold text-ink">
                  Episode {episode.number}
                  {episode.title ? ` · ${episode.title}` : ''}
                </span>
                {resume?.completed ? (
                  <span className="mt-0.5 block text-[12px] text-ink-muted">Watched · plays again from the start</span>
                ) : null}
              </span>
            </button>
          )}
        </div>
      ) : null}

      {/* --- Buffering ------------------------------------------------------ */}
      {started && (state.phase === 'buffering' || (audioState.active && audioState.buffering && state.phase !== 'paused')) && !adState.playing ? (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
          <span className="h-11 w-11 animate-spin rounded-full border-[3px] border-white/20 border-t-brand-bright" />
        </div>
      ) : null}

      {/* --- Error ---------------------------------------------------------- */}
      {state.phase === 'error' || allSourcesFailed ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/88 px-6 text-center">
          <div className="max-w-sm">
            <WarningIcon className="mx-auto mb-3 h-9 w-9 text-danger" />
            <p className="text-sm font-semibold text-ink">
              {allSourcesFailed ? 'No working source for this episode' : 'Playback problem'}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
              {state.error ?? 'This source could not be played.'}
              {sources.length > 1 && !allSourcesFailed ? ' Trying another server…' : ''}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFailedSourceIds([]);
                  actions.retry();
                }}
                className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-bright"
              >
                Try again
              </button>
              {onReport ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReport({
                      source: activeSource?.label,
                      quality: activeQuality?.label,
                      positionSeconds: Math.round(state.currentTime),
                      error: state.error,
                    });
                  }}
                  className="rounded-lg border border-white/15 px-4 py-2 text-[13px] font-semibold text-ink-soft transition hover:bg-white/8"
                >
                  Report this
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* --- Skip intro / outro --------------------------------------------- */}
      {started && !adState.playing && showSkipIntro ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            actions.seek(episode.introEnd!);
          }}
          className="absolute bottom-24 right-4 z-30 animate-fade-up rounded-lg border border-white/20 bg-black/80 px-4 py-2 text-[13px] font-semibold text-ink backdrop-blur transition hover:bg-black"
        >
          Skip intro
        </button>
      ) : null}

      {started && !adState.playing && showSkipOutro && !showNextOverlay ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            actions.seek(episode.outroEnd!);
          }}
          className="absolute bottom-24 right-4 z-30 animate-fade-up rounded-lg border border-white/20 bg-black/80 px-4 py-2 text-[13px] font-semibold text-ink backdrop-blur transition hover:bg-black"
        >
          Skip outro
        </button>
      ) : null}

      {/* --- Next episode overlay ------------------------------------------- */}
      {showNextOverlay && navigation.next && !adState.playing ? (
        <div className="absolute bottom-24 right-4 z-30 w-64 animate-fade-up rounded-xl border border-white/15 bg-black/85 p-3 backdrop-blur">
          <p className="text-[11px] uppercase tracking-wide text-ink-faint">Up next</p>
          <p className="mt-0.5 line-clamp-2 text-[13px] font-semibold text-ink">
            Episode {navigation.next.number}
            {navigation.next.title ? ` · ${navigation.next.title}` : ''}
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNextEpisode?.();
              }}
              className="flex-1 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-brand-bright"
            >
              Play now
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowNextOverlay(false);
              }}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-[12px] text-ink-soft transition hover:bg-white/8"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {/* --- Settings ------------------------------------------------------- */}
      <SettingsMenu
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        sources={sources}
        activeSource={activeSource}
        activeQuality={activeQuality}
        activeSubtitle={activeSubtitle}
        preferences={preferences}
        hlsLevels={state.hlsLevels}
        hlsAutoLevel={state.hlsAutoLevel}
        activeHlsLevel={state.activeHlsLevel}
        onSelectSource={handleSelectSource}
        onSelectQuality={handleSelectQuality}
        onSelectSubtitle={handleSelectSubtitle}
        onSelectRate={handleRate}
        onUpdateSubtitleStyle={updateSubtitleStyle}
        onResetSubtitleStyle={resetSubtitleStyle}
        externalAudioTracks={externalAudioTracks}
        activeExternalAudio={activeExternalAudio}
        onSelectExternalAudio={handleSelectExternalAudio}
        onToggleAutoplayNext={() => update({ autoplayNext: !preferences.autoplayNext })}
        onToggleAutoSkipIntro={() => update({ autoSkipIntro: !preferences.autoSkipIntro })}
      />

      {/* --- Control bar ----------------------------------------------------- */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/92 via-black/55 to-transparent px-2 pb-2 pt-10 transition-opacity duration-300 md:px-3 md:pb-3',
          controlsVisible || !started ? 'opacity-100' : 'pointer-events-none opacity-0',
          adState.playing && 'hidden',
        )}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          // Touch produces no hover/move, so any tap on the bar restarts the
          // hide timer rather than letting it hide mid-interaction.
          if (e.pointerType === 'touch') revealControls();
        }}
        onPointerEnter={(e) => {
          if (e.pointerType === 'touch') return;
          overControlsRef.current = true;
          if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'touch') return;
          overControlsRef.current = false;
          revealControls();
        }}
      >
        {/* Seek bar */}
        <div className="group/seek relative mb-1.5 px-1">
          <div className="relative h-1 w-full rounded-full bg-white/22 transition-all group-hover/seek:h-1.5">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white/25"
              style={{ width: `${bufferedPercent}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-brand-bright"
              style={{ width: `${progressPercent}%` }}
            />
            {/* Intro/outro markers, only when configured. */}
            {state.duration > 0 && episode.introStart != null && episode.introEnd != null ? (
              <div
                className="absolute inset-y-0 bg-accent/45"
                style={{
                  left: `${(episode.introStart / state.duration) * 100}%`,
                  width: `${((episode.introEnd - episode.introStart) / state.duration) * 100}%`,
                }}
              />
            ) : null}
            {state.duration > 0 && episode.outroStart != null && episode.outroEnd != null ? (
              <div
                className="absolute inset-y-0 bg-hot/40"
                style={{
                  left: `${(episode.outroStart / state.duration) * 100}%`,
                  width: `${((episode.outroEnd - episode.outroStart) / state.duration) * 100}%`,
                }}
              />
            ) : null}
          </div>
          <input
            type="range"
            min={0}
            max={state.duration || 0}
            step={0.1}
            value={state.currentTime}
            onChange={(e) => actions.seek(Number(e.target.value))}
            aria-label="Seek"
            className="player-range absolute inset-0 h-full w-full opacity-0"
          />
        </div>

        <div className="flex items-center gap-0.5 md:gap-1">
          <ControlButton label={state.phase === 'playing' ? 'Pause' : 'Play'} onClick={actions.togglePlay}>
            {state.phase === 'ended' ? (
              <ReplayIcon className="h-5 w-5" />
            ) : state.phase === 'playing' ? (
              <PauseIcon className="h-5 w-5" />
            ) : (
              <PlayIcon className="h-5 w-5" />
            )}
          </ControlButton>

          {onPreviousEpisode && navigation.previous ? (
            <ControlButton label="Previous episode" onClick={onPreviousEpisode} className="hidden sm:inline-flex">
              <PrevIcon className="h-4.5 w-4.5" />
            </ControlButton>
          ) : null}

          {onNextEpisode && navigation.next ? (
            <ControlButton label="Next episode" onClick={onNextEpisode} className="hidden sm:inline-flex">
              <NextIcon className="h-4.5 w-4.5" />
            </ControlButton>
          ) : null}

          <ControlButton label="Back 10 seconds" onClick={() => actions.skip(-10)} className="hidden md:inline-flex">
            <Back10Icon className="h-5 w-5" />
          </ControlButton>
          <ControlButton label="Forward 10 seconds" onClick={() => actions.skip(10)} className="hidden md:inline-flex">
            <Forward10Icon className="h-5 w-5" />
          </ControlButton>

          {/* Volume */}
          <div className="group/vol flex items-center">
            <ControlButton label={state.muted ? 'Unmute' : 'Mute'} onClick={handleToggleMute}>
              {state.muted || state.volume === 0 ? (
                <VolumeMuteIcon className="h-5 w-5" />
              ) : state.volume < 0.5 ? (
                <VolumeLowIcon className="h-5 w-5" />
              ) : (
                <VolumeHighIcon className="h-5 w-5" />
              )}
            </ControlButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={state.muted ? 0 : state.volume}
              onChange={(e) => handleVolumeInput(Number(e.target.value))}
              aria-label="Volume"
              className="player-range h-1 w-0 rounded-full bg-white/25 opacity-0 transition-all duration-200 group-hover/vol:ml-1.5 group-hover/vol:w-16 group-hover/vol:opacity-100 focus:ml-1.5 focus:w-16 focus:opacity-100"
              style={{
                background: `linear-gradient(to right, var(--color-brand-bright) ${
                  (state.muted ? 0 : state.volume) * 100
                }%, rgb(255 255 255 / 0.25) ${(state.muted ? 0 : state.volume) * 100}%)`,
              }}
            />
          </div>

          <span className="ml-1.5 shrink-0 font-mono text-[11px] tabular-nums text-ink-soft md:text-[12px]">
            {formatTime(state.currentTime)} <span className="text-ink-faint">/ {formatTime(state.duration)}</span>
          </span>

          <div className="flex-1" />

          {activeSource ? (
            <span className="mr-1 hidden rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-soft lg:inline">
              {activeExternalAudio ? activeExternalAudio.language.toUpperCase() : activeSource.kind} ·{' '}
              {activeQuality?.label ?? (state.hlsAutoLevel ? 'Auto' : '—')}
            </span>
          ) : null}

          <ControlButton
            label={activeSubtitle ? 'Turn subtitles off' : 'Turn subtitles on'}
            onClick={() => handleSelectSubtitle(activeSubtitle ? null : (activeSource?.subtitles[0] ?? null))}
            active={Boolean(activeSubtitle)}
          >
            <SubtitlesIcon className="h-5 w-5" />
          </ControlButton>

          <ControlButton label="Settings" onClick={() => setSettingsOpen((v) => !v)} active={settingsOpen}>
            <SettingsIcon className="h-5 w-5" />
          </ControlButton>

          <ControlButton label="Lights off" onClick={onToggleLights} active={lightsOff} className="hidden md:inline-flex">
            <LightOffIcon className="h-5 w-5" />
          </ControlButton>

          <ControlButton
            label="Theatre mode"
            onClick={onToggleTheatre}
            active={theatreMode}
            className="hidden md:inline-flex"
          >
            <TheatreIcon className="h-5 w-5" />
          </ControlButton>

          <ControlButton label="Picture in picture" onClick={() => void actions.togglePip()} className="hidden sm:inline-flex">
            <PipIcon className="h-5 w-5" />
          </ControlButton>

          <ControlButton label="Fullscreen" onClick={() => void actions.toggleFullscreen()}>
            {state.isFullscreen ? <ExitFullscreenIcon className="h-5 w-5" /> : <FullscreenIcon className="h-5 w-5" />}
          </ControlButton>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  children,
  active,
  className,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-soft transition hover:bg-white/12 hover:text-ink',
        active && 'text-accent',
        className,
      )}
    >
      {children}
    </button>
  );
}
