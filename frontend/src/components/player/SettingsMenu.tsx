'use client';

import { useState } from 'react';
import type { ExternalAudioTrack, PlaybackSource, QualityOption, SubtitleOption } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  AudioIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ServerIcon,
  SettingsIcon,
  SpeedIcon,
  SubtitlesIcon,
} from './icons';
import {
  DEFAULT_SUBTITLE_STYLE,
  PLAYBACK_RATES,
  SUBTITLE_COLOURS,
  SUBTITLE_POSITIONS,
  SUBTITLE_SIZES,
  type PlayerPreferences,
  type SubtitleEdge,
  type SubtitleStyle,
} from './usePlayerPreferences';

type Panel = 'root' | 'quality' | 'subtitles' | 'subtitleStyle' | 'audio' | 'speed' | 'server';

interface SettingsMenuProps {
  open: boolean;
  onClose: () => void;
  sources: PlaybackSource[];
  activeSource: PlaybackSource | null;
  activeQuality: QualityOption | null;
  activeSubtitle: SubtitleOption | null;
  preferences: PlayerPreferences;
  hlsLevels: Array<{ index: number; height: number; label: string }>;
  hlsAutoLevel: boolean;
  activeHlsLevel: number;
  onSelectSource: (source: PlaybackSource) => void;
  onSelectQuality: (quality: QualityOption | 'auto') => void;
  onSelectSubtitle: (subtitle: SubtitleOption | null) => void;
  onSelectRate: (rate: number) => void;
  onUpdateSubtitleStyle: (patch: Partial<SubtitleStyle>) => void;
  onResetSubtitleStyle: () => void;
  /** Episode-level audio files. When present they replace source-based audio. */
  externalAudioTracks: ExternalAudioTrack[];
  activeExternalAudio: ExternalAudioTrack | null;
  onSelectExternalAudio: (track: ExternalAudioTrack) => void;
  onToggleAutoplayNext: () => void;
  onToggleAutoSkipIntro: () => void;
}

const BACKGROUND_COLOURS = [
  { label: 'Black', value: '#000000' },
  { label: 'Dark grey', value: '#2b2b33' },
  { label: 'Navy', value: '#0b1a3a' },
  { label: 'White', value: '#ffffff' },
];

const EDGES: Array<{ value: SubtitleEdge; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'outline', label: 'Outline' },
  { value: 'shadow', label: 'Shadow' },
  { value: 'outline-shadow', label: 'Outline + shadow' },
];

