import { Injectable } from '@nestjs/common';
import { PublishStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Genres, studios and producers. Grouped into one module because they share the
 * same shape and are always fetched together to build the navigation menus.
 */
@Injectable()
export class TaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  async genres() {
    const genres = await this.prisma.genre.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            anime: { where: { anime: { publishStatus: PublishStatus.PUBLISHED, deletedAt: null } } },
          },
        },
      },
    });

    return genres.map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      color: g.color,
      description: g.description,
      animeCount: g._count.anime,
    }));
  }

  async studios(search?: string, limit = 200) {
    return this.prisma.studio.findMany({
      where: search ? { name: { contains: search, mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
      take: limit,
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        _count: {
          select: { anime: { where: { publishStatus: PublishStatus.PUBLISHED, deletedAt: null } } },
        },
      },
    });
  }

  async producers(search?: string, limit = 200) {
    return this.prisma.producer.findMany({
      where: search ? { name: { contains: search, mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
      take: limit,
      select: {
        id: true,
        name: true,
        slug: true,
        _count: {
          select: { anime: { where: { anime: { publishStatus: PublishStatus.PUBLISHED, deletedAt: null } } } },
        },
      },
    });
  }

  /** Distinct release years present in the catalogue, for the filter dropdown. */
  async years(): Promise<number[]> {
    const rows = await this.prisma.anime.findMany({
      where: { publishStatus: PublishStatus.PUBLISHED, deletedAt: null, releaseYear: { not: null } },
      distinct: ['releaseYear'],
      select: { releaseYear: true },
      orderBy: { releaseYear: 'desc' },
    });
    return rows.map((r) => r.releaseYear!).filter(Boolean);
  }
}
