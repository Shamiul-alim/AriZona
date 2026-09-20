import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ManaEvent, Prisma, RequestStatus } from '@prisma/client';
import { paginate } from 'src/common/dto/pagination.dto';
import { sanitizePlainText } from 'src/common/utils/sanitize.util';
import { PrismaService } from 'src/prisma/prisma.service';
import { ManaService } from '../mana/mana.service';
import { CreateAnimeRequestDto, UpdateAnimeRequestDto } from './dto/request.dto';

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mana: ManaService,
  ) {}

  async create(dto: CreateAnimeRequestDto, userId?: string) {
    const title = sanitizePlainText(dto.title);

    // Nudge users toward an existing entry instead of collecting duplicates.
    const alreadyAvailable = await this.prisma.anime.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { titleEnglish: { equals: title, mode: 'insensitive' } },
          { titles: { some: { title: { equals: title, mode: 'insensitive' } } } },
        ],
      },
      select: { slug: true, titleEnglish: true },
    });
    if (alreadyAvailable) {
      throw new BadRequestException(
        `"${alreadyAvailable.titleEnglish}" is already on the site at /anime/${alreadyAvailable.slug}`,
      );
    }

    if (userId) {
      const pending = await this.prisma.animeRequest.count({
        where: { userId, status: { in: [RequestStatus.PENDING, RequestStatus.REVIEWING] } },
      });
      if (pending >= 5) {
        throw new BadRequestException('You already have 5 requests awaiting review');
      }
    }

    const request = await this.prisma.animeRequest.create({
      data: {
        userId: userId ?? null,
        title,
        titleJapanese: dto.titleJapanese ? sanitizePlainText(dto.titleJapanese) : null,
        malUrl: dto.malUrl ?? null,
        anilistUrl: dto.anilistUrl ?? null,
        message: dto.message ? sanitizePlainText(dto.message) : null,
      },
    });
    return { id: request.id, status: request.status };
  }

  async listMine(userId: string, page: number, limit: number) {
    const where: Prisma.AnimeRequestWhereInput = { userId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.animeRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { fulfilledAnime: { select: { slug: true, titleEnglish: true, posterUrl: true } } },
      }),
      this.prisma.animeRequest.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }

  /** Public board of approved/available requests, so users can see progress. */
  async listPublic(page: number, limit: number) {
    const where: Prisma.AnimeRequestWhereInput = {
      status: { in: [RequestStatus.APPROVED, RequestStatus.AVAILABLE, RequestStatus.REVIEWING] },
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.animeRequest.findMany({
        where,
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          titleJapanese: true,
          status: true,
          createdAt: true,
          user: { select: { username: true, avatarUrl: true } },
          fulfilledAnime: { select: { slug: true, titleEnglish: true, posterUrl: true } },
        },
      }),
      this.prisma.animeRequest.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }

  async listAll(status: RequestStatus | undefined, page: number, limit: number) {
    const where: Prisma.AnimeRequestWhereInput = status ? { status } : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.animeRequest.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, username: true, email: true, avatarUrl: true } },
          fulfilledAnime: { select: { slug: true, titleEnglish: true } },
        },
      }),
      this.prisma.animeRequest.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }

  async update(id: string, dto: UpdateAnimeRequestDto) {
    const request = await this.prisma.animeRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');

    const closed = dto.status === RequestStatus.AVAILABLE || dto.status === RequestStatus.REJECTED;
    const updated = await this.prisma.animeRequest.update({
      where: { id },
      data: {
        status: dto.status,
        adminNote: dto.adminNote ?? request.adminNote,
        fulfilledAnimeId: dto.fulfilledAnimeId ?? request.fulfilledAnimeId,
        resolvedAt: closed ? new Date() : null,
      },
    });

    // Reward the requester once the title actually goes live.
    if (
      request.userId &&
      dto.status === RequestStatus.AVAILABLE &&
      request.status !== RequestStatus.AVAILABLE
    ) {
      await this.mana.award(request.userId, ManaEvent.ANIME_REQUEST_APPROVED, {
        dedupeKey: `REQUEST:${id}`,
        reason: 'Requested title was added',
      });
    }

    return updated;
  }

  async counts() {
    const grouped = await this.prisma.animeRequest.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const base = Object.fromEntries(
      Object.values(RequestStatus).map((s) => [s, 0]),
    ) as Record<RequestStatus, number>;
    for (const row of grouped) base[row.status] = row._count._all;
    return base;
  }
}