export function SettingsMenu(props: SettingsMenuProps) {
  const [panel, setPanel] = useState<Panel>('root');

  if (!props.open) return null;

  const { activeSource, sources, preferences } = props;

  // Without episode-level audio files, audio choice is expressed as "which
  // source", because a progressive file carries exactly one audio track.
  const audioOptions = sources.filter(
    (s, index, all) => all.findIndex((x) => x.audioLanguage === s.audioLanguage && x.kind === s.kind) === index,
  );

  const serverOptions = activeSource
    ? sources.filter((s) => s.kind === activeSource.kind && s.audioLanguage === activeSource.audioLanguage)
    : sources;

  const usesHls = activeSource?.isHls ?? false;
  const style = preferences.subtitleStyle;
  const externalAudio = props.externalAudioTracks;
  const hasExternalAudio = externalAudio.length > 0;
  const sizeLabel = SUBTITLE_SIZES.find((s) => s.value === style.size)?.label ?? 'Medium';

  const close = () => {
    setPanel('root');
    props.onClose();
  };

  // The menu is anchored above the control bar and is capped to the player's
  // height: a long panel (subtitle styling has a dozen controls) would
  // otherwise grow past the top of the player, get clipped by its overflow and
  // put the back button out of reach. The active panel scrolls internally.
  return (
    <div
      className="absolute bottom-[4.5rem] right-3 z-40 flex max-h-[calc(100%-5.75rem)] w-[min(19rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[rgb(10_10_19_/_0.96)] text-sm text-ink shadow-2xl backdrop-blur-xl md:right-4"
      role="dialog"
      aria-label="Player settings"
      onClick={(e) => e.stopPropagation()}
    >
      {panel === 'root' ? (
        <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
          <Header title="Settings" icon={<SettingsIcon className="h-4 w-4" />} />

          <Row
            label="Quality"
            value={usesHls ? (props.hlsAutoLevel ? 'Auto' : (props.hlsLevels[props.activeHlsLevel]?.label ?? 'Auto')) : (props.activeQuality?.label ?? '—')}
            onClick={() => setPanel('quality')}
          />
          <Row
            label="Subtitles"
            value={props.activeSubtitle?.label ?? 'Off'}
            icon={<SubtitlesIcon className="h-4 w-4 text-ink-muted" />}
            onClick={() => setPanel('subtitles')}
          />
          <Row
            label="Subtitle style"
            value={style.backgroundOpacity > 0 ? `${sizeLabel}, boxed` : sizeLabel}
            onClick={() => setPanel('subtitleStyle')}
          />
          {hasExternalAudio ? (
            <Row
              label="Audio"
              value={props.activeExternalAudio?.label ?? '—'}
              icon={<AudioIcon className="h-4 w-4 text-ink-muted" />}
              onClick={() => setPanel('audio')}
            />
          ) : audioOptions.length > 1 ? (
            <Row
              label="Audio"
              value={activeSource?.audioLabel ?? '—'}
              icon={<AudioIcon className="h-4 w-4 text-ink-muted" />}
              onClick={() => setPanel('audio')}
            />
          ) : null}
          {serverOptions.length > 1 ? (
            <Row
              label="Server"
              value={activeSource?.label ?? '—'}
              icon={<ServerIcon className="h-4 w-4 text-ink-muted" />}
              onClick={() => setPanel('server')}
            />
          ) : null}
          <Row
            label="Playback speed"
            value={preferences.playbackRate === 1 ? 'Normal' : `${preferences.playbackRate}×`}
            icon={<SpeedIcon className="h-4 w-4 text-ink-muted" />}
            onClick={() => setPanel('speed')}
          />

          <div className="my-1.5 h-px bg-white/8" />

          <Toggle label="Autoplay next episode" checked={preferences.autoplayNext} onChange={props.onToggleAutoplayNext} />
          <Toggle label="Auto-skip intro" checked={preferences.autoSkipIntro} onChange={props.onToggleAutoSkipIntro} />
        </div>
      ) : null}

      {panel === 'quality' ? (
        <Panel title="Quality" onBack={() => setPanel('root')}>
          {usesHls ? (
            <>
              <Option
                label="Auto"
                hint="Adapts to your connection"
                selected={props.hlsAutoLevel}
                onClick={() => {
                  props.onSelectQuality('auto');
                  close();
                }}
              />
              {props.hlsLevels
                .slice()
                .sort((a, b) => b.height - a.height)
                .map((level) => (
                  <Option
                    key={level.index}
                    label={level.label}
                    selected={!props.hlsAutoLevel && props.activeHlsLevel === level.index}
                    onClick={() => {
                      props.onSelectQuality({ ...(props.activeQuality as QualityOption), height: level.height, label: level.label, id: String(level.index) });
                      close();
                    }}
                  />
                ))}
            </>
          ) : (
            props.activeSource?.qualities.map((q) => (
              <Option
                key={q.id}
                label={q.label}
                hint={q.height ? `${q.height}p source` : undefined}
                selected={props.activeQuality?.id === q.id}
                onClick={() => {
                  props.onSelectQuality(q);
                  close();
                }}
              />
            ))
          )}
          {!usesHls ? (
            <p className="px-3.5 pb-2 pt-1 text-[11px] leading-relaxed text-ink-faint">
              Each quality is a separate file, so switching reloads the video. Your position is kept.
            </p>
          ) : null}
        </Panel>
      ) : null}

      {panel === 'subtitles' ? (
        <Panel title="Subtitles" onBack={() => setPanel('root')}>
          <Option
            label="Off"
            selected={!props.activeSubtitle}
            onClick={() => {
              props.onSelectSubtitle(null);
              close();
            }}
          />
          {(props.activeSource?.subtitles ?? []).map((s) => (
            <Option
              key={s.id}
              label={s.label}
              hint={s.isForced ? 'Forced' : undefined}
              selected={props.activeSubtitle?.id === s.id}
              onClick={() => {
                props.onSelectSubtitle(s);
                close();
              }}
            />
          ))}
        </Panel>
      ) : null}

      {panel === 'subtitleStyle' ? (
        <Panel title="Subtitle style" onBack={() => setPanel('root')}>
          <SubtitlePreview style={style} />

          <Section label="Text size">
            <div className="flex flex-wrap gap-1.5 px-3.5 pb-2">
              {SUBTITLE_SIZES.map((size) => (
                <Chip
                  key={size.value}
                  active={style.size === size.value}
                  onClick={() => props.onUpdateSubtitleStyle({ size: size.value })}
                >
                  {size.label}
                </Chip>
              ))}
            </div>
          </Section>

          <Section label="Text colour">
            <div className="flex flex-wrap items-center gap-2 px-3.5 pb-2.5">
              {SUBTITLE_COLOURS.map((c) => (
                <Swatch
                  key={c.value}
                  label={c.label}
                  colour={c.value}
                  active={style.color.toLowerCase() === c.value}
                  onClick={() => props.onUpdateSubtitleStyle({ color: c.value })}
                />
              ))}
              <ColourInput
                label="Custom text colour"
                value={style.color}
                onChange={(color) => props.onUpdateSubtitleStyle({ color })}
              />
            </div>
          </Section>

          <Section label="Background">
            <div className="flex flex-wrap items-center gap-2 px-3.5 pb-2">
              {BACKGROUND_COLOURS.map((c) => (
                <Swatch
                  key={c.value}
                  label={c.label}
                  colour={c.value}
                  active={style.backgroundOpacity > 0 && style.backgroundColor.toLowerCase() === c.value}
                  onClick={() =>
                    props.onUpdateSubtitleStyle({
                      backgroundColor: c.value,
                      // Picking a colour while the box is off should make it visible.
                      backgroundOpacity: style.backgroundOpacity > 0 ? style.backgroundOpacity : 0.6,
                    })
                  }
                />
              ))}
              <ColourInput
                label="Custom background colour"
                value={style.backgroundColor}
                onChange={(backgroundColor) => props.onUpdateSubtitleStyle({ backgroundColor })}
              />
            </div>
            <Slider
              label="Background opacity"
              min={0}
              max={100}
              step={5}
              value={Math.round(style.backgroundOpacity * 100)}
              display={style.backgroundOpacity === 0 ? 'None' : `${Math.round(style.backgroundOpacity * 100)}%`}
              onChange={(v) => props.onUpdateSubtitleStyle({ backgroundOpacity: v / 100 })}
            />
          </Section>

          <Section label="Outline & shadow">
            <div className="flex flex-wrap gap-1.5 px-3.5 pb-2">
              {EDGES.map((edge) => (
                <Chip
                  key={edge.value}
                  active={style.edge === edge.value}
                  onClick={() => props.onUpdateSubtitleStyle({ edge: edge.value })}
                >
                  {edge.label}
                </Chip>
              ))}
            </div>
          </Section>

          <Section label="Vertical position">
            <div className="flex flex-wrap gap-1.5 px-3.5 pb-1">
              {SUBTITLE_POSITIONS.map((pos) => (
                <Chip
                  key={pos.label}
                  active={style.offsetPercent === pos.value}
                  onClick={() => props.onUpdateSubtitleStyle({ offsetPercent: pos.value })}
                >
                  {pos.label}
                </Chip>
              ))}
            </div>
            <Slider
              label="Height above bottom"
              min={0}
              max={40}
              step={1}
              value={style.offsetPercent}
              display={`${style.offsetPercent}%`}
              onChange={(v) => props.onUpdateSubtitleStyle({ offsetPercent: v })}
            />
          </Section>

          <div className="px-3.5 pb-3 pt-1">
            <button
              type="button"
              onClick={props.onResetSubtitleStyle}
              disabled={JSON.stringify(style) === JSON.stringify(DEFAULT_SUBTITLE_STYLE)}
              className="w-full rounded-lg bg-white/8 px-3 py-1.5 text-[12px] font-medium text-ink-soft transition hover:bg-white/14 disabled:opacity-40"
            >
              Reset to default
            </button>
          </div>
        </Panel>
      ) : null}

      {panel === 'audio' ? (
        <Panel title="Audio" onBack={() => setPanel('root')}>
          {hasExternalAudio ? (
            <>
              {externalAudio.map((track) => (
                <Option
                  key={track.id}
                  label={track.label}
                  hint={track.language.toUpperCase()}
                  selected={props.activeExternalAudio?.id === track.id}
                  onClick={() => {
                    props.onSelectExternalAudio(track);
                    close();
                  }}
                />
              ))}
              <p className="px-3.5 pb-2 pt-1 text-[11px] leading-relaxed text-ink-faint">
                Switching audio keeps the video playing at the same point and quality.
              </p>
            </>
          ) : (
            <>
              {audioOptions.map((s) => (
                <Option
                  key={`${s.kind}-${s.audioLanguage}`}
                  label={s.audioLabel}
                  hint={s.kind === 'DUB' ? 'Dubbed' : 'Original audio'}
                  selected={activeSource?.audioLanguage === s.audioLanguage && activeSource?.kind === s.kind}
                  onClick={() => {
                    props.onSelectSource(s);
                    close();
                  }}
                />
              ))}
              <p className="px-3.5 pb-2 pt-1 text-[11px] leading-relaxed text-ink-faint">
                Each audio language is a separate file, so switching reloads the video. Your position is kept.
              </p>
            </>
          )}
        </Panel>
      ) : null}

      {panel === 'server' ? (
        <Panel title="Server" onBack={() => setPanel('root')}>
          {serverOptions.map((s) => (
            <Option
              key={s.id}
              label={s.label}
              hint={s.qualities.length ? `${s.qualities.length} qualities` : s.isHls ? 'Adaptive stream' : undefined}
              selected={activeSource?.id === s.id}
              onClick={() => {
                props.onSelectSource(s);
                close();
              }}
            />
          ))}
        </Panel>
      ) : null}

      {panel === 'speed' ? (
        <Panel title="Playback speed" onBack={() => setPanel('root')}>
          {PLAYBACK_RATES.map((rate) => (
            <Option
              key={rate}
              label={rate === 1 ? 'Normal' : `${rate}×`}
              selected={preferences.playbackRate === rate}
              onClick={() => {
                props.onSelectRate(rate);
                close();
              }}
            />
          ))}
        </Panel>
      ) : null}
    </div>
  );
}

