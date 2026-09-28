import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MediaProcessingState } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * The queue the local worker pulls from.
 *
 * There is no separate job table: a MediaSource with a `masterDriveFileId` is
 * the job, and `processingState` is its progress. That keeps one row as the
 * source of truth for both "what should play" and "what still needs building",
 * so the two can never disagree.
 *
 * Transcoding runs on the operator's own machine, so the server's part is only
 * to hand out work, accept the result and record why an attempt failed.
 */
@Injectable()
export class AdminMediaJobsService {
  private readonly logger = new Logger(AdminMediaJobsService.name);

  /**
   * A claim older than this is assumed dead — the worker was killed, the laptop
   * slept, the network dropped — and the job becomes available again. Long
   * enough that a genuinely slow encode is never stolen mid-run.
   */
  private static readonly STALE_CLAIM_MS = 90 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  /** Jobs a worker may pick up, oldest episode first so a series fills in order. */
  async pending(limit = 20) {
    await this.releaseStaleClaims();

    const rows = await this.prisma.mediaSource.findMany({
      where: {
        masterDriveFileId: { not: null },
        processingState: { in: [MediaProcessingState.PENDING, MediaProcessingState.FAILED] },
      },
      orderBy: [{ episode: { animeId: 'asc' } }, { episode: { number: 'asc' } }],
      take: Math.min(limit, 50),
      select: {
        id: true,
        masterDriveFileId: true,
        processingState: true,
        processingError: true,
        label: true,
        kind: true,
        audioLanguage: true,
        audioLabel: true,
        episode: {
          select: {
            id: true,
            number: true,
            title: true,
            anime: { select: { id: true, slug: true, titleEnglish: true } },
            season: { select: { number: true, title: true } },
          },
        },
        // What already exists decides what still needs building, which is what
        // makes a restart resume instead of redo.
        variants: { select: { quality: true, driveFileId: true, isActive: true } },
        audioTracks: { select: { language: true, driveFileId: true } },
        subtitleTracks: { select: { language: true, driveFileId: true, url: true } },
      },
    });

    return rows.map((row) => ({
      ...row,
      episode: { ...row.episode, number: Number(row.episode.number) },
    }));
  }

  /**
   * Takes ownership of a job. Returns null when another worker got there first,
   * so two machines can safely poll the same queue.
   */
  async claim(id: string) {
    const claimed = await this.prisma.mediaSource.updateMany({
      where: {
        id,
        masterDriveFileId: { not: null },
        processingState: { in: [MediaProcessingState.PENDING, MediaProcessingState.FAILED] },
      },
      data: { processingState: MediaProcessingState.PROCESSING, processingError: null, updatedAt: new Date() },
    });
    if (claimed.count === 0) return null;
    this.logger.log(`Media job ${id} claimed by a worker`);
    return this.byId(id);
  }

  /**
   * Marks a job finished. `ready` is only accepted once the caller has actually
   * written the renditions, so this cannot report success for an episode that
   * still has nothing to play.
   */
  async complete(id: string, ready: boolean, error?: string) {
    const source = await this.prisma.mediaSource.findUnique({
      where: { id },
      select: { id: true, masterDriveFileId: true, _count: { select: { variants: true } } },
    });
    if (!source) throw new NotFoundException('Media source not found');
    if (!source.masterDriveFileId) throw new BadRequestException('That source has no master to process');

    if (ready && source._count.variants === 0) {
      // The old failure mode was a job that "succeeded" with only the master
      // registered. Refusing here makes that impossible to record.
      throw new BadRequestException('Cannot mark a job ready before any rendition has been registered');
    }

    const updated = await this.prisma.mediaSource.update({
      where: { id },
      data: {
        processingState: ready ? MediaProcessingState.READY : MediaProcessingState.FAILED,
        processingError: ready ? null : (error?.slice(0, 2000) ?? 'Processing failed without a reported cause'),
        processedAt: new Date(),
      },
      select: { id: true, processingState: true, processingError: true, processedAt: true },
    });
    this.logger.log(`Media job ${id} -> ${updated.processingState}`);
    return updated;
  }

  /** Status for the admin UI: what exists for this episode right now. */
  async statusForEpisode(episodeId: string) {
    // Audio and subtitle files built from a master hang off the episode, not
    // the source — the arrays nested in a source describe HLS rendition groups.
    const [episodeAudio, episodeSubtitles] = await Promise.all([
      this.prisma.audioTrack.findMany({
        where: { episodeId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { language: true, label: true, isDefault: true },
      }),
      this.prisma.subtitleTrack.findMany({
        where: { episodeId },
        select: { language: true, label: true, isDefault: true },
      }),
    ]);

    const sources = await this.prisma.mediaSource.findMany({
      where: { episodeId },
      orderBy: { priority: 'asc' },
      select: {
        id: true,
        label: true,
        masterDriveFileId: true,
        processingState: true,
        processingError: true,
        processedAt: true,
        variants: { select: { quality: true, isActive: true }, orderBy: { quality: 'asc' } },
        audioTracks: { select: { language: true, label: true, isDefault: true }, orderBy: { sortOrder: 'asc' } },
        subtitleTracks: { select: { language: true, label: true, isDefault: true } },
      },
    });

    return sources.map((s) => ({
      id: s.id,
      label: s.label,
      /** Presence of a master is what makes this a SINGLE_MASTER source. */
      isSingleMaster: Boolean(s.masterDriveFileId),
      processingState: s.processingState,
      processingError: s.processingError,
      processedAt: s.processedAt,
      qualities: s.variants.filter((v) => v.isActive).map((v) => v.quality),
      audio: s.audioTracks.length > 0 ? s.audioTracks.map((a) => ({ language: a.language, label: a.label, isDefault: a.isDefault })) : episodeAudio,
      subtitles: s.subtitleTracks.length > 0 ? s.subtitleTracks.map((t) => ({ language: t.language, label: t.label, isDefault: t.isDefault })) : episodeSubtitles,
    }));
  }

  private async byId(id: string) {
    const rows = await this.pendingById(id);
    return rows;
  }

  private async pendingById(id: string) {
    const row = await this.prisma.mediaSource.findUnique({
      where: { id },
      select: {
        id: true,
        masterDriveFileId: true,
        processingState: true,
        label: true,
        kind: true,
        audioLanguage: true,
        audioLabel: true,
        episode: {
          select: {
            id: true,
            number: true,
            title: true,
            anime: { select: { id: true, slug: true, titleEnglish: true } },
            season: { select: { number: true, title: true } },
          },
        },
        variants: { select: { quality: true, driveFileId: true, isActive: true } },
        audioTracks: { select: { language: true, driveFileId: true } },
        subtitleTracks: { select: { language: true, driveFileId: true, url: true } },
      },
    });
    if (!row) return null;
    return { ...row, episode: { ...row.episode, number: Number(row.episode.number) } };
  }

  /** Returns abandoned claims to the queue so a killed worker does not park a job forever. */
  private async releaseStaleClaims() {
    const cutoff = new Date(Date.now() - AdminMediaJobsService.STALE_CLAIM_MS);
    const released = await this.prisma.mediaSource.updateMany({
      where: { processingState: MediaProcessingState.PROCESSING, updatedAt: { lt: cutoff } },
      data: { processingState: MediaProcessingState.PENDING },
    });
    if (released.count > 0) this.logger.warn(`Released ${released.count} stale media claim(s)`);
  }
}
