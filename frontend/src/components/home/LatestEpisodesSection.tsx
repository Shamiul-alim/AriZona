'use client';

import { useEffect, useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import type { AnimeCard as AnimeCardType, LatestEpisode, Paginated } from '@/lib/types';
import { AnimeCard } from '@/components/anime/AnimeCard';
import { EpisodeCard, EpisodeCardSkeleton } from '@/components/anime/EpisodeCard';
import { SectionHeader, TabGroup } from '@/components/anime/SectionHeader';

type Tab = 'all' | 'sub' | 'dub' | 'trending' | 'random';

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'sub', label: 'Sub' },
  { value: 'dub', label: 'Dub' },
  { value: 'trending', label: 'Trending' },
  { value: 'random', label: 'Random' },
];

interface LatestEpisodesSectionProps {
  initial: LatestEpisode[];
}

/**
 * Latest Episodes rail. The All/Sub/Dub tabs fetch episodes; Trending and
 * Random switch to anime cards, because neither is episode-shaped.
 */
export function LatestEpisodesSection({ initial }: LatestEpisodesSectionProps) {
  const [tab, setTab] = useState<Tab>('all');
  const [episodes, setEpisodes] = useState<LatestEpisode[]>(initial);
  const [anime, setAnime] = useState<AnimeCardType[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tab === 'all') {
      setEpisodes(initial);
      setAnime([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const request =
      tab === 'sub' || tab === 'dub'
        ? apiFetch<Paginated<LatestEpisode>>(`/episodes/latest${qs({ filter: tab, limit: 12 })}`).then((res) => {
            if (cancelled) return;
            setEpisodes(res.data);
            setAnime([]);
          })
        : tab === 'trending'
          ? apiFetch<AnimeCardType[]>(`/anime/trending${qs({ period: 'week', limit: 12 })}`).then((res) => {
              if (cancelled) return;
              setAnime(res);
              setEpisodes([]);
            })
          : apiFetch<Paginated<AnimeCardType>>(`/anime${qs({ limit: 12, sort: 'default', page: randomPage() })}`).then(
              (res) => {
                if (cancelled) return;
                setAnime(res.data);
                setEpisodes([]);
              },
            );

    void request.catch(() => undefined).finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [tab, initial]);

  const showingAnime = tab === 'trending' || tab === 'random';

  return (
    <section>
      <SectionHeader title="Latest Episodes" href="/browse?sort=updated">
        <TabGroup tabs={TABS} active={tab} onChange={setTab} />
      </SectionHeader>

      {loading ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <EpisodeCardSkeleton key={i} />
          ))}
        </div>
      ) : showingAnime ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {anime.map((item) => (
            <AnimeCard key={item.id} anime={item} />
          ))}
        </div>
      ) : episodes.length === 0 ? (
        <p className="card-surface px-6 py-12 text-center text-[13px] text-ink-faint">
          No {tab === 'all' ? '' : tab.toUpperCase()} episodes published yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {episodes.map((episode) => (
            <EpisodeCard key={episode.id} episode={episode} />
          ))}
        </div>
      )}
    </section>
  );
}

function randomPage(): number {
  return 1 + Math.floor(Math.random() * 2);
}
