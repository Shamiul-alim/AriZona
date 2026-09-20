import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PublishStatus } from '@prisma/client';
import type { Request } from 'express';
import { visitorFingerprint } from 'src/common/utils/crypto.util';
import { AppConfigService } from 'src/config/app-config.service';
import { PrismaService } from 'src/prisma/prisma.service';

/** A repeat visit inside this window does not count again. */
const DEDUPE_WINDOW_MS = 30 * 60 * 1000;

/**
 * View counting with cheap abuse resistance: a pseudonymous fingerprint
 * (hashed IP + user agent + server secret) may only register one view per title
 * per 30 minutes. It is not bulletproof against a determined attacker, but it
 * stops a refresh loop from inflating the charts, and no raw IP is ever stored.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async recordAnimeView(animeId: string, req: Request, userId?: string): Promise<void> {
    try {
      const visitorHash = this.fingerprint(req);
      const since = new Date(Date.now() - DEDUPE_WINDOW_MS);

      const recent = await this.prisma.animeView.findFirst({
        where: { animeId, visitorHash, createdAt: { gte: since } },
        select: { id: true },
      });
      if (recent) return;

      const day = startOfDay();
      await this.prisma.$transaction([
        this.prisma.animeView.create({ data: { animeId, userId, visitorHash } }),
        this.prisma.anime.update({ where: { id: animeId }, data: { viewCount: { increment: 1 } } }),
        this.prisma.animeViewStat.upsert({
          where: { animeId_day: { animeId, day } },
          create: { animeId, day, views: 1 },
          update: { views: { increment: 1 } },
        }),
      ]);
    } catch (error) {
      this.logger.warn(`Could not record anime view: ${(error as Error).message}`);
    }
  }

  async recordEpisodeView(episodeId: string, animeId: string, req: Request, userId?: string): Promise<void> {
    try {
      const visitorHash = this.fingerprint(req);
      const since = new Date(Date.now() - DEDUPE_WINDOW_MS);

      const recent = await this.prisma.episodeView.findFirst({
        where: { episodeId, visitorHash, createdAt: { gte: since } },
        select: { id: true },
      });
      if (recent) return;

      const day = startOfDay();
      await this.prisma.$transaction([
        this.prisma.episodeView.create({ data: { episodeId, userId, visitorHash } }),
        this.prisma.episode.update({ where: { id: episodeId }, data: { viewCount: { increment: 1 } } }),
        this.prisma.episodeViewStat.upsert({
          where: { episodeId_day: { episodeId, day } },
          create: { episodeId, day, views: 1 },
          update: { views: { increment: 1 } },
        }),
        this.prisma.anime.update({ where: { id: animeId }, data: { viewCount: { increment: 1 } } }),
        this.prisma.animeViewStat.upsert({
          where: { animeId_day: { animeId, day } },
          create: { animeId, day, views: 1 },
          update: { views: { increment: 1 } },
        }),
      ]);
    } catch (error) {
      this.logger.warn(`Could not record episode view: ${(error as Error).message}`);
    }
  }

  /**
   * Recomputes the rolling popularity score used for "Trending" ordering.
   * Weights recent views most heavily, with score and favourites as tiebreakers.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async refreshPopularity(): Promise<void> {
    try {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      since.setDate(since.getDate() - 6);

      await this.prisma.$executeRaw`
        UPDATE "anime" a
        SET "popularity" = sub.score
        FROM (
          SELECT an."id",
                 COALESCE(w.views, 0) * 10
                   + COALESCE(a2."favoriteCount", 0) * 5
                   + (COALESCE(a2."score", 0) * COALESCE(a2."scoreCount", 0))::int
                   + COALESCE(a2."viewCount", 0) / 10 AS score
          FROM "anime" an
          JOIN "anime" a2 ON a2."id" = an."id"
          LEFT JOIN (
            SELECT "animeId", SUM("views")::int AS views
            FROM "anime_view_stats"
            WHERE "day" >= ${since}
            GROUP BY "animeId"
          ) w ON w."animeId" = an."id"
        ) sub
        WHERE a."id" = sub."id"
      `;
      this.logger.log('Popularity scores refreshed');
    } catch (error) {
      this.logger.error(`Popularity refresh failed: ${(error as Error).message}`);
    }
  }

  /** Raw view rows are only needed for the dedupe window; roll-ups keep history. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async pruneRawViews(): Promise<void> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [anime, episode] = await this.prisma.$transaction([
      this.prisma.animeView.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      this.prisma.episodeView.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    ]);
    this.logger.log(`Pruned ${anime.count + episode.count} raw view rows`);
  }

  async dashboardStats() {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const today = startOfDay();

    const [
      totalAnime,
      totalEpisodes,
      totalUsers,
      newUsersThisWeek,
      pendingReports,
      totalComments,
      pendingRequests,
      newContact,
      viewsToday,
      totalViews,
    ] = await this.prisma.$transaction([
      this.prisma.anime.count({ where: { deletedAt: null } }),
      this.prisma.episode.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, createdAt: { gte: weekAgo } } }),
      this.prisma.report.count({ where: { status: 'PENDING' } }),
      this.prisma.comment.count({ where: { isDeleted: false } }),
      this.prisma.animeRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.contactMessage.count({ where: { status: 'NEW' } }),
      this.prisma.animeViewStat.aggregate({ where: { day: today }, _sum: { views: true } }),
      this.prisma.anime.aggregate({ _sum: { viewCount: true } }),
    ]);

    return {
      totalAnime,
      totalEpisodes,
      totalUsers,
      newUsersThisWeek,
      pendingReports,
      totalComments,
      pendingRequests,
      newContactMessages: newContact,
      viewsToday: viewsToday._sum.views ?? 0,
      totalViews: totalViews._sum.viewCount ?? 0,
    };
  }

  /** Daily view totals for the admin dashboard chart. */
  async viewSeries(days = 30) {
    const since = startOfDay();
    since.setDate(since.getDate() - (days - 1));

    const rows = await this.prisma.animeViewStat.groupBy({
      by: ['day'],
      where: { day: { gte: since } },
      _sum: { views: true },
      orderBy: { day: 'asc' },
    });

    const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r._sum.views ?? 0]));
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      return { date: key, views: byDay.get(key) ?? 0 };
    });
  }

  async popularAnime(limit = 8) {
    return this.prisma.anime.findMany({
      where: { publishStatus: PublishStatus.PUBLISHED, deletedAt: null },
      orderBy: { viewCount: 'desc' },
      take: limit,
      select: { id: true, slug: true, titleEnglish: true, posterUrl: true, viewCount: true },
    });
  }

  private fingerprint(req: Request): string {
    return visitorFingerprint(
      req.ip,
      req.headers['user-agent'],
      this.config.values.media.signingSecret,
    );
  }
}

function startOfDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
