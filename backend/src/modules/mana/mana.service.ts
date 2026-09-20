import { Injectable, Logger } from '@nestjs/common';
import { ManaEvent, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

interface AwardOptions {
  /**
   * Idempotency key. When supplied, a second award with the same key for the
   * same user is silently ignored — this is what stops a user farming Mana by
   * re-finishing the same episode or re-sending the same request.
   */
  dedupeKey?: string;
  reason?: string;
  /** Overrides the configured amount. Admin adjustments only. */
  amount?: number;
}

@Injectable()
export class ManaService {
  private readonly logger = new Logger(ManaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Grants Mana for an event, honouring the admin-configured amount, the
   * per-day cap, and the optional idempotency key. Returns the amount actually
   * granted (0 when suppressed), and never throws into the caller's request —
   * gamification must not be able to fail a comment or a rating.
   */
  async award(userId: string, event: ManaEvent, options: AwardOptions = {}): Promise<number> {
    try {
      const rule = await this.prisma.manaRule.findUnique({ where: { event } });
      if (!rule || !rule.isActive) return 0;

      const amount = options.amount ?? rule.amount;
      if (amount === 0) return 0;

      if (options.dedupeKey) {
        const existing = await this.prisma.manaTransaction.findFirst({
          where: { userId, dedupeKey: options.dedupeKey },
          select: { id: true },
        });
        if (existing) return 0;
      }

      if (rule.dailyLimit > 0) {
        const since = startOfToday();
        const earnedToday = await this.prisma.manaTransaction.aggregate({
          where: { userId, event, createdAt: { gte: since }, amount: { gt: 0 } },
          _sum: { amount: true },
        });
        const used = earnedToday._sum.amount ?? 0;
        if (used >= rule.dailyLimit) return 0;
        // Partial award when the cap would be exceeded mid-way.
        if (used + amount > rule.dailyLimit) {
          return this.commit(userId, event, rule.dailyLimit - used, options);
        }
      }

      return this.commit(userId, event, amount, options);
    } catch (error) {
      this.logger.warn(`Mana award failed for user=${userId} event=${event}: ${(error as Error).message}`);
      return 0;
    }
  }

  /** Reverses a previously granted award, e.g. when an upvote is withdrawn. */
  async revoke(userId: string, event: ManaEvent, dedupeKey: string): Promise<void> {
    try {
      const tx = await this.prisma.manaTransaction.findFirst({ where: { userId, dedupeKey, event } });
      if (!tx) return;
      await this.prisma.$transaction([
        this.prisma.manaTransaction.delete({ where: { id: tx.id } }),
        this.prisma.user.update({
          where: { id: userId },
          data: { mana: { decrement: tx.amount } },
        }),
      ]);
      await this.syncRank(userId);
    } catch (error) {
      this.logger.warn(`Mana revoke failed for user=${userId}: ${(error as Error).message}`);
    }
  }

  async awardDailyLogin(userId: string): Promise<number> {
    const today = startOfToday().toISOString().slice(0, 10);
    return this.award(userId, ManaEvent.DAILY_LOGIN, {
      dedupeKey: `DAILY_LOGIN:${today}`,
      reason: 'Daily login',
    });
  }

  async historyFor(userId: string, skip: number, take: number) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.manaTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.manaTransaction.count({ where: { userId } }),
    ]);
    return { data, total };
  }

  /** Current rank plus the distance to the next one, for the profile UI. */
  async progressFor(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mana: true, rank: true },
    });
    if (!user) return null;

    const nextRank = await this.prisma.rank.findFirst({
      where: { requiredMana: { gt: user.mana } },
      orderBy: { requiredMana: 'asc' },
    });

    const currentThreshold = user.rank?.requiredMana ?? 0;
    const span = nextRank ? nextRank.requiredMana - currentThreshold : 0;
    const gained = user.mana - currentThreshold;

    return {
      mana: user.mana,
      rank: user.rank,
      nextRank,
      manaToNextRank: nextRank ? nextRank.requiredMana - user.mana : 0,
      progressPercent: span > 0 ? Math.min(100, Math.round((gained / span) * 100)) : 100,
    };
  }

  private async commit(
    userId: string,
    event: ManaEvent,
    amount: number,
    options: AwardOptions,
  ): Promise<number> {
    try {
      await this.prisma.$transaction([
        this.prisma.manaTransaction.create({
          data: { userId, event, amount, reason: options.reason, dedupeKey: options.dedupeKey },
        }),
        this.prisma.user.update({ where: { id: userId }, data: { mana: { increment: amount } } }),
      ]);
    } catch (error) {
      // Unique violation on (userId, dedupeKey) means a concurrent request won
      // the race. That is the correct outcome, not an error.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return 0;
      }
      throw error;
    }

    await this.syncRank(userId);
    return amount;
  }

  /** Promotes (or demotes) the user to the highest rank their Mana satisfies. */
  private async syncRank(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mana: true, rankId: true },
    });
    if (!user) return;

    const earned = await this.prisma.rank.findFirst({
      where: { requiredMana: { lte: user.mana } },
      orderBy: { requiredMana: 'desc' },
    });
    if (earned && earned.id !== user.rankId) {
      await this.prisma.user.update({ where: { id: userId }, data: { rankId: earned.id } });
    }
  }
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
