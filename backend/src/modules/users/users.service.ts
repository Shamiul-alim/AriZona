import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TitlePreference, UserStatus, WatchStatus } from '@prisma/client';
import { paginate } from 'src/common/dto/pagination.dto';
import { sanitizePlainText } from 'src/common/utils/sanitize.util';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdatePreferencesDto, UpdateProfileDto } from './dto/user.dto';

const PUBLIC_PROFILE_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bannerUrl: true,
  bio: true,
  role: true,
  mana: true,
  createdAt: true,
  rank: { select: { name: true, slug: true, icon: true, color: true, requiredMana: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...PUBLIC_PROFILE_SELECT,
        email: true,
        status: true,
        emailVerifiedAt: true,
        titlePreference: true,
        preferredAudio: true,
        preferredSubtitle: true,
        autoplayNext: true,
        autoSkipIntro: true,
        lastLoginAt: true,
      },
    });
    if (!user) throw new NotFoundException('Account not found');
    return { ...user, emailVerified: user.emailVerifiedAt !== null };
  }

  /** Public profile. Only ever exposes non-sensitive fields. */
  async publicProfile(username: string) {
    const user = await this.prisma.user.findFirst({
      where: { username, deletedAt: null, status: { not: UserStatus.BANNED } },
      select: PUBLIC_PROFILE_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');

    const [watchlistCounts, favoriteCount, commentCount, postCount, nextRank] = await Promise.all([
      this.prisma.watchlistEntry.groupBy({
        by: ['status'],
        where: { userId: user.id },
        _count: { _all: true },
      }),
      this.prisma.favorite.count({ where: { userId: user.id } }),
      this.prisma.comment.count({ where: { userId: user.id, isDeleted: false } }),
      this.prisma.communityPost.count({ where: { userId: user.id, isDeleted: false } }),
      this.prisma.rank.findFirst({
        where: { requiredMana: { gt: user.mana } },
        orderBy: { requiredMana: 'asc' },
      }),
    ]);

    const counts = Object.fromEntries(
      Object.values(WatchStatus).map((s) => [s, 0]),
    ) as Record<WatchStatus, number>;
    for (const row of watchlistCounts) counts[row.status] = row._count._all;

    const floor = user.rank?.requiredMana ?? 0;
    const span = nextRank ? nextRank.requiredMana - floor : 0;

    return {
      ...user,
      stats: {
        watchlist: counts,
        favorites: favoriteCount,
        comments: commentCount,
        posts: postCount,
      },
      nextRank,
      rankProgressPercent: span > 0 ? Math.min(100, Math.round(((user.mana - floor) / span) * 100)) : 100,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.username) {
      const clash = await this.prisma.user.findFirst({
        where: { username: dto.username, id: { not: userId } },
        select: { id: true },
      });
      if (clash) throw new BadRequestException('That username is already taken');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.username ? { username: dto.username } : {}),
        ...(dto.displayName !== undefined ? { displayName: sanitizePlainText(dto.displayName || '') || null } : {}),
        ...(dto.bio !== undefined ? { bio: sanitizePlainText(dto.bio || '') || null } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl || null } : {}),
        ...(dto.bannerUrl !== undefined ? { bannerUrl: dto.bannerUrl || null } : {}),
      },
      select: PUBLIC_PROFILE_SELECT,
    });
  }

  /**
   * Player preferences live on the account so they follow the user across
   * devices. The player also mirrors them into localStorage for guests.
   */
  updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.titlePreference ? { titlePreference: dto.titlePreference as TitlePreference } : {}),
        ...(dto.preferredAudio !== undefined ? { preferredAudio: dto.preferredAudio || null } : {}),
        ...(dto.preferredSubtitle !== undefined ? { preferredSubtitle: dto.preferredSubtitle || null } : {}),
        ...(dto.autoplayNext !== undefined ? { autoplayNext: dto.autoplayNext } : {}),
        ...(dto.autoSkipIntro !== undefined ? { autoSkipIntro: dto.autoSkipIntro } : {}),
      },
      select: {
        titlePreference: true,
        preferredAudio: true,
        preferredSubtitle: true,
        autoplayNext: true,
        autoSkipIntro: true,
      },
    });
  }

  /** Combined recent activity feed for the profile page. */
  async activity(username: string, page: number, limit: number) {
    const user = await this.prisma.user.findFirst({
      where: { username, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const [comments, posts] = await Promise.all([
      this.prisma.comment.findMany({
        where: { userId: user.id, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          anime: { select: { slug: true, titleEnglish: true, posterUrl: true } },
          episode: {
            select: { number: true, anime: { select: { slug: true, titleEnglish: true, posterUrl: true } } },
          },
        },
      }),
      this.prisma.communityPost.findMany({
        where: { userId: user.id, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { slug: true, title: true, createdAt: true, category: { select: { name: true, color: true } } },
      }),
    ]);

    const feed = [
      ...comments.map((c) => ({
        type: 'comment' as const,
        createdAt: c.createdAt,
        body: c.body.slice(0, 200),
        anime: c.anime ?? c.episode?.anime ?? null,
        episodeNumber: c.episode ? Number(c.episode.number) : null,
      })),
      ...posts.map((p) => ({
        type: 'post' as const,
        createdAt: p.createdAt,
        title: p.title,
        slug: p.slug,
        category: p.category,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const start = (page - 1) * limit;
    return paginate(feed.slice(start, start + limit), feed.length, page, limit);
  }
}
