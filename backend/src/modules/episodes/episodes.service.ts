import { Injectable, NotFoundException } from '@nestjs/common';
import { MediaKind, MediaProvider, Prisma, PublishStatus, VideoQuality } from '@prisma/client';
import { PaginatedResult, paginate } from 'src/common/dto/pagination.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { MediaProviderRegistry } from '../media/media-provider.registry';
import { MediaService } from '../media/media.service';

const PUBLISHED_EPISODE: Prisma.EpisodeWhereInput = {
  publishStatus: PublishStatus.PUBLISHED,
  deletedAt: null,
};

/** Descending display order, and the numeric height the player labels use. */
const QUALITY_META: Record<VideoQuality, { label: string; height: number }> = {
  Q_2160P: { label: '4K', height: 2160 },
  Q_1440P: { label: '1440p', height: 1440 },
  Q_1080P: { label: '1080p', height: 1080 },
  Q_720P: { label: '720p', height: 720 },
  Q_480P: { label: '480p', height: 480 },
  Q_360P: { label: '360p', height: 360 },
  Q_240P: { label: '240p', height: 240 },
  AUTO: { label: 'Auto', height: 0 },
};

@Injectable()
export class EpisodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly registry: MediaProviderRegistry,
  ) {}

  async listForAnime(animeSlug: string, page = 1, limit = 100, search?: string) {
    const anime = await this.prisma.anime.findFirst({
      where: { slug: animeSlug, publishStatus: PublishStatus.PUBLISHED, deletedAt: null },
      select: { id: true },
    });
    if (!anime) throw new NotFoundException(`No anime found at "${animeSlug}"`);

    const where: Prisma.EpisodeWhereInput = {
      animeId: anime.id,
      ...PUBLISHED_EPISODE,
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              ...(Number.isFinite(Number(search)) ? [{ number: Number(search) }] : []),
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.episode.findMany({
        where,
        orderBy: { number: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          number: true,
          title: true,
          thumbnailUrl: true,
          durationSeconds: true,
          airDate: true,
          hasSub: true,
          hasDub: true,
          isFiller: true,
          viewCount: true,
        },
      }),
      this.prisma.episode.count({ where }),
    ]);

    return paginate(
      rows.map((r) => ({ ...r, number: Number(r.number) })),
      total,
      page,
      limit,
    );
  }

  /** Newest published episodes across the whole catalogue (homepage rail). */
  async latest(filter: 'all' | 'sub' | 'dub' = 'all', limit = 24, page = 1): Promise<PaginatedResult<unknown>> {
    const where: Prisma.EpisodeWhereInput = {
      ...PUBLISHED_EPISODE,
      anime: { publishStatus: PublishStatus.PUBLISHED, deletedAt: null },
      ...(filter === 'sub' ? { hasSub: true } : {}),
      ...(filter === 'dub' ? { hasDub: true } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.episode.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          number: true,
          title: true,
          thumbnailUrl: true,
          hasSub: true,
          hasDub: true,
          createdAt: true,
          durationSeconds: true,
          anime: {
            select: {
              slug: true,
              titleEnglish: true,
              titleJapanese: true,
              posterUrl: true,
              type: true,
              subEpisodeCount: true,
              dubEpisodeCount: true,
              totalEpisodes: true,
              score: true,
            },
          },
        },
      }),
      this.prisma.episode.count({ where }),
    ]);

    return paginate(
      rows.map((r) => ({
        ...r,
        number: Number(r.number),
        anime: { ...r.anime, score: Number(r.anime.score) },
      })),
      total,
      page,
      limit,
    );
  }

  /**
   * Everything the watch page needs in a single round trip: the episode, its
   * neighbours, and the full playback manifest with freshly signed URLs.
   */
  async watchPayload(animeSlug: string, episodeNumber: number, userId?: string) {
    const anime = await this.prisma.anime.findFirst({
      where: { slug: animeSlug, publishStatus: PublishStatus.PUBLISHED, deletedAt: null },
      select: {
        id: true,
        slug: true,
        titleEnglish: true,
        titleJapanese: true,
        posterUrl: true,
        bannerUrl: true,
        type: true,
        status: true,
        score: true,
        releaseYear: true,
        totalEpisodes: true,
        synopsis: true,
        ageRating: true,
        studio: { select: { name: true, slug: true } },
        genres: { select: { genre: { select: { name: true, slug: true } } } },
      },
    });
    if (!anime) throw new NotFoundException(`No anime found at "${animeSlug}"`);

    const episode = await this.prisma.episode.findFirst({
      where: { animeId: anime.id, number: episodeNumber, ...PUBLISHED_EPISODE },
      include: {
        mediaSources: {
          where: { isActive: true },
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
          include: {
            variants: { where: { isActive: true } },
            audioTracks: true,
            subtitleTracks: { where: { isActive: true } },
          },
        },
        subtitleTracks: { where: { isActive: true, mediaSourceId: null } },
        downloadSources: { where: { isActive: true } },
        audioTracks: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    if (!episode) {
      throw new NotFoundException(`Episode ${episodeNumber} of "${animeSlug}" is not available`);
    }

    const [previous, next, progress] = await Promise.all([
      this.prisma.episode.findFirst({
        where: { animeId: anime.id, number: { lt: episodeNumber }, ...PUBLISHED_EPISODE },
        orderBy: { number: 'desc' },
        select: { number: true, title: true },
      }),
      this.prisma.episode.findFirst({
        where: { animeId: anime.id, number: { gt: episodeNumber }, ...PUBLISHED_EPISODE },
        orderBy: { number: 'asc' },
        select: { number: true, title: true },
      }),
      userId
        ? this.prisma.watchProgress.findUnique({
            where: { userId_episodeId: { userId, episodeId: episode.id } },
          })
        : Promise.resolve(null),
    ]);

    return {
      anime: {
        ...anime,
        score: Number(anime.score),
        genres: anime.genres.map((g) => g.genre),
      },
      episode: {
        id: episode.id,
        number: Number(episode.number),
        title: episode.title,
        description: episode.description,
        thumbnailUrl: episode.thumbnailUrl,
        durationSeconds: episode.durationSeconds,
        airDate: episode.airDate,
        hasSub: episode.hasSub,
        hasDub: episode.hasDub,
        isFiller: episode.isFiller,
        viewCount: episode.viewCount,
        // Null markers make the player hide the corresponding skip button
        // rather than render a control that would do nothing.
        introStart: episode.introStart,
        introEnd: episode.introEnd,
        outroStart: episode.outroStart,
        outroEnd: episode.outroEnd,
      },
      navigation: {
        previous: previous ? { number: Number(previous.number), title: previous.title } : null,
        next: next ? { number: Number(next.number), title: next.title } : null,
      },
      playback: {
        ...this.buildManifest(episode),
        /**
         * Separate audio files for this episode. When present, the player
         * plays the video muted and the selected file in a synced <audio>
         * element, so changing language never restarts the video.
         */
        audioTracks: episode.audioTracks
          .filter((t) => t.driveFileId || t.url)
          .map((t) => ({
            id: t.id,
            language: t.language,
            label: t.label,
            isDefault: t.isDefault,
            mimeType: t.mimeType,
            ...this.media.sign('audio', t.id),
          })),
      },
      downloads: episode.downloadSources.map((d) => ({
        id: d.id,
        label: d.label,
        quality: QUALITY_META[d.quality].label,
        kind: d.kind,
        url: d.url,
        sizeBytes: d.sizeBytes ? Number(d.sizeBytes) : null,
      })),
      progress: progress
        ? {
            positionSeconds: progress.positionSeconds,
            percent: progress.percent,
            completed: progress.completed,
          }
        : null,
    };
  }

  /**
   * Converts stored media rows into the player's source list.
   *
   * `seekable` is the honest capability flag: true only when the bytes flow
   * through our proxy (Drive / direct file / object storage) or the source is
   * HLS. For EXTERNAL_EMBED it is false, and the frontend then renders the
   * iframe WITHOUT custom controls instead of pretending to drive it.
   */
  private buildManifest(episode: {
    mediaSources: Array<{
      id: string;
      label: string;
      provider: MediaProvider;
      kind: MediaKind;
      audioLanguage: string;
      audioLabel: string;
      hlsUrl: string | null;
      embedUrl: string | null;
      isDefault: boolean;
      variants: Array<{
        id: string;
        quality: VideoQuality;
        width: number | null;
        height: number | null;
        isDefault: boolean;
        driveFileId: string | null;
        directUrl: string | null;
      }>;
      audioTracks: Array<{ id: string; language: string; label: string; hlsGroupId: string | null; isDefault: boolean }>;
      subtitleTracks: Array<{ id: string; language: string; label: string; isDefault: boolean; isForced: boolean }>;
    }>;
    subtitleTracks: Array<{ id: string; language: string; label: string; isDefault: boolean; isForced: boolean }>;
  }) {
    const sharedSubtitles = episode.subtitleTracks.map((t) => this.signSubtitle(t));

    const sources = episode.mediaSources.map((source) => {
      const proxied = this.registry.isProxied(source.provider);

      const qualities = source.variants
        .filter((v) => v.driveFileId || v.directUrl)
        .map((variant) => ({
          id: variant.id,
          quality: variant.quality,
          label: QUALITY_META[variant.quality].label,
          height: variant.height ?? QUALITY_META[variant.quality].height,
          isDefault: variant.isDefault,
          ...(proxied ? this.media.sign('variant', variant.id) : { url: variant.directUrl ?? '', expiresAt: 0 }),
        }))
        .sort((a, b) => b.height - a.height);

      return {
        id: source.id,
        label: source.label,
        provider: source.provider,
        kind: source.kind,
        audioLanguage: source.audioLanguage,
        audioLabel: source.audioLabel,
        isDefault: source.isDefault,
        seekable: source.provider !== MediaProvider.EXTERNAL_EMBED,
        /** True when the browser must use an HLS engine rather than a plain <video src>. */
        isHls: source.provider === MediaProvider.HLS,
        hlsUrl: source.hlsUrl,
        embedUrl: source.provider === MediaProvider.EXTERNAL_EMBED ? source.embedUrl : null,
        qualities,
        /**
         * Only HLS/DASH can switch audio inside one stream. For progressive
         * sources this is empty and the UI switches audio by selecting a
         * different source, which is the honest mechanism.
         */
        audioTracks: source.provider === MediaProvider.HLS ? source.audioTracks : [],
        subtitles: [...sharedSubtitles, ...source.subtitleTracks.map((t) => this.signSubtitle(t))],
      };
    });

    const available = sources.filter((s) => s.qualities.length > 0 || s.hlsUrl || s.embedUrl);

    return {
      sources: available,
      defaultSourceId:
        available.find((s) => s.isDefault)?.id ?? available[0]?.id ?? null,
      hasSub: available.some((s) => s.kind === MediaKind.SUB),
      hasDub: available.some((s) => s.kind === MediaKind.DUB),
    };
  }

  private signSubtitle(track: { id: string; language: string; label: string; isDefault: boolean; isForced: boolean }) {
    return {
      id: track.id,
      language: track.language,
      label: track.label,
      isDefault: track.isDefault,
      isForced: track.isForced,
      ...this.media.sign('subtitle', track.id),
    };
  }
}
