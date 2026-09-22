'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type Hls from 'hls.js';
import type { PlaybackSource, QualityOption } from '@/lib/types';
import { clamp } from '@/lib/utils';

export type PlayerPhase = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';

export interface PlayerState {
  phase: PlayerPhase;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  isFullscreen: boolean;
  isPip: boolean;
  error: string | null;
  /** Levels reported by the HLS engine; empty for progressive sources. */
  hlsLevels: Array<{ index: number; height: number; label: string }>;
  hlsAutoLevel: boolean;
  activeHlsLevel: number;
}

interface UseVideoPlayerArgs {
  source: PlaybackSource | null;
  quality: QualityOption | null;
  initialTime: number;
  initialVolume: number;
  initialMuted: boolean;
  initialRate: number;
  /**
   * True while a separate audio file supplies the sound. The video element is
   * then kept muted and volume/mute apply to that audio instead.
   */
  externalAudioActive?: boolean;
  /**
   * True while the external-audio hook has paused the video to let the audio
   * catch up. Such a pause is not the viewer pausing, so it must not surface as
   * the paused state or save watch progress.
   */
  internalPauseRef?: React.MutableRefObject<boolean>;
  onEnded?: () => void;
  onPause?: (currentTime: number, duration: number) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onFatalError?: (message: string) => void;
}

const INITIAL_STATE: PlayerState = {
  phase: 'idle',
  currentTime: 0,
  duration: 0,
  buffered: 0,
  volume: 1,
  muted: false,
  playbackRate: 1,
  isFullscreen: false,
  isPip: false,
  error: null,
  hlsLevels: [],
  hlsAutoLevel: true,
  activeHlsLevel: -1,
};

/**
 * Owns the <video> element and everything that touches it directly.
 *
 * The two behaviours worth calling out, because they are what make quality and
 * audio switching real rather than cosmetic:
 *
 *  1. Progressive sources (Drive / direct file) have one file per quality, so
 *     switching means swapping `src`. The position and play state are captured
 *     before the swap and restored on `loadedmetadata`, so the viewer lands
 *     back exactly where they were instead of at zero.
 *
 *  2. HLS sources switch renditions in-engine via `hls.currentLevel`, which
 *     needs no reload at all.
 */
