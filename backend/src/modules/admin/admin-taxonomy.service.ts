import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ManaEvent } from '@prisma/client';
import { paginate } from 'src/common/dto/pagination.dto';
import { toSlug, uniqueSlug } from 'src/common/utils/slug.util';
import { PrismaService } from 'src/prisma/prisma.service';

interface TaxonomyInput {
  name: string;
  description?: string;
  color?: string;
  logoUrl?: string;
  order?: number;
}

interface RankInput {
  name: string;
  requiredMana: number;
  icon?: string;
  color?: string;
  description?: string;
}

interface FeaturedInput {
  animeId: string;
  headline?: string;
  subtitle?: string;
  ctaLabel?: string;
  backdropUrl?: string;
  order?: number;
}

/** Genres, studios, producers, ranks, the Mana economy and the hero slider. */
@Injectable()
export class AdminTaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  async createGenre(dto: TaxonomyInput) {
    const slug = await uniqueSlug(dto.name, (s) => this.exists('genre', s));
    return this.prisma.genre.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description ?? null,
        color: dto.color ?? null,
        order: dto.order ?? 0,
      },
    });
  }

  updateGenre(id: string, dto: TaxonomyInput) {
    return this.prisma.genre.update({
      where: { id },
      data: {
        name: dto.name,
        slug: toSlug(dto.name),
        description: dto.description ?? null,
        color: dto.color ?? null,
        order: dto.order ?? 0,
      },
    });
  }

  async removeGenre(id: string) {
    const inUse = await this.prisma.animeGenre.count({ where: { genreId: id } });
    if (inUse > 0) {
      throw new BadRequestException(
        `This genre is still assigned to ${inUse} title(s). Remove it from them first.`,
      );
    }
    await this.prisma.genre.delete({ where: { id } });
    return { deleted: true };
  }

  async createStudio(dto: TaxonomyInput) {
    const slug = await uniqueSlug(dto.name, (s) => this.exists('studio', s));
    return this.prisma.studio.create({
      data: { name: dto.name, slug, description: dto.description ?? null, logoUrl: dto.logoUrl ?? null },
    });
  }

  updateStudio(id: string, dto: TaxonomyInput) {
    return this.prisma.studio.update({
      where: { id },
      data: {
        name: dto.name,
        slug: toSlug(dto.name),
        description: dto.description ?? null,
        logoUrl: dto.logoUrl ?? null,
      },
    });
  }

  async removeStudio(id: string) {
    // Titles keep existing; their studio reference is simply cleared.
    await this.prisma.anime.updateMany({ where: { studioId: id }, data: { studioId: null } });
    await this.prisma.studio.delete({ where: { id } });
    return { deleted: true };
  }

  async createProducer(dto: TaxonomyInput) {
    const slug = await uniqueSlug(dto.name, (s) => this.exists('producer', s));
    return this.prisma.producer.create({
      data: { name: dto.name, slug, description: dto.description ?? null },
    });
  }

  updateProducer(id: string, dto: TaxonomyInput) {
    return this.prisma.producer.update({
      where: { id },
      data: { name: dto.name, slug: toSlug(dto.name), description: dto.description ?? null },
    });
  }

  async removeProducer(id: string) {
    await this.prisma.animeProducer.deleteMany({ where: { producerId: id } });
    await this.prisma.producer.delete({ where: { id } });
    return { deleted: true };
  }

  manaRules() {
    return this.prisma.manaRule.findMany({ orderBy: { event: 'asc' } });
  }

  setManaRule(event: ManaEvent, amount: number, dailyLimit: number) {
    return this.prisma.manaRule.upsert({
      where: { event },
      create: { event, amount, dailyLimit },
      update: { amount, dailyLimit },
    });
  }

  ranks() {
    return this.prisma.rank.findMany({
      orderBy: { requiredMana: 'asc' },
      include: { _count: { select: { users: true } } },
    });
  }

  async createRank(dto: RankInput) {
    const slug = await uniqueSlug(dto.name, (s) => this.exists('rank', s));
    return this.prisma.rank.create({
      data: {
        name: dto.name,
        slug,
        requiredMana: dto.requiredMana,
        icon: dto.icon ?? null,
        color: dto.color ?? null,
        description: dto.description ?? null,
        order: dto.requiredMana,
      },
    });
  }

  updateRank(id: string, dto: RankInput) {
    return this.prisma.rank.update({
      where: { id },
      data: {
        name: dto.name,
        requiredMana: dto.requiredMana,
        icon: dto.icon ?? null,
        color: dto.color ?? null,
        description: dto.description ?? null,
        order: dto.requiredMana,
      },
    });
  }

  async removeRank(id: string) {
    const rank = await this.prisma.rank.findUnique({ where: { id } });
    if (!rank) throw new NotFoundException('Rank not found');
    if (rank.requiredMana === 0) {
      throw new BadRequestException('The starting rank cannot be deleted');
    }

    // Members drop to the highest remaining rank they still qualify for.
    const fallback = await this.prisma.rank.findFirst({
      where: { requiredMana: { lt: rank.requiredMana }, id: { not: id } },
      orderBy: { requiredMana: 'desc' },
    });
    await this.prisma.user.updateMany({
      where: { rankId: id },
      data: { rankId: fallback?.id ?? null },
    });
    await this.prisma.rank.delete({ where: { id } });
    return { deleted: true };
  }

  featured() {
    return this.prisma.featuredAnime.findMany({
      orderBy: { order: 'asc' },
      include: {
        anime: { select: { id: true, slug: true, titleEnglish: true, posterUrl: true, bannerUrl: true } },
      },
    });
  }

  async upsertFeatured(dto: FeaturedInput) {
    const anime = await this.prisma.anime.findUnique({
      where: { id: dto.animeId },
      select: { id: true },
    });
    if (!anime) throw new NotFoundException('Anime not found');

    const count = await this.prisma.featuredAnime.count();
    const entry = await this.prisma.featuredAnime.upsert({
      where: { animeId: dto.animeId },
      create: {
        animeId: dto.animeId,
        headline: dto.headline ?? null,
        subtitle: dto.subtitle ?? null,
        ctaLabel: dto.ctaLabel ?? 'Watch Now',
        backdropUrl: dto.backdropUrl ?? null,
        order: dto.order ?? count,
      },
      update: {
        headline: dto.headline ?? null,
        subtitle: dto.subtitle ?? null,
        ctaLabel: dto.ctaLabel ?? 'Watch Now',
        backdropUrl: dto.backdropUrl ?? null,
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        isActive: true,
      },
    });

    await this.prisma.anime.update({ where: { id: dto.animeId }, data: { isFeatured: true } });
    return entry;
  }

  async removeFeatured(animeId: string) {
    await this.prisma.featuredAnime.deleteMany({ where: { animeId } });
    await this.prisma.anime.update({ where: { id: animeId }, data: { isFeatured: false } });
    return { deleted: true };
  }

  async activityLog(page: number, limit: number) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { username: true, avatarUrl: true, role: true } } },
      }),
      this.prisma.activityLog.count(),
    ]);
    return paginate(data, total, page, limit);
  }

  private async exists(model: 'genre' | 'studio' | 'producer' | 'rank', slug: string): Promise<boolean> {
    const delegate = {
      genre: this.prisma.genre,
      studio: this.prisma.studio,
      producer: this.prisma.producer,
      rank: this.prisma.rank,
    }[model];
    const row = await (delegate as { findUnique: (args: unknown) => Promise<unknown> }).findUnique({
      where: { slug },
      select: { id: true },
    });
    return Boolean(row);
  }
}
