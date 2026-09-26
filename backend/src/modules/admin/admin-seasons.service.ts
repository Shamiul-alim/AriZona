import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpsertSeasonDto } from './dto/admin-season.dto';

/**
 * Seasons group an anime's episodes for display. They are deliberately thin:
 * an episode's `seasonId` is optional, so every existing episode keeps working
 * untouched, and a season can be removed without taking episodes with it
 * (the relation is onDelete: SetNull).
 */
@Injectable()
export class AdminSeasonsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(animeId: string) {
    await this.assertAnime(animeId);
    return this.prisma.season.findMany({
      where: { animeId },
      orderBy: { number: 'asc' },
      include: { _count: { select: { episodes: true } } },
    });
  }

  /**
   * Create-or-update by (anime, number).
   *
   * Importers run more than once — after a failure, or to add episodes to a
   * season that already exists — so this is an upsert on the natural key
   * rather than a blind insert. Running an import twice therefore cannot
   * produce a second "Season 1".
   */
  async upsert(dto: UpsertSeasonDto) {
    await this.assertAnime(dto.animeId);
    if (!Number.isInteger(dto.number) || dto.number < 0) {
      throw new BadRequestException('Season number must be a whole number');
    }
    return this.prisma.season.upsert({
      where: { animeId_number: { animeId: dto.animeId, number: dto.number } },
      create: {
        animeId: dto.animeId,
        number: dto.number,
        title: dto.title ?? null,
        posterUrl: dto.posterUrl ?? null,
      },
      // Only overwrite what was actually supplied, so a re-run that omits the
      // title does not wipe a title someone set by hand.
      update: {
        ...(dto.title !== undefined ? { title: dto.title || null } : {}),
        ...(dto.posterUrl !== undefined ? { posterUrl: dto.posterUrl || null } : {}),
      },
      include: { _count: { select: { episodes: true } } },
    });
  }

  async update(id: string, dto: Partial<Omit<UpsertSeasonDto, 'animeId'>>) {
    const season = await this.prisma.season.findUnique({ where: { id } });
    if (!season) throw new NotFoundException('Season not found');
    if (dto.number !== undefined && dto.number !== season.number) {
      const clash = await this.prisma.season.findUnique({
        where: { animeId_number: { animeId: season.animeId, number: dto.number } },
      });
      if (clash) throw new BadRequestException(`This anime already has a season ${dto.number}`);
    }
    return this.prisma.season.update({
      where: { id },
      data: {
        ...(dto.number !== undefined ? { number: dto.number } : {}),
        ...(dto.title !== undefined ? { title: dto.title || null } : {}),
        ...(dto.posterUrl !== undefined ? { posterUrl: dto.posterUrl || null } : {}),
      },
      include: { _count: { select: { episodes: true } } },
    });
  }

  /** Removing a season detaches its episodes; it never deletes them. */
  async remove(id: string) {
    const season = await this.prisma.season.findUnique({
      where: { id },
      include: { _count: { select: { episodes: true } } },
    });
    if (!season) throw new NotFoundException('Season not found');
    await this.prisma.season.delete({ where: { id } });
    return { id, detachedEpisodes: season._count.episodes };
  }

  /** Attaches episodes to a season, refusing anything from another anime. */
  async assignEpisodes(seasonId: string, episodeIds: string[]) {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId } });
    if (!season) throw new NotFoundException('Season not found');
    const episodes = await this.prisma.episode.findMany({
      where: { id: { in: episodeIds } },
      select: { id: true, animeId: true },
    });
    const foreign = episodes.filter((e) => e.animeId !== season.animeId);
    if (foreign.length) {
      throw new BadRequestException('Every episode must belong to the same anime as the season');
    }
    const { count } = await this.prisma.episode.updateMany({
      where: { id: { in: episodes.map((e) => e.id) } },
      data: { seasonId },
    });
    return { seasonId, assigned: count };
  }

  private async assertAnime(animeId: string) {
    const anime = await this.prisma.anime.findUnique({ where: { id: animeId }, select: { id: true } });
    if (!anime) throw new NotFoundException('Anime not found');
    return anime;
  }
}
