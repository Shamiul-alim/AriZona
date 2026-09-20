'use client';

import { useEffect, useRef, useState } from 'react';
import type { ExternalAudioTrack } from '@/lib/types';

/**
 * Plays a separate audio file (e.g. English-Dub.m4a) in lock-step with the video.
 *
 * WHY THIS ARCHITECTURE
 * ---------------------
 * Browsers cannot attach a second, separately-fetched audio file to a <video>
 * element, and the audioTracks API is not implemented in Chrome or Firefox.
 * Media Source Extensions could mux them, but only for fragmented MP4 — plain
 * files from Google Drive are not. So the video element plays muted and a
 * hidden <audio> element plays the selected language, kept in sync by:
 *
 *   * mirroring play / pause / seek / playback-rate from video to audio,
 *   * briefly holding the video when the audio genuinely stalls,
 *   * correcting drift every half second.
 *
 * Switching language swaps ONLY the audio element's source. The video element
 * is never touched, so it does not reload, restart or change quality.
 *
 * AVOIDING FEEDBACK LOOPS
 * -----------------------
 * The two elements drive each other, so a naive implementation oscillates: the
 * audio fires `waiting` the instant it is asked to play, that pauses the video,
 * the audio then fires `canplay`, which resumes the video, which plays the
 * audio, which fires `waiting` again — thousands of times a second. Three rules
 * prevent it:
 *
 *   1. A stall must persist for HOLD_DELAY_MS *and* the audio must still lack
 *      future data before the video is held, so the transient `waiting` that
 *      every play() emits is ignored.
 *   2. Every handler is state-checked and idempotent — it never issues a
 *      command the element is already obeying.
 *   3. If holding still happens repeatedly it is abandoned altogether and drift
 *      correction alone keeps the track aligned. Slightly late audio is always
 *      better than a stuttering picture.
 */

/** Beyond this the audio is hard-resynced to the video. */
const HARD_SYNC_THRESHOLD = 0.3;
/** Within this, gently nudge playbackRate instead of jumping. */
const SOFT_SYNC_THRESHOLD = 0.06;
const SYNC_INTERVAL_MS = 500;
/** A stall must last this long before the video is held for the audio. */
const HOLD_DELAY_MS = 350;
/** After this many holds we stop holding and rely on drift correction only. */
const MAX_HOLDS = 6;
/** readyState at which the audio has enough buffered to keep playing. */
const HAVE_FUTURE_DATA = 3;

interface UseExternalAudioArgs {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  track: ExternalAudioTrack | null;
  volume: number;
  muted: boolean;
  /**
   * Set while the video is paused *by this hook* for buffering. The player
   * reads it so an internal hold is not mistaken for the viewer pausing, which
   * would otherwise show the play icon and save watch progress.
   */
  holdRef?: React.MutableRefObject<boolean>;
}

export interface ExternalAudioState {
  /** True when an external track is the audio being heard. */
  active: boolean;
  /** The audio file is loading or buffering. */
  buffering: boolean;
  error: string | null;
}

