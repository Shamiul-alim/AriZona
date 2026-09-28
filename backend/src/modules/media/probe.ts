/**
 * Reading an ffprobe result, and deciding what to build from it.
 *
 * This lives in the backend rather than only in the worker script so it can be
 * tested properly: the decisions here (which qualities, which audio tracks,
 * whether a subtitle is usable) are the ones that were previously implicit and
 * wrong.
 */

export interface ProbeStream {
  index: number;
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  channels?: number;
  sample_rate?: string;
  r_frame_rate?: string;
  disposition?: Record<string, number>;
  tags?: Record<string, string>;
}

export interface ProbeResult {
  format?: { format_name?: string; duration?: string; size?: string; bit_rate?: string };
  streams?: ProbeStream[];
}

export interface AudioStream {
  index: number;
  codec: string;
  channels: number;
  language: string | null;
  /** What a viewer should see in the menu. */
  label: string;
  isDefault: boolean;
}

export interface SubtitleStream {
  index: number;
  codec: string;
  language: string | null;
  label: string;
  isDefault: boolean;
  isForced: boolean;
  /**
   * Text subtitles convert cleanly to WebVTT. Bitmap ones (PGS, VobSub) are
   * images and would need OCR, so they are detected and reported rather than
   * silently dropped.
   */
  isTextBased: boolean;
}

export interface MasterSummary {
  container: string;
  durationSeconds: number;
  sizeBytes: number;
  video: {
    codec: string;
    width: number;
    height: number;
    pixFmt: string;
    frameRate: number;
    /** 10-bit and HEVC are common in releases and unplayable in most browsers. */
    browserPlayable: boolean;
    reason: string | null;
  } | null;
  audio: AudioStream[];
  subtitles: SubtitleStream[];
}

/** ISO 639-2 codes seen in real releases, mapped to what a viewer reads. */
const LANGUAGE_NAMES: Record<string, string> = {
  jpn: 'Japanese',
  ja: 'Japanese',
  eng: 'English',
  en: 'English',
  hin: 'Hindi',
  hi: 'Hindi',
  ben: 'Bengali',
  bn: 'Bengali',
  kor: 'Korean',
  ko: 'Korean',
  chi: 'Chinese',
  zho: 'Chinese',
  zh: 'Chinese',
  spa: 'Spanish',
  es: 'Spanish',
  por: 'Portuguese',
  pt: 'Portuguese',
  fre: 'French',
  fra: 'French',
  fr: 'French',
  ger: 'German',
  deu: 'German',
  de: 'German',
  ara: 'Arabic',
  ar: 'Arabic',
  tam: 'Tamil',
  tel: 'Telugu',
  ind: 'Indonesian',
  tha: 'Thai',
  vie: 'Vietnamese',
  rus: 'Russian',
  ru: 'Russian',
  ita: 'Italian',
  it: 'Italian',
};

/** `und`, empty and missing all mean the same thing: nobody tagged it. */
function normaliseLanguage(raw: string | undefined): string | null {
  const value = raw?.trim().toLowerCase();
  if (!value || value === 'und' || value === 'unknown') return null;
  return value;
}

/**
 * A name for a track. A real title wins, then the language, then a positional
 * fallback — never an invented language.
 */
export function trackLabel(language: string | null, title: string | undefined, position: number, kind: 'Audio' | 'Subtitle'): string {
  const named = title?.trim();
  if (named) return named.slice(0, 60);
  if (language && LANGUAGE_NAMES[language]) return LANGUAGE_NAMES[language];
  if (language) return language.toUpperCase();
  return `${kind} ${position}`;
}

/** Subtitle codecs that are text and can become WebVTT. */
const TEXT_SUBTITLE_CODECS = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text']);

/** Video the browser can play directly, given a progressive MP4. */
function assessVideo(stream: ProbeStream): { browserPlayable: boolean; reason: string | null } {
  const codec = (stream.codec_name ?? '').toLowerCase();
  const pixFmt = (stream.pix_fmt ?? '').toLowerCase();
  if (codec !== 'h264') {
    return { browserPlayable: false, reason: `${codec || 'unknown'} is not reliably playable in browsers` };
  }
  if (pixFmt && !pixFmt.startsWith('yuv420p')) {
    return { browserPlayable: false, reason: `pixel format ${pixFmt} is not widely supported` };
  }
  if (pixFmt.includes('10le') || pixFmt.includes('10be')) {
    return { browserPlayable: false, reason: '10-bit video is not supported by most browsers' };
  }
  return { browserPlayable: true, reason: null };
}

