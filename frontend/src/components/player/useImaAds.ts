'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Google IMA SDK integration for in-stream video advertising.
 *
 * WHAT YOU NEED FOR THIS TO SERVE REAL ADS
 * ----------------------------------------
 * A VAST/VMAP ad tag. In practice that means a **Google Ad Manager** video ad
 * unit — a standard AdSense display account does not by itself grant in-stream
 * video inventory. Until a tag is configured in the admin panel this hook stays
 * completely inert: no SDK is loaded, no container is created, and playback
 * behaves exactly as if advertising did not exist.
 *
 * Google publishes sample VAST tags for development. Those are for testing
 * only and must never be shipped as production configuration.
 *
 * FAILURE POLICY
 * --------------
 * An ad must never be able to prevent someone watching the episode. Every
 * failure path — SDK blocked by an ad blocker, malformed tag, empty response,
 * request timeout — resolves by resuming content.
 */

const IMA_SDK_URL = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js';
const AD_REQUEST_TIMEOUT_MS = 8000;

export interface VideoAdConfig {
  enabled: boolean;
  vastTagUrl: string;
  preRoll: boolean;
  midRoll: boolean;
  postRoll: boolean;
  midRollIntervalSeconds: number;
  midRollCuePoints: number[];
  frequencyCapPerHour: number;
}

export interface AdState {
  /** True while an ad is on screen and content must stay paused. */
  playing: boolean;
  loading: boolean;
  remainingSeconds: number;
  adsRemaining: number;
  skippable: boolean;
  /** True once the skip offset has elapsed and Skip can be pressed. */
  canSkipNow: boolean;
  error: string | null;
}

const IDLE: AdState = {
  playing: false,
  loading: false,
  remainingSeconds: 0,
  adsRemaining: 0,
  skippable: false,
  canSkipNow: false,
  error: null,
};

const FREQUENCY_KEY = 'anizora.ads.impressions';

/** Rolling one-hour impression log, used to honour the frequency cap. */
function recentImpressions(): number[] {
  try {
    const raw = window.localStorage.getItem(FREQUENCY_KEY);
    if (!raw) return [];
    const cutoff = Date.now() - 3_600_000;
    return (JSON.parse(raw) as number[]).filter((t) => t > cutoff);
  } catch {
    return [];
  }
}

