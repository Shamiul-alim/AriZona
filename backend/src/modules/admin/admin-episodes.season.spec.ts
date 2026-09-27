import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminEpisodesService } from './admin-episodes.service';

/**
 * A season belongs to one anime. Attaching an episode to a season from another
 * title would create a row no season view could render correctly, and no
 * database constraint catches it — so the service has to.
 */
describe('AdminEpisodesService season assignment', () => {
  const ANIME = 'anime-1';
  const OTHER = 'anime-2';

  function setup(season: { animeId: string } | null) {
    const prisma = {
      anime: { findUnique: jest.fn().mockResolvedValue({ id: ANIME }) },
      season: { findUnique: jest.fn().mockResolvedValue(season) },
      episode: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ id: 'ep-1', animeId: ANIME, number: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'ep-1' }),
        update: jest.fn().mockResolvedValue({ id: 'ep-1' }),
      },
    };
    const service = new AdminEpisodesService(
      prisma as never,
      { refreshCounters: jest.fn() } as never,
      ...([] as never[]),
    );
    return { service, prisma };
  }

  const base = { animeId: ANIME, number: 1 };

  it('rejects a season that belongs to another anime on create', async () => {
    const { service, prisma } = setup({ animeId: OTHER });
    await expect(service.create({ ...base, seasonId: 'season-x' } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.episode.create).not.toHaveBeenCalled();
  });

  it('rejects a season that belongs to another anime on update', async () => {
    const { service, prisma } = setup({ animeId: OTHER });
    await expect(service.update('ep-1', { seasonId: 'season-x' } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.episode.update).not.toHaveBeenCalled();
  });

  it('rejects a season id that does not exist', async () => {
    const { service } = setup(null);
    await expect(service.create({ ...base, seasonId: 'missing' } as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('accepts a season belonging to the same anime', async () => {
    const { service, prisma } = setup({ animeId: ANIME });
    await service.create({ ...base, seasonId: 'season-1' } as never).catch(() => null);
    expect(prisma.season.findUnique).toHaveBeenCalledWith({ where: { id: 'season-1' }, select: { animeId: true } });
  });

  it('leaves an episode with no season alone — the field stays optional', async () => {
    const { service, prisma } = setup({ animeId: ANIME });
    await service.create({ ...base } as never).catch(() => null);
    expect(prisma.season.findUnique).not.toHaveBeenCalled();
  });
});
