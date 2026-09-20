'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { qs } from '@/lib/api';
import { authFetch } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { AdminHeader, Banner, Button, Card, Label, adminInput, adminSelect, adminTextarea } from './ui';
import { ImageUploadField } from './ImageUploadField';

const PROVIDERS = [
  { value: 'GOOGLE_DRIVE', label: 'Google Drive', needsVariants: true },
  { value: 'DIRECT_FILE', label: 'Direct file / URL', needsVariants: true },
  { value: 'OBJECT_STORAGE', label: 'Object storage (S3, R2…)', needsVariants: true },
  { value: 'HLS', label: 'HLS stream (.m3u8)', needsVariants: false },
  { value: 'EXTERNAL_EMBED', label: 'External embed (no controls)', needsVariants: false },
];

const QUALITIES = ['Q_2160P', 'Q_1440P', 'Q_1080P', 'Q_720P', 'Q_480P', 'Q_360P', 'Q_240P'];
const QUALITY_LABELS: Record<string, string> = {
  Q_2160P: '4K',
  Q_1440P: '1440p',
  Q_1080P: '1080p',
  Q_720P: '720p',
  Q_480P: '480p',
  Q_360P: '360p',
  Q_240P: '240p',
};

interface VariantDraft {
  quality: string;
  driveFileIdOrUrl: string;
  directUrl: string;
  isDefault: boolean;
}

interface SourceDraft {
  label: string;
  provider: string;
  kind: 'SUB' | 'DUB';
  audioLanguage: string;
  audioLabel: string;
  hlsUrl: string;
  embedUrl: string;
  isDefault: boolean;
  variants: VariantDraft[];
}

interface SubtitleDraft {
  language: string;
  label: string;
  format: string;
  url: string;
  driveFileIdOrUrl: string;
  isDefault: boolean;
}

interface AudioTrackDraft {
  language: string;
  label: string;
  provider: 'GOOGLE_DRIVE' | 'DIRECT_FILE' | 'OBJECT_STORAGE';
  /** Drive link / file ID, or the file URL for the other providers. */
  location: string;
  mimeType: string;
  codec: string;
  isDefault: boolean;
}

const AUDIO_PROVIDERS: Array<{ value: AudioTrackDraft['provider']; label: string }> = [
  { value: 'GOOGLE_DRIVE', label: 'Google Drive' },
  { value: 'DIRECT_FILE', label: 'Direct file / URL' },
  { value: 'OBJECT_STORAGE', label: 'Object storage' },
];

const AUDIO_MIME_TYPES = [
  { value: 'audio/mp4', label: 'M4A / AAC (audio/mp4)' },
  { value: 'audio/mpeg', label: 'MP3 (audio/mpeg)' },
  { value: 'audio/webm', label: 'WebM / Opus (audio/webm)' },
  { value: 'audio/ogg', label: 'Ogg (audio/ogg)' },
];

function newAudioTrack(first: boolean): AudioTrackDraft {
  return {
    language: first ? 'ja' : 'en',
    label: first ? 'Japanese' : 'English Dub',
    provider: 'GOOGLE_DRIVE',
    location: '',
    mimeType: 'audio/mp4',
    codec: '',
    isDefault: first,
  };
}

interface DownloadDraft {
  label: string;
  quality: string;
  kind: 'SUB' | 'DUB';
  url: string;
}

interface AnimeOption {
  id: string;
  titleEnglish: string;
}

function newSource(index: number): SourceDraft {
  return {
    label: `Server ${index + 1}`,
    provider: 'GOOGLE_DRIVE',
    kind: 'SUB',
    audioLanguage: 'ja',
    audioLabel: 'Japanese',
    hlsUrl: '',
    embedUrl: '',
    isDefault: index === 0,
    variants: [{ quality: 'Q_1080P', driveFileIdOrUrl: '', directUrl: '', isDefault: false }],
  };
}