function Header({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3.5 pb-2 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
      {icon}
      {title}
    </div>
  );
}

function Panel({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-1.5">
      <button
        type="button"
        onClick={onBack}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-ink transition hover:bg-white/6"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        {title}
      </button>
      <div className="my-1 h-px bg-white/8" />
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  icon,
  onClick,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-white/6"
    >
      {icon}
      <span className="flex-1 text-[13px]">{label}</span>
      <span className="max-w-[45%] truncate text-[12px] text-ink-muted">{value}</span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink-faint" />
    </button>
  );
}

function Option({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected}
      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-white/6"
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {selected ? <CheckIcon className="h-4 w-4 text-accent" /> : null}
      </span>
      <span className="flex-1">
        <span className={cn('block text-[13px]', selected && 'font-semibold text-accent')}>{label}</span>
        {hint ? <span className="block text-[11px] text-ink-faint">{hint}</span> : null}
      </span>
    </button>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-white/6"
    >
      <span className="flex-1 text-[13px]">{label}</span>
      <span
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand' : 'bg-white/20',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
            checked ? 'translate-x-4.5' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3.5 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{label}</div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-lg px-2.5 py-1 text-[12px] font-medium transition',
        active ? 'bg-brand text-white' : 'bg-white/8 text-ink-soft hover:bg-white/14',
      )}
    >
      {children}
    </button>
  );
}

