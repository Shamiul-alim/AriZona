import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PublishStatus, WatchStatus } from '@prisma/client';
import { paginate } from 'src/common/dto/pagination.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { animeCardSelect, toAnimeCard } from '../anime/anime.mapper';

@Injectable()
export class WatchlistService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, status: WatchStatus | undefined, page: number, limit: number) {
    const where: Prisma.WatchlistEntryWhereInput = {
      userId,
      ...(status ? { status } : {}),
      anime: { deletedAt: null },
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.watchlistEntry.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { anime: { select: animeCardSelect } },
      }),
      this.prisma.watchlistEntry.count({ where }),
    ]);

    return paginate(
      rows.map((r) => ({
        id: r.id,
        status: r.status,
        progressEpisodes: r.progressEpisodes,
        note: r.note,
        updatedAt: r.updatedAt,
        anime: toAnimeCard(r.anime),
      })),
      total,
      page,
      limit,
    );
  }

  /** Per-status totals for the profile tab badges. */
  async counts(userId: string): Promise<Record<WatchStatus, number>> {
    const grouped = await this.prisma.watchlistEntry.groupBy({
      by: ['status'],
      where: { userId },
      _count: { _all: true },
    });
    const base = Object.fromEntries(
      Object.values(WatchStatus).map((s) => [s, 0]),
    ) as Record<WatchStatus, number>;
    for (const row of grouped) base[row.status] = row._count._all;
    return base;
  }

  async upsert(userId: string, animeSlug: string, status: WatchStatus, progressEpisodes?: number) {
    const anime = await this.requireAnime(animeSlug);

    const entry = await this.prisma.watchlistEntry.upsert({
      where: { userId_animeId: { userId, animeId: anime.id } },
      create: { userId, animeId: anime.id, status, progressEpisodes: progressEpisodes ?? 0 },
      update: { status, ...(progressEpisodes !== undefined ? { progressEpisodes } : {}) },
    });
    return { status: entry.status, progressEpisodes: entry.progressEpisodes };
  }

  async remove(userId: string, animeSlug: string) {
    const anime = await this.requireAnime(animeSlug);
    await this.prisma.watchlistEntry.deleteMany({ where: { userId, animeId: anime.id } });
    return { removed: true };
  }

  async toggleFavorite(userId: string, animeSlug: string) {
    const anime = await this.requireAnime(animeSlug);
    const existing = await this.prisma.favorite.findUnique({
      where: { userId_animeId: { userId, animeId: anime.id } },
    });

    if (existing) {
      await this.prisma.$transaction([
        this.prisma.favorite.delete({ where: { id: existing.id } }),
        this.prisma.anime.update({
          where: { id: anime.id },
          data: { favoriteCount: { decrement: 1 } },
        }),
      ]);
      return { isFavorite: false };
    }

    await this.prisma.$transaction([
      this.prisma.favorite.create({ data: { userId, animeId: anime.id } }),
      this.prisma.anime.update({ where: { id: anime.id }, data: { favoriteCount: { increment: 1 } } }),
    ]);
    return { isFavorite: true };
  }

  async favorites(userId: string, page: number, limit: number) {
    const where: Prisma.FavoriteWhereInput = { userId, anime: { deletedAt: null } };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.favorite.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { anime: { select: animeCardSelect } },
      }),
      this.prisma.favorite.count({ where }),
    ]);
    return paginate(rows.map((r) => toAnimeCard(r.anime)), total, page, limit);
  }

  private async requireAnime(slug: string) {
    const anime = await this.prisma.anime.findFirst({
      where: { slug, deletedAt: null, publishStatus: PublishStatus.PUBLISHED },
      select: { id: true },
    });
    if (!anime) throw new NotFoundException(`No anime found at "${slug}"`);
    return anime;
  }
}
