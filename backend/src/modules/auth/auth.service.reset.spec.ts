import { BadRequestException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { sha256 } from 'src/common/utils/crypto.util';
import { AuthService } from './auth.service';

/**
 * Password reset by emailed code. The properties that matter:
 *  - the code is never stored, only a hash bound to the user,
 *  - every rejection looks identical, so nothing can be enumerated,
 *  - wrong guesses are counted and the code burns at the ceiling,
 *  - a successful reset consumes the code and kills other sessions.
 */
describe('AuthService password reset by code', () => {
  const USER = { id: 'user-1', email: 'viewer@example.com', username: 'viewer', displayName: null, deletedAt: null };

  function setup(record: Record<string, unknown> | null = null, user: typeof USER | null = USER) {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn().mockResolvedValue(USER) },
      passwordResetToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'reset-1' }),
        findFirst: jest.fn().mockResolvedValue(record),
        update: jest.fn().mockResolvedValue({}),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    const mail = {
      // send() reports the delivery outcome rather than throwing, so the
      // service can log a failure the caller is never told about.
      sendPasswordResetCode: jest.fn().mockResolvedValue({ ok: true, driver: 'smtp' }),
      sendGoogleAccountNotice: jest.fn().mockResolvedValue({ ok: true, driver: 'smtp' }),
    };
    const config = { values: { bcryptRounds: 4, siteName: 'AniZora', siteUrl: 'https://example.test' } };
    const service = new AuthService(prisma as never, {} as never, mail as never, {} as never, config as never);
    return { service, prisma, mail };
  }

  /** A live record holding the hash of `code` for USER. */
  const liveRecord = (code: string, overrides: Record<string, unknown> = {}) => ({
    id: 'reset-1',
    userId: USER.id,
    tokenHash: sha256(`${USER.id}:${code}`),
    expiresAt: new Date(Date.now() + 5 * 60_000),
    usedAt: null,
    attempts: 0,
    createdAt: new Date(),
    ...overrides,
  });

  describe('requesting a code', () => {
    it('emails a six-digit code and stores only its hash', async () => {
      const { service, prisma, mail } = setup();
      await service.forgotPassword(USER.email);

      const [[args]] = prisma.passwordResetToken.create.mock.calls as [[{ data: Record<string, string> }]];
      const [[, , code]] = mail.sendPasswordResetCode.mock.calls as [[string, string, string, number]];

      expect(code).toMatch(/^\d{6}$/);
      // The raw code must never reach the database.
      expect(JSON.stringify(args.data)).not.toContain(code);
      expect(args.data.tokenHash).toBe(sha256(`${USER.id}:${code}`));
    });

    it('never mints a code for a Google-only account', async () => {
      // There is no password to reset, and issuing a code would let inbox
      // access attach a password credential to an account that has none.
      const googleOnly = { ...USER, passwordHash: null, googleId: 'g-123' };
      const { service, prisma, mail } = setup(null, googleOnly as never);

      await service.forgotPassword(googleOnly.email);

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordResetCode).not.toHaveBeenCalled();
      // Instead they are pointed at the sign-in method that works.
      expect(mail.sendGoogleAccountNotice).toHaveBeenCalledTimes(1);
    });

    it('still resets a local account that has also linked Google', async () => {
      const linked = { ...USER, passwordHash: 'bcrypt-hash', googleId: 'g-123' };
      const { service, prisma, mail } = setup(null, linked as never);

      await service.forgotPassword(linked.email);

      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      expect(mail.sendPasswordResetCode).toHaveBeenCalledTimes(1);
      expect(mail.sendGoogleAccountNotice).not.toHaveBeenCalled();
    });

    it('resolves normally when the provider refuses the message', async () => {
      // The caller still gets the same 202; only the log records the failure.
      const { service, mail } = setup();
      mail.sendPasswordResetCode.mockResolvedValue({ ok: false, driver: 'log', error: 'MAIL_DRIVER=log' });

      await expect(service.forgotPassword(USER.email)).resolves.toBeUndefined();
    });

    it('retires any outstanding code first', async () => {
      const { service, prisma } = setup();
      await service.forgotPassword(USER.email);
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER.id, usedAt: null } }),
      );
    });

    it('stays silent for an unknown address, and sends nothing', async () => {
      const { service, mail, prisma } = setup(null, null);
      await expect(service.forgotPassword('nobody@example.com')).resolves.toBeUndefined();
      expect(mail.sendPasswordResetCode).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });
  });

  describe('verifying a code', () => {
    it('accepts the right code without spending it', async () => {
      const { service, prisma } = setup(liveRecord('123456'));
      await expect(service.verifyResetCode(USER.email, '123456')).resolves.toBeUndefined();
      // Not consumed: the user still has to choose a new password.
      expect(prisma.passwordResetToken.update).not.toHaveBeenCalled();
    });

    it('rejects a wrong code and counts the attempt', async () => {
      const { service, prisma } = setup(liveRecord('123456'));
      await expect(service.verifyResetCode(USER.email, '000000')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { attempts: { increment: 1 } } }),
      );
    });

    it('rejects an expired code', async () => {
      const { service } = setup(liveRecord('123456', { expiresAt: new Date(Date.now() - 1000) }));
      await expect(service.verifyResetCode(USER.email, '123456')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a code that was already used', async () => {
      // A consumed code is no longer the newest unused record.
      const { service } = setup(null);
      await expect(service.verifyResetCode(USER.email, '123456')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('burns the code once the attempt ceiling is reached', async () => {
      const { service, prisma } = setup(liveRecord('123456', { attempts: 5 }));
      await expect(service.verifyResetCode(USER.email, '123456')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { usedAt: expect.any(Date) } }),
      );
    });

    it('gives the same message for every failure, so nothing is enumerable', async () => {
      const messages: string[] = [];
      for (const [record, user, code] of [
        [liveRecord('123456'), USER, '000000'],
        [liveRecord('123456', { expiresAt: new Date(Date.now() - 1) }), USER, '123456'],
        [null, USER, '123456'],
        [null, null, '123456'],
      ] as const) {
        const { service } = setup(record as never, user as never);
        await service.verifyResetCode('viewer@example.com', code).catch((e: Error) => messages.push(e.message));
      }
      expect(new Set(messages).size).toBe(1);
      expect(messages).toHaveLength(4);
    });
  });

  describe('resetting the password', () => {
    it('stores a hash of the new password, consumes the code and drops other sessions', async () => {
      const { service, prisma } = setup(liveRecord('123456'));
      await service.resetPassword(USER.email, '123456', 'BrandNew123');

      const [[userUpdate]] = prisma.user.update.mock.calls as [[{ data: { passwordHash: string } }]];
      expect(userUpdate.data.passwordHash).not.toBe('BrandNew123');
      await expect(bcrypt.compare('BrandNew123', userUpdate.data.passwordHash)).resolves.toBe(true);

      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { usedAt: expect.any(Date) } }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER.id, revokedAt: null } }),
      );
    });

    it('refuses to reset with a wrong code', async () => {
      const { service, prisma } = setup(liveRecord('123456'));
      await expect(service.resetPassword(USER.email, '999999', 'BrandNew123')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
