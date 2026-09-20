import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PublishStatus } from '@prisma/client';
import { paginate } from 'src/common/dto/pagination.dto';
import { uniqueSlug } from 'src/common/utils/slug.util';
import { PrismaService } from 'src/prisma/prisma.service';
import { AdminAnimeQueryDto, CreateAnimeDto, UpdateAnimeDto } from './dto/admin-anime.dto';

@Injectable()
export class AdminAnimeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminAnimeQueryDto, page: number, limit: number) {
    const where: Prisma.AnimeWhereInput = {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.publishStatus ? { publishStatus: query.publishStatus } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.q
        ? {
            OR: [
              { titleEnglish: { contains: query.q, mode: 'insensitive' } },
              { titleJapanese: { contains: query.q, mode: 'insensitive' } },
              { slug: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.anime.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          slug: true,
          titleEnglish: true,
          titleJapanese: true,
          posterUrl: true,
          type: true,
          status: true,
          publishStatus: true,
          releaseYear: true,
          score: true,
          viewCount: true,
          isFeatured: true,
          deletedAt: true,
          updatedAt: true,
          _count: { select: { episodes: { where: { deletedAt: null } } } },
        },
      }),
      this.prisma.anime.count({ where }),
    ]);

    return paginate(
      rows.map((r) => ({ ...r, score: Number(r.score), episodeCount: r._count.episodes })),
      total,
      page,
      limit,
    );
  }

  async findOne(id: string) {
    const anime = await this.prisma.anime.findUnique({
      where: { id },
      include: {
        genres: { select: { genreId: true } },
        producers: { select: { producerId: true } },
        titles: true,
        studio: true,
        relationsFrom: { include: { relatedAnime: { select: { id: true, titleEnglish: true, posterUrl: true } } } },
      },
    });
    if (!anime) throw new NotFoundException('Anime not found');

    return {
      ...anime,
      score: Number(anime.score),
      genreIds: anime.genres.map((g) => g.genreId),
      producerIds: anime.producers.map((p) => p.producerId),
      genres: undefined,
      producers: undefined,
    };
  }

  async create(dto: CreateAnimeDto) {
    const slug = await uniqueSlug(dto.slug || dto.titleEnglish, (candidate) => this.slugTaken(candidate));

    const anime = await this.prisma.anime.create({
      data: {
        ...this.scalarFields(dto),
        titleEnglish: dto.titleEnglish,
        slug,
        ...(dto.genreIds?.length
          ? { genres: { create: dto.genreIds.map((genreId) => ({ genreId })) } }
          : {}),
        ...(dto.producerIds?.length
          ? { producers: { create: dto.producerIds.map((producerId) => ({ producerId })) } }
          : {}),
        ...(dto.alternativeTitles?.length
          ? { titles: { create: dto.alternativeTitles.map((t) => ({ title: t.title, kind: t.kind })) } }
          : {}),
      },
    });

    if (dto.relations?.length) await this.replaceRelations(anime.id, dto.relations);
    await this.syncFeatured(anime.id, dto.isFeatured ?? false);
    return this.findOne(anime.id);
  }

  async update(id: string, dto: UpdateAnimeDto) {
    const existing = await this.prisma.anime.findUnique({ where: { id }, select: { id: true, slug: true } });
    if (!existing) throw new NotFoundException('Anime not found');

    const slug =
      dto.slug && dto.slug !== existing.slug
        ? await uniqueSlug(dto.slug, (candidate) => this.slugTaken(candidate, id))
        : existing.slug;

    await this.prisma.$transaction(async (tx) => {
      await tx.anime.update({
        where: { id },
        data: { ...this.scalarFields(dto), slug },
      });

      // Join rows are replaced wholesale — simpler and safer than diffing, and
      // the sets involved are tiny.
      if (dto.genreIds) {
        await tx.animeGenre.deleteMany({ where: { animeId: id } });
        if (dto.genreIds.length) {
          await tx.animeGenre.createMany({
            data: dto.genreIds.map((genreId) => ({ animeId: id, genreId })),
            skipDuplicates: true,
          });
        }
      }
      if (dto.producerIds) {
        await tx.animeProducer.deleteMany({ where: { animeId: id } });
        if (dto.producerIds.length) {
          await tx.animeProducer.createMany({
            data: dto.producerIds.map((producerId) => ({ animeId: id, producerId })),
            skipDuplicates: true,
          });
        }
      }
      if (dto.alternativeTitles) {
        await tx.animeTitle.deleteMany({ where: { animeId: id } });
        if (dto.alternativeTitles.length) {
          await tx.animeTitle.createMany({
            data: dto.alternativeTitles.map((t) => ({ animeId: id, title: t.title, kind: t.kind })),
            skipDuplicates: true,
          });
        }
      }
    });

    if (dto.relations) await this.replaceRelations(id, dto.relations);
    if (dto.isFeatured !== undefined) await this.syncFeatured(id, dto.isFeatured);

    return this.findOne(id);
  }

  /** Soft delete, so watch history and reports referencing it stay coherent. */
  async remove(id: string) {
    await this.prisma.anime.update({
      where: { id },
      data: { deletedAt: new Date(), publishStatus: PublishStatus.ARCHIVED },
    });
    await this.prisma.featuredAnime.deleteMany({ where: { animeId: id } });
    return { deleted: true };
  }

  async restore(id: string) {
    await this.prisma.anime.update({
      where: { id },
      data: { deletedAt: null, publishStatus: PublishStatus.DRAFT },
    });
    return { restored: true };
  }

  /**
   * Recomputes the SUB/DUB episode counters shown on cards. Called after any
   * episode change so the badges never drift from reality.
   */
  async refreshCounters(animeId: string) {
    const [sub, dub, total] = await this.prisma.$transaction([
      this.prisma.episode.count({
        where: { animeId, deletedAt: null, publishStatus: PublishStatus.PUBLISHED, hasSub: true },
      }),
      this.prisma.episode.count({
        where: { animeId, deletedAt: null, publishStatus: PublishStatus.PUBLISHED, hasDub: true },
      }),
      this.prisma.episode.count({
        where: { animeId, deletedAt: null, publishStatus: PublishStatus.PUBLISHED },
      }),
    ]);

    const anime = await this.prisma.anime.findUnique({
      where: { id: animeId },
      select: { totalEpisodes: true },
    });

    await this.prisma.anime.update({
      where: { id: animeId },
      data: {
        subEpisodeCount: sub,
        dubEpisodeCount: dub,
        // Only fill totalEpisodes automatically when the admin has not set it.
        ...(anime?.totalEpisodes ? {} : { totalEpisodes: total }),
      },
    });
  }

  private async replaceRelations(animeId: string, relations: Array<{ relatedAnimeId: string; kind: Prisma.AnimeRelationCreateManyInput['kind'] }>) {
    await this.prisma.animeRelation.deleteMany({ where: { animeId } });
    const valid = relations.filter((r) => r.relatedAnimeId !== animeId);
    if (valid.length === 0) return;
    await this.prisma.animeRelation.createMany({
      data: valid.map((r) => ({ animeId, relatedAnimeId: r.relatedAnimeId, kind: r.kind })),
      skipDuplicates: true,
    });
  }

  /** Keeps the homepage slider table in step with the isFeatured flag. */
  private async syncFeatured(animeId: string, isFeatured: boolean) {
    if (isFeatured) {
      const count = await this.prisma.featuredAnime.count();
      await this.prisma.featuredAnime.upsert({
        where: { animeId },
        create: { animeId, order: count },
        update: { isActive: true },
      });
    } else {
      await this.prisma.featuredAnime.deleteMany({ where: { animeId } });
    }
  }

  private async slugTaken(slug: string, exceptId?: string): Promise<boolean> {
    const row = await this.prisma.anime.findFirst({
      where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    return Boolean(row);
  }

  private scalarFields(dto: CreateAnimeDto | UpdateAnimeDto) {
    return {
      ...(dto.titleEnglish !== undefined ? { titleEnglish: dto.titleEnglish } : {}),
      titleJapanese: dto.titleJapanese ?? null,
      titleRomaji: dto.titleRomaji ?? null,
      synopsis: dto.synopsis ?? null,
      posterUrl: dto.posterUrl ?? null,
      bannerUrl: dto.bannerUrl ?? null,
      trailerUrl: dto.trailerUrl ?? null,
      ...(dto.type ? { type: dto.type } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      season: dto.season ?? null,
      releaseYear: dto.releaseYear ?? null,
      airStartDate: dto.airStartDate ? new Date(dto.airStartDate) : null,
      airEndDate: dto.airEndDate ? new Date(dto.airEndDate) : null,
      ageRating: dto.ageRating ?? null,
      source: dto.source ?? null,
      durationMinutes: dto.durationMinutes ?? null,
      totalEpisodes: dto.totalEpisodes ?? null,
      studioId: dto.studioId ?? null,
      ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
      ...(dto.isTrending !== undefined ? { isTrending: dto.isTrending } : {}),
      ...(dto.publishStatus ? { publishStatus: dto.publishStatus } : {}),
      seoTitle: dto.seoTitle ?? null,
      seoDescription: dto.seoDescription ?? null,
      malId: dto.malId ?? null,
      anilistId: dto.anilistId ?? null,
    };
  }
}
