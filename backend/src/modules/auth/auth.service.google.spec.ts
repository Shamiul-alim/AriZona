import { UnauthorizedException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { AuthService } from './auth.service';

/**
 * Google sign-in rules:
 *  - a returning Google user signs in to the same account,
 *  - a verified Google email links to an existing password account (no duplicate),
 *  - an unverified Google email never links or creates,
 *  - new accounts are always USER; an existing role is never changed.
 */
describe('AuthService.loginWithGoogle', () => {
  const baseUser = {
    id: 'u1',
    email: 'viewer@example.com',
    username: 'viewer',
    displayName: null,
    avatarUrl: null,
    bannerUrl: null,
    bio: null,
    googleId: null as string | null,
    role: UserRole.USER as UserRole,
    status: UserStatus.ACTIVE as UserStatus,
    emailVerifiedAt: null as Date | null,
    rankId: null,
    mana: 0,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  function setup(existing: { byGoogleId?: typeof baseUser | null; byEmail?: typeof baseUser | null } = {}) {
    const prisma = {
      user: {
        findUnique: jest.fn(({ where }: { where: { googleId?: string; email?: string } }) => {
          if (where.googleId) return Promise.resolve(existing.byGoogleId ?? null);
          if (where.email) return Promise.resolve(existing.byEmail ?? null);
          return Promise.resolve(null);
        }),
        update: jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
          Promise.resolve({ ...(existing.byEmail ?? existing.byGoogleId ?? baseUser), id: where.id, ...data }),
        ),
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...baseUser, id: 'new', ...data })),
      },
      rank: { findFirst: jest.fn().mockResolvedValue({ id: 'rank-1' }) },
    };
    const tokens = { issuePair: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 }) };
    const mana = { awardDailyLogin: jest.fn().mockResolvedValue(undefined) };
    const service = new AuthService(prisma as never, tokens as never, {} as never, mana as never, {} as never);
    return { service, prisma, tokens };
  }

  const profile = { googleId: 'g-123', email: 'viewer@example.com', emailVerified: true, displayName: 'Viewer' };

  it('signs a returning Google user in to the same account', async () => {
    const linked = { ...baseUser, googleId: 'g-123' };
    const { service, prisma } = setup({ byGoogleId: linked });
    const result = await service.loginWithGoogle(profile);
    expect(result.user.id).toBe('u1');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('links a verified Google email to the existing account instead of duplicating it', async () => {
    const { service, prisma } = setup({ byEmail: { ...baseUser } });
    const result = await service.loginWithGoogle(profile);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: expect.objectContaining({ googleId: 'g-123' }) }),
    );
    expect(result.user.id).toBe('u1');
  });

  it('keeps an existing admin an admin, and never promotes anyone', async () => {
    const admin = { ...baseUser, role: UserRole.ADMIN };
    const { service, prisma } = setup({ byEmail: admin });
    await service.loginWithGoogle(profile);
    for (const call of prisma.user.update.mock.calls) {
      expect(call[0].data).not.toHaveProperty('role');
    }
  });

  it('refuses to link when Google has not verified the email', async () => {
    const { service, prisma } = setup({ byEmail: { ...baseUser } });
    await expect(service.loginWithGoogle({ ...profile, emailVerified: false })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses when the email is already linked to a different Google account', async () => {
    const { service } = setup({ byEmail: { ...baseUser, googleId: 'g-other' } });
    await expect(service.loginWithGoogle(profile)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('creates a new account as USER on first Google sign-in', async () => {
    const { service, prisma } = setup();
    await service.loginWithGoogle(profile);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'viewer@example.com', googleId: 'g-123', role: UserRole.USER }),
      }),
    );
  });

  it('does not create an account from an unverified Google email', async () => {
    const { service, prisma } = setup();
    await expect(service.loginWithGoogle({ ...profile, emailVerified: false })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('blocks a suspended account', async () => {
    const { service } = setup({ byGoogleId: { ...baseUser, googleId: 'g-123', status: UserStatus.BANNED } });
    await expect(service.loginWithGoogle(profile)).rejects.toBeTruthy();
  });
});
