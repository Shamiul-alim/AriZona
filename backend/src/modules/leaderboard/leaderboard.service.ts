import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

export type LeaderboardPeriod = 'week' | 'month' | 'all';

const USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  mana: true,
  createdAt: true,
  rank: { select: { name: true, icon: true, color: true } },
};

const VISIBLE = { deletedAt: null, status: { not: UserStatus.BANNED } } as const;

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lifetime Mana holders. */
  topByMana(limit = 25) {
    return this.prisma.user.findMany({
      where: VISIBLE,
      orderBy: { mana: 'desc' },
      take: limit,
      select: USER_SELECT,
    });
  }

  /**
   * Mana *earned within the window*, which is a fairer "most active" signal
   * than a lifetime total that early members would permanently dominate.
   */
  async mostActive(period: LeaderboardPeriod, limit = 25) {
    if (period === 'all') return this.topByMana(limit);

    const since = periodStart(period);
    const grouped = await this.prisma.manaTransaction.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: since }, amount: { gt: 0 } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: limit,
    });
    if (grouped.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.userId) }, ...VISIBLE },
      select: USER_SELECT,
    });
    const earned = new Map(grouped.map((g) => [g.userId, g._sum.amount ?? 0]));

    return users
      .map((u) => ({ ...u, earnedInPeriod: earned.get(u.id) ?? 0 }))
      .sort((a, b) => b.earnedInPeriod - a.earnedInPeriod);
  }

  /** Users whose comments and posts have collected the most upvotes. */
  async mostUpvoted(limit = 25) {
    const [comments, posts] = await Promise.all([
      this.prisma.comment.groupBy({
        by: ['userId'],
        where: { isDeleted: false, upvoteCount: { gt: 0 } },
        _sum: { upvoteCount: true },
      }),
      this.prisma.communityPost.groupBy({
        by: ['userId'],
        where: { isDeleted: false, upvoteCount: { gt: 0 } },
        _sum: { upvoteCount: true },
      }),
    ]);

    const totals = new Map<string, number>();
    for (const row of [...comments, ...posts]) {
      totals.set(row.userId, (totals.get(row.userId) ?? 0) + (row._sum.upvoteCount ?? 0));
    }

    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
    if (ranked.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: ranked.map(([id]) => id) }, ...VISIBLE },
      select: USER_SELECT,
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    return ranked
      .filter(([id]) => byId.has(id))
      .map(([id, upvotes]) => ({ ...byId.get(id)!, totalUpvotes: upvotes }));
  }

  /** Users who have published the most non-deleted community posts. */
  async topContributors(limit = 25) {
    const grouped = await this.prisma.communityPost.groupBy({
      by: ['userId'],
      where: { isDeleted: false },
      _count: { _all: true },
      orderBy: { _count: { userId: 'desc' } },
      take: limit,
    });
    if (grouped.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.userId) }, ...VISIBLE },
      select: USER_SELECT,
    });
    const counts = new Map(grouped.map((g) => [g.userId, g._count._all]));

    return users
      .map((u) => ({ ...u, postCount: counts.get(u.id) ?? 0 }))
      .sort((a, b) => b.postCount - a.postCount);
  }

  popularPosts(period: LeaderboardPeriod, limit = 10) {
    const where =
      period === 'all'
        ? { isDeleted: false }
        : { isDeleted: false, createdAt: { gte: periodStart(period) } };

    return this.prisma.communityPost.findMany({
      where,
      orderBy: [{ upvoteCount: 'desc' }, { commentCount: 'desc' }],
      take: limit,
      select: {
        slug: true,
        title: true,
        upvoteCount: true,
        commentCount: true,
        viewCount: true,
        createdAt: true,
        category: { select: { name: true, slug: true, color: true } },
        user: { select: { username: true, displayName: true, avatarUrl: true } },
      },
    });
  }

  ranks() {
    return this.prisma.rank.findMany({
      orderBy: { requiredMana: 'asc' },
      include: { _count: { select: { users: true } } },
    });
  }
}

function periodStart(period: Exclude<LeaderboardPeriod, 'all'>): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (period === 'week' ? 6 : 29));
  return d;
}
