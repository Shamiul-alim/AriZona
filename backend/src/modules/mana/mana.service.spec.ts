import { ManaEvent } from '@prisma/client';
import { ManaService } from './mana.service';

/**
 * The Mana economy's whole value rests on two guarantees:
 *   1. daily caps make farming pointless, and
 *   2. idempotency keys stop the same action paying out twice.
 * Both are exercised here against a hand-rolled Prisma double.
 */
function buildPrisma(overrides: Record<string, unknown> = {}) {
  const base = {
    manaRule: {
      findUnique: jest.fn().mockResolvedValue({ amount: 10, dailyLimit: 0, isActive: true }),
    },
    manaTransaction: {
      findFirst: jest.fn().mockResolvedValue(null),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      create: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ mana: 0, rankId: null, rank: null }),
      update: jest.fn(),
    },
    rank: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  return { ...base, ...overrides } as never;
}

describe('ManaService.award', () => {
  it('grants the configured amount', async () => {
    const prisma = buildPrisma();
    const service = new ManaService(prisma);

    const granted = await service.award('user-1', ManaEvent.EPISODE_COMMENT);

    expect(granted).toBe(10);
  });

  it('grants nothing when the rule is inactive', async () => {
    const prisma = buildPrisma({
      manaRule: { findUnique: jest.fn().mockResolvedValue({ amount: 10, dailyLimit: 0, isActive: false }) },
    });
    const service = new ManaService(prisma);

    expect(await service.award('user-1', ManaEvent.EPISODE_COMMENT)).toBe(0);
  });

  it('grants nothing when no rule exists for the event', async () => {
    const prisma = buildPrisma({ manaRule: { findUnique: jest.fn().mockResolvedValue(null) } });
    const service = new ManaService(prisma);

    expect(await service.award('user-1', ManaEvent.EPISODE_COMMENT)).toBe(0);
  });

  it('is idempotent for a repeated dedupe key', async () => {
    const prisma = buildPrisma({
      manaTransaction: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing' }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
        create: jest.fn(),
      },
    });
    const service = new ManaService(prisma);

    const granted = await service.award('user-1', ManaEvent.EPISODE_COMPLETED, { dedupeKey: 'EP:1' });

    expect(granted).toBe(0);
  });

  it('refuses once the daily cap is reached', async () => {
    const prisma = buildPrisma({
      manaRule: { findUnique: jest.fn().mockResolvedValue({ amount: 10, dailyLimit: 30, isActive: true }) },
      manaTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 30 } }),
        create: jest.fn(),
      },
    });
    const service = new ManaService(prisma);

    expect(await service.award('user-1', ManaEvent.EPISODE_COMMENT)).toBe(0);
  });

  it('grants only the remainder when the cap would be exceeded part-way', async () => {
    const prisma = buildPrisma({
      manaRule: { findUnique: jest.fn().mockResolvedValue({ amount: 10, dailyLimit: 25, isActive: true }) },
      manaTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 20 } }),
        create: jest.fn(),
      },
    });
    const service = new ManaService(prisma);

    // 20 already earned against a cap of 25 leaves exactly 5.
    expect(await service.award('user-1', ManaEvent.EPISODE_COMMENT)).toBe(5);
  });

  it('never throws into the caller when the database misbehaves', async () => {
    const prisma = buildPrisma({
      manaRule: { findUnique: jest.fn().mockRejectedValue(new Error('connection lost')) },
    });
    const service = new ManaService(prisma);

    // Gamification must never be able to fail a comment or a rating.
    await expect(service.award('user-1', ManaEvent.EPISODE_COMMENT)).resolves.toBe(0);
  });

  it('uses a date-scoped key for the daily login bonus', async () => {
    const create = jest.fn();
    const prisma = buildPrisma({
      manaTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
        create,
      },
    });
    const service = new ManaService(prisma);

    await service.awardDailyLogin('user-1');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expectedKey = `DAILY_LOGIN:${today.toISOString().slice(0, 10)}`;

    // The transaction is built inside $transaction, so assert on the call args
    // that were used to construct it.
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dedupeKey: expectedKey }) }),
    );
  });
});
