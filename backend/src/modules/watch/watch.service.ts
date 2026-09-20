import { Injectable, NotFoundException } from '@nestjs/common';
import { ManaEvent, PublishStatus, WatchStatus } from '@prisma/client';
import { paginate } from 'src/common/dto/pagination.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { ManaService } from '../mana/mana.service';
import { UpdateProgressDto } from './dto/watch.dto';

/** Past this fraction the episode counts as watched. */
const COMPLETION_THRESHOLD = 0.9;

/** Below this, saved progress is treated as "not really started". */
export const MIN_RESUME_SECONDS = 10;

@Injectable()
export class WatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mana: ManaService,
  ) {}

  /**
   * Persists the player's reported position.
   *
   * Progress is only ever recorded for sources we actually stream, so the
   * number stored is a real playback position rather than a guess. The client
   * sends this on a throttled interval and on pause/unload.
   */
  async updateProgress(userId: string, dto: UpdateProgressDto) {
    const episode = await this.prisma.episode.findUnique({
      where: { id: dto.episodeId },
      select: { id: true, animeId: true, number: true, durationSeconds: true },
    });
    if (!episode) throw new NotFoundException('Episode not found');

    const duration = dto.durationSeconds ?? episode.durationSeconds ?? 0;
    const position = Math.max(0, Math.floor(dto.positionSeconds));
    const percent = duration > 0 ? Math.min(100, Math.round((position / duration) * 100)) : 0;
    const completed = duration > 0 && position >= duration * COMPLETION_THRESHOLD;

    const progress = await this.prisma.watchProgress.upsert({
      where: { userId_episodeId: { userId, episodeId: episode.id } },
      create: {
        userId,
        episodeId: episode.id,
        animeId: episode.animeId,
        positionSeconds: position,
        durationSeconds: duration || null,
        percent,
        completed,
        lastWatchedAt: new Date(),
      },
      update: {
        positionSeconds: position,
        durationSeconds: duration || undefined,
        percent,
        // Omitted unless newly completed, so rewatching from the start never
        // un-completes an episode the user has already finished.
        ...(completed ? { completed: true } : {}),
        lastWatchedAt: new Date(),
      },
    });

    if (completed) {
      await this.onEpisodeCompleted(userId, episode.animeId, episode.id, Number(episode.number));
    }

    return {
      positionSeconds: progress.positionSeconds,
      percent: progress.percent,
      completed: progress.completed,
    };
  }

  /** Appends to the activity feed. Deliberately separate from resume state. */
  async recordOpen(userId: string, episodeId: string) {
    const episode = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      select: { id: true, animeId: true },
    });
    if (!episode) throw new NotFoundException('Episode not found');

    await this.prisma.watchHistory.create({
      data: { userId, episodeId: episode.id, animeId: episode.animeId },
    });
    return { recorded: true };
  }

  /** Saved position for one episode — drives the Resume / Start Over prompt. */
  async progressFor(userId: string, episodeId: string) {
    const row = await this.prisma.watchProgress.findUnique({
      where: { userId_episodeId: { userId, episodeId } },
      select: { positionSeconds: true, durationSeconds: true, percent: true, completed: true, lastWatchedAt: true },
    });
    return row ?? null;
  }

  /**
   * "Continue watching", one entry per title, most recently watched first.
   *
   *  * An unfinished episode is shown with its saved progress ("resume").
   *  * A finished episode is replaced by the next published episode of the same
   *    title ("next"), so a series in progress never drops off the row.
   *  * A title whose last episode has been finished is left out entirely.
   */
  async continueWatching(userId: string, limit = 12) {
    const rows = await this.prisma.watchProgress.findMany({
      where: {
        userId,
        anime: { publishStatus: PublishStatus.PUBLISHED, deletedAt: null },
        episode: { publishStatus: PublishStatus.PUBLISHED, deletedAt: null },
      },
      orderBy: { lastWatchedAt: 'desc' },
      take: limit * 4,
      include: {
        episode: {
          select: { id: true, number: true, title: true, thumbnailUrl: true, durationSeconds: true },
        },
        anime: {
          select: { id: true, slug: true, titleEnglish: true, titleJapanese: true, posterUrl: true, bannerUrl: true },
        },
      },
    });

    const seen = new Set<string>();
    const items = [];

    for (const row of rows) {
      if (seen.has(row.animeId)) continue;
      seen.add(row.animeId);

      const duration = row.durationSeconds ?? row.episode.durationSeconds ?? null;
      const nearEnd = duration ? row.positionSeconds >= duration * COMPLETION_THRESHOLD : false;
      // Mid-episode is resumable even on a rewatch of a finished episode; a few
      // seconds in is an accidental click, not a viewing to resume.
      const resumable = row.positionSeconds >= MIN_RESUME_SECONDS && !nearEnd;

      if (resumable) {
        items.push({
          state: 'resume' as const,
          anime: row.anime,
          episode: { ...row.episode, number: Number(row.episode.number) },
          positionSeconds: row.positionSeconds,
          durationSeconds: duration,
          percent: row.percent,
          remainingSeconds: duration ? Math.max(0, duration - row.positionSeconds) : null,
          lastWatchedAt: row.lastWatchedAt,
        });
      } else if (row.completed || nearEnd) {
        const next = await this.prisma.episode.findFirst({
          where: {
            animeId: row.animeId,
            number: { gt: row.episode.number },
            publishStatus: PublishStatus.PUBLISHED,
            deletedAt: null,
          },
          orderBy: { number: 'asc' },
          select: { id: true, number: true, title: true, thumbnailUrl: true, durationSeconds: true },
        });
        if (!next) continue;
        items.push({
          state: 'next' as const,
          anime: row.anime,
          episode: { ...next, number: Number(next.number) },
          positionSeconds: 0,
          durationSeconds: next.durationSeconds,
          percent: 0,
          remainingSeconds: next.durationSeconds,
          lastWatchedAt: row.lastWatchedAt,
        });
      }

      if (items.length >= limit) break;
    }
    return items;
  }

  async history(userId: string, page: number, limit: number) {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.watchProgress.findMany({
        where: { userId },
        orderBy: { lastWatchedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          episode: { select: { id: true, number: true, title: true, thumbnailUrl: true } },
          anime: { select: { slug: true, titleEnglish: true, posterUrl: true } },
        },
      }),
      this.prisma.watchProgress.count({ where: { userId } }),
    ]);

    return paginate(
      rows.map((r) => ({
        anime: r.anime,
        episode: { ...r.episode, number: Number(r.episode.number) },
        positionSeconds: r.positionSeconds,
        percent: r.percent,
        completed: r.completed,
        lastWatchedAt: r.lastWatchedAt,
      })),
      total,
      page,
      limit,
    );
  }

  async clearHistory(userId: string, episodeId?: string) {
    if (episodeId) {
      await this.prisma.watchProgress.deleteMany({ where: { userId, episodeId } });
    } else {
      await this.prisma.$transaction([
        this.prisma.watchProgress.deleteMany({ where: { userId } }),
        this.prisma.watchHistory.deleteMany({ where: { userId } }),
      ]);
    }
    return { cleared: true };
  }

  /**
   * On completion: award Mana once per episode, and advance the user's
   * watchlist progress if this episode is further than where they were.
   */
  private async onEpisodeCompleted(userId: string, animeId: string, episodeId: string, number: number) {
    await this.mana.award(userId, ManaEvent.EPISODE_COMPLETED, {
      dedupeKey: `EPISODE_COMPLETED:${episodeId}`,
      reason: 'Finished an episode',
    });

    const entry = await this.prisma.watchlistEntry.findUnique({
      where: { userId_animeId: { userId, animeId } },
    });

    if (!entry) {
      await this.prisma.watchlistEntry.create({
        data: { userId, animeId, status: WatchStatus.WATCHING, progressEpisodes: Math.floor(number) },
      });
      return;
    }

    if (Math.floor(number) > entry.progressEpisodes) {
      await this.prisma.watchlistEntry.update({
        where: { id: entry.id },
        data: {
          progressEpisodes: Math.floor(number),
          status: entry.status === WatchStatus.PLAN_TO_WATCH ? WatchStatus.WATCHING : entry.status,
        },
      });
    }
  }
}