function parseFrameRate(raw: string | undefined): number {
  if (!raw) return 0;
  const [num, den] = raw.split('/').map(Number);
  if (!den) return num || 0;
  return Number((num / den).toFixed(3));
}

/** Turns a raw ffprobe payload into the facts the pipeline acts on. */
export function summariseMaster(probe: ProbeResult): MasterSummary {
  const streams = probe.streams ?? [];
  const videoStream = streams.find((s) => s.codec_type === 'video' && !isCoverArt(s));

  const audio: AudioStream[] = streams
    .filter((s) => s.codec_type === 'audio')
    .map((s, position) => {
      const language = normaliseLanguage(s.tags?.language);
      return {
        index: s.index,
        codec: s.codec_name ?? 'unknown',
        channels: s.channels ?? 0,
        language,
        label: trackLabel(language, s.tags?.title, position + 1, 'Audio'),
        isDefault: s.disposition?.default === 1,
      };
    });

  const subtitles: SubtitleStream[] = streams
    .filter((s) => s.codec_type === 'subtitle')
    .map((s, position) => {
      const language = normaliseLanguage(s.tags?.language);
      const codec = (s.codec_name ?? 'unknown').toLowerCase();
      return {
        index: s.index,
        codec,
        language,
        label: trackLabel(language, s.tags?.title, position + 1, 'Subtitle'),
        isDefault: s.disposition?.default === 1,
        isForced: s.disposition?.forced === 1,
        isTextBased: TEXT_SUBTITLE_CODECS.has(codec),
      };
    });

  const assessment = videoStream ? assessVideo(videoStream) : null;

  return {
    container: probe.format?.format_name ?? 'unknown',
    durationSeconds: Number(probe.format?.duration ?? 0),
    sizeBytes: Number(probe.format?.size ?? 0),
    video: videoStream
      ? {
          codec: videoStream.codec_name ?? 'unknown',
          width: videoStream.width ?? 0,
          height: videoStream.height ?? 0,
          pixFmt: videoStream.pix_fmt ?? 'unknown',
          frameRate: parseFrameRate(videoStream.r_frame_rate),
          browserPlayable: assessment?.browserPlayable ?? false,
          reason: assessment?.reason ?? null,
        }
      : null,
    audio,
    subtitles,
  };
}

/** An attached poster is a video stream by codec but not by intent. */
function isCoverArt(stream: ProbeStream): boolean {
  return stream.disposition?.attached_pic === 1;
}

export interface LadderStep {
  quality: 'Q_1080P' | 'Q_720P' | 'Q_480P' | 'Q_360P';
  height: number;
  /** Rough ceiling, in kbps, for a 16:9 frame at this height. */
  kbps: number;
}

const LADDER: LadderStep[] = [
  { quality: 'Q_1080P', height: 1080, kbps: 2800 },
  { quality: 'Q_720P', height: 720, kbps: 1600 },
  { quality: 'Q_480P', height: 480, kbps: 900 },
  { quality: 'Q_360P', height: 360, kbps: 550 },
];

/**
 * Which renditions to build for a master.
 *
 * Never upscales: a 720p master yields 720/480/360 and nothing above. The
 * top step is included even when it matches the master's own height, because
 * the master may not be playable in a browser (HEVC, 10-bit) and then it has to
 * be re-encoded rather than served as-is.
 */
export function planLadder(sourceHeight: number): LadderStep[] {
  if (!sourceHeight || sourceHeight <= 0) return [];
  // A tolerance, so a 1088p or 1076p master still counts as 1080p.
  return LADDER.filter((step) => step.height <= sourceHeight + 8);
}

/**
 * Whether the master itself can be registered as the top quality, or whether
 * even that height has to be re-encoded.
 */
export function canServeMasterDirectly(summary: MasterSummary): boolean {
  return Boolean(summary.video?.browserPlayable);
}
