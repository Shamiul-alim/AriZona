import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MediaProcessingState, VideoQuality } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

/** What a worker reports having produced. Mirrors RegisterMediaDto. */
export interface RegisterProducedMedia {
  variants: Array<{ quality: VideoQuality; driveFileId: string }>;
  /** The file the tracks were read from. Track jobs send it; master jobs do not. */
  trackSourceFileId?: string;
  audioTracks?: Array<{ language: string; label: string; driveFileId: string; isDefault?: boolean; sortOrder?: number }>;
  subtitleTracks?: Array<{ language: string; label: string; driveFileId: string; isDefault?: boolean; isForced?: boolean }>;
}

/**
 * The queue the media worker pulls from.
 *
 * There is no separate job table: a MediaSource with a `masterDriveFileId` is
 * the job, and `processingState` is its progress. That keeps one row as the
 * source of truth for both "what should play" and "what still needs building",
 * so the two can never disagree.
 *
 * Transcoding runs in a separate worker service, so the API's part is only to
 * hand out work, accept the result and record why an attempt failed. Nothing
 * here depends on where that worker runs.
 */
@Injectable()
export class AdminMediaJobsService {
  private readonly logger = new Logger(AdminMediaJobsService.name);

  /**
   * A claim older than this is assumed dead — the container was stopped, the
   * host rebooted, the network dropped — and the job becomes available again. Long
   * enough that a genuinely slow encode is never stolen mid-run.
   */
  private static readonly STALE_CLAIM_MS = 90 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  /** Jobs a worker may pick up, oldest episode first so a series fills in order. */
  async pending(limit = 20) {
    await this.releaseStaleClaims();

    const rows = await this.prisma.mediaSource.findMany({
      where: {
        // Two kinds of job. A master is the legacy transcoding one. autoTracks
        // is the normal one now: the admin supplied the qualities and only the
        // audio and subtitles need finding.
        OR: [{ masterDriveFileId: { not: null } }, { autoTracks: true }],
        processingState: { in: [MediaProcessingState.PENDING, MediaProcessingState.FAILED] },
        // An archived episode is not worth the work. FAILED jobs are retried on
        // every poll, so without this an archived failure would loop forever on
        // content nobody can watch.
        episode: { deletedAt: null },
      },
      orderBy: [{ episode: { animeId: 'asc' } }, { episode: { number: 'asc' } }],
      take: Math.min(limit, 50),
      select: {
        id: true,
        masterDriveFileId: true,
        autoTracks: true,
        trackSourceQuality: true,
        trackSourceFileId: true,
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
        OR: [{ masterDriveFileId: { not: null } }, { autoTracks: true }],
        processingState: { in: [MediaProcessingState.PENDING, MediaProcessingState.FAILED] },
      },
      data: { processingState: MediaProcessingState.PROCESSING, processingError: null, updatedAt: new Date() },
    });
    if (claimed.count === 0) return null;
    this.logger.log(`Media job ${id} claimed by a worker`);
    return this.byId(id);
  }