export function useExternalAudio({ videoRef, track, volume, muted, holdRef }: UseExternalAudioArgs) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<ExternalAudioState>({ active: false, buffering: false, error: null });

  const fallbackHold = useRef(false);
  const holding = holdRef ?? fallbackHold;
  const holdTimer = useRef<number | null>(null);
  const holdCount = useRef(0);
  const holdingDisabled = useRef(false);
  /** When the current hold was issued, used to tell our pause from the viewer's. */
  const holdIssuedAt = useRef(0);

  const active = Boolean(track);

  // --- Source: swap the audio file, keep the video untouched --------------
  useEffect(() => {
    const audio = audioRef.current;
    const video = videoRef.current;
    if (!audio || !video) return;

    // A new track starts with a clean slate.
    holdCount.current = 0;
    holdingDisabled.current = false;
    holding.current = false;

    if (!track) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      setState({ active: false, buffering: false, error: null });
      return;
    }

    setState({ active: true, buffering: true, error: null });

    const onReady = () => {
      audio.currentTime = video.currentTime;
      audio.playbackRate = video.playbackRate;
      setState((s) => ({ ...s, buffering: false }));
      if (!video.paused && !video.ended && audio.paused) void audio.play().catch(() => undefined);
    };
    const onError = () => setState({ active: true, buffering: false, error: 'This audio track could not be loaded.' });

    audio.addEventListener('loadedmetadata', onReady, { once: true });
    audio.addEventListener('error', onError);
    audio.src = track.url;
    audio.load();

    return () => {
      audio.removeEventListener('loadedmetadata', onReady);
      audio.removeEventListener('error', onError);
    };
  }, [track, videoRef, holding]);

  // --- Volume / mute: the audio element is what the viewer hears ------------
  useEffect(() => {
    const audio = audioRef.current;
    const video = videoRef.current;
    if (!audio || !video) return;
    audio.volume = Math.min(1, Math.max(0, volume));
    audio.muted = muted;
    // The video's own soundtrack must stay silent while an external track plays,
    // otherwise two languages would play at once.
    if (active) video.muted = true;
  }, [volume, muted, active, videoRef]);

  // --- Mirror video transport onto the audio -------------------------------
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio || !active) return;

    const clearHoldTimer = () => {
      if (holdTimer.current !== null) {
        window.clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
    };

    /** Releases a hold this hook placed on the video. */
    const release = () => {
      clearHoldTimer();
      if (!holding.current) return;
      holding.current = false;
      if (video.paused) void video.play().catch(() => undefined);
    };

    const syncAudioToVideo = () => {
      if (Number.isFinite(video.currentTime)) audio.currentTime = video.currentTime;
    };

    const playAudioIfNeeded = () => {
      if (audio.paused) void audio.play().catch(() => undefined);
    };

    // -- video -> audio ----------------------------------------------------
    const onVideoPlay = () => {
      syncAudioToVideo();
      playAudioIfNeeded();
    };
    const onVideoPause = () => {
      // A pause arriving well after we issued a hold is the viewer pressing
      // pause; drop the hold so recovering audio does not resume playback
      // against their wish.
      if (holding.current && Date.now() - holdIssuedAt.current > 250) {
        clearHoldTimer();
        holding.current = false;
      }
      if (!audio.paused) audio.pause();
    };
    const onVideoSeeking = () => syncAudioToVideo();
    const onVideoRate = () => {
      audio.playbackRate = video.playbackRate;
    };
    const onVideoPlaying = () => {
      syncAudioToVideo();
      playAudioIfNeeded();
    };
    const onVideoEnded = () => audio.pause();
    // A quality switch reloads the video element without firing "pause";
    // hold the audio until the new file resumes at the restored position.
    const onVideoEmptied = () => {
      clearHoldTimer();
      holding.current = false;
      audio.pause();
    };

    // -- audio -> video (guarded) ------------------------------------------
    const onAudioWaiting = () => {
      if (holdingDisabled.current || holding.current || video.paused) return;
      clearHoldTimer();
      holdTimer.current = window.setTimeout(() => {
        holdTimer.current = null;
        // Only hold if the audio is *still* short of data: the `waiting` that
        // every play() emits has long since resolved by now.
        if (audio.readyState >= HAVE_FUTURE_DATA || video.paused || holdingDisabled.current) return;
        holdCount.current += 1;
        if (holdCount.current > MAX_HOLDS) {
          holdingDisabled.current = true;
          return;
        }
        holding.current = true;
        holdIssuedAt.current = Date.now();
        setState((s) => ({ ...s, buffering: true }));
        video.pause();
      }, HOLD_DELAY_MS);
    };

    const onAudioReady = () => {
      clearHoldTimer();
      if (audio.readyState < HAVE_FUTURE_DATA) return;
      setState((s) => (s.buffering ? { ...s, buffering: false } : s));
      release();
    };

    video.addEventListener('play', onVideoPlay);
    video.addEventListener('pause', onVideoPause);
    video.addEventListener('seeking', onVideoSeeking);
    video.addEventListener('ratechange', onVideoRate);
    video.addEventListener('playing', onVideoPlaying);
    video.addEventListener('ended', onVideoEnded);
    video.addEventListener('emptied', onVideoEmptied);
    audio.addEventListener('waiting', onAudioWaiting);
    audio.addEventListener('canplaythrough', onAudioReady);
    audio.addEventListener('playing', onAudioReady);

    // Drift correction.
    const interval = window.setInterval(() => {
      if (video.paused || audio.paused || audio.readyState < 2) {
        audio.playbackRate = video.playbackRate;
        return;
      }
      const drift = audio.currentTime - video.currentTime;
      if (Math.abs(drift) > HARD_SYNC_THRESHOLD) {
        audio.currentTime = video.currentTime;
        audio.playbackRate = video.playbackRate;
      } else if (Math.abs(drift) > SOFT_SYNC_THRESHOLD) {
        // Audio ahead -> slow it slightly; behind -> speed it up slightly.
        audio.playbackRate = video.playbackRate * (drift > 0 ? 0.97 : 1.03);
      } else {
        audio.playbackRate = video.playbackRate;
      }
    }, SYNC_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      clearHoldTimer();
      holding.current = false;
      video.removeEventListener('play', onVideoPlay);
      video.removeEventListener('pause', onVideoPause);
      video.removeEventListener('seeking', onVideoSeeking);
      video.removeEventListener('ratechange', onVideoRate);
      video.removeEventListener('playing', onVideoPlaying);
      video.removeEventListener('ended', onVideoEnded);
      video.removeEventListener('emptied', onVideoEmptied);
      audio.removeEventListener('waiting', onAudioWaiting);
      audio.removeEventListener('canplaythrough', onAudioReady);
      audio.removeEventListener('playing', onAudioReady);
    };
  }, [active, videoRef, holding]);

  return { audioRef, audioState: state };
}
