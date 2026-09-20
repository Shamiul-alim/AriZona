import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReportStatus, ReportTargetType } from '@prisma/client';
import { paginate } from 'src/common/dto/pagination.dto';
import { sanitizePlainText } from 'src/common/utils/sanitize.util';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateReportDto, ReportQueryDto, ResolveReportDto } from './dto/report.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateReportDto, userId?: string) {
    await this.assertTargetExists(dto.targetType, dto.targetId);

    const report = await this.prisma.report.create({
      data: {
        userId: userId ?? null,
        targetType: dto.targetType,
        targetId: dto.targetId,
        kind: dto.kind,
        message: dto.message ? sanitizePlainText(dto.message) : null,
        // Snapshot of what the viewer was actually watching, so a moderator can
        // reproduce the fault instead of guessing.
        context: (dto.context ?? null) as Prisma.InputJsonValue,
      },
    });

    return { id: report.id, status: report.status };
  }

  async list(query: ReportQueryDto, page: number, limit: number) {
    const where: Prisma.ReportWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, username: true, avatarUrl: true } },
          resolvedBy: { select: { id: true, username: true } },
        },
      }),
      this.prisma.report.count({ where }),
    ]);

    const enriched = await Promise.all(rows.map((row) => this.attachTarget(row)));
    return paginate(enriched, total, page, limit);
  }

  async findOne(id: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true, email: true } },
        resolvedBy: { select: { id: true, username: true } },
      },
    });
    if (!report) throw new NotFoundException('Report not found');
    return this.attachTarget(report);
  }

  async resolve(id: string, moderatorId: string, dto: ResolveReportDto) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Report not found');

    const closed = dto.status === ReportStatus.RESOLVED || dto.status === ReportStatus.REJECTED;
    return this.prisma.report.update({
      where: { id },
      data: {
        status: dto.status,
        adminNote: dto.adminNote ?? report.adminNote,
        resolvedById: closed ? moderatorId : null,
        resolvedAt: closed ? new Date() : null,
      },
    });
  }

  async counts() {
    const grouped = await this.prisma.report.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const base = Object.fromEntries(
      Object.values(ReportStatus).map((s) => [s, 0]),
    ) as Record<ReportStatus, number>;
    for (const row of grouped) base[row.status] = row._count._all;
    return base;
  }

  /**
   * Reports use a polymorphic target rather than a foreign key so they survive
   * the deletion of the thing they describe. That means resolving the target
   * has to be done explicitly here.
   */
  private async attachTarget<T extends { targetType: ReportTargetType; targetId: string }>(report: T) {
    const target = await this.loadTarget(report.targetType, report.targetId);
    return { ...report, target };
  }

  private async loadTarget(type: ReportTargetType, id: string) {
    switch (type) {
      case ReportTargetType.EPISODE: {
        const episode = await this.prisma.episode.findUnique({
          where: { id },
          select: {
            id: true,
            number: true,
            title: true,
            anime: { select: { slug: true, titleEnglish: true, posterUrl: true } },
          },
        });
        return episode
          ? {
              kind: 'EPISODE' as const,
              label: `${episode.anime.titleEnglish} — Episode ${Number(episode.number)}`,
              href: `/watch/${episode.anime.slug}/ep-${Number(episode.number)}`,
              posterUrl: episode.anime.posterUrl,
            }
          : null;
      }
      case ReportTargetType.ANIME: {
        const anime = await this.prisma.anime.findUnique({
          where: { id },
          select: { slug: true, titleEnglish: true, posterUrl: true },
        });
        return anime
          ? {
              kind: 'ANIME' as const,
              label: anime.titleEnglish,
              href: `/anime/${anime.slug}`,
              posterUrl: anime.posterUrl,
            }
          : null;
      }
      case ReportTargetType.COMMENT: {
        const comment = await this.prisma.comment.findUnique({
          where: { id },
          select: { id: true, body: true, isDeleted: true, user: { select: { username: true } } },
        });
        return comment
          ? {
              kind: 'COMMENT' as const,
              label: comment.isDeleted ? '[removed]' : comment.body.slice(0, 160),
              author: comment.user.username,
              href: null,
              posterUrl: null,
            }
          : null;
      }
      case ReportTargetType.COMMUNITY_POST: {
        const post = await this.prisma.communityPost.findUnique({
          where: { id },
          select: { slug: true, title: true, user: { select: { username: true } } },
        });
        return post
          ? {
              kind: 'COMMUNITY_POST' as const,
              label: post.title,
              author: post.user.username,
              href: `/community/${post.slug}`,
              posterUrl: null,
            }
          : null;
      }
      case ReportTargetType.COMMUNITY_COMMENT: {
        const comment = await this.prisma.communityComment.findUnique({
          where: { id },
          select: { body: true, post: { select: { slug: true } }, user: { select: { username: true } } },
        });
        return comment
          ? {
              kind: 'COMMUNITY_COMMENT' as const,
              label: comment.body.slice(0, 160),
              author: comment.user.username,
              href: `/community/${comment.post.slug}`,
              posterUrl: null,
            }
          : null;
      }
      case ReportTargetType.USER: {
        const user = await this.prisma.user.findUnique({
          where: { id },
          select: { username: true, avatarUrl: true },
        });
        return user
          ? {
              kind: 'USER' as const,
              label: user.username,
              href: `/user/${user.username}`,
              posterUrl: user.avatarUrl,
            }
          : null;
      }
      default:
        return null;
    }
  }

  private async assertTargetExists(type: ReportTargetType, id: string): Promise<void> {
    const exists = await this.loadTarget(type, id);
    if (!exists) throw new NotFoundException('The item you are reporting no longer exists');
  }
}