export function useVideoPlayer({
  source,
  quality,
  initialTime,
  initialVolume,
  initialMuted,
  initialRate,
  externalAudioActive = false,
  internalPauseRef,
  onEnded,
  onPause,
  onTimeUpdate,
  onFatalError,
}: UseVideoPlayerArgs) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [state, setState] = useState<PlayerState>({
    ...INITIAL_STATE,
    volume: initialVolume,
    muted: initialMuted,
    playbackRate: initialRate,
  });

  /** Position to restore once the next loaded source reports metadata. */
  const pendingSeekRef = useRef<number>(initialTime);
  const shouldResumeRef = useRef(false);
  const currentSrcRef = useRef<string | null>(null);

  const patch = useCallback((next: Partial<PlayerState>) => {
    setState((previous) => ({ ...previous, ...next }));
  }, []);

  // -- Source loading --------------------------------------------------------

  const resolvedSrc = useMemo(() => {
    if (!source) return null;
    if (source.isHls) return source.hlsUrl;
    return quality?.url ?? source.qualities[0]?.url ?? null;
  }, [source, quality]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source || !resolvedSrc) return;
    if (currentSrcRef.current === resolvedSrc) return;

    currentSrcRef.current = resolvedSrc;
    patch({ phase: 'loading', error: null });

    let cancelled = false;

    const attach = async () => {
      // Tear down any previous HLS engine before re-attaching.
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      if (source.isHls) {
        const canPlayNatively = video.canPlayType('application/vnd.apple.mpegurl');
        if (canPlayNatively) {
          // Safari drives HLS itself, including level selection.
          video.src = resolvedSrc;
          return;
        }

        const { default: HlsEngine } = await import('hls.js');
        if (cancelled) return;

        if (!HlsEngine.isSupported()) {
          patch({ phase: 'error', error: 'Your browser cannot play this stream format.' });
          onFatalError?.('HLS is not supported in this browser');
          return;
        }

        const engine = new HlsEngine({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 60,
        });
        hlsRef.current = engine;

        engine.on(HlsEngine.Events.MANIFEST_PARSED, () => {
          if (cancelled) return;
          patch({
            hlsLevels: engine.levels.map((level, index) => ({
              index,
              height: level.height ?? 0,
              label: level.height ? `${level.height}p` : `${Math.round((level.bitrate ?? 0) / 1000)}kbps`,
            })),
            hlsAutoLevel: engine.autoLevelEnabled,
          });
        });

        engine.on(HlsEngine.Events.LEVEL_SWITCHED, (_e, data) => {
          if (!cancelled) patch({ activeHlsLevel: data.level });
        });

        engine.on(HlsEngine.Events.ERROR, (_e, data) => {
          if (cancelled || !data.fatal) return;
          // Network and media errors are recoverable; anything else is not.
          if (data.type === HlsEngine.ErrorTypes.NETWORK_ERROR) {
            engine.startLoad();
          } else if (data.type === HlsEngine.ErrorTypes.MEDIA_ERROR) {
            engine.recoverMediaError();
          } else {
            patch({ phase: 'error', error: 'This stream could not be loaded.' });
            onFatalError?.(data.details ?? 'HLS fatal error');
          }
        });

        engine.loadSource(resolvedSrc);
        engine.attachMedia(video);
      } else {
        video.src = resolvedSrc;
        video.load();
      }
    };

    void attach();

    return () => {
      cancelled = true;
    };
  }, [source, resolvedSrc, patch, onFatalError]);

  // Destroy the HLS engine when the component unmounts.
  useEffect(
    () => () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    },
    [],
  );

  // -- Media element events --------------------------------------------------

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      patch({ duration: video.duration || 0 });

      // Restore the captured position after a quality/audio swap.
      const target = pendingSeekRef.current;
      if (target > 0 && Number.isFinite(video.duration) && target < video.duration) {
        video.currentTime = target;
      }
      pendingSeekRef.current = 0;

      if (shouldResumeRef.current) {
        shouldResumeRef.current = false;
        void video.play().catch(() => {
          // Autoplay can be refused; leaving it paused is the correct fallback.
          patch({ phase: 'paused' });
        });
      } else {
        patch({ phase: video.paused ? 'ready' : 'playing' });
      }
    };

    const handleTimeUpdate = () => {
      patch({ currentTime: video.currentTime });
      // While a source swap is restoring the position, currentTime briefly
      // reads 0. Reporting that would overwrite the viewer's saved progress.
      if (pendingSeekRef.current > 0) return;
      onTimeUpdate?.(video.currentTime, video.duration || 0);
    };

    const handleProgress = () => {
      if (video.buffered.length === 0) return;
      // The buffered range containing the playhead is the one that matters.
      for (let i = 0; i < video.buffered.length; i += 1) {
        if (video.buffered.start(i) <= video.currentTime && video.currentTime <= video.buffered.end(i)) {
          patch({ buffered: video.buffered.end(i) });
          return;
        }
      }
      patch({ buffered: video.buffered.end(video.buffered.length - 1) });
    };

    const handlePlay = () => patch({ phase: 'playing' });
    const handlePause = () => {
      // A hold placed by the external-audio sync reads as buffering, not as a
      // pause: the viewer did not stop playback and progress must not be saved.
      if (internalPauseRef?.current) {
        patch({ phase: 'buffering' });
        return;
      }
      patch({ phase: 'paused' });
      if (!video.ended && pendingSeekRef.current === 0) onPause?.(video.currentTime, video.duration || 0);
    };
    const handleWaiting = () => patch({ phase: 'buffering' });
    const handlePlaying = () => patch({ phase: 'playing' });
    const handleEnded = () => {
      patch({ phase: 'ended' });
      onEnded?.();
    };
    // Only reflect native volume changes (e.g. the PiP window's mute) when the
    // video itself is the sound source; with external audio it is force-muted.
    const handleVolumeChange = () => {
      if (externalAudioRef.current) return;
      patch({ volume: video.volume, muted: video.muted });
    };
    const handleRateChange = () => patch({ playbackRate: video.playbackRate });

    const handleError = () => {
      const code = video.error?.code;
      const messages: Record<number, string> = {
        1: 'Playback was aborted.',
        2: 'A network error interrupted playback.',
        3: 'This file could not be decoded.',
        4: 'This source is unavailable or unsupported.',
      };
      const message = messages[code ?? 4] ?? 'Playback failed.';
      patch({ phase: 'error', error: message });
      onFatalError?.(message);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('ratechange', handleRateChange);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('ratechange', handleRateChange);
      video.removeEventListener('error', handleError);
    };
  }, [patch, onEnded, onPause, onTimeUpdate, onFatalError, internalPauseRef]);

  // Persisted preferences arrive after hydration: adopt them as the state.
  useEffect(() => {
    patch({ volume: clamp(initialVolume, 0, 1), muted: initialMuted, playbackRate: initialRate });
    const video = videoRef.current;
    if (video) video.playbackRate = initialRate;
  }, [initialVolume, initialMuted, initialRate, patch]);

  // Volume and mute are player state, applied to whichever element is making
  // the sound. With external audio the video is always silent.
  const externalAudioRef = useRef(externalAudioActive);
  externalAudioRef.current = externalAudioActive;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = clamp(state.volume, 0, 1);
    video.muted = externalAudioActive ? true : state.muted;
  }, [state.volume, state.muted, externalAudioActive]);

  // -- Fullscreen / PiP ------------------------------------------------------

  useEffect(() => {
    const handler = () => patch({ isFullscreen: Boolean(document.fullscreenElement) });
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [patch]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const enter = () => patch({ isPip: true });
    const leave = () => patch({ isPip: false });
    video.addEventListener('enterpictureinpicture', enter);
    video.addEventListener('leavepictureinpicture', leave);
    return () => {
      video.removeEventListener('enterpictureinpicture', enter);
      video.removeEventListener('leavepictureinpicture', leave);
    };
  }, [patch]);

  // -- Actions ---------------------------------------------------------------

  const play = useCallback(async () => {
    try {
      await videoRef.current?.play();
    } catch {
      patch({ phase: 'paused' });
    }
  }, [patch]);

  const pause = useCallback(() => videoRef.current?.pause(), []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) void play();
    else video.pause();
  }, [play]);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = clamp(time, 0, video.duration);
  }, []);

  const skip = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (video) seek(video.currentTime + delta);
    },
    [seek],
  );

  const setVolume = useCallback(
    (value: number) => {
      const volume = clamp(value, 0, 1);
      setState((previous) => ({ ...previous, volume, muted: volume > 0 ? false : previous.muted }));
    },
    [],
  );

  const toggleMute = useCallback(() => {
    setState((previous) => ({ ...previous, muted: !previous.muted }));
  }, []);

  /**
   * Start (or restart) playback at a given second: Resume uses the saved
   * position, Start Over uses 0. Works before and after metadata has loaded.
   */
  const startAt = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    if (video.readyState >= 1 && Number.isFinite(video.duration)) {
      video.currentTime = clamp(seconds, 0, video.duration);
    } else {
      pendingSeekRef.current = seconds;
    }
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (video) video.playbackRate = rate;
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (typeof container.requestFullscreen === 'function') await container.requestFullscreen();
      else {
        // iPhone Safari has no element Fullscreen API; it only lets the <video>
        // itself go fullscreen, using the system's native controls. Without
        // this fallback the fullscreen button silently did nothing there.
        const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
        video?.webkitEnterFullscreen?.();
      }
    } catch {
      // Fullscreen can be blocked by permissions policy; ignore quietly.
    }
  }, []);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      // Some codecs/elements refuse PiP; the button simply does nothing.
    }
  }, []);

  /**
   * Prepares for a source swap by capturing where the viewer is, so the new
   * file can resume from the same moment.
   */
  const captureForSwap = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    pendingSeekRef.current = video.currentTime;
    shouldResumeRef.current = !video.paused && !video.ended;
    currentSrcRef.current = null;
  }, []);

  /** HLS-only: pick a rendition, or -1 for automatic. */
  const setHlsLevel = useCallback(
    (level: number) => {
      const engine = hlsRef.current;
      if (!engine) return;
      engine.currentLevel = level;
      patch({ hlsAutoLevel: level === -1 });
    },
    [patch],
  );

  const retry = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    pendingSeekRef.current = video.currentTime;
    shouldResumeRef.current = true;
    currentSrcRef.current = null;
    patch({ phase: 'loading', error: null });
    video.load();
  }, [patch]);

  return {
    videoRef,
    containerRef,
    state,
    actions: {
      play,
      pause,
      togglePlay,
      seek,
      skip,
      setVolume,
      toggleMute,
      startAt,
      setPlaybackRate,
      toggleFullscreen,
      togglePip,
      captureForSwap,
      setHlsLevel,
      retry,
    },
  };
}
