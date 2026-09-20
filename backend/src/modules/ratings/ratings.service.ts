import { Injectable, NotFoundException } from '@nestjs/common';
import { ManaEvent, PublishStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ManaService } from '../mana/mana.service';

@Injectable()
export class RatingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mana: ManaService,
  ) {}

  /** One active rating per user per title; submitting again updates it. */
  async rate(userId: string, animeSlug: string, score: number) {
    const anime = await this.requireAnime(animeSlug);

    const existing = await this.prisma.rating.findUnique({
      where: { userId_animeId: { userId, animeId: anime.id } },
    });

    await this.prisma.rating.upsert({
      where: { userId_animeId: { userId, animeId: anime.id } },
      create: { userId, animeId: anime.id, score },
      update: { score },
    });

    if (!existing) {
      await this.mana.award(userId, ManaEvent.RATING_SUBMITTED, {
        dedupeKey: `RATING:${anime.id}`,
        reason: 'Rated a title',
      });
    }

    return this.recalculate(anime.id);
  }

  async remove(userId: string, animeSlug: string) {
    const anime = await this.requireAnime(animeSlug);
    await this.prisma.rating.deleteMany({ where: { userId, animeId: anime.id } });
    return this.recalculate(anime.id);
  }

  async summary(animeSlug: string, userId?: string) {
    const anime = await this.requireAnime(animeSlug);

    const [aggregate, distribution, mine] = await Promise.all([
      this.prisma.rating.aggregate({
        where: { animeId: anime.id },
        _avg: { score: true },
        _count: { _all: true },
      }),
      this.prisma.rating.groupBy({
        by: ['score'],
        where: { animeId: anime.id },
        _count: { _all: true },
      }),
      userId
        ? this.prisma.rating.findUnique({ where: { userId_animeId: { userId, animeId: anime.id } } })
        : Promise.resolve(null),
    ]);

    const buckets = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, 0])) as Record<number, number>;
    for (const row of distribution) buckets[row.score] = row._count._all;

    return {
      average: Number((aggregate._avg.score ?? 0).toFixed(2)),
      count: aggregate._count._all,
      distribution: buckets,
      myRating: mine?.score ?? null,
    };
  }

  /** Writes the denormalised score back onto Anime so lists can sort by it. */
  private async recalculate(animeId: string) {
    const aggregate = await this.prisma.rating.aggregate({
      where: { animeId },
      _avg: { score: true },
      _count: { _all: true },
    });

    const average = Number((aggregate._avg.score ?? 0).toFixed(2));
    await this.prisma.anime.update({
      where: { id: animeId },
      data: { score: average, scoreCount: aggregate._count._all },
    });

    return { average, count: aggregate._count._all };
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
