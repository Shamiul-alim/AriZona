import { MediaWorkerPresenceService } from './media-worker-presence.service';
import type { PrismaService } from 'src/prisma/prisma.service';

function prismaDouble(workers: Array<Record<string, unknown>> = []) {
  return {
    mediaWorker: {
      findMany: jest.fn().mockResolvedValue(workers),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function service(prisma: ReturnType<typeof prismaDouble>) {
  return new MediaWorkerPresenceService(prisma as unknown as PrismaService);
}

const secondsAgo = (n: number) => new Date(Date.now() - n * 1000);

describe('MediaWorkerPresenceService', () => {
  describe('record', () => {
    it('upserts, so a restarting worker keeps one row rather than accumulating', async () => {
      const prisma = prismaDouble();
      await service(prisma).record({ workerId: 'worker-1', status: 'IDLE' });

      const call = prisma.mediaWorker.upsert.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'worker-1' });
      expect(call.create.id).toBe('worker-1');
      expect(call.update.lastSeenAt).toBeInstanceOf(Date);
    });

    it('stores what the worker is doing', async () => {
      const prisma = prismaDouble();
      await service(prisma).record({
        workerId: 'worker-1',
        status: 'BUSY',
        currentJobLabel: 'Solo Leveling S1E2',
        currentStep: 'ENCODING_720P',
        version: '1.0.0',
      });

      const { update } = prisma.mediaWorker.upsert.mock.calls[0][0];
      expect(update.status).toBe('BUSY');
      expect(update.currentJobLabel).toBe('Solo Leveling S1E2');
      expect(update.currentStep).toBe('ENCODING_720P');
    });

    it('clears the job when an idle worker reports in', async () => {
      // Otherwise a finished job would sit in the panel as if still running.
      const prisma = prismaDouble();
      await service(prisma).record({ workerId: 'worker-1', status: 'IDLE' });

      const { update } = prisma.mediaWorker.upsert.mock.calls[0][0];
      expect(update.currentJobLabel).toBeNull();
      expect(update.currentStep).toBeNull();
    });

    it('truncates oversized fields rather than letting a worker write freely', async () => {
      const prisma = prismaDouble();
      await service(prisma).record({
        workerId: 'w'.repeat(500),
        status: 's'.repeat(500),
        currentJobLabel: 'l'.repeat(500),
        currentStep: 'p'.repeat(500),
        version: 'v'.repeat(500),
      });

      const call = prisma.mediaWorker.upsert.mock.calls[0][0];
      expect((call.where.id as string).length).toBe(64);
      expect((call.update.status as string).length).toBe(16);
      expect((call.update.currentJobLabel as string).length).toBe(200);
      expect((call.update.currentStep as string).length).toBe(60);
      expect((call.update.version as string).length).toBe(40);
    });

    it('accepts a heartbeat with nothing but an id, so an older worker still reports presence', async () => {
      const prisma = prismaDouble();
      await expect(service(prisma).record({ workerId: 'worker-1' })).resolves.toMatchObject({ ok: true });
    });
  });

  describe('status', () => {
    it('is offline when nothing has called in at all', async () => {
      const result = await service(prismaDouble([])).status();
      expect(result.online).toBe(false);
      expect(result.workers).toEqual([]);
    });

    it('is online for a worker seen moments ago', async () => {
      const prisma = prismaDouble([
        { id: 'worker-1', lastSeenAt: secondsAgo(12), status: 'IDLE', currentJobLabel: null, currentStep: null, version: '1.0.0' },
      ]);
      const result = await service(prisma).status();
      expect(result.online).toBe(true);
      expect(result.workers[0].online).toBe(true);
      expect(result.workers[0].secondsSinceSeen).toBeGreaterThanOrEqual(11);
      expect(result.workers[0].secondsSinceSeen).toBeLessThanOrEqual(14);
    });

    it('is offline once a worker has missed several polls', async () => {
      // A machine someone switched off must stop claiming to be there.
      const prisma = prismaDouble([
        { id: 'worker-1', lastSeenAt: secondsAgo(600), status: 'IDLE', currentJobLabel: null, currentStep: null, version: null },
      ]);
      const result = await service(prisma).status();
      expect(result.online).toBe(false);
      expect(result.workers[0].online).toBe(false);
    });

    it('stays online while one worker is fresh and another is long gone', async () => {
      const prisma = prismaDouble([
        { id: 'fresh', lastSeenAt: secondsAgo(5), status: 'BUSY', currentJobLabel: 'Solo Leveling S1E2', currentStep: 'ENCODING_720P', version: null },
        { id: 'stale', lastSeenAt: secondsAgo(9999), status: 'IDLE', currentJobLabel: null, currentStep: null, version: null },
      ]);
      const result = await service(prisma).status();
      expect(result.online).toBe(true);
    });

    it('tolerates a slow poll without flapping to offline', async () => {
      // 30s polling plus a long ffprobe must not read as a dead machine.
      const prisma = prismaDouble([
        { id: 'worker-1', lastSeenAt: secondsAgo(75), status: 'BUSY', currentJobLabel: 'X', currentStep: 'PROBING', version: null },
      ]);
      expect((await service(prisma).status()).online).toBe(true);
    });

    it('publishes only a short prefix of the worker id', async () => {
      const prisma = prismaDouble([
        { id: 'abcdef0123456789-the-rest', lastSeenAt: secondsAgo(1), status: 'IDLE', currentJobLabel: null, currentStep: null, version: null },
      ]);
      const result = await service(prisma).status();
      expect(result.workers[0].id).toBe('abcdef01');
    });

    it('forgets workers that have not been heard from in a week', async () => {
      const prisma = prismaDouble([]);
      await service(prisma).status();
      const { where } = prisma.mediaWorker.deleteMany.mock.calls[0][0];
      const age = Date.now() - (where.lastSeenAt.lt as Date).getTime();
      expect(age).toBeGreaterThan(6 * 24 * 3600 * 1000);
      expect(age).toBeLessThan(8 * 24 * 3600 * 1000);
    });
  });
});