  /**
   * Marks a job finished. `ready` needs something playable to exist, so a job
   * cannot report success for an episode that has nothing to show.
   */
  async complete(id: string, ready: boolean, error?: string) {
    const source = await this.prisma.mediaSource.findUnique({
      where: { id },
      select: { id: true, masterDriveFileId: true, autoTracks: true, _count: { select: { variants: true } } },
    });
    if (!source) throw new NotFoundException('Media source not found');
    if (!source.masterDriveFileId && !source.autoTracks) {
      throw new BadRequestException('That source has nothing to process');
    }

    if (ready && source._count.variants === 0) {
      // For a master job this catches the old failure mode: a run that
      // "succeeded" having built nothing. For a track job the qualities came
      // from the admin, so this only fires if they have since been removed.
      throw new BadRequestException('Cannot mark a job ready while the episode has no video to play');
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

  /**
   * Heartbeat plus the step being worked on.
   *
   * The step is stored where the failure reason goes, prefixed so the admin
   * panel can tell "this is happening" from "this went wrong", and the write
   * doubles as the liveness signal that keeps a long encode from being treated
   * as an abandoned claim.
   */
  async reportProgress(id: string, step: string, detail?: string) {
    const updated = await this.prisma.mediaSource.updateMany({
      where: { id, processingState: MediaProcessingState.PROCESSING },
      data: {
        processingError: `STEP:${step}${detail ? ` — ${detail}` : ''}`.slice(0, 2000),
        updatedAt: new Date(),
      },
    });
    if (updated.count === 0) throw new NotFoundException('That job is not currently being processed');
    return { id, step, detail: detail ?? null };
  }

  /**
   * Registers what one job produced.
   *
   * Scoped on purpose: it writes the renditions and tracks for this source and
   * nothing else. The worker never calls the episode endpoints, which can
   * replace media wholesale and belong to an admin.
   *
   * Idempotent by (source, quality) and (episode, language): re-running a job
   * updates rows rather than adding a second copy.
   */
  async registerProducedMedia(id: string, dto: RegisterProducedMedia) {
    const source = await this.prisma.mediaSource.findUnique({
      where: { id },
      select: { id: true, episodeId: true, masterDriveFileId: true, autoTracks: true },
    });
    if (!source) throw new NotFoundException('Media source not found');
    if (!source.masterDriveFileId && !source.autoTracks) {
      throw new BadRequestException('That source has nothing to process');
    }

    await this.prisma.$transaction(
      async (tx) => {
        for (const [index, variant] of dto.variants.entries()) {
          const existing = await tx.mediaVariant.findFirst({
            where: { mediaSourceId: id, quality: variant.quality },
            select: { id: true },
          });
          const data = {
            mediaSourceId: id,
            quality: variant.quality,
            driveFileId: variant.driveFileId,
            isDefault: index === 0,
            isActive: true,
          };
          if (existing) await tx.mediaVariant.update({ where: { id: existing.id }, data });
          else await tx.mediaVariant.create({ data });
        }

        // Audio and subtitles hang off the episode: they are separate playable
        // files, not HLS rendition groups.
        //
        // Present-but-empty is meaningful and must clear what is there. A
        // source that used to carry two languages and now carries one has to
        // lose the other, or the player would offer a track that no longer
        // exists. Absent leaves them alone.
        if (dto.audioTracks) {
          await tx.audioTrack.deleteMany({ where: { episodeId: source.episodeId } });
          if (dto.audioTracks.length) await tx.audioTrack.createMany({
            data: dto.audioTracks.map((track, order) => ({
              episodeId: source.episodeId,
              language: track.language,
              label: track.label,
              driveFileId: track.driveFileId,
              isDefault: track.isDefault ?? order === 0,
              sortOrder: track.sortOrder ?? order,
            })),
          });
        }

        if (dto.subtitleTracks) {
          await tx.subtitleTrack.deleteMany({ where: { episodeId: source.episodeId } });
          if (dto.subtitleTracks.length) await tx.subtitleTrack.createMany({
            data: dto.subtitleTracks.map((track) => ({
              episodeId: source.episodeId,
              language: track.language,
              label: track.label,
              driveFileId: track.driveFileId,
              isDefault: track.isDefault ?? false,
              isForced: track.isForced ?? false,
            })),
          });
        }
        // Which file these tracks came from, so the admin panel can say so and
        // so replacing that file re-runs detection rather than keeping tracks
        // from a source that is no longer there.
        if (dto.trackSourceFileId) {
          await tx.mediaSource.update({
            where: { id },
            data: { trackSourceFileId: dto.trackSourceFileId },
          });
        }
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    this.logger.log(
      `Job ${id}: registered ${dto.variants.length} rendition(s), ${dto.audioTracks?.length ?? 0} audio, ${dto.subtitleTracks?.length ?? 0} subtitle`,
    );
    return { id, variants: dto.variants.length };
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
        autoTracks: true,
        trackSourceQuality: true,
        trackSourceFileId: true,
        processingState: true,
        processingError: true,
        processedAt: true,
        variants: { select: { quality: true, driveFileId: true, isActive: true }, orderBy: { quality: 'asc' } },
        audioTracks: { select: { language: true, label: true, isDefault: true }, orderBy: { sortOrder: 'asc' } },
        subtitleTracks: { select: { language: true, label: true, isDefault: true } },
      },
    });

    return sources.map((s) => ({
      id: s.id,
      label: s.label,
      /** Presence of a master is what makes this a legacy transcoding source. */
      isSingleMaster: Boolean(s.masterDriveFileId),
      autoTracks: s.autoTracks,
      /**
       * Which file the tracks came from. Reported so the operator can see it:
       * two qualities of one episode do not always carry the same streams, and
       * "English is missing" is a different problem depending on which was read.
       */
      trackSource: s.trackSourceFileId
        ? (s.variants.find((v) => v.driveFileId === s.trackSourceFileId)?.quality ?? 'an earlier file')
        : null,
      trackSourcePreference: s.trackSourceQuality,
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
