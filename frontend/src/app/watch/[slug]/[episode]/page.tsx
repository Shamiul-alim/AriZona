import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { apiFetch, apiFetchOrNull, qs } from '@/lib/api';
import { SITE_NAME, SITE_URL } from '@/lib/config';
import type { AnimeCard, EpisodeSummary, Paginated, WatchPayload } from '@/lib/types';
import { WatchClient } from '@/components/watch/WatchClient';

export const dynamic = 'force-dynamic';

/** Accepts "ep-12", "ep-7.5" or a bare "12". */
function parseEpisodeParam(value: string): number | null {
  const match = /^(?:ep-)?(\d+(?:\.\d+)?)$/i.exec(decodeURIComponent(value));
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; episode: string }>;
}): Promise<Metadata> {
  const { slug, episode } = await params;
  const number = parseEpisodeParam(episode);
  if (number === null) return { title: 'Not found' };

  const payload = await apiFetchOrNull<WatchPayload>(`/watch/${slug}/ep-${number}`, { revalidate: 60 });
  if (!payload) return { title: 'Not found' };

  const title = `${payload.anime.titleEnglish} Episode ${number}${
    payload.episode.title ? ` — ${payload.episode.title}` : ''
  }`;
  const description =
    payload.episode.description ??
    payload.anime.synopsis?.slice(0, 250) ??
    `Watch ${payload.anime.titleEnglish} episode ${number} online on ${SITE_NAME}.`;

  return {
    title,
    description,
    alternates: { canonical: `/watch/${slug}/ep-${number}` },
    openGraph: {
      type: 'video.episode',
      title,
      description,
      url: `${SITE_URL}/watch/${slug}/ep-${number}`,
      images: payload.episode.thumbnailUrl ? [{ url: payload.episode.thumbnailUrl }] : undefined,
    },
  };
}

export default async function WatchPage({
  params,
}: {
  params: Promise<{ slug: string; episode: string }>;
}) {
  const { slug, episode } = await params;
  const number = parseEpisodeParam(episode);
  if (number === null) notFound();

  const payload = await apiFetchOrNull<WatchPayload>(`/watch/${slug}/ep-${number}`, { revalidate: 60 });
  if (!payload) notFound();

  const [episodes, recommendations] = await Promise.all([
    apiFetch<Paginated<EpisodeSummary>>(`/anime/${slug}/episodes${qs({ limit: 500 })}`, { revalidate: 120 }).catch(() => ({
      data: [] as EpisodeSummary[],
      meta: { page: 1, limit: 0, total: 0, totalPages: 0, hasPrevious: false, hasNext: false },
    })),
    apiFetch<AnimeCard[]>(`/anime/${slug}/recommendations${qs({ limit: 12 })}`, { revalidate: 300 }).catch(() => []),
  ]);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TVEpisode',
    name: payload.episode.title ?? `Episode ${number}`,
    episodeNumber: number,
    partOfSeries: {
      '@type': 'TVSeries',
      name: payload.anime.titleEnglish,
      url: `${SITE_URL}/anime/${slug}`,
    },
    description: payload.episode.description ?? undefined,
    image: payload.episode.thumbnailUrl ?? undefined,
    datePublished: payload.episode.airDate ?? undefined,
    url: `${SITE_URL}/watch/${slug}/ep-${number}`,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <WatchClient payload={payload} episodes={episodes.data} recommendations={recommendations} />
    </>
  );
}