function recordImpression(): void {
  try {
    const list = [...recentImpressions(), Date.now()];
    window.localStorage.setItem(FREQUENCY_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — the cap simply is not enforced */
  }
}

let sdkPromise: Promise<boolean> | null = null;

function loadImaSdk(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if ((window as { google?: { ima?: unknown } }).google?.ima) return Promise.resolve(true);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement('script');
    script.src = IMA_SDK_URL;
    script.async = true;
    // An ad blocker will fail this load. That is a normal, expected outcome.
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return sdkPromise;
}

interface UseImaAdsArgs {
  config: VideoAdConfig | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  adContainerRef: React.RefObject<HTMLDivElement | null>;
  onContentPause: () => void;
  onContentResume: () => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type ImaNamespace = any;

export function useImaAds({
  config,
  videoRef,
  containerRef,
  adContainerRef,
  onContentPause,
  onContentResume,
}: UseImaAdsArgs) {
  const [state, setState] = useState<AdState>(IDLE);
  const adsLoaderRef = useRef<any>(null);
  const adsManagerRef = useRef<any>(null);
  const adDisplayContainerRef = useRef<any>(null);
  const initialisedRef = useRef(false);
  const firedCuePointsRef = useRef<Set<number>>(new Set());
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const active = Boolean(config?.enabled && config.vastTagUrl);

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    clearCountdown();
    setState(IDLE);
    onContentResume();
  }, [clearCountdown, onContentResume]);

  const destroy = useCallback(() => {
    clearCountdown();
    try {
      adsManagerRef.current?.destroy();
      adsLoaderRef.current?.destroy();
    } catch {
      /* SDK teardown is best-effort */
    }
    adsManagerRef.current = null;
    adsLoaderRef.current = null;
    initialisedRef.current = false;
  }, [clearCountdown]);

  useEffect(() => destroy, [destroy]);

  const underFrequencyCap = useCallback(() => {
    if (!config || config.frequencyCapPerHour <= 0) return true;
    return recentImpressions().length < config.frequencyCapPerHour;
  }, [config]);

  /**
   * Requests and plays one ad break. Resolves as soon as content may resume —
   * whether the break played, was empty, or failed outright.
   */
  const requestAdBreak = useCallback(
    async (kind: 'preroll' | 'midroll' | 'postroll'): Promise<void> => {
      if (!active || !config) return;
      if (!underFrequencyCap()) return;

      const video = videoRef.current;
      const container = containerRef.current;
      const adContainer = adContainerRef.current;
      if (!video || !container || !adContainer) return;

      setState({ ...IDLE, loading: true });

      const loaded = await loadImaSdk();
      const ima: ImaNamespace = (window as any).google?.ima;
      if (!loaded || !ima) {
        // Blocked or unavailable: fail open, straight back to content.
        setState(IDLE);
        onContentResume();
        return;
      }

      onContentPause();

      return new Promise<void>((resolve) => {
        let settled = false;
        const settle = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve();
        };

        const timeout = setTimeout(() => {
          // A tag that never answers must not strand the viewer.
          setState({ ...IDLE, error: 'Ad request timed out' });
          finish();
          settle();
        }, AD_REQUEST_TIMEOUT_MS);

        try {
          if (!adDisplayContainerRef.current) {
            adDisplayContainerRef.current = new ima.AdDisplayContainer(adContainer, video);
            // Must happen inside a user gesture; the play button qualifies.
            adDisplayContainerRef.current.initialize();
          }

          const adsLoader = new ima.AdsLoader(adDisplayContainerRef.current);
          adsLoaderRef.current = adsLoader;

          adsLoader.addEventListener(
            ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
            (event: any) => {
              const settings = new ima.AdsRenderingSettings();
              settings.restoreCustomPlaybackStateOnAdBreakComplete = true;
              settings.enablePreloading = true;

              const manager = event.getAdsManager(video, settings);
              adsManagerRef.current = manager;

              manager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, (e: any) => {
                setState({ ...IDLE, error: e?.getError?.()?.getMessage?.() ?? 'Ad playback error' });
                finish();
                settle();
              });

              manager.addEventListener(ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, () => {
                onContentPause();
              });

              manager.addEventListener(ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, () => {
                finish();
                settle();
              });

              manager.addEventListener(ima.AdEvent.Type.STARTED, (e: any) => {
                recordImpression();
                const ad = e.getAd?.();
                const skippable = (ad?.getSkipTimeOffset?.() ?? -1) >= 0;

                setState({
                  playing: true,
                  loading: false,
                  remainingSeconds: Math.ceil(ad?.getDuration?.() ?? 0),
                  adsRemaining: manager.getRemainingTime?.() > 0 ? 1 : 0,
                  skippable,
                  canSkipNow: false,
                  error: null,
                });

                clearCountdown();
                countdownRef.current = setInterval(() => {
                  const remaining = Math.max(0, Math.ceil(manager.getRemainingTime?.() ?? 0));
                  const skipOffset = ad?.getSkipTimeOffset?.() ?? -1;
                  const elapsed = (ad?.getDuration?.() ?? 0) - remaining;
                  setState((previous) => ({
                    ...previous,
                    remainingSeconds: remaining,
                    canSkipNow: skipOffset >= 0 && elapsed >= skipOffset,
                  }));
                }, 250);
              });

              manager.addEventListener(ima.AdEvent.Type.COMPLETE, () => clearCountdown());
              manager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => {
                finish();
                settle();
              });
              manager.addEventListener(ima.AdEvent.Type.SKIPPED, () => {
                finish();
                settle();
              });

              try {
                manager.init(container.clientWidth, container.clientHeight, ima.ViewMode.NORMAL);
                manager.start();
              } catch {
                finish();
                settle();
              }
            },
            false,
          );

          adsLoader.addEventListener(
            ima.AdErrorEvent.Type.AD_ERROR,
            (e: any) => {
              // The commonest case here is simply "no ad to serve", which is
              // not an error worth showing anyone.
              setState({ ...IDLE, error: e?.getError?.()?.getMessage?.() ?? null });
              finish();
              settle();
            },
            false,
          );

          const request = new ima.AdsRequest();
          request.adTagUrl = config.vastTagUrl;
          request.linearAdSlotWidth = container.clientWidth || 640;
          request.linearAdSlotHeight = container.clientHeight || 360;
          request.nonLinearAdSlotWidth = container.clientWidth || 640;
          request.nonLinearAdSlotHeight = Math.round((container.clientHeight || 360) / 3);
          adsLoader.requestAds(request);
        } catch {
          setState(IDLE);
          finish();
          settle();
        }
      });
    },
    [
      active,
      config,
      videoRef,
      containerRef,
      adContainerRef,
      onContentPause,
      onContentResume,
      finish,
      clearCountdown,
      underFrequencyCap,
    ],
  );

  const playPreRoll = useCallback(async () => {
    if (!active || !config?.preRoll || initialisedRef.current) return;
    initialisedRef.current = true;
    await requestAdBreak('preroll');
  }, [active, config, requestAdBreak]);

  const playPostRoll = useCallback(async () => {
    if (!active || !config?.postRoll) return;
    await requestAdBreak('postroll');
  }, [active, config, requestAdBreak]);

  /**
   * Called on every timeupdate. Fires a mid-roll once per configured cue point
   * (or at a fixed interval when no explicit cue points are set).
   */
  const checkMidRoll = useCallback(
    (currentTime: number, duration: number) => {
      if (!active || !config?.midRoll || state.playing || state.loading) return;

      const cuePoints =
        config.midRollCuePoints.length > 0
          ? config.midRollCuePoints
          : buildIntervalCuePoints(duration, config.midRollIntervalSeconds);

      for (const cue of cuePoints) {
        if (firedCuePointsRef.current.has(cue)) continue;
        // A 1.5s window is wide enough to survive coarse timeupdate ticks but
        // narrow enough that seeking past a cue point skips it, as it should.
        if (currentTime >= cue && currentTime < cue + 1.5) {
          firedCuePointsRef.current.add(cue);
          void requestAdBreak('midroll');
          return;
        }
      }
    },
    [active, config, state.playing, state.loading, requestAdBreak],
  );

  const skipAd = useCallback(() => {
    try {
      adsManagerRef.current?.skip();
    } catch {
      finish();
    }
  }, [finish]);

  /** Resets cue-point history when moving to a different episode. */
  const resetForNewContent = useCallback(() => {
    firedCuePointsRef.current.clear();
    initialisedRef.current = false;
    destroy();
    setState(IDLE);
  }, [destroy]);

  return { adState: state, enabled: active, playPreRoll, playPostRoll, checkMidRoll, skipAd, resetForNewContent };
}

function buildIntervalCuePoints(duration: number, interval: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || interval <= 0) return [];
  const points: number[] = [];
  // Stop short of the end so a mid-roll never lands on top of the credits.
  for (let t = interval; t < duration - 30; t += interval) {
    points.push(Math.round(t));
  }
  return points;
}
