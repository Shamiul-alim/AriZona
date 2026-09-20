import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { randomToken, sha256 } from 'src/common/utils/crypto.util';
import { JwtAccessPayload } from 'src/common/types/authenticated-user';
import { AppConfigService } from 'src/config/app-config.service';
import { PrismaService } from 'src/prisma/prisma.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface IssueContext {
  userAgent?: string;
  ipHash?: string;
  rememberMe?: boolean;
}

/**
 * Refresh tokens are opaque random strings, stored only as a SHA-256 hash, and
 * rotated on every use. Reusing a consumed token revokes the whole family,
 * which turns a stolen token into a detectable, self-limiting event.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async issuePair(user: Pick<User, 'id' | 'email' | 'username' | 'role'>, ctx: IssueContext = {}): Promise<TokenPair> {
    const { jwt: jwtConfig } = this.config.values;

    const payload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      type: 'access',
    };

    // Expressed in seconds rather than "15m" so the value satisfies the
    // jsonwebtoken typings without a cast.
    const accessTtlSeconds = Math.floor(parseDuration(jwtConfig.accessTtl) / 1000);
    const accessToken = await this.jwt.signAsync(payload, {
      secret: jwtConfig.accessSecret,
      expiresIn: accessTtlSeconds,
    });

    const refreshToken = randomToken(48);
    const ttl = ctx.rememberMe ? jwtConfig.refreshTtlRemember : jwtConfig.refreshTtl;

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        userAgent: ctx.userAgent?.slice(0, 250),
        ipHash: ctx.ipHash,
        expiresAt: new Date(Date.now() + parseDuration(ttl)),
      },
    });

    return { accessToken, refreshToken, expiresIn: accessTtlSeconds };
  }

  async rotate(refreshToken: string, ctx: IssueContext = {}): Promise<TokenPair> {
    const tokenHash = sha256(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (record.revokedAt) {
      // Replay of an already-rotated token: assume compromise and cut the
      // entire session family.
      await this.revokeAllForUser(record.userId);
      throw new UnauthorizedException('Refresh token has already been used');
    }

    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }
    if (record.user.deletedAt || record.user.status === 'BANNED') {
      throw new UnauthorizedException('Account is not active');
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    return this.issuePair(record.user, { ...ctx, rememberMe: ctx.rememberMe });
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Removes expired and long-revoked rows. Called by the maintenance cron. */
  async pruneExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }] },
    });
    return result.count;
  }
}

const UNITS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseDuration(value: string): number {
  const match = /^(\d+)\s*([smhd])$/i.exec(value.trim());
  if (!match) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber * 1000;
    throw new Error(`Unsupported duration format: "${value}"`);
  }
  return Number(match[1]) * UNITS[match[2].toLowerCase()];
}
