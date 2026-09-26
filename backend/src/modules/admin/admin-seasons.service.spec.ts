import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminSeasonsService } from './admin-seasons.service';

/**
 * Seasons exist to group episodes, and importers re-run. The properties that
 * matter: creating the same season twice is not an error and makes no
 * duplicate, deleting a season never deletes episodes, and episodes cannot be
 * attached to a season belonging to a different anime.
 */
describe('AdminSeasonsService', () => {
  const ANIME = 'anime-1';

  function setup(overrides: Record<string, unknown> = {}) {
    const prisma = {
      anime: { findUnique: jest.fn().mockResolvedValue({ id: ANIME }) },
      season: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation(({ where }) => Promise.resolve({ id: 'season-1', ...where.animeId_number })),
        update: jest.fn().mockResolvedValue({ id: 'season-1' }),
        delete: jest.fn().mockResolvedValue({}),
      },
      episode: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      ...overrides,
    };
    return { service: new AdminSeasonsService(prisma as never), prisma };
  }

  describe('upsert', () => {
    it('keys on (anime, number) so a repeated import cannot duplicate a season', async () => {
      const { service, prisma } = setup();
      await service.upsert({ animeId: ANIME, number: 1, title: 'Season 1' });
      await service.upsert({ animeId: ANIME, number: 1, title: 'Season 1' });

      expect(prisma.season.upsert).toHaveBeenCalledTimes(2);
      for (const [args] of prisma.season.upsert.mock.calls as [{ where: Record<string, unknown> }][]) {
        expect(args.where).toEqual({ animeId_number: { animeId: ANIME, number: 1 } });
      }
    });

    it('does not wipe a hand-set title when a re-run omits it', async () => {
      const { service, prisma } = setup();
      await service.upsert({ animeId: ANIME, number: 2 });
      const [[args]] = prisma.season.upsert.mock.calls as [[{ update: Record<string, unknown> }]];
      expect(args.update).toEqual({});
    });

    it('rejects a season for an anime that does not exist', async () => {
      const { service } = setup({ anime: { findUnique: jest.fn().mockResolvedValue(null) } });
      await expect(service.upsert({ animeId: 'missing', number: 1 })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a nonsensical season number', async () => {
      const { service } = setup();
      await expect(service.upsert({ animeId: ANIME, number: -1 })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.upsert({ animeId: ANIME, number: 1.5 })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it('refuses to renumber onto an existing season', async () => {
      const { service, prisma } = setup();
      prisma.season.findUnique
        .mockResolvedValueOnce({ id: 'season-1', animeId: ANIME, number: 1 })
        .mockResolvedValueOnce({ id: 'season-2', animeId: ANIME, number: 2 });
      await expect(service.update('season-1', { number: 2 })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it('detaches episodes rather than deleting them', async () => {
      const { service, prisma } = setup();
      prisma.season.findUnique.mockResolvedValue({ id: 'season-1', animeId: ANIME, _count: { episodes: 3 } });

      const result = await service.remove('season-1');

      expect(result).toEqual({ id: 'season-1', detachedEpisodes: 3 });
      // The relation is onDelete: SetNull, so no episode delete is ever issued.
      expect(prisma.episode.updateMany).not.toHaveBeenCalled();
      expect(prisma.season.delete).toHaveBeenCalledWith({ where: { id: 'season-1' } });
    });
  });

  describe('assignEpisodes', () => {
    it('attaches episodes of the same anime', async () => {
      const { service, prisma } = setup();
      prisma.season.findUnique.mockResolvedValue({ id: 'season-1', animeId: ANIME });
      prisma.episode.findMany.mockResolvedValue([
        { id: 'ep-1', animeId: ANIME },
        { id: 'ep-2', animeId: ANIME },
      ]);
      prisma.episode.updateMany.mockResolvedValue({ count: 2 });

      expect(await service.assignEpisodes('season-1', ['ep-1', 'ep-2'])).toEqual({ seasonId: 'season-1', assigned: 2 });
    });

    it('refuses an episode from another anime', async () => {
      const { service, prisma } = setup();
      prisma.season.findUnique.mockResolvedValue({ id: 'season-1', animeId: ANIME });
      prisma.episode.findMany.mockResolvedValue([{ id: 'ep-9', animeId: 'other-anime' }]);

      await expect(service.assignEpisodes('season-1', ['ep-9'])).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.episode.updateMany).not.toHaveBeenCalled();
    });
  });
});
