import type { MetadataRoute } from 'next';
import { apiFetch, qs } from '@/lib/api';
import { SITE_URL } from '@/lib/config';
import type { AnimeCard, CommunityPostSummary, GenreRef, Paginated } from '@/lib/types';

export const revalidate = 3600;

/**
 * Sitemap covering the static pages, every published title and its episode
 * pages, plus genres and community threads.
 *
 * Episode URLs are generated from the recorded episode count rather than
 * fetched per title — one request per anime would make this endpoint
 * prohibitively slow on a large catalogue.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'hourly', priority: 1 },
    { url: `${SITE_URL}/browse`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE_URL}/az`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${SITE_URL}/community`, lastModified: now, changeFrequency: 'hourly', priority: 0.7 },
    { url: `${SITE_URL}/leaderboard`, lastModified: now, changeFrequency: 'daily', priority: 0.5 },
    { url: `${SITE_URL}/request`, lastModified: now, changeFrequency: 'weekly', priority: 0.4 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}/guides`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
  ];

  const [catalogue, genres, posts] = await Promise.all([
    collectAnime(),
    apiFetch<GenreRef[]>('/genres', { revalidate: 3600 }).catch(() => []),
    apiFetch<Paginated<CommunityPostSummary>>(`/community/posts${qs({ limit: 100, sort: 'newest' })}`, {
      revalidate: 3600,
    })
      .then((r) => r.data)
      .catch(() => []),
  ]);

  const animeRoutes: MetadataRoute.Sitemap = catalogue.flatMap((anime) => {
    const entries: MetadataRoute.Sitemap = [
      {
        url: `${SITE_URL}/anime/${anime.slug}`,
        lastModified: new Date(anime.updatedAt),
        changeFrequency: 'daily',
        priority: 0.8,
      },
    ];

    const episodeCount = Math.max(anime.subCount, anime.dubCount, anime.totalEpisodes ?? 0);
    for (let n = 1; n <= Math.min(episodeCount, 500); n += 1) {
      entries.push({
        url: `${SITE_URL}/watch/${anime.slug}/ep-${n}`,
        lastModified: new Date(anime.updatedAt),
        changeFrequency: 'weekly',
        priority: 0.6,
      });
    }
    return entries;
  });

  return [
    ...staticRoutes,
    ...genres.map((genre) => ({
      url: `${SITE_URL}/genres/${genre.slug}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.6,
    })),
    ...animeRoutes,
    ...posts.map((post) => ({
      url: `${SITE_URL}/community/${post.slug}`,
      lastModified: new Date(post.createdAt),
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
  ];
}

/** Pages through the catalogue, with a ceiling so the build cannot hang. */
async function collectAnime(): Promise<AnimeCard[]> {
  const all: AnimeCard[] = [];
  const limit = 100;

  for (let page = 1; page <= 20; page += 1) {
    try {
      const result = await apiFetch<Paginated<AnimeCard>>(`/anime${qs({ page, limit, sort: 'added' })}`, {
        revalidate: 3600,
      });
      all.push(...result.data);
      if (!result.meta.hasNext) break;
    } catch {
      break;
    }
  }
  return all;
}
