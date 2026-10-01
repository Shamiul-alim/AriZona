import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MediaProcessingState, VideoQuality } from '@prisma/client';
import { AdminMediaJobsService } from './admin-media-jobs.service';
import type { PrismaService } from 'src/prisma/prisma.service';

/**
 * The queue's contract, which the worker depends on but cannot enforce: only
 * live work is handed out, a claim is exclusive, success cannot be reported
 * with nothing to play, and re-running a job updates rather than duplicates.
 */
function prismaDouble(overrides: Record<string, unknown> = {}) {
  const mediaSource = {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    update: jest.fn(),
    ...(overrides.mediaSource as object),
  };
  return {
    mediaSource,
    mediaVariant: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    audioTrack: { deleteMany: jest.fn(), createMany: jest.fn() },
    subtitleTrack: { deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(),
  };
}

function service(prisma: ReturnType<typeof prismaDouble>) {
  return new AdminMediaJobsService(prisma as unknown as PrismaService);
}

describe('AdminMediaJobsService', () => {
  describe('pending', () => {
    it('offers both kinds of job: a legacy master, and tracks from supplied qualities', async () => {
      const prisma = prismaDouble();
      await service(prisma).pending();

      const { where } = prisma.mediaSource.findMany.mock.calls[0][0];
      expect(where.AND[0].OR).toEqual([{ masterDriveFileId: { not: null } }, { autoTracks: true }]);
      const states = where.AND[1].OR;
      expect(states[0]).toEqual({ processingState: MediaProcessingState.PENDING });
      expect(states[1].processingState).toBe(MediaProcessingState.FAILED);
      // Without this an archived episode whose job failed would be retried on
      // every poll, forever, on content nobody can watch.
      expect(where.episode).toEqual({ deletedAt: null });
    });

    it('releases claims older than the stale window before handing out work', async () => {
      const prisma = prismaDouble();
      await service(prisma).pending();

      expect(prisma.mediaSource.updateMany).toHaveBeenCalledTimes(1);
      const { where, data } = prisma.mediaSource.updateMany.mock.calls[0][0];
      expect(where.processingState).toBe(MediaProcessingState.PROCESSING);
      expect(data.processingState).toBe(MediaProcessingState.PENDING);

      const cutoff: Date = where.updatedAt.lt;
      const age = Date.now() - cutoff.getTime();
      expect(age).toBeGreaterThan(80 * 60 * 1000);
      expect(age).toBeLessThan(100 * 60 * 1000);
    });

    it('never asks for more than fifty jobs, whatever the caller requests', async () => {
      const prisma = prismaDouble();
      await service(prisma).pending(5000);
      expect(prisma.mediaSource.findMany.mock.calls[0][0].take).toBe(50);
    });
  });

  describe('claim', () => {
    it('returns null when another worker already holds the job', async () => {
      // updateMany matching nothing is how the race is settled: the second
      // worker sees a count of zero and moves on rather than duplicating work.
      const prisma = prismaDouble({ mediaSource: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } });
      await expect(service(prisma).claim('source-1')).resolves.toBeNull();
    });

    it('only claims a job that is PENDING or FAILED, of either kind', async () => {
      const prisma = prismaDouble();
      await service(prisma).claim('source-1');
      const { where, data } = prisma.mediaSource.updateMany.mock.calls.at(-1)![0];
      expect(where.AND[0].OR).toEqual([{ masterDriveFileId: { not: null } }, { autoTracks: true }]);
      const claimable = where.AND[1].OR;
      expect(claimable[0]).toEqual({ processingState: MediaProcessingState.PENDING });
      expect(claimable[1].processingState).toBe(MediaProcessingState.FAILED);
      expect(data.processingState).toBe(MediaProcessingState.PROCESSING);
      expect(data.processingError).toBeNull();
    });

    it('makes a failed job wait before it can be claimed again', async () => {
      // A missing Drive file had one episode failing and re-queueing every 30
      // seconds for hours. A failure has to rest, or "retry" is a hot loop.
      const prisma = prismaDouble();
      await service(prisma).claim('source-1');
      const { where } = prisma.mediaSource.updateMany.mock.calls.at(-1)![0];
      const failed = where.AND[1].OR[1];
      expect(failed.processingState).toBe(MediaProcessingState.FAILED);
      expect(failed.updatedAt.lt.getTime()).toBeLessThanOrEqual(Date.now() - 15 * 60 * 1000);
    });
  });

  describe('complete', () => {
    const source = (variants: number) => ({
      id: 'source-1',
      masterDriveFileId: 'drive-master',
      _count: { variants },
    });

    it('refuses to record success while nothing has been registered', async () => {
      const prisma = prismaDouble({
        mediaSource: { findUnique: jest.fn().mockResolvedValue(source(0)) },
      });
      await expect(service(prisma).complete('source-1', true)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.mediaSource.update).not.toHaveBeenCalled();
    });

    it('accepts success once a rendition exists', async () => {
      const prisma = prismaDouble({
        mediaSource: {
          findUnique: jest.fn().mockResolvedValue(source(4)),
          update: jest.fn().mockResolvedValue({ processingState: MediaProcessingState.READY }),
        },
      });
      await service(prisma).complete('source-1', true);
      expect(prisma.mediaSource.update.mock.calls[0][0].data.processingState).toBe(MediaProcessingState.READY);
    });

    it('records a failure with a cause even when the worker reports none', async () => {
      const prisma = prismaDouble({
        mediaSource: {
          findUnique: jest.fn().mockResolvedValue(source(0)),
          update: jest.fn().mockResolvedValue({}),
        },
      });
      await service(prisma).complete('source-1', false);
      const { data } = prisma.mediaSource.update.mock.calls[0][0];
      expect(data.processingState).toBe(MediaProcessingState.FAILED);
      expect(data.processingError).toBeTruthy();
    });

    it('truncates a runaway error rather than storing it whole', async () => {
      const prisma = prismaDouble({
        mediaSource: {
          findUnique: jest.fn().mockResolvedValue(source(0)),
          update: jest.fn().mockResolvedValue({}),
        },
      });
      await service(prisma).complete('source-1', false, 'x'.repeat(50_000));
      expect(prisma.mediaSource.update.mock.calls[0][0].data.processingError).toHaveLength(2000);
    });

    it('rejects an unknown source', async () => {
      const prisma = prismaDouble({ mediaSource: { findUnique: jest.fn().mockResolvedValue(null) } });
      await expect(service(prisma).complete('nope', true)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('registerProducedMedia', () => {
    function registering(existingVariantId: string | null, source: Record<string, unknown> = {}) {
      const prisma = prismaDouble({
        mediaSource: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'source-1',
            episodeId: 'episode-1',
            masterDriveFileId: 'drive-master',
            autoTracks: false,
            ...source,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      });
      prisma.mediaVariant.findFirst.mockResolvedValue(existingVariantId ? { id: existingVariantId } : null);
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
      return prisma;
    }

    const payload = {
      variants: [{ quality: VideoQuality.Q_720P, driveFileId: 'drive-720' }],
      audioTracks: [{ language: 'jpn', label: 'Japanese', driveFileId: 'drive-jpn' }],
      subtitleTracks: [{ language: 'eng', label: 'English', driveFileId: 'drive-eng' }],
    };

    it('creates a quality that is not there yet', async () => {
      const prisma = registering(null);
      await service(prisma).registerProducedMedia('source-1', payload);
      expect(prisma.mediaVariant.create).toHaveBeenCalledTimes(1);
      expect(prisma.mediaVariant.update).not.toHaveBeenCalled();
    });

    it('updates rather than duplicating when the same quality is registered again', async () => {
      // A re-run after a partial failure must not leave two 720p rows behind.
      const prisma = registering('variant-1');
      await service(prisma).registerProducedMedia('source-1', payload);
      expect(prisma.mediaVariant.update).toHaveBeenCalledTimes(1);
      expect(prisma.mediaVariant.create).not.toHaveBeenCalled();
    });

    it('replaces the episode tracks so a re-run cannot stack duplicates', async () => {
      const prisma = registering(null);
      await service(prisma).registerProducedMedia('source-1', payload);
      expect(prisma.audioTrack.deleteMany).toHaveBeenCalledWith({ where: { episodeId: 'episode-1' } });
      expect(prisma.subtitleTrack.deleteMany).toHaveBeenCalledWith({ where: { episodeId: 'episode-1' } });
    });


    it('clears tracks a new source no longer carries', async () => {
      // Present-but-empty means "this is the whole set". An episode that used
      // to have two languages and now has one must lose the other, or the
      // player offers a track that is not there any more.
      const prisma = registering(null);
      await service(prisma).registerProducedMedia('source-1', {
        variants: [],
        audioTracks: [],
        subtitleTracks: [],
      });
      expect(prisma.audioTrack.deleteMany).toHaveBeenCalledWith({ where: { episodeId: 'episode-1' } });
      expect(prisma.subtitleTrack.deleteMany).toHaveBeenCalledWith({ where: { episodeId: 'episode-1' } });
      expect(prisma.audioTrack.createMany).not.toHaveBeenCalled();
      expect(prisma.subtitleTrack.createMany).not.toHaveBeenCalled();
    });

    it('leaves tracks alone when the worker does not mention them', async () => {
      const prisma = registering(null);
      await service(prisma).registerProducedMedia('source-1', { variants: [] });
      expect(prisma.audioTrack.deleteMany).not.toHaveBeenCalled();
      expect(prisma.subtitleTrack.deleteMany).not.toHaveBeenCalled();
    });

    it('accepts a track-only source, which has no master', async () => {
      const prisma = registering(null, { masterDriveFileId: null, autoTracks: true });
      await expect(
        service(prisma).registerProducedMedia('source-1', { variants: [], audioTracks: [], subtitleTracks: [] }),
      ).resolves.toBeDefined();
    });

    it('records which file the tracks were read from', async () => {
      // So the admin panel can say "tracks from 1080p", and so replacing that
      // file re-runs detection instead of keeping tracks from a file that is
      // no longer the source.
      const prisma = registering(null, { masterDriveFileId: null, autoTracks: true });
      await service(prisma).registerProducedMedia('source-1', {
        variants: [],
        audioTracks: [],
        subtitleTracks: [],
        trackSourceFileId: 'drive-1080p',
      });
      expect(prisma.mediaSource.update).toHaveBeenCalledWith({
        where: { id: 'source-1' },
        data: { trackSourceFileId: 'drive-1080p' },
      });
    });

    it('refuses a source that is neither a master job nor a track job', async () => {
      const prisma = prismaDouble({
        mediaSource: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 's', episodeId: 'e', masterDriveFileId: null, autoTracks: false }),
        },
      });
      await expect(service(prisma).registerProducedMedia('s', { variants: [] })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