export function EpisodeForm({ episodeId, presetAnimeId }: { episodeId?: string; presetAnimeId?: string }) {
  const router = useRouter();
  const isEdit = Boolean(episodeId);

  const [animeList, setAnimeList] = useState<AnimeOption[]>([]);
  const [animeId, setAnimeId] = useState(presetAnimeId ?? '');
  const [number, setNumber] = useState('1');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [durationSeconds, setDurationSeconds] = useState('');
  const [airDate, setAirDate] = useState('');
  const [hasSub, setHasSub] = useState(true);
  const [hasDub, setHasDub] = useState(false);
  const [isFiller, setIsFiller] = useState(false);
  const [publishStatus, setPublishStatus] = useState('DRAFT');

  const [introStart, setIntroStart] = useState('');
  const [introEnd, setIntroEnd] = useState('');
  const [outroStart, setOutroStart] = useState('');
  const [outroEnd, setOutroEnd] = useState('');

  const [sources, setSources] = useState<SourceDraft[]>([newSource(0)]);
  const [subtitles, setSubtitles] = useState<SubtitleDraft[]>([]);
  const [downloads, setDownloads] = useState<DownloadDraft[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrackDraft[]>([]);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  /** Number of image uploads still in flight; saving waits for them. */
  const [pendingUploads, setPendingUploads] = useState(0);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    void authFetch<{ data: AnimeOption[] }>(`/admin/anime${qs({ limit: 100, publishStatus: undefined })}`)
      .then((result) => setAnimeList(result.data))
      .catch(() => setAnimeList([]));
  }, []);

  useEffect(() => {
    if (!episodeId) return;
    void authFetch<Record<string, unknown>>(`/admin/episodes/${episodeId}`)
      .then((data) => {
        setAnimeId(String((data.anime as { id: string }).id));
        setNumber(String(data.number ?? 1));
        setTitle(String(data.title ?? ''));
        setDescription(String(data.description ?? ''));
        setThumbnailUrl(String(data.thumbnailUrl ?? ''));
        setDurationSeconds(data.durationSeconds ? String(data.durationSeconds) : '');
        setAirDate(data.airDate ? String(data.airDate).slice(0, 10) : '');
        setHasSub(Boolean(data.hasSub));
        setHasDub(Boolean(data.hasDub));
        setIsFiller(Boolean(data.isFiller));
        setPublishStatus(String(data.publishStatus ?? 'DRAFT'));
        setIntroStart(data.introStart != null ? String(data.introStart) : '');
        setIntroEnd(data.introEnd != null ? String(data.introEnd) : '');
        setOutroStart(data.outroStart != null ? String(data.outroStart) : '');
        setOutroEnd(data.outroEnd != null ? String(data.outroEnd) : '');

        const loadedSources = (data.mediaSources as Array<Record<string, unknown>>) ?? [];
        setSources(
          loadedSources.length > 0
            ? loadedSources.map((source) => ({
                label: String(source.label ?? 'Server 1'),
                provider: String(source.provider ?? 'GOOGLE_DRIVE'),
                kind: (source.kind as 'SUB' | 'DUB') ?? 'SUB',
                audioLanguage: String(source.audioLanguage ?? 'ja'),
                audioLabel: String(source.audioLabel ?? 'Japanese'),
                hlsUrl: String(source.hlsUrl ?? ''),
                embedUrl: String(source.embedUrl ?? ''),
                isDefault: Boolean(source.isDefault),
                variants: ((source.variants as Array<Record<string, unknown>>) ?? []).map((v) => ({
                  quality: String(v.quality ?? 'Q_720P'),
                  driveFileIdOrUrl: String(v.driveFileId ?? ''),
                  directUrl: String(v.directUrl ?? ''),
                  isDefault: Boolean(v.isDefault),
                })),
              }))
            : [newSource(0)],
        );

        setSubtitles(
          ((data.subtitleTracks as Array<Record<string, unknown>>) ?? []).map((t) => ({
            language: String(t.language ?? 'en'),
            label: String(t.label ?? 'English'),
            format: String(t.format ?? 'VTT'),
            url: String(t.url ?? ''),
            driveFileIdOrUrl: String(t.driveFileId ?? ''),
            isDefault: Boolean(t.isDefault),
          })),
        );

        setAudioTracks(
          ((data.audioTracks as Array<Record<string, unknown>>) ?? []).map((t) => {
            const provider = (String(t.provider ?? 'GOOGLE_DRIVE') as AudioTrackDraft['provider']);
            return {
              language: String(t.language ?? ''),
              label: String(t.label ?? ''),
              provider,
              location: String((provider === 'GOOGLE_DRIVE' ? t.driveFileId : t.url) ?? ''),
              mimeType: String(t.mimeType ?? 'audio/mp4'),
              codec: String(t.codec ?? ''),
              isDefault: Boolean(t.isDefault),
            };
          }),
        );

        setDownloads(
          ((data.downloadSources as Array<Record<string, unknown>>) ?? []).map((d) => ({
            label: String(d.label ?? ''),
            quality: String(d.quality ?? 'Q_720P'),
            kind: (d.kind as 'SUB' | 'DUB') ?? 'SUB',
            url: String(d.url ?? ''),
          })),
        );
      })
      .catch(() => setBanner({ tone: 'error', text: 'Could not load this episode.' }))
      .finally(() => setLoading(false));
  }, [episodeId]);

  const updateSource = (index: number, patch: Partial<SourceDraft>) =>
    setSources((previous) => previous.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const updateVariant = (sourceIndex: number, variantIndex: number, patch: Partial<VariantDraft>) =>
    setSources((previous) =>
      previous.map((s, i) =>
        i === sourceIndex
          ? { ...s, variants: s.variants.map((v, vi) => (vi === variantIndex ? { ...v, ...patch } : v)) }
          : s,
      ),
    );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!animeId) {
      setBanner({ tone: 'error', text: 'Choose which anime this episode belongs to.' });
      return;
    }

    setSaving(true);
    setBanner(null);

    const payload: Record<string, unknown> = {
      animeId,
      number: Number(number),
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      thumbnailUrl: thumbnailUrl.trim() || undefined,
      durationSeconds: durationSeconds ? Number(durationSeconds) : undefined,
      airDate: airDate ? new Date(airDate).toISOString() : undefined,
      hasSub,
      hasDub,
      isFiller,
      publishStatus,
      introStart: introStart ? Number(introStart) : undefined,
      introEnd: introEnd ? Number(introEnd) : undefined,
      outroStart: outroStart ? Number(outroStart) : undefined,
      outroEnd: outroEnd ? Number(outroEnd) : undefined,
      mediaSources: sources.map((source) => ({
        label: source.label,
        provider: source.provider,
        kind: source.kind,
        audioLanguage: source.audioLanguage,
        audioLabel: source.audioLabel,
        hlsUrl: source.provider === 'HLS' ? source.hlsUrl : undefined,
        embedUrl: source.provider === 'EXTERNAL_EMBED' ? source.embedUrl : undefined,
        isDefault: source.isDefault,
        variants: PROVIDERS.find((p) => p.value === source.provider)?.needsVariants
          ? source.variants
              .filter((v) => v.driveFileIdOrUrl.trim() || v.directUrl.trim())
              .map((v) => ({
                quality: v.quality,
                driveFileIdOrUrl:
                  source.provider === 'GOOGLE_DRIVE' ? v.driveFileIdOrUrl.trim() || undefined : undefined,
                directUrl: source.provider !== 'GOOGLE_DRIVE' ? v.directUrl.trim() || undefined : undefined,
                isDefault: v.isDefault,
              }))
          : [],
      })),
      subtitleTracks: subtitles
        .filter((t) => t.url.trim() || t.driveFileIdOrUrl.trim())
        .map((t) => ({
          language: t.language,
          label: t.label,
          format: t.format,
          url: t.url.trim() || undefined,
          driveFileIdOrUrl: t.driveFileIdOrUrl.trim() || undefined,
          isDefault: t.isDefault,
        })),
      downloadSources: downloads.filter((d) => d.url.trim()).map((d) => ({ ...d, url: d.url.trim() })),
      // Always sent, so removing the last track really removes it.
      audioTracks: audioTracks
        .filter((t) => t.location.trim())
        .map((t, index) => ({
          language: t.language.trim(),
          label: t.label.trim(),
          provider: t.provider,
          driveFileIdOrUrl: t.provider === 'GOOGLE_DRIVE' ? t.location.trim() : undefined,
          url: t.provider !== 'GOOGLE_DRIVE' ? t.location.trim() : undefined,
          mimeType: t.mimeType,
          codec: t.codec.trim() || undefined,
          isDefault: t.isDefault,
          sortOrder: index,
        })),
    };

    const incomplete = audioTracks.find((t) => t.location.trim() && (!t.language.trim() || !t.label.trim()));
    if (incomplete) {
      setSaving(false);
      setBanner({ tone: 'error', text: 'Every audio track needs a language code and a label.' });
      return;
    }

    try {
      const result = await authFetch<{ id: string }>(isEdit ? `/admin/episodes/${episodeId}` : '/admin/episodes', {
        method: isEdit ? 'PUT' : 'POST',
        body: payload,
      });
      setBanner({ tone: 'ok', text: isEdit ? 'Saved.' : 'Episode created.' });
      if (!isEdit) router.push(`/admin/episodes/${result.id}`);
      router.refresh();
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-40 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <AdminHeader title={isEdit ? 'Edit episode' : 'New episode'}>
        <Button type="button" variant="secondary" onClick={() => router.push('/admin/episodes')}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || pendingUploads > 0}>
          {pendingUploads > 0 ? 'Uploading image…' : saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create episode'}
        </Button>
      </AdminHeader>

      {banner ? (
        <div className="mb-4">
          <Banner state={banner} />
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card title="Episode">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_7rem]">
                <label className="block">
                  <Label required>Anime</Label>
                  <select value={animeId} onChange={(e) => setAnimeId(e.target.value)} className={adminSelect} required>
                    <option value="">Choose a title…</option>
                    {animeList.map((anime) => (
                      <option key={anime.id} value={anime.id}>
                        {anime.titleEnglish}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <Label required hint="7.5 is valid">
                    Number
                  </Label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    className={adminInput}
                    required
                  />
                </label>
              </div>

              <label className="block">
                <Label>Episode title</Label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={adminInput} />
              </label>

              <label className="block">
                <Label>Description</Label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={adminTextarea} />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <Label hint="Used by the player and shown on cards.">Duration (seconds)</Label>
                  <input
                    type="number"
                    min={0}
                    value={durationSeconds}
                    onChange={(e) => setDurationSeconds(e.target.value)}
                    className={adminInput}
                  />
                </label>
                <label className="block">
                  <Label>Air date</Label>
                  <input type="date" value={airDate} onChange={(e) => setAirDate(e.target.value)} className={adminInput} />
                </label>
              </div>

              <div className="flex flex-wrap gap-4">
                {[
                  { label: 'Has subtitles (SUB)', checked: hasSub, set: setHasSub },
                  { label: 'Has dub (DUB)', checked: hasDub, set: setHasDub },
                  { label: 'Filler episode', checked: isFiller, set: setIsFiller },
                ].map((item) => (
                  <label key={item.label} className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-soft">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(e) => item.set(e.target.checked)}
                      className="h-4 w-4 rounded border-line bg-base accent-[var(--color-brand)]"
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>
          </Card>

          <Card
            title="Intro & outro markers"
            description="Seconds from the start. Leave a pair blank and the matching skip button is hidden — the player never shows a control that would do nothing."
          >
            <div className="grid gap-4 sm:grid-cols-4">
              {[
                { label: 'Intro start', value: introStart, set: setIntroStart },
                { label: 'Intro end', value: introEnd, set: setIntroEnd },
                { label: 'Outro start', value: outroStart, set: setOutroStart },
                { label: 'Outro end', value: outroEnd, set: setOutroEnd },
              ].map((field) => (
                <label key={field.label} className="block">
                  <Label>{field.label}</Label>
                  <input
                    type="number"
                    min={0}
                    value={field.value}
                    onChange={(e) => field.set(e.target.value)}
                    placeholder="—"
                    className={adminInput}
                  />
                </label>
              ))}
            </div>
          </Card>

          {/* Media sources */}
          <Card
            title="Media sources"
            description="One source is one server AND one audio flavour. A progressive file carries a single audio track, so a subbed and a dubbed version are two separate sources — that is what makes audio switching real."
          >
            <div className="space-y-4">
              {sources.map((source, sourceIndex) => {
                const providerMeta = PROVIDERS.find((p) => p.value === source.provider);
                const isDrive = source.provider === 'GOOGLE_DRIVE';

                return (
                  <div key={sourceIndex} className="rounded-xl border border-line-soft bg-base/50 p-3.5">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-bold uppercase tracking-wide text-ink-faint">
                        Source {sourceIndex + 1}
                      </span>
                      <div className="flex gap-1.5">
                        <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-ink-muted">
                          <input
                            type="radio"
                            name="default-source"
                            checked={source.isDefault}
                            onChange={() =>
                              setSources((previous) => previous.map((s, i) => ({ ...s, isDefault: i === sourceIndex })))
                            }
                            className="h-3.5 w-3.5 accent-[var(--color-brand)]"
                          />
                          Default
                        </label>
                        {sources.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setSources((previous) => previous.filter((_, i) => i !== sourceIndex))}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="block">
                        <Label>Label</Label>
                        <input
                          value={source.label}
                          onChange={(e) => updateSource(sourceIndex, { label: e.target.value })}
                          className={adminInput}
                        />
                      </label>

                      <label className="block">
                        <Label>Provider</Label>
                        <select
                          value={source.provider}
                          onChange={(e) => updateSource(sourceIndex, { provider: e.target.value })}
                          className={adminSelect}
                        >
                          {PROVIDERS.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <Label>SUB or DUB</Label>
                        <select
                          value={source.kind}
                          onChange={(e) => {
                            const kind = e.target.value as 'SUB' | 'DUB';
                            updateSource(sourceIndex, {
                              kind,
                              audioLanguage: kind === 'DUB' ? 'en' : 'ja',
                              audioLabel: kind === 'DUB' ? 'English Dub' : 'Japanese',
                            });
                          }}
                          className={adminSelect}
                        >
                          <option value="SUB">SUB — original audio</option>
                          <option value="DUB">DUB — dubbed audio</option>
                        </select>
                      </label>

                      <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
                        <label className="block">
                          <Label>Lang</Label>
                          <input
                            value={source.audioLanguage}
                            onChange={(e) => updateSource(sourceIndex, { audioLanguage: e.target.value })}
                            className={adminInput}
                          />
                        </label>
                        <label className="block">
                          <Label>Audio label</Label>
                          <input
                            value={source.audioLabel}
                            onChange={(e) => updateSource(sourceIndex, { audioLabel: e.target.value })}
                            className={adminInput}
                          />
                        </label>
                      </div>
                    </div>

                    {source.provider === 'HLS' ? (
                      <label className="mt-3 block">
                        <Label hint="Adaptive streams switch quality and audio seamlessly — no reload.">
                          Master playlist URL (.m3u8)
                        </Label>
                        <input
                          value={source.hlsUrl}
                          onChange={(e) => updateSource(sourceIndex, { hlsUrl: e.target.value })}
                          placeholder="https://…/master.m3u8"
                          className={adminInput}
                        />
                      </label>
                    ) : null}

                    {source.provider === 'EXTERNAL_EMBED' ? (
                      <label className="mt-3 block">
                        <Label hint="An embed cannot be driven by our player, so quality, subtitle and progress controls are hidden for this source. Use it only as a fallback.">
                          Embed URL
                        </Label>
                        <input
                          value={source.embedUrl}
                          onChange={(e) => updateSource(sourceIndex, { embedUrl: e.target.value })}
                          placeholder="https://…"
                          className={adminInput}
                        />
                      </label>
                    ) : null}

                    {providerMeta?.needsVariants ? (
                      <div className="mt-3">
                        <div className="mb-2 flex items-center justify-between">
                          <Label hint="Each quality is a separate file for this provider. That is what makes quality switching work.">
                            Quality files
                          </Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              updateSource(sourceIndex, {
                                variants: [
                                  ...source.variants,
                                  { quality: 'Q_720P', driveFileIdOrUrl: '', directUrl: '', isDefault: false },
                                ],
                              })
                            }
                          >
                            + Add quality
                          </Button>
                        </div>

                        <div className="space-y-2">
                          {source.variants.map((variant, variantIndex) => (
                            <div key={variantIndex} className="flex flex-wrap items-center gap-2">
                              <select
                                value={variant.quality}
                                onChange={(e) => updateVariant(sourceIndex, variantIndex, { quality: e.target.value })}
                                aria-label="Quality"
                                className={`${adminSelect} w-24`}
                              >
                                {QUALITIES.map((q) => (
                                  <option key={q} value={q}>
                                    {QUALITY_LABELS[q]}
                                  </option>
                                ))}
                              </select>

                              <input
                                value={isDrive ? variant.driveFileIdOrUrl : variant.directUrl}
                                onChange={(e) =>
                                  updateVariant(
                                    sourceIndex,
                                    variantIndex,
                                    isDrive ? { driveFileIdOrUrl: e.target.value } : { directUrl: e.target.value },
                                  )
                                }
                                placeholder={
                                  isDrive ? 'Drive share link or file ID' : 'https://… or a path inside uploads/'
                                }
                                aria-label="Source location"
                                className={`${adminInput} min-w-48 flex-1`}
                              />

                              <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-ink-muted">
                                <input
                                  type="radio"
                                  name={`default-variant-${sourceIndex}`}
                                  checked={variant.isDefault}
                                  onChange={() =>
                                    updateSource(sourceIndex, {
                                      variants: source.variants.map((v, i) => ({ ...v, isDefault: i === variantIndex })),
                                    })
                                  }
                                  className="h-3.5 w-3.5 accent-[var(--color-brand)]"
                                />
                                Start here
                              </label>

                              {source.variants.length > 1 ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    updateSource(sourceIndex, {
                                      variants: source.variants.filter((_, i) => i !== variantIndex),
                                    })
                                  }
                                >
                                  ✕
                                </Button>
                              ) : null}
                            </div>
                          ))}
                        </div>

                        {isDrive ? (
                          <p className="mt-2 rounded-lg bg-base px-3 py-2 text-[11.5px] leading-relaxed text-ink-faint">
                            Paste the whole Drive share link or just the file ID — either works. Each file must be
                            shared with the account configured in the backend, or playback will fail with a 404.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              <Button
                type="button"
                variant="secondary"
                onClick={() => setSources((previous) => [...previous, newSource(previous.length)])}
              >
                + Add source
              </Button>
            </div>
          </Card>

          <Card
            title="Audio Tracks"
            description="Separate audio files (for example a Japanese original and an English dub) played in sync with the video. Viewers switch between them from the player's Audio menu without the video restarting. Leave empty if each source already carries its own audio."
          >
            <div className="space-y-3" data-testid="audio-tracks">
              {audioTracks.map((track, index) => {
                const patch = (next: Partial<AudioTrackDraft>) =>
                  setAudioTracks((previous) => previous.map((t, i) => (i === index ? { ...t, ...next } : t)));
                const move = (delta: number) =>
                  setAudioTracks((previous) => {
                    const target = index + delta;
                    if (target < 0 || target >= previous.length) return previous;
                    const copy = previous.slice();
                    [copy[index], copy[target]] = [copy[target], copy[index]];
                    return copy;
                  });
                return (
                  <div key={index} className="rounded-xl border border-line-soft bg-base/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-6 text-center text-[12px] font-semibold text-ink-faint">{index + 1}</span>
                      <input
                        value={track.language}
                        onChange={(e) => patch({ language: e.target.value })}
                        placeholder="en"
                        aria-label="Audio language code"
                        className={`${adminInput} w-20`}
                      />
                      <input
                        value={track.label}
                        onChange={(e) => patch({ label: e.target.value })}
                        placeholder="English Dub"
                        aria-label="Audio label"
                        className={`${adminInput} w-40`}
                      />
                      <select
                        value={track.provider}
                        onChange={(e) => patch({ provider: e.target.value as AudioTrackDraft['provider'] })}
                        aria-label="Audio provider"
                        className={`${adminSelect} w-44`}
                      >
                        {AUDIO_PROVIDERS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-ink-muted">
                        <input
                          type="radio"
                          name="default-audio"
                          checked={track.isDefault}
                          onChange={() =>
                            setAudioTracks((previous) => previous.map((t, i) => ({ ...t, isDefault: i === index })))
                          }
                          className="h-3.5 w-3.5 accent-[var(--color-brand)]"
                        />
                        Default
                      </label>
                      <div className="ml-auto flex items-center gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => move(-1)} disabled={index === 0} aria-label="Move up">
                          ↑
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => move(1)}
                          disabled={index === audioTracks.length - 1}
                          aria-label="Move down"
                        >
                          ↓
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setAudioTracks((previous) => previous.filter((_, i) => i !== index))}
                          aria-label="Remove audio track"
                        >
                          ✕
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
                      <input
                        value={track.location}
                        onChange={(e) => patch({ location: e.target.value })}
                        placeholder={
                          track.provider === 'GOOGLE_DRIVE'
                            ? 'Drive share link or file ID of the .m4a / .mp3'
                            : 'https://… or /uploads/… URL of the audio file'
                        }
                        aria-label="Audio file"
                        className={`${adminInput} min-w-56 flex-1`}
                      />
                      <select
                        value={track.mimeType}
                        onChange={(e) => patch({ mimeType: e.target.value })}
                        aria-label="Audio format"
                        className={`${adminSelect} w-52`}
                      >
                        {AUDIO_MIME_TYPES.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={track.codec}
                        onChange={(e) => patch({ codec: e.target.value })}
                        placeholder="AAC 2.0 192k (optional)"
                        aria-label="Codec note"
                        className={`${adminInput} w-44`}
                      />
                    </div>
                  </div>
                );
              })}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setAudioTracks((previous) => [...previous, newAudioTrack(previous.length === 0)])}
              >
                + Add audio track
              </Button>
              <p className="rounded-lg bg-base px-3 py-2 text-[11.5px] leading-relaxed text-ink-faint">
                Each audio file must be the same length as the video and start at the same moment. Drive files must be
                shared with the backend&apos;s service account. When audio tracks are set, the video&apos;s own soundtrack is muted.
              </p>
            </div>
          </Card>

          <Card title="Subtitles" description="Applies to every source of this episode. SRT files are converted to WebVTT automatically.">
            <div className="space-y-2.5">
              {subtitles.map((track, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <input
                    value={track.language}
                    onChange={(e) =>
                      setSubtitles((previous) => previous.map((t, i) => (i === index ? { ...t, language: e.target.value } : t)))
                    }
                    placeholder="en"
                    aria-label="Language tag"
                    className={`${adminInput} w-20`}
                  />
                  <input
                    value={track.label}
                    onChange={(e) =>
                      setSubtitles((previous) => previous.map((t, i) => (i === index ? { ...t, label: e.target.value } : t)))
                    }
                    placeholder="English"
                    aria-label="Display label"
                    className={`${adminInput} w-32`}
                  />
                  <select
                    value={track.format}
                    onChange={(e) =>
                      setSubtitles((previous) => previous.map((t, i) => (i === index ? { ...t, format: e.target.value } : t)))
                    }
                    aria-label="Format"
                    className={`${adminSelect} w-20`}
                  >
                    <option value="VTT">VTT</option>
                    <option value="SRT">SRT</option>
                  </select>
                  <input
                    value={track.url || track.driveFileIdOrUrl}
                    onChange={(e) => {
                      const value = e.target.value;
                      const looksLikeDrive = /drive\.google\.com/.test(value);
                      setSubtitles((previous) =>
                        previous.map((t, i) =>
                          i === index
                            ? looksLikeDrive
                              ? { ...t, driveFileIdOrUrl: value, url: '' }
                              : { ...t, url: value, driveFileIdOrUrl: '' }
                            : t,
                        ),
                      );
                    }}
                    placeholder="URL of the .vtt file, or a Drive link"
                    aria-label="Subtitle file"
                    className={`${adminInput} min-w-48 flex-1`}
                  />
                  <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-ink-muted">
                    <input
                      type="radio"
                      name="default-subtitle"
                      checked={track.isDefault}
                      onChange={() =>
                        setSubtitles((previous) => previous.map((t, i) => ({ ...t, isDefault: i === index })))
                      }
                      className="h-3.5 w-3.5 accent-[var(--color-brand)]"
                    />
                    Default
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSubtitles((previous) => previous.filter((_, i) => i !== index))}
                  >
                    ✕
                  </Button>
                </div>
              ))}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setSubtitles((previous) => [
                    ...previous,
                    { language: 'en', label: 'English', format: 'VTT', url: '', driveFileIdOrUrl: '', isDefault: previous.length === 0 },
                  ])
                }
              >
                + Add subtitle track
              </Button>
            </div>
          </Card>

          <Card
            title="Downloads"
            description="Only add links you are authorised to distribute. The download control is hidden entirely when this list is empty."
          >
            <div className="space-y-2.5">
              {downloads.map((download, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <input
                    value={download.label}
                    onChange={(e) =>
                      setDownloads((previous) => previous.map((d, i) => (i === index ? { ...d, label: e.target.value } : d)))
                    }
                    placeholder="Label"
                    aria-label="Label"
                    className={`${adminInput} w-32`}
                  />
                  <select
                    value={download.quality}
                    onChange={(e) =>
                      setDownloads((previous) => previous.map((d, i) => (i === index ? { ...d, quality: e.target.value } : d)))
                    }
                    aria-label="Quality"
                    className={`${adminSelect} w-24`}
                  >
                    {QUALITIES.map((q) => (
                      <option key={q} value={q}>
                        {QUALITY_LABELS[q]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={download.kind}
                    onChange={(e) =>
                      setDownloads((previous) =>
                        previous.map((d, i) => (i === index ? { ...d, kind: e.target.value as 'SUB' | 'DUB' } : d)),
                      )
                    }
                    aria-label="SUB or DUB"
                    className={`${adminSelect} w-20`}
                  >
                    <option value="SUB">SUB</option>
                    <option value="DUB">DUB</option>
                  </select>
                  <input
                    value={download.url}
                    onChange={(e) =>
                      setDownloads((previous) => previous.map((d, i) => (i === index ? { ...d, url: e.target.value } : d)))
                    }
                    placeholder="https://…"
                    aria-label="Download URL"
                    className={`${adminInput} min-w-48 flex-1`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDownloads((previous) => previous.filter((_, i) => i !== index))}
                  >
                    ✕
                  </Button>
                </div>
              ))}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setDownloads((previous) => [...previous, { label: '', quality: 'Q_720P', kind: 'SUB', url: '' }])
                }
              >
                + Add download link
              </Button>
            </div>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card title="Publishing">
            <label className="block">
              <Label hint="Only Published episodes are visible on the site.">Status</Label>
              <select value={publishStatus} onChange={(e) => setPublishStatus(e.target.value)} className={adminSelect}>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
          </Card>

          <Card title="Thumbnail">
            <ImageUploadField
              label="Episode thumbnail"
              hint="16:9. Falls back to the anime banner when empty."
              kind="thumbnail"
              value={thumbnailUrl}
              onChange={setThumbnailUrl}
              onUploadingChange={(busy) => setPendingUploads((n) => n + (busy ? 1 : -1))}
              aspect="aspect-video"
            />
          </Card>

          <Card title="Checklist">
            <ul className="space-y-1.5 text-[12.5px]">
              {[
                { done: Boolean(animeId), label: 'Anime selected' },
                { done: sources.some((s) => s.variants.some((v) => v.driveFileIdOrUrl || v.directUrl) || s.hlsUrl || s.embedUrl), label: 'At least one playable source' },
                { done: subtitles.length > 0, label: 'Subtitle track added' },
                { done: Boolean(introStart && introEnd), label: 'Intro markers set' },
                { done: Boolean(durationSeconds), label: 'Duration set' },
                { done: publishStatus === 'PUBLISHED', label: 'Published' },
              ].map((item) => (
                <li key={item.label} className={cn('flex items-center gap-2', item.done ? 'text-ok' : 'text-ink-faint')}>
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.6}>
                    {item.done ? (
                      <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                    ) : (
                      <circle cx="12" cy="12" r="7" />
                    )}
                  </svg>
                  {item.label}
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </form>
  );
}
