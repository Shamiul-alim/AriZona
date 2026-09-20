import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ManaEvent, Prisma, UserRole, UserStatus } from '@prisma/client';
import { paginate } from 'src/common/dto/pagination.dto';
import { AuthenticatedUser } from 'src/common/types/authenticated-user';
import { PrismaService } from 'src/prisma/prisma.service';
import { ManaService } from '../mana/mana.service';

const RANK_ORDER: Record<UserRole, number> = {
  USER: 0,
  MODERATOR: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mana: ManaService,
  ) {}

  async list(
    query: { q?: string; role?: UserRole; status?: UserStatus },
    page: number,
    limit: number,
  ) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { username: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              { displayName: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          role: true,
          status: true,
          mana: true,
          emailVerifiedAt: true,
          lastLoginAt: true,
          createdAt: true,
          suspendedUntil: true,
          rank: { select: { name: true, color: true } },
          _count: { select: { comments: true, communityPosts: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(rows, total, page, limit);
  }

  /**
   * Role changes are constrained so an admin can never grant a role at or above
   * their own level, and cannot modify someone who outranks them.
   */
  async setRole(actor: AuthenticatedUser, userId: string, role: UserRole) {
    const target = await this.requireUser(userId);
    this.assertOutranks(actor, target.role);

    if (RANK_ORDER[role] >= RANK_ORDER[actor.role]) {
      throw new ForbiddenException('You cannot grant a role equal to or above your own');
    }
    if (target.id === actor.id) {
      throw new BadRequestException('You cannot change your own role');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, username: true, role: true },
    });
  }

  async setStatus(
    actor: AuthenticatedUser,
    userId: string,
    status: UserStatus,
    options: { reason?: string; suspendedUntil?: string } = {},
  ) {
    const target = await this.requireUser(userId);
    this.assertOutranks(actor, target.role);
    if (target.id === actor.id) {
      throw new BadRequestException('You cannot change your own account status');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        status,
        banReason: status === UserStatus.BANNED ? (options.reason ?? null) : null,
        suspendedUntil:
          status === UserStatus.SUSPENDED && options.suspendedUntil
            ? new Date(options.suspendedUntil)
            : null,
      },
      select: { id: true, username: true, status: true, suspendedUntil: true },
    });

    // A banned or suspended account must lose its live sessions immediately.
    if (status !== UserStatus.ACTIVE) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return updated;
  }

  async adjustMana(actor: AuthenticatedUser, userId: string, amount: number, reason: string) {
    await this.requireUser(userId);
    if (amount === 0) throw new BadRequestException('Amount must be non-zero');

    await this.prisma.$transaction([
      this.prisma.manaTransaction.create({
        data: {
          userId,
          event: ManaEvent.ADMIN_ADJUSTMENT,
          amount,
          reason: `${reason} (by ${actor.username})`,
        },
      }),
      this.prisma.user.update({ where: { id: userId }, data: { mana: { increment: amount } } }),
    ]);

    return this.mana.progressFor(userId);
  }

  private async requireUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, username: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private assertOutranks(actor: AuthenticatedUser, targetRole: UserRole): void {
    if (RANK_ORDER[actor.role] <= RANK_ORDER[targetRole]) {
      throw new ForbiddenException('You cannot modify an account at or above your own level');
    }
  }
}
