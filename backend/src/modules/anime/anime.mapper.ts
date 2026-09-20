import { Prisma } from '@prisma/client';

/**
 * Shapes returned to the frontend. Kept in one place so the card contract stays
 * identical everywhere a grid is rendered.
 */
export const animeCardSelect = {
  id: true,
  slug: true,
  titleEnglish: true,
  titleJapanese: true,
  posterUrl: true,
  type: true,
  status: true,
  score: true,
  scoreCount: true,
  releaseYear: true,
  season: true,
  totalEpisodes: true,
  subEpisodeCount: true,
  dubEpisodeCount: true,
  durationMinutes: true,
  ageRating: true,
  viewCount: true,
  updatedAt: true,
  genres: { select: { genre: { select: { name: true, slug: true } } } },
} satisfies Prisma.AnimeSelect;

export type AnimeCardRow = Prisma.AnimeGetPayload<{ select: typeof animeCardSelect }>;

export interface AnimeCard {
  id: string;
  slug: string;
  title: string;
  titleEnglish: string;
  titleJapanese: string | null;
  posterUrl: string | null;
  type: AnimeCardRow['type'];
  status: AnimeCardRow['status'];
  score: number;
  scoreCount: number;
  releaseYear: number | null;
  season: AnimeCardRow['season'];
  totalEpisodes: number | null;
  subCount: number;
  dubCount: number;
  durationMinutes: number | null;
  ageRating: AnimeCardRow['ageRating'];
  viewCount: number;
  genres: Array<{ name: string; slug: string }>;
  updatedAt: Date;
}

export function toAnimeCard(row: AnimeCardRow): AnimeCard {
  return {
    id: row.id,
    slug: row.slug,
    title: row.titleEnglish,
    titleEnglish: row.titleEnglish,
    titleJapanese: row.titleJapanese,
    posterUrl: row.posterUrl,
    type: row.type,
    status: row.status,
    score: Number(row.score),
    scoreCount: row.scoreCount,
    releaseYear: row.releaseYear,
    season: row.season,
    totalEpisodes: row.totalEpisodes,
    subCount: row.subEpisodeCount,
    dubCount: row.dubEpisodeCount,
    durationMinutes: row.durationMinutes,
    ageRating: row.ageRating,
    viewCount: row.viewCount,
    genres: row.genres.map((g) => g.genre),
    updatedAt: row.updatedAt,
  };
}

export const animeDetailInclude = {
  studio: true,
  genres: { select: { genre: true } },
  producers: { select: { producer: true } },
  titles: true,
  relationsFrom: {
    include: { relatedAnime: { select: animeCardSelect } },
  },
} satisfies Prisma.AnimeInclude;