function Swatch({
  label,
  colour,
  active,
  onClick,
}: {
  label: string;
  colour: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-7 w-7 rounded-full border-2 transition',
        active ? 'scale-110 border-brand-bright' : 'border-white/20 hover:border-white/50',
      )}
      style={{ background: colour }}
    />
  );
}

function ColourInput({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  return (
    <label
      title={label}
      className="relative flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-white/30 text-[13px] text-ink-muted hover:border-white/60"
    >
      +
      <input
        type="color"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3.5 pb-2.5 pt-1">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 flex-1 cursor-pointer accent-brand"
      />
      <span className="w-12 text-right text-[11.5px] tabular-nums text-ink-muted">{display}</span>
    </div>
  );
}

/** Live sample, so style changes are visible even between cues or while paused. */
function SubtitlePreview({ style }: { style: SubtitleStyle }) {
  const hasBox = style.backgroundOpacity > 0;
  const n = parseInt(style.backgroundColor.slice(1), 16);
  const bg = `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${style.backgroundOpacity})`;
  const scale = SUBTITLE_SIZES.find((s) => s.value === style.size)?.scale ?? 1;
  const outline = '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000';
  const shadow = '0 2px 4px rgba(0,0,0,0.95)';
  const textShadow =
    style.edge === 'none'
      ? 'none'
      : style.edge === 'outline'
        ? outline
        : style.edge === 'shadow'
          ? shadow
          : `${outline}, ${shadow}`;
  return (
    <div className="mx-3.5 mb-1 mt-2 flex h-14 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#3a4a6b,#8a6a5a)]">
      <span
        className="font-semibold"
        style={{
          fontSize: `${14 * scale}px`,
          color: style.color,
          background: hasBox ? bg : 'transparent',
          padding: hasBox ? '0.1em 0.45em' : 0,
          borderRadius: hasBox ? 5 : 0,
          textShadow,
        }}
      >
        Subtitle preview
      </span>
    </div>
  );
}
