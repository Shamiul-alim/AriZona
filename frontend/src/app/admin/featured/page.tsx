'use client';

import { SmartImage as Image } from '@/components/ui/SmartImage';
import { useCallback, useEffect, useState } from 'react';
import { qs } from '@/lib/api';
import { authFetch } from '@/lib/auth-store';
import type { AnimeCard } from '@/lib/types';
import { AdminHeader, Banner, Button, Card, Label, adminInput } from '@/components/admin/ui';

interface FeaturedEntry {
  id: string;
  animeId: string;
  headline: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  backdropUrl: string | null;
  order: number;
  isActive: boolean;
  anime: { id: string; slug: string; titleEnglish: string; posterUrl: string | null; bannerUrl: string | null };
}

export default function AdminFeaturedPage() {
  const [entries, setEntries] = useState<FeaturedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<AnimeCard[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await authFetch<FeaturedEntry[]>('/admin/featured'));
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (search.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void authFetch<{ data: AnimeCard[] }>(`/anime${qs({ q: search.trim(), limit: 6 })}`)
        .then((r) => setResults(r.data))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const upsert = async (body: Record<string, unknown>) => {
    try {
      await authFetch('/admin/featured', { method: 'PUT', body });
      setBanner({ tone: 'ok', text: 'Slider updated.' });
      void load();
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : 'Could not save.' });
    }
  };

  const remove = async (entry: FeaturedEntry) => {
    try {
      await authFetch(`/admin/featured/${entry.animeId}`, { method: 'DELETE' });
      void load();
    } catch {
      /* keep the row */
    }
  };

  const move = async (entry: FeaturedEntry, direction: -1 | 1) => {
    const target = entry.order + direction;
    if (target < 0 || target >= entries.length) return;
    const swap = entries.find((e) => e.order === target);
    if (swap) await upsert({ animeId: swap.animeId, order: entry.order });
    await upsert({ animeId: entry.animeId, order: target });
  };

  if (loading) return <div className="skeleton h-96 rounded-xl" />;

  return (
    <div className="space-y-5">
      <AdminHeader title="Homepage slider" description="The hero carousel on the homepage, in display order." />

      {banner ? <Banner state={banner} /> : null}

      <Card title="Add a title">
        <div className="relative">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the catalogue…"
            aria-label="Search anime"
            className={adminInput}
          />
          {results.length > 0 ? (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-2xl">
              {results.map((anime) => (
                <li key={anime.id}>
                  <button
                    type="button"
                    onClick={() => {
                      void upsert({ animeId: anime.id, headline: anime.title });
                      setSearch('');
                      setResults([]);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-white/6"
                  >
                    <span className="relative h-12 w-8 shrink-0 overflow-hidden rounded bg-surface-2">
                      {anime.posterUrl ? (
                        <Image src={anime.posterUrl} alt="" fill sizes="32px" className="object-cover" />
                      ) : null}
                    </span>
                    <span className="truncate text-[13px] text-ink">{anime.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Card>

      {entries.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-[13px] text-ink-faint">
            The slider is empty — the homepage hero will be hidden.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((entry, index) => (
              <Card key={entry.id}>
                <div className="flex flex-wrap gap-4">
                  <span className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                    {entry.anime.posterUrl ? (
                      <Image src={entry.anime.posterUrl} alt="" fill sizes="80px" className="object-cover" />
                    ) : null}
                  </span>

                  <div className="min-w-56 flex-1 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded bg-brand text-[12px] font-bold text-white">
                        {index + 1}
                      </span>
                      <p className="text-[13.5px] font-semibold text-ink">{entry.anime.titleEnglish}</p>
                    </div>

                    <label className="block">
                      <Label>Headline</Label>
                      <input
                        defaultValue={entry.headline ?? ''}
                        onBlur={(e) => void upsert({ animeId: entry.animeId, headline: e.target.value })}
                        placeholder={entry.anime.titleEnglish}
                        className={adminInput}
                      />
                    </label>

                    <label className="block">
                      <Label>Tagline</Label>
                      <input
                        defaultValue={entry.subtitle ?? ''}
                        onBlur={(e) => void upsert({ animeId: entry.animeId, subtitle: e.target.value })}
                        placeholder="A short line under the title"
                        className={adminInput}
                      />
                    </label>

                    <label className="block">
                      <Label>Button label</Label>
                      <input
                        defaultValue={entry.ctaLabel ?? 'Watch Now'}
                        onBlur={(e) => void upsert({ animeId: entry.animeId, ctaLabel: e.target.value })}
                        className={adminInput}
                      />
                    </label>
                  </div>

                  <div className="flex shrink-0 flex-col gap-1.5">
                    <Button size="sm" variant="secondary" disabled={index === 0} onClick={() => void move(entry, -1)}>
                      ↑ Up
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={index === entries.length - 1}
                      onClick={() => void move(entry, 1)}
                    >
                      ↓ Down
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => void remove(entry)}>
                      Remove
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
