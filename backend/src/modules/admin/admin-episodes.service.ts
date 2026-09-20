import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MediaProvider, Prisma, PublishStatus, SubtitleFormat } from '@prisma/client';
import { paginate } from 'src/common/dto/pagination.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { GoogleDriveProvider } from '../media/providers/google-drive.provider';
import { AdminAnimeService } from './admin-anime.service';
import {
  CreateEpisodeDto,
  EpisodeAudioTrackDto,
  MediaSourceDto,
  SubtitleTrackDto,
  UpdateEpisodeDto,
} from './dto/admin-episode.dto';

@Injectable()
export class AdminEpisodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly animeService: AdminAnimeService,
  ) {}

  async list(animeId: string | undefined, page: number, limit: number, search?: string) {
    const where: Prisma.EpisodeWhereInput = {
      deletedAt: null,
      ...(animeId ? { animeId } : {}),
      ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.episode.findMany({
        where,
        orderBy: animeId ? { number: 'asc' } : { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          number: true,
          title: true,
          thumbnailUrl: true,
          publishStatus: true,
          hasSub: true,
          hasDub: true,
          viewCount: true,
          durationSeconds: true,
          updatedAt: true,
          anime: { select: { id: true, slug: true, titleEnglish: true, posterUrl: true } },
          _count: { select: { mediaSources: true, subtitleTracks: true } },
        },
      }),
      this.prisma.episode.count({ where }),
    ]);

    return paginate(
      rows.map((r) => ({
        ...r,
        number: Number(r.number),
        sourceCount: r._count.mediaSources,
        subtitleCount: r._count.subtitleTracks,
      })),
      total,
      page,
      limit,
    );
  }

  async findOne(id: string) {
    const episode = await this.prisma.episode.findUnique({
      where: { id },
      include: {
        anime: { select: { id: true, slug: true, titleEnglish: true } },
        mediaSources: {
          orderBy: { priority: 'asc' },
          include: { variants: true, audioTracks: true, subtitleTracks: true },
        },
        subtitleTracks: { where: { mediaSourceId: null } },
        downloadSources: true,
        audioTracks: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    if (!episode) throw new NotFoundException('Episode not found');
    return { ...episode, number: Number(episode.number) };
  }

  async create(dto: CreateEpisodeDto) {
    const anime = await this.prisma.anime.findUnique({
      where: { id: dto.animeId },
      select: { id: true },
    });
    if (!anime) throw new NotFoundException('Anime not found');

    const clash = await this.prisma.episode.findFirst({
      where: { animeId: dto.animeId, number: dto.number },
      select: { id: true },
    });
    if (clash) throw new BadRequestException(`Episode ${dto.number} already exists for this title`);

    this.assertTimestamps(dto);

    const episode = await this.prisma.episode.create({
      data: {
        animeId: dto.animeId,
        seasonId: dto.seasonId ?? null,
        number: dto.number,
        ...this.scalarFields(dto),
      },
    });

    await this.replaceMedia(episode.id, dto);
    await this.animeService.refreshCounters(dto.animeId);
    return this.findOne(episode.id);
  }

  async update(id: string, dto: UpdateEpisodeDto) {
    const existing = await this.prisma.episode.findUnique({
      where: { id },
      select: { id: true, animeId: true, number: true },
    });
    if (!existing) throw new NotFoundException('Episode not found');

    if (dto.number !== undefined && Number(existing.number) !== dto.number) {
      const clash = await this.prisma.episode.findFirst({
        where: { animeId: existing.animeId, number: dto.number, id: { not: id } },
        select: { id: true },
      });
      if (clash) throw new BadRequestException(`Episode ${dto.number} already exists for this title`);
    }

    this.assertTimestamps(dto);

    await this.prisma.episode.update({
      where: { id },
      data: {
        ...(dto.number !== undefined ? { number: dto.number } : {}),
        ...(dto.seasonId !== undefined ? { seasonId: dto.seasonId || null } : {}),
        ...this.scalarFields(dto),
      },
    });

    // Media is only touched when the caller actually sent it, so a metadata-only
    // edit never silently wipes configured sources.
    if (dto.mediaSources || dto.subtitleTracks || dto.downloadSources || dto.audioTracks) {
      await this.replaceMedia(id, dto);
    }

    await this.animeService.refreshCounters(existing.animeId);
    return this.findOne(id);
  }

  async remove(id: string) {
    const episode = await this.prisma.episode.findUnique({
      where: { id },
      select: { animeId: true },
    });
    if (!episode) throw new NotFoundException('Episode not found');

    await this.prisma.episode.update({
      where: { id },
      data: { deletedAt: new Date(), publishStatus: PublishStatus.ARCHIVED },
    });
    await this.animeService.refreshCounters(episode.animeId);
    return { deleted: true };
  }

  /**
   * Replaces the whole media configuration for an episode in one transaction.
   * Sources cascade-delete their variants, audio tracks and scoped subtitles,
   * so the rebuild is clean and cannot leave orphans.
   */
  private async replaceMedia(episodeId: string, dto: CreateEpisodeDto | UpdateEpisodeDto) {
    await this.prisma.$transaction(async (tx) => {
      if (dto.mediaSources) {
        await tx.mediaSource.deleteMany({ where: { episodeId } });

        for (const [index, source] of dto.mediaSources.entries()) {
          this.assertSourcePayload(source);

          const created = await tx.mediaSource.create({
            data: {
              episodeId,
              label: source.label,
              provider: source.provider,
              kind: source.kind,
              audioLanguage: source.audioLanguage ?? 'ja',
              audioLabel: source.audioLabel ?? 'Japanese',
              hlsUrl: source.provider === MediaProvider.HLS ? (source.hlsUrl ?? null) : null,
              embedUrl:
                source.provider === MediaProvider.EXTERNAL_EMBED ? (source.embedUrl ?? null) : null,
              priority: source.priority ?? index,
              isDefault: source.isDefault ?? index === 0,
              isActive: source.isActive ?? true,
            },
          });

          if (source.variants?.length) {
            for (const variant of source.variants) {
              const driveFileId = variant.driveFileIdOrUrl
                ? GoogleDriveProvider.extractFileId(variant.driveFileIdOrUrl)
                : null;

              if (source.provider === MediaProvider.GOOGLE_DRIVE && !driveFileId) {
                throw new BadRequestException(
                  `Could not read a Drive file ID from "${variant.driveFileIdOrUrl}". Paste the share link or the file ID.`,
                );
              }

              await tx.mediaVariant.create({
                data: {
                  mediaSourceId: created.id,
                  quality: variant.quality,
                  driveFileId,
                  directUrl: variant.directUrl ?? null,
                  mimeType: variant.mimeType ?? 'video/mp4',
                  width: variant.width ?? null,
                  height: variant.height ?? null,
                  isDefault: variant.isDefault ?? false,
                  isActive: variant.isActive ?? true,
                },
              });
            }
          }

          if (source.audioTracks?.length && source.provider === MediaProvider.HLS) {
            await tx.audioTrack.createMany({
              data: source.audioTracks.map((track) => ({
                mediaSourceId: created.id,
                language: track.language,
                label: track.label,
                hlsGroupId: track.hlsGroupId ?? null,
                isDefault: track.isDefault ?? false,
              })),
              skipDuplicates: true,
            });
          }
        }
      }

      if (dto.audioTracks) {
        const rows = dto.audioTracks.map((track, index) => this.audioRow(episodeId, track, index));
        // Exactly one default: the one marked, else the first.
        if (rows.length && !rows.some((r) => r.isDefault)) rows[0].isDefault = true;
        let seenDefault = false;
        for (const row of rows) {
          if (row.isDefault && seenDefault) row.isDefault = false;
          if (row.isDefault) seenDefault = true;
        }
        await tx.audioTrack.deleteMany({ where: { episodeId } });
        if (rows.length) await tx.audioTrack.createMany({ data: rows });
      }

      if (dto.subtitleTracks) {
        await tx.subtitleTrack.deleteMany({ where: { episodeId, mediaSourceId: null } });
        if (dto.subtitleTracks.length) {
          await tx.subtitleTrack.createMany({
            data: dto.subtitleTracks.map((track) => this.subtitleRow(episodeId, track)),
          });
        }
      }

      if (dto.downloadSources) {
        await tx.downloadSource.deleteMany({ where: { episodeId } });
        if (dto.downloadSources.length) {
          await tx.downloadSource.createMany({
            data: dto.downloadSources.map((d) => ({
              episodeId,
              label: d.label,
              quality: d.quality,
              kind: d.kind,
              url: d.url,
            })),
          });
        }
      }
    });
  }

  private audioRow(episodeId: string, track: EpisodeAudioTrackDto, index: number) {
    const provider = track.provider ?? MediaProvider.GOOGLE_DRIVE;
    if (provider === MediaProvider.HLS || provider === MediaProvider.EXTERNAL_EMBED) {
      throw new BadRequestException(
        `Audio track "${track.label}": use Google Drive, a direct file or object storage for separate audio files`,
      );
    }

    const driveFileId =
      provider === MediaProvider.GOOGLE_DRIVE && track.driveFileIdOrUrl
        ? GoogleDriveProvider.extractFileId(track.driveFileIdOrUrl)
        : null;
    const url = provider !== MediaProvider.GOOGLE_DRIVE ? track.url?.trim() || null : null;

    if (provider === MediaProvider.GOOGLE_DRIVE && !driveFileId) {
      throw new BadRequestException(
        `Audio track "${track.label}": could not read a Drive file ID from "${track.driveFileIdOrUrl ?? ''}"`,
      );
    }
    if (provider !== MediaProvider.GOOGLE_DRIVE && !url) {
      throw new BadRequestException(`Audio track "${track.label}" needs a file URL`);
    }

    return {
      episodeId,
      mediaSourceId: null,
      language: track.language.trim().toLowerCase(),
      label: track.label.trim(),
      provider,
      driveFileId,
      url,
      mimeType: track.mimeType?.trim() || 'audio/mp4',
      codec: track.codec?.trim() || null,
      isDefault: track.isDefault ?? false,
      sortOrder: track.sortOrder ?? index,
    };
  }

  private subtitleRow(episodeId: string, track: SubtitleTrackDto) {
    const driveFileId = track.driveFileIdOrUrl
      ? GoogleDriveProvider.extractFileId(track.driveFileIdOrUrl)
      : null;

    if (!driveFileId && !track.url) {
      throw new BadRequestException(
        `Subtitle track "${track.label}" needs either an uploaded file URL or a Drive file ID`,
      );
    }

    return {
      episodeId,
      mediaSourceId: null,
      language: track.language,
      label: track.label,
      format: track.format ?? SubtitleFormat.VTT,
      url: track.url ?? null,
      driveFileId,
      isDefault: track.isDefault ?? false,
      isForced: track.isForced ?? false,
    };
  }

  private assertSourcePayload(source: MediaSourceDto): void {
    if (source.provider === MediaProvider.HLS && !source.hlsUrl) {
      throw new BadRequestException(`Source "${source.label}" is HLS but has no .m3u8 URL`);
    }
    if (source.provider === MediaProvider.EXTERNAL_EMBED && !source.embedUrl) {
      throw new BadRequestException(`Source "${source.label}" is an embed but has no embed URL`);
    }
    const needsVariants =
      source.provider === MediaProvider.GOOGLE_DRIVE ||
      source.provider === MediaProvider.DIRECT_FILE ||
      source.provider === MediaProvider.OBJECT_STORAGE;
    if (needsVariants && !source.variants?.length) {
      throw new BadRequestException(
        `Source "${source.label}" needs at least one quality. Each quality is a separate file for this provider.`,
      );
    }
  }

  /** Markers must be ordered and consistent, or the skip buttons misbehave. */
  private assertTimestamps(dto: CreateEpisodeDto | UpdateEpisodeDto): void {
    if (dto.introStart != null && dto.introEnd != null && dto.introEnd <= dto.introStart) {
      throw new BadRequestException('Intro end must be after intro start');
    }
    if (dto.outroStart != null && dto.outroEnd != null && dto.outroEnd <= dto.outroStart) {
      throw new BadRequestException('Outro end must be after outro start');
    }
    if (dto.introStart != null && dto.introEnd == null) {
      throw new BadRequestException('Set both intro start and intro end, or neither');
    }
    if (dto.outroStart != null && dto.outroEnd == null) {
      throw new BadRequestException('Set both outro start and outro end, or neither');
    }
  }

  private scalarFields(dto: CreateEpisodeDto | UpdateEpisodeDto) {
    return {
      title: dto.title ?? null,
      description: dto.description ?? null,
      thumbnailUrl: dto.thumbnailUrl ?? null,
      durationSeconds: dto.durationSeconds ?? null,
      airDate: dto.airDate ? new Date(dto.airDate) : null,
      ...(dto.hasSub !== undefined ? { hasSub: dto.hasSub } : {}),
      ...(dto.hasDub !== undefined ? { hasDub: dto.hasDub } : {}),
      ...(dto.isFiller !== undefined ? { isFiller: dto.isFiller } : {}),
      introStart: dto.introStart ?? null,
      introEnd: dto.introEnd ?? null,
      outroStart: dto.outroStart ?? null,
      outroEnd: dto.outroEnd ?? null,
      ...(dto.publishStatus ? { publishStatus: dto.publishStatus } : {}),
    };
  }
}
