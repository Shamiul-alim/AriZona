import { Injectable, NotFoundException } from '@nestjs/common';
import { MediaKind, Prisma, PublishStatus } from '@prisma/client';
import { PaginatedResult, paginate } from 'src/common/dto/pagination.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { AnimeQueryDto, AnimeSort } from './dto/anime-query.dto';
import { AnimeCard, animeCardSelect, animeDetailInclude, toAnimeCard } from './anime.mapper';

export type TrendingPeriod = 'day' | 'week' | 'month' | 'all';

const PUBLISHED: Prisma.AnimeWhereInput = { publishStatus: PublishStatus.PUBLISHED, deletedAt: null };

@Injectable()
export class AnimeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AnimeQueryDto, userId?: string): Promise<PaginatedResult<AnimeCard>> {
    const where = await this.buildWhere(query, userId);
    const orderBy = this.buildOrderBy(query.sort ?? AnimeSort.DEFAULT);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.anime.findMany({
        where,
        orderBy,
        skip: query.skip,
        take: query.limit,
        select: animeCardSelect,
      }),
      this.prisma.anime.count({ where }),
    ]);

    return paginate(rows.map(toAnimeCard), total, query.page, query.limit);
  }

  async findBySlug(slug: string, userId?: string) {
    const anime = await this.prisma.anime.findFirst({
      where: { slug, ...PUBLISHED },
      include: animeDetailInclude,
    });
    if (!anime) throw new NotFoundException(`No anime found at "${slug}"`);

    const [episodeCount, userState] = await Promise.all([
      this.prisma.episode.count({
        where: { animeId: anime.id, publishStatus: PublishStatus.PUBLISHED, deletedAt: null },
      }),
      userId ? this.userStateFor(anime.id, userId) : Promise.resolve(null),
    ]);

    return {
      ...anime,
      score: Number(anime.score),
      genres: anime.genres.map((g) => g.genre),
      producers: anime.producers.map((p) => p.producer),
      related: anime.relationsFrom.map((r) => ({ kind: r.kind, anime: toAnimeCard(r.relatedAnime) })),
      publishedEpisodeCount: episodeCount,
      userState,
      relationsFrom: undefined,
    };
  }

  /** Powers the "Random" navigation entry. */
  async random(): Promise<{ slug: string } | null> {
    const total = await this.prisma.anime.count({ where: PUBLISHED });
    if (total === 0) return null;
    const skip = Math.floor(Math.random() * total);
    const [row] = await this.prisma.anime.findMany({
      where: PUBLISHED,
      skip,
      take: 1,
      select: { slug: true },
    });
    return row ?? null;
  }

  /**
   * Trending is computed from the daily view rollup, so "this month" is one
   * indexed scan over ~30 rows per title rather than a count over raw views.
   */
  async trending(period: TrendingPeriod, limit = 12): Promise<AnimeCard[]> {
    if (period === 'all') {
      const rows = await this.prisma.anime.findMany({
        where: PUBLISHED,
        orderBy: [{ viewCount: 'desc' }, { score: 'desc' }],
        take: limit,
        select: animeCardSelect,
      });
      return rows.map(toAnimeCard);
    }

    const since = periodStart(period);
    const grouped = await this.prisma.animeViewStat.groupBy({
      by: ['animeId'],
      where: { day: { gte: since } },
      _sum: { views: true },
      orderBy: { _sum: { views: 'desc' } },
      take: limit,
    });

    if (grouped.length === 0) {
      // A brand-new install has no view history yet; fall back to score so the
      // homepage is never empty.
      const rows = await this.prisma.anime.findMany({
        where: PUBLISHED,
        orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
        take: limit,
        select: animeCardSelect,
      });
      return rows.map(toAnimeCard);
    }

    const ids = grouped.map((g) => g.animeId);
    const rows = await this.prisma.anime.findMany({
      where: { id: { in: ids }, ...PUBLISHED },
      select: animeCardSelect,
    });

    const order = new Map(ids.map((id, index) => [id, index]));
    return rows
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map(toAnimeCard);
  }

  /** Top rated within a window, requiring a minimum number of votes. */
  async topAnime(period: TrendingPeriod, limit = 10): Promise<AnimeCard[]> {
    if (period === 'all') {
      const rows = await this.prisma.anime.findMany({
        where: { ...PUBLISHED, scoreCount: { gte: 1 } },
        orderBy: [{ score: 'desc' }, { scoreCount: 'desc' }],
        take: limit,
        select: animeCardSelect,
      });
      return rows.map(toAnimeCard);
    }
    return this.trending(period, limit);
  }

  async featured() {
    // Card fields plus the three extras the hero actually renders. The detail
    // include also pulled producers, alternative titles and related titles —
    // none of which appear in the hero, and each cost its own round trip to a
    // database in another region.
    const rows = await this.prisma.featuredAnime.findMany({
      where: { isActive: true, anime: PUBLISHED },
      orderBy: { order: 'asc' },
      include: {
        anime: {
          select: {
            ...animeCardSelect,
            synopsis: true,
            bannerUrl: true,
            studio: { select: { name: true } },
          },
        },
      },
      take: 8,
    });

    return rows.map((row) => ({
      id: row.id,
      headline: row.headline,
      subtitle: row.subtitle,
      ctaLabel: row.ctaLabel,
      backdropUrl: row.backdropUrl ?? row.anime.bannerUrl,
      anime: {
        ...toAnimeCard(row.anime),
        synopsis: row.anime.synopsis,
        bannerUrl: row.anime.bannerUrl,
        studio: row.anime.studio?.name ?? null,
      },
    }));
  }

  /**
   * Content-based similarity over our own catalogue — no third-party metadata
   * service is contacted. Manual curation wins when present; otherwise titles
   * are scored by shared genres, then studio, then type, then popularity.
   */
  async recommendations(animeId: string, limit = 12): Promise<AnimeCard[]> {
    const manual = await this.prisma.animeRecommendation.findMany({
      where: { animeId, recommendedAnime: PUBLISHED },
      orderBy: { weight: 'desc' },
      take: limit,
      include: { recommendedAnime: { select: animeCardSelect } },
    });
    if (manual.length >= limit) {
      return manual.map((m) => toAnimeCard(m.recommendedAnime));
    }

    const source = await this.prisma.anime.findUnique({
      where: { id: animeId },
      select: { id: true, studioId: true, type: true, genres: { select: { genreId: true } } },
    });
    if (!source) return manual.map((m) => toAnimeCard(m.recommendedAnime));

    const genreIds = source.genres.map((g) => g.genreId);
    const excluded = [animeId, ...manual.map((m) => m.recommendedAnimeId)];

    const candidates = await this.prisma.anime.findMany({
      where: {
        ...PUBLISHED,
        id: { notIn: excluded },
        OR: [
          genreIds.length ? { genres: { some: { genreId: { in: genreIds } } } } : {},
          source.studioId ? { studioId: source.studioId } : {},
        ].filter((clause) => Object.keys(clause).length > 0),
      },
      select: { ...animeCardSelect, studioId: true, genres: { select: { genreId: true, genre: { select: { name: true, slug: true } } } } },
      take: 80,
      orderBy: { popularity: 'desc' },
    });

    const scored = candidates
      .map((candidate) => {
        const shared = candidate.genres.filter((g) => genreIds.includes(g.genreId)).length;
        let score = shared * 10;
        if (candidate.studioId && candidate.studioId === source.studioId) score += 6;
        if (candidate.type === source.type) score += 3;
        score += Math.min(5, Number(candidate.score) / 2);
        return { candidate, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit - manual.length);

    return [
      ...manual.map((m) => toAnimeCard(m.recommendedAnime)),
      ...scored.map((s) => toAnimeCard(s.candidate)),
    ];
  }

  /** Counts per starting letter, for the A-Z browser's badges. */
  async azIndex(): Promise<Array<{ letter: string; count: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ letter: string; count: bigint }>>`
      SELECT
        CASE
          WHEN UPPER(LEFT("titleEnglish", 1)) BETWEEN 'A' AND 'Z' THEN UPPER(LEFT("titleEnglish", 1))
          WHEN LEFT("titleEnglish", 1) BETWEEN '0' AND '9' THEN '0-9'
          ELSE '#'
        END AS letter,
        COUNT(*) AS count
      FROM "anime"
      WHERE "publishStatus" = 'PUBLISHED' AND "deletedAt" IS NULL
      GROUP BY 1
      ORDER BY 1
    `;
    return rows.map((r) => ({ letter: r.letter, count: Number(r.count) }));
  }

  private async userStateFor(animeId: string, userId: string) {
    const [watchlist, favorite, rating, progress] = await this.prisma.$transaction([
      this.prisma.watchlistEntry.findUnique({ where: { userId_animeId: { userId, animeId } } }),
      this.prisma.favorite.findUnique({ where: { userId_animeId: { userId, animeId } } }),
      this.prisma.rating.findUnique({ where: { userId_animeId: { userId, animeId } } }),
      this.prisma.watchProgress.findFirst({
        where: { userId, animeId },
        orderBy: { lastWatchedAt: 'desc' },
        include: { episode: { select: { number: true, title: true } } },
      }),
    ]);

    return {
      watchStatus: watchlist?.status ?? null,
      progressEpisodes: watchlist?.progressEpisodes ?? 0,
      isFavorite: Boolean(favorite),
      rating: rating?.score ?? null,
      lastWatched: progress
        ? {
            episodeId: progress.episodeId,
            episodeNumber: Number(progress.episode.number),
            positionSeconds: progress.positionSeconds,
            percent: progress.percent,
          }
        : null,
    };
  }

  private async buildWhere(query: AnimeQueryDto, userId?: string): Promise<Prisma.AnimeWhereInput> {
    const and: Prisma.AnimeWhereInput[] = [PUBLISHED];

    if (query.q) {
      and.push({
        OR: [
          { titleEnglish: { contains: query.q, mode: 'insensitive' } },
          { titleJapanese: { contains: query.q, mode: 'insensitive' } },
          { titleRomaji: { contains: query.q, mode: 'insensitive' } },
          { titles: { some: { title: { contains: query.q, mode: 'insensitive' } } } },
        ],
      });
    }

    if (query.genres?.length) {
      // Every selected genre must be present, not just one of them.
      and.push({
        AND: query.genres.map((slug) => ({ genres: { some: { genre: { slug } } } })),
      });
    }

    if (query.type?.length) and.push({ type: { in: query.type } });
    if (query.status?.length) and.push({ status: { in: query.status } });
    if (query.season) and.push({ season: query.season });
    if (query.year) and.push({ releaseYear: query.year });
    if (query.ageRating?.length) and.push({ ageRating: { in: query.ageRating } });
    if (query.source?.length) and.push({ source: { in: query.source } });
    if (query.studio) and.push({ studio: { slug: query.studio } });
    if (query.producer) and.push({ producers: { some: { producer: { slug: query.producer } } } });
    if (query.minScore !== undefined) and.push({ score: { gte: query.minScore } });

    if (query.language === MediaKind.SUB) and.push({ subEpisodeCount: { gt: 0 } });
    if (query.language === MediaKind.DUB) and.push({ dubEpisodeCount: { gt: 0 } });

    if (query.minEpisodes !== undefined) and.push({ totalEpisodes: { gte: query.minEpisodes } });
    if (query.maxEpisodes !== undefined) and.push({ totalEpisodes: { lte: query.maxEpisodes } });

    if (query.letter && query.letter !== 'all') {
      and.push(letterFilter(query.letter));
    }

    if (query.hideInList && userId) {
      const entries = await this.prisma.watchlistEntry.findMany({
        where: { userId },
        select: { animeId: true },
      });
      if (entries.length) {
        and.push({ id: { notIn: entries.map((e) => e.animeId) } });
      }
    }

    return { AND: and };
  }

  private buildOrderBy(sort: AnimeSort): Prisma.AnimeOrderByWithRelationInput[] {
    switch (sort) {
      case AnimeSort.LATEST_UPDATED:
        return [{ updatedAt: 'desc' }];
      case AnimeSort.LATEST_ADDED:
        return [{ createdAt: 'desc' }];
      case AnimeSort.SCORE:
        return [{ score: 'desc' }, { scoreCount: 'desc' }];
      case AnimeSort.NAME_ASC:
        return [{ titleEnglish: 'asc' }];
      case AnimeSort.NAME_DESC:
        return [{ titleEnglish: 'desc' }];
      case AnimeSort.RELEASE_DATE:
        return [{ airStartDate: 'desc' }, { releaseYear: 'desc' }];
      case AnimeSort.MOST_VIEWED:
        return [{ viewCount: 'desc' }];
      case AnimeSort.EPISODE_COUNT:
        return [{ totalEpisodes: 'desc' }];
      case AnimeSort.TRENDING:
        return [{ popularity: 'desc' }, { viewCount: 'desc' }];
      default:
        return [{ updatedAt: 'desc' }, { id: 'asc' }];
    }
  }
}

function letterFilter(letter: string): Prisma.AnimeWhereInput {
  if (letter === '0-9') {
    return {
      OR: Array.from({ length: 10 }, (_, d) => ({
        titleEnglish: { startsWith: String(d) },
      })),
    };
  }
  if (letter === '#') {
    // Anything that does not begin with a letter or a digit.
    return {
      NOT: {
        OR: [
          ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => ({
            titleEnglish: { startsWith: c, mode: Prisma.QueryMode.insensitive },
          })),
          ...Array.from({ length: 10 }, (_, d) => ({ titleEnglish: { startsWith: String(d) } })),
        ],
      },
    };
  }
  return { titleEnglish: { startsWith: letter, mode: 'insensitive' } };
}

function periodStart(period: Exclude<TrendingPeriod, 'all'>): Date {
  const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d;
}
