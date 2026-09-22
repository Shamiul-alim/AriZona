import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { User, UserRole, UserStatus } from '@prisma/client';
import bcrypt from 'bcrypt';
import { randomDigits, randomToken, safeEquals, sha256 } from 'src/common/utils/crypto.util';
import { AppConfigService } from 'src/config/app-config.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ManaService } from '../mana/mana.service';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { TokenPair, TokenService } from './token.service';

export interface SessionContext {
  userAgent?: string;
  ipHash?: string;
}

export interface AuthResult extends TokenPair {
  user: PublicUser;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: UserRole;
  status: UserStatus;
  mana: number;
  titlePreference: User['titlePreference'];
  emailVerified: boolean;
  createdAt: Date;
}

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/**
 * A six-digit code has far less entropy than a link token, so it is short
 * lived and tolerates only a handful of guesses. Ten minutes is long enough to
 * fetch an email and slow enough that a code is never worth queueing attacks
 * against; five wrong guesses burns the record entirely.
 */
const RESET_CODE_TTL_MS = 10 * 60 * 1000;
const RESET_CODE_MAX_ATTEMPTS = 5;
/** One message for every failure mode, so nothing leaks which part was wrong. */
const RESET_CODE_REJECTED = 'That code is invalid or has expired. Request a new one.';
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly mana: ManaService,
    private readonly config: AppConfigService,
  ) {}

  async register(dto: RegisterDto, ctx: SessionContext = {}): Promise<AuthResult> {
    const [emailTaken, usernameTaken] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { username: dto.username }, select: { id: true } }),
    ]);
    if (emailTaken) throw new ConflictException('An account with this email already exists');
    if (usernameTaken) throw new ConflictException('That username is already taken');

    const passwordHash = await bcrypt.hash(dto.password, this.config.values.bcryptRounds);
    const startingRank = await this.prisma.rank.findFirst({ orderBy: { requiredMana: 'asc' } });

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        displayName: dto.username,
        passwordHash,
        rankId: startingRank?.id ?? null,
        // Email verification is advisory: an unverified account can still
        // browse and watch, it simply carries the PENDING flag until confirmed.
        status: UserStatus.ACTIVE,
      },
    });

    await this.dispatchVerificationEmail(user);

    const pair = await this.tokens.issuePair(user, ctx);
    return { ...pair, user: toPublicUser(user) };
  }

  async login(dto: LoginDto, ctx: SessionContext = {}): Promise<AuthResult> {
    const identifier = dto.identifier.toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ email: identifier }, { username: dto.identifier }],
      },
    });

    // Compare against a dummy hash when the account is missing so that a
    // non-existent user and a wrong password take the same amount of time.
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const valid = await bcrypt.compare(dto.password, hash);

    if (!user || !valid) {
      throw new UnauthorizedException('Incorrect email/username or password');
    }
    if (!user.passwordHash) {
      throw new UnauthorizedException('This account uses Google sign-in. Continue with Google instead.');
    }
    this.assertUsable(user);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.mana.awardDailyLogin(user.id);

    const pair = await this.tokens.issuePair(user, { ...ctx, rememberMe: dto.rememberMe });
    return { ...pair, user: toPublicUser(user) };
  }

  /**
   * Google sign-in / sign-up.
   *
   *  1. A Google account already linked to a user -> sign in as that user.
   *  2. Otherwise, a user with the same email exists -> link ONLY if Google
   *     states the email is verified. An unverified Google email could belong to
   *     anyone, so linking on it would hand them the existing account.
   *  3. Otherwise -> create a new account with role USER.
   *
   * The role is never changed here: a Google login can only ever reach the
   * privileges the matching database account already has.
   */
  async loginWithGoogle(
    profile: { googleId: string; email: string; emailVerified: boolean; displayName?: string; avatarUrl?: string },
    ctx: SessionContext = {},
  ): Promise<AuthResult> {
    let user = await this.prisma.user.findUnique({ where: { googleId: profile.googleId } });

    if (!user) {
      const byEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });

      if (byEmail) {
        if (!profile.emailVerified) {
          throw new UnauthorizedException(
            'An account with this email already exists. Sign in with your password instead.',
          );
        }
        if (byEmail.googleId && byEmail.googleId !== profile.googleId) {
          throw new UnauthorizedException('This email is already linked to a different Google account.');
        }
        this.assertUsable(byEmail);
        user = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: {
            googleId: profile.googleId,
            emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
            avatarUrl: byEmail.avatarUrl ?? profile.avatarUrl ?? null,
          },
        });
      } else {
        if (!profile.emailVerified) {
          throw new UnauthorizedException('Your Google email address is not verified.');
        }
        const startingRank = await this.prisma.rank.findFirst({ orderBy: { requiredMana: 'asc' } });
        user = await this.prisma.user.create({
          data: {
            email: profile.email,
            username: await this.deriveUsername(profile.email),
            displayName: profile.displayName ?? null,
            avatarUrl: profile.avatarUrl ?? null,
            googleId: profile.googleId,
            emailVerifiedAt: new Date(),
            role: UserRole.USER,
            rankId: startingRank?.id ?? null,
          },
        });
      }
    }

    this.assertUsable(user);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.mana.awardDailyLogin(user.id);

    const pair = await this.tokens.issuePair(user, { ...ctx, rememberMe: true });
    return { ...pair, user: toPublicUser(user) };
  }

  async refresh(refreshToken: string, ctx: SessionContext = {}): Promise<AuthResult> {
    const pair = await this.tokens.rotate(refreshToken, ctx);
    const payload = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(pair.refreshToken) },
      include: { user: true },
    });
    if (!payload) throw new UnauthorizedException('Could not refresh session');
    return { ...pair, user: toPublicUser(payload.user) };
  }

  async logout(refreshToken?: string): Promise<void> {
    if (refreshToken) await this.tokens.revoke(refreshToken);
  }

  async logoutEverywhere(userId: string): Promise<void> {
    await this.tokens.revokeAllForUser(userId);
  }

  /**
   * Always resolves successfully, whether or not the address exists — otherwise
   * the endpoint becomes an account-enumeration oracle.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt) {
      this.logger.debug('Password reset requested for an address with no account');
      return;
    }

    // A Google-only account has no password to reset. Minting a code would
    // let anyone with inbox access attach a password credential to an account
    // that deliberately has none, so instead we mail a notice pointing at the
    // sign-in method that actually works. The HTTP response is unchanged, so
    // this stays invisible to anyone probing for registered addresses.
    if (!user.passwordHash && user.googleId) {
      this.logger.log(`Password reset requested for a Google-only account (user ${user.id}) — notice sent`);
      const notice = await this.mail.sendGoogleAccountNotice(user.email, user.displayName ?? user.username);
      if (!notice.ok) {
        this.logger.error(`Google-account notice not delivered: ${notice.error ?? 'provider rejected the message'}`);
      }
      return;
    }

    // Requesting a new code retires every outstanding one, so only the most
    // recent email can ever be used.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = randomDigits(6);
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        // Bound to the user so two people holding the same six digits do not
        // collide on the unique index. The code itself is never stored.
        tokenHash: sha256(`${user.id}:${code}`),
        expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
      },
    });

    const attempt = await this.mail.sendPasswordResetCode(
      user.email,
      user.displayName ?? user.username,
      code,
      Math.round(RESET_CODE_TTL_MS / 60000),
    );

    // The caller always sees the same 202, so a delivery failure is otherwise
    // indistinguishable from success. Record it where an operator will see it.
    if (attempt.ok) {
      this.logger.log(`Password reset code issued for user ${user.id} and accepted by the mail provider`);
    } else {
      this.logger.error(
        `Password reset code issued for user ${user.id} but NOT delivered — ` +
          `driver=${attempt.driver} error="${attempt.error ?? 'provider rejected the message'}"`,
      );
    }
  }

  /**
   * Checks a code without spending it, so the client can move to the
   * "choose a new password" step before the code is consumed.
   */
  async verifyResetCode(email: string, code: string): Promise<void> {
    await this.findValidResetCode(email, code);
  }

  async resetPassword(email: string, code: string, password: string): Promise<void> {
    const { record } = await this.findValidResetCode(email, code);

    const passwordHash = await bcrypt.hash(password, this.config.values.bcryptRounds);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Whoever reset the password keeps control; every other session dies.
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    this.logger.log(`Password reset completed for user ${record.userId}`);
  }

  /**
   * Resolves the live reset record for an address and validates the code.
   *
   * The lookup is by user rather than by code hash: a wrong guess hashes to
   * nothing, so hashing first would leave no row to charge the attempt
   * against and the ceiling could never be reached. Every rejection raises
   * the same message, so this cannot be used to discover which addresses have
   * accounts or which part of the input was wrong.
   */
  private async findValidResetCode(email: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt) throw new BadRequestException(RESET_CODE_REJECTED);

    const record = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.expiresAt < new Date()) throw new BadRequestException(RESET_CODE_REJECTED);

    if (record.attempts >= RESET_CODE_MAX_ATTEMPTS) {
      await this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      this.logger.warn(`Password reset code burned after too many attempts for user ${user.id}`);
      throw new BadRequestException(RESET_CODE_REJECTED);
    }

    if (!safeEquals(record.tokenHash, sha256(`${user.id}:${code}`))) {
      await this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException(RESET_CODE_REJECTED);
    }

    return { user, record };
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) {
      throw new BadRequestException('This account has no password set');
    }
    const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!matches) throw new BadRequestException('Your current password is incorrect');

    const passwordHash = await bcrypt.hash(dto.newPassword, this.config.values.bcryptRounds);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.tokens.revokeAllForUser(userId);
  }

  async verifyEmail(token: string): Promise<void> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('This confirmation link is invalid or has expired');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date(), status: UserStatus.ACTIVE },
      }),
      this.prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.emailVerifiedAt) return;
    await this.dispatchVerificationEmail(user);
  }

  private async dispatchVerificationEmail(user: User): Promise<void> {
    const token = randomToken(32);
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
      },
    });
    const url = `${this.config.values.siteUrl}/auth/verify-email?token=${token}`;
    await this.mail.sendEmailVerification(user.email, user.displayName ?? user.username, url);
  }

  private assertUsable(user: User): void {
    if (user.deletedAt) throw new UnauthorizedException('This account has been deleted');
    if (user.status === UserStatus.BANNED) {
      throw new UnauthorizedException(user.banReason ?? 'This account has been banned');
    }
    if (user.status === UserStatus.SUSPENDED && user.suspendedUntil && user.suspendedUntil > new Date()) {
      throw new UnauthorizedException(`This account is suspended until ${user.suspendedUntil.toDateString()}`);
    }
  }

  private async deriveUsername(email: string): Promise<string> {
    const base = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'user';
    for (let i = 0; i < 20; i += 1) {
      const candidate = i === 0 ? base : `${base}${i}`;
      const clash = await this.prisma.user.findUnique({ where: { username: candidate }, select: { id: true } });
      if (!clash) return candidate;
    }
    return `${base}${Date.now().toString(36)}`;
  }
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    mana: user.mana,
    titlePreference: user.titlePreference,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt,
  };
}

/** A real bcrypt hash of a value nobody knows, used purely for timing parity. */
const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
