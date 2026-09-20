'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SubtitleOption } from '@/lib/types';
import { SUBTITLE_SIZES, type SubtitleStyle } from './usePlayerPreferences';

/**
 * Subtitles are split into two pieces because of a DOM constraint: a <track>
 * only works when it is a direct child of <video>, but the rendered cues need
 * to sit in an overlay *above* the video.
 *
 * `SubtitleTrack` goes inside <video> and does nothing visible — it exists so
 * the browser fetches and parses the WebVTT file for us. `SubtitleCues` reads
 * the resulting cue list and paints it.
 *
 * Cues are painted by us rather than the browser because the native ::cue
 * pseudo-element cannot reliably control background opacity, text outline or
 * vertical position — the settings the player offers.
 */

export function SubtitleTrack({ track }: { track: SubtitleOption | null }) {
  if (!track) return null;
  return (
    // `key` forces a fresh element (and therefore a fresh fetch) per track.
    <track key={track.id} kind="subtitles" src={track.url} srcLang={track.language} label={track.label} default />
  );
}

interface SubtitleCuesProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  track: SubtitleOption | null;
  style: SubtitleStyle;
  /** Lifts the cues above the control bar while it is visible. */
  controlsVisible: boolean;
}

/** Height of the control bar area the cues must never cover. */
const CONTROL_BAR_CLEARANCE_PX = 96;

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function textShadowFor(edge: SubtitleStyle['edge']): string {
  // Outline built from eight offsets reads as a solid stroke at any size, which
  // is what keeps subtitles legible without a background box.
  const outline =
    '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, ' +
    '0 -1.5px 0 #000, 0 1.5px 0 #000, -1.5px 0 0 #000, 1.5px 0 0 #000';
  const shadow = '0 2px 4px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.8)';
  switch (edge) {
    case 'outline':
      return outline;
    case 'shadow':
      return shadow;
    case 'outline-shadow':
      return `${outline}, ${shadow}`;
    default:
      return 'none';
  }
}

export function SubtitleCues({ videoRef, track, style, controlsVisible }: SubtitleCuesProps) {
  const [lines, setLines] = useState<string[]>([]);
  // Incremented whenever the video element (re)loads a source, e.g. a quality
  // switch, so the listener is re-attached to whatever TextTrack is now live.
  const [sourceGeneration, setSourceGeneration] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const bump = () => setSourceGeneration((n) => n + 1);
    video.addEventListener('loadedmetadata', bump);
    return () => video.removeEventListener('loadedmetadata', bump);
  }, [videoRef]);

  useEffect(() => {
    setLines([]);
    const video = videoRef.current;
    if (!video || !track) return;

    let textTrack: TextTrack | null = null;
    let detach: (() => void) | null = null;

    const handleCueChange = () => {
      const active = textTrack?.activeCues;
      if (!active || active.length === 0) {
        setLines([]);
        return;
      }
      const collected: string[] = [];
      for (let i = 0; i < active.length; i += 1) {
        const cue = active[i] as VTTCue;
        // Strip VTT inline markup (<v Speaker>, <i>, <c.class>) so the
        // configured styling is the only thing that applies.
        collected.push(
          ...(cue.text ?? '')
            .replace(/<\/?[^>]+>/g, '')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
        );
      }
      setLines(collected);
    };

    // The <track> is added by React, so the TextTrack may not exist for a tick.
    let attempts = 0;
    let timer = 0;
    const attach = () => {
      const candidate = Array.from(video.textTracks).find(
        (t) => t.language === track.language && t.label === track.label,
      );
      if (!candidate) {
        attempts += 1;
        if (attempts < 40) timer = window.setTimeout(attach, 50);
        return;
      }
      textTrack = candidate;
      // `hidden` still fires cuechange but stops the browser painting cues.
      textTrack.mode = 'hidden';
      textTrack.addEventListener('cuechange', handleCueChange);
      handleCueChange();
      detach = () => {
        textTrack?.removeEventListener('cuechange', handleCueChange);
        if (textTrack) textTrack.mode = 'disabled';
      };
    };
    timer = window.setTimeout(attach, 0);

    return () => {
      window.clearTimeout(timer);
      detach?.();
    };
  }, [track, videoRef, sourceGeneration]);

  const cueStyle = useMemo<React.CSSProperties>(() => {
    const scale = SUBTITLE_SIZES.find((s) => s.value === style.size)?.scale ?? 1;
    const hasBox = style.backgroundOpacity > 0;
    return {
      fontSize: `calc(${scale} * clamp(0.95rem, 2.4vw, 1.9rem))`,
      color: style.color,
      backgroundColor: hasBox ? hexToRgba(style.backgroundColor, style.backgroundOpacity) : 'transparent',
      textShadow: textShadowFor(style.edge),
      padding: hasBox ? '0.12em 0.5em' : 0,
      borderRadius: hasBox ? '6px' : 0,
      boxDecorationBreak: 'clone',
      WebkitBoxDecorationBreak: 'clone',
    };
  }, [style]);

  if (lines.length === 0) return null;

  // Whichever is higher: the viewer's chosen offset, or just above the controls.
  const bottom = controlsVisible
    ? `max(${style.offsetPercent}%, ${CONTROL_BAR_CLEARANCE_PX}px)`
    : `${style.offsetPercent}%`;

  return (
    <div
      aria-live="polite"
      data-testid="subtitle-cues"
      className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-[5%] transition-[bottom] duration-200"
      style={{ bottom }}
    >
      <div className="flex max-w-[92%] flex-col items-center gap-[0.15em] text-center font-semibold leading-snug">
        {lines.map((line, index) => (
          <span key={`${line}-${index}`} style={cueStyle}>
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}
