'use client';

import { SmartImage as Image } from '@/components/ui/SmartImage';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { authFetch } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { AdminHeader, Banner, Button, Card, Label, adminInput, adminSelect, adminTextarea } from './ui';
import { ImageUploadField } from './ImageUploadField';

const TYPES = ['TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'TV_SHORT', 'TV_SPECIAL', 'MUSIC', 'OTHER'];
const STATUSES = ['ONGOING', 'COMPLETED', 'UPCOMING', 'HIATUS', 'CANCELLED'];
const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
const RATINGS = ['G', 'PG', 'PG_13', 'R_17', 'R_PLUS', 'RX'];
const SOURCES = [
  'ORIGINAL',
  'MANGA',
  'LIGHT_NOVEL',
  'NOVEL',
  'VISUAL_NOVEL',
  'GAME',
  'WEB_MANGA',
  'FOUR_KOMA',
  'MUSIC',
  'OTHER',
];
const PUBLISH = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

interface Option {
  id: string;
  name: string;
  slug: string;
}

interface AnimeFormState {
  titleEnglish: string;
  titleJapanese: string;
  titleRomaji: string;
  slug: string;
  synopsis: string;
  posterUrl: string;
  bannerUrl: string;
  trailerUrl: string;
  type: string;
  status: string;
  season: string;
  releaseYear: string;
  airStartDate: string;
  airEndDate: string;
  ageRating: string;
  source: string;
  durationMinutes: string;
  totalEpisodes: string;
  studioId: string;
  genreIds: string[];
  producerIds: string[];
  isFeatured: boolean;
  isTrending: boolean;
  publishStatus: string;
  seoTitle: string;
  seoDescription: string;
  malId: string;
  anilistId: string;
}

const EMPTY: AnimeFormState = {
  titleEnglish: '',
  titleJapanese: '',
  titleRomaji: '',
  slug: '',
  synopsis: '',
  posterUrl: '',
  bannerUrl: '',
  trailerUrl: '',
  type: 'TV',
  status: 'ONGOING',
  season: '',
  releaseYear: '',
  airStartDate: '',
  airEndDate: '',
  ageRating: '',
  source: 'ORIGINAL',
  durationMinutes: '',
  totalEpisodes: '',
  studioId: '',
  genreIds: [],
  producerIds: [],
  isFeatured: false,
  isTrending: false,
  publishStatus: 'DRAFT',
  seoTitle: '',
  seoDescription: '',
  malId: '',
  anilistId: '',
};

function label(value: string): string {
  return value
    .split('_')
    .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
    .join(' ')
    .replace('Pg 13', 'PG-13')
    .replace('R 17', 'R-17')
    .replace('R Plus', 'R+')
    .replace(/^Tv/, 'TV')
    .replace(/^Ova$/, 'OVA')
    .replace(/^Ona$/, 'ONA');
}

export function AnimeForm({ animeId }: { animeId?: string }) {
  const router = useRouter();
  const isEdit = Boolean(animeId);

  const [form, setForm] = useState<AnimeFormState>(EMPTY);
  const [genres, setGenres] = useState<Option[]>([]);
  const [studios, setStudios] = useState<Option[]>([]);
  const [producers, setProducers] = useState<Option[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  /** Number of image uploads still in flight; saving waits for them. */
  const [pendingUploads, setPendingUploads] = useState(0);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const set = <K extends keyof AnimeFormState>(key: K, value: AnimeFormState[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  useEffect(() => {
    void Promise.all([
      apiFetch<Option[]>('/genres').catch(() => []),
      apiFetch<Option[]>('/studios').catch(() => []),
      apiFetch<Option[]>('/producers').catch(() => []),
    ]).then(([g, s, p]) => {
      setGenres(g);
      setStudios(s);
      setProducers(p);
    });
  }, []);

  useEffect(() => {
    if (!animeId) return;
    void authFetch<Record<string, unknown>>(`/admin/anime/${animeId}`)
      .then((data) => {
        setForm({
          ...EMPTY,
          titleEnglish: String(data.titleEnglish ?? ''),
          titleJapanese: String(data.titleJapanese ?? ''),
          titleRomaji: String(data.titleRomaji ?? ''),
          slug: String(data.slug ?? ''),
          synopsis: String(data.synopsis ?? ''),
          posterUrl: String(data.posterUrl ?? ''),
          bannerUrl: String(data.bannerUrl ?? ''),
          trailerUrl: String(data.trailerUrl ?? ''),
          type: String(data.type ?? 'TV'),
          status: String(data.status ?? 'ONGOING'),
          season: String(data.season ?? ''),
          releaseYear: data.releaseYear ? String(data.releaseYear) : '',
          airStartDate: data.airStartDate ? String(data.airStartDate).slice(0, 10) : '',
          airEndDate: data.airEndDate ? String(data.airEndDate).slice(0, 10) : '',
          ageRating: String(data.ageRating ?? ''),
          source: String(data.source ?? 'ORIGINAL'),
          durationMinutes: data.durationMinutes ? String(data.durationMinutes) : '',
          totalEpisodes: data.totalEpisodes ? String(data.totalEpisodes) : '',
          studioId: String(data.studioId ?? ''),
          genreIds: (data.genreIds as string[]) ?? [],
          producerIds: (data.producerIds as string[]) ?? [],
          isFeatured: Boolean(data.isFeatured),
          isTrending: Boolean(data.isTrending),
          publishStatus: String(data.publishStatus ?? 'DRAFT'),
          seoTitle: String(data.seoTitle ?? ''),
          seoDescription: String(data.seoDescription ?? ''),
          malId: data.malId ? String(data.malId) : '',
          anilistId: data.anilistId ? String(data.anilistId) : '',
        });
      })
      .catch(() => setBanner({ tone: 'error', text: 'Could not load this title.' }))
      .finally(() => setLoading(false));
  }, [animeId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.titleEnglish.trim().length < 1) {
      setBanner({ tone: 'error', text: 'An English title is required.' });
      return;
    }

    setSaving(true);
    setBanner(null);

    // Empty strings are converted to undefined so the API treats them as
    // "not set" rather than as an empty value.
    const payload = {
      titleEnglish: form.titleEnglish.trim(),
      titleJapanese: form.titleJapanese.trim() || undefined,
      titleRomaji: form.titleRomaji.trim() || undefined,
      slug: form.slug.trim() || undefined,
      synopsis: form.synopsis.trim() || undefined,
      posterUrl: form.posterUrl.trim() || undefined,
      bannerUrl: form.bannerUrl.trim() || undefined,
      trailerUrl: form.trailerUrl.trim() || undefined,
      type: form.type,
      status: form.status,
      season: form.season || undefined,
      releaseYear: form.releaseYear ? Number(form.releaseYear) : undefined,
      airStartDate: form.airStartDate ? new Date(form.airStartDate).toISOString() : undefined,
      airEndDate: form.airEndDate ? new Date(form.airEndDate).toISOString() : undefined,
      ageRating: form.ageRating || undefined,
      source: form.source || undefined,
      durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
      totalEpisodes: form.totalEpisodes ? Number(form.totalEpisodes) : undefined,
      studioId: form.studioId || undefined,
      genreIds: form.genreIds,
      producerIds: form.producerIds,
      isFeatured: form.isFeatured,
      isTrending: form.isTrending,
      publishStatus: form.publishStatus,
      seoTitle: form.seoTitle.trim() || undefined,
      seoDescription: form.seoDescription.trim() || undefined,
      malId: form.malId ? Number(form.malId) : undefined,
      anilistId: form.anilistId ? Number(form.anilistId) : undefined,
    };

    try {
      const result = await authFetch<{ id: string }>(isEdit ? `/admin/anime/${animeId}` : '/admin/anime', {
        method: isEdit ? 'PUT' : 'POST',
        body: payload,
      });
      setBanner({ tone: 'ok', text: isEdit ? 'Saved.' : 'Created.' });
      if (!isEdit) router.push(`/admin/anime/${result.id}`);
      router.refresh();
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleId = (key: 'genreIds' | 'producerIds', id: string) =>
    set(key, form[key].includes(id) ? form[key].filter((x) => x !== id) : [...form[key], id]);

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
      <AdminHeader title={isEdit ? 'Edit anime' : 'New anime'} description="All fields are managed by hand — no external metadata service is used.">
        <Button type="button" variant="secondary" onClick={() => router.push('/admin/anime')}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || pendingUploads > 0}>
          {pendingUploads > 0 ? 'Uploading image…' : saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create anime'}
        </Button>
      </AdminHeader>

      {banner ? (
        <div className="mb-4">
          <Banner state={banner} />
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card title="Titles">
            <div className="space-y-4">
              <label className="block">
                <Label required>English title</Label>
                <input
                  value={form.titleEnglish}
                  onChange={(e) => set('titleEnglish', e.target.value)}
                  className={adminInput}
                  required
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <Label>Japanese title</Label>
                  <input value={form.titleJapanese} onChange={(e) => set('titleJapanese', e.target.value)} className={adminInput} />
                </label>
                <label className="block">
                  <Label>Romaji title</Label>
                  <input value={form.titleRomaji} onChange={(e) => set('titleRomaji', e.target.value)} className={adminInput} />
                </label>
              </div>

              <label className="block">
                <Label hint="Leave blank to generate one from the English title. Changing this breaks existing links.">
                  URL slug
                </Label>
                <input
                  value={form.slug}
                  onChange={(e) => set('slug', e.target.value)}
                  placeholder="auto-generated"
                  className={adminInput}
                />
              </label>

              <label className="block">
                <Label>Synopsis</Label>
                <textarea
                  value={form.synopsis}
                  onChange={(e) => set('synopsis', e.target.value)}
                  rows={7}
                  className={adminTextarea}
                />
              </label>
            </div>
          </Card>

          <Card title="Classification">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block">
                <Label>Type</Label>
                <select value={form.type} onChange={(e) => set('type', e.target.value)} className={adminSelect}>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {label(t)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <Label>Status</Label>
                <select value={form.status} onChange={(e) => set('status', e.target.value)} className={adminSelect}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {label(s)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <Label>Source</Label>
                <select value={form.source} onChange={(e) => set('source', e.target.value)} className={adminSelect}>
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {label(s)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <Label>Season</Label>
                <select value={form.season} onChange={(e) => set('season', e.target.value)} className={adminSelect}>
                  <option value="">Not set</option>
                  {SEASONS.map((s) => (
                    <option key={s} value={s}>
                      {label(s)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <Label>Release year</Label>
                <input
                  type="number"
                  min={1900}
                  max={2200}
                  value={form.releaseYear}
                  onChange={(e) => set('releaseYear', e.target.value)}
                  className={adminInput}
                />
              </label>

              <label className="block">
                <Label>Age rating</Label>
                <select value={form.ageRating} onChange={(e) => set('ageRating', e.target.value)} className={adminSelect}>
                  <option value="">Not set</option>
                  {RATINGS.map((r) => (
                    <option key={r} value={r}>
                      {label(r)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <Label>Aired from</Label>
                <input type="date" value={form.airStartDate} onChange={(e) => set('airStartDate', e.target.value)} className={adminInput} />
              </label>

              <label className="block">
                <Label>Aired to</Label>
                <input type="date" value={form.airEndDate} onChange={(e) => set('airEndDate', e.target.value)} className={adminInput} />
              </label>

              <label className="block">
                <Label hint="Average runtime per episode">Duration (minutes)</Label>
                <input
                  type="number"
                  min={1}
                  value={form.durationMinutes}
                  onChange={(e) => set('durationMinutes', e.target.value)}
                  className={adminInput}
                />
              </label>

              <label className="block">
                <Label hint="Leave blank to count published episodes automatically">Total episodes</Label>
                <input
                  type="number"
                  min={0}
                  value={form.totalEpisodes}
                  onChange={(e) => set('totalEpisodes', e.target.value)}
                  className={adminInput}
                />
              </label>

              <label className="block">
                <Label>Studio</Label>
                <select value={form.studioId} onChange={(e) => set('studioId', e.target.value)} className={adminSelect}>
                  <option value="">Not set</option>
                  {studios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Card>

          <Card title="Genres" description="Used by filtering, the genre pages and the recommendation engine.">
            <div className="flex flex-wrap gap-1.5">
              {genres.map((genre) => (
                <button
                  key={genre.id}
                  type="button"
                  onClick={() => toggleId('genreIds', genre.id)}
                  aria-pressed={form.genreIds.includes(genre.id)}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition',
                    form.genreIds.includes(genre.id)
                      ? 'bg-brand text-white'
                      : 'bg-surface-2 text-ink-soft hover:bg-surface-3 hover:text-ink',
                  )}
                >
                  {genre.name}
                </button>
              ))}
            </div>
          </Card>

          <Card title="Producers">
            <div className="flex flex-wrap gap-1.5">
              {producers.map((producer) => (
                <button
                  key={producer.id}
                  type="button"
                  onClick={() => toggleId('producerIds', producer.id)}
                  aria-pressed={form.producerIds.includes(producer.id)}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition',
                    form.producerIds.includes(producer.id)
                      ? 'bg-brand text-white'
                      : 'bg-surface-2 text-ink-soft hover:bg-surface-3 hover:text-ink',
                  )}
                >
                  {producer.name}
                </button>
              ))}
            </div>
          </Card>

          <Card title="SEO" description="Falls back to the title and synopsis when left blank.">
            <div className="space-y-4">
              <label className="block">
                <Label>Meta title</Label>
                <input value={form.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} className={adminInput} />
              </label>
              <label className="block">
                <Label hint={`${form.seoDescription.length}/320 characters`}>Meta description</Label>
                <textarea
                  value={form.seoDescription}
                  onChange={(e) => set('seoDescription', e.target.value.slice(0, 320))}
                  rows={3}
                  className={adminTextarea}
                />
              </label>
            </div>
          </Card>

          <Card
            title="External identifiers"
            description="Stored for your own reference only. This application never contacts those services."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <Label>MyAnimeList ID</Label>
                <input type="number" value={form.malId} onChange={(e) => set('malId', e.target.value)} className={adminInput} />
              </label>
              <label className="block">
                <Label>AniList ID</Label>
                <input type="number" value={form.anilistId} onChange={(e) => set('anilistId', e.target.value)} className={adminInput} />
              </label>
            </div>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card title="Publishing">
            <div className="space-y-4">
              <label className="block">
                <Label>Status</Label>
                <select
                  value={form.publishStatus}
                  onChange={(e) => set('publishStatus', e.target.value)}
                  className={adminSelect}
                >
                  {PUBLISH.map((p) => (
                    <option key={p} value={p}>
                      {label(p)}
                    </option>
                  ))}
                </select>
                <span className="mt-1.5 block text-[11.5px] leading-relaxed text-ink-faint">
                  Only Published titles appear anywhere on the public site.
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={form.isFeatured}
                  onChange={(e) => set('isFeatured', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-line bg-base accent-[var(--color-brand)]"
                />
                <span>
                  <span className="block text-[13px] font-medium text-ink">Feature on the homepage</span>
                  <span className="block text-[11.5px] text-ink-faint">Adds it to the hero slider.</span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={form.isTrending}
                  onChange={(e) => set('isTrending', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-line bg-base accent-[var(--color-brand)]"
                />
                <span>
                  <span className="block text-[13px] font-medium text-ink">Mark as trending</span>
                  <span className="block text-[11.5px] text-ink-faint">A manual flag, separate from view-based trending.</span>
                </span>
              </label>
            </div>
          </Card>

          <Card title="Artwork">
            <div className="space-y-5">
              <ImageUploadField
                label="Poster"
                hint="Portrait, roughly 2:3. Shown on every card."
                kind="poster"
                value={form.posterUrl}
                onChange={(url) => set('posterUrl', url)}
                onUploadingChange={(busy) => setPendingUploads((n) => n + (busy ? 1 : -1))}
                aspect="aspect-[2/3]"
              />
              <ImageUploadField
                label="Banner"
                hint="Wide backdrop for the hero and detail page."
                kind="banner"
                value={form.bannerUrl}
                onChange={(url) => set('bannerUrl', url)}
                onUploadingChange={(busy) => setPendingUploads((n) => n + (busy ? 1 : -1))}
                aspect="aspect-video"
              />
              <label className="block">
                <Label hint="Optional external trailer link.">Trailer URL</Label>
                <input value={form.trailerUrl} onChange={(e) => set('trailerUrl', e.target.value)} className={adminInput} />
              </label>
            </div>
          </Card>

          {isEdit && form.posterUrl ? (
            <Card title="Preview">
              <div className="mx-auto w-36">
                <span className="relative block aspect-[2/3] overflow-hidden rounded-lg bg-surface-2 ring-1 ring-line-soft">
                  <Image src={form.posterUrl} alt="" fill sizes="144px" className="object-cover" />
                </span>
                <p className="clamp-2 mt-2 text-[12.5px] font-semibold text-ink">{form.titleEnglish}</p>
                <p className="text-[11px] text-ink-faint">
                  {label(form.type)} · {form.releaseYear || '—'}
                </p>
              </div>
            </Card>
          ) : null}
        </aside>
      </div>
    </form>
  );
}
