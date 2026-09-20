import { Injectable, NotFoundException } from '@nestjs/common';
import { AdType, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpsertAdPlacementDto, VideoAdConfig } from './dto/ads.dto';

/**
 * Advertising configuration.
 *
 * Display slots carry AdSense identifiers. There is one VIDEO placement whose
 * `config` holds the IMA/VAST settings. Everything is admin-editable so ad
 * behaviour can change without a deploy, and every slot can be disabled
 * individually.
 */
@Injectable()
export class AdsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public payload for the frontend. Returns only enabled, fully-configured
   * slots — a placement missing its slot ID is skipped rather than rendered as
   * an empty box that would shift the layout.
   */
  async publicConfig() {
    const placements = await this.prisma.adPlacement.findMany({
      where: { isEnabled: true },
      orderBy: { order: 'asc' },
    });

    const display = placements
      .filter((p) => p.type !== AdType.VIDEO && p.adClient && p.adSlot)
      .map((p) => ({
        key: p.key,
        type: p.type,
        adClient: p.adClient,
        adSlot: p.adSlot,
        format: p.format,
        fullWidthResponsive: p.fullWidthResponsive,
      }));

    const videoPlacement = placements.find((p) => p.type === AdType.VIDEO);
    const videoConfig = (videoPlacement?.config ?? null) as VideoAdConfig | null;

    return {
      display,
      video:
        videoPlacement && videoConfig?.vastTagUrl
          ? {
              enabled: true,
              vastTagUrl: videoConfig.vastTagUrl,
              preRoll: videoConfig.preRoll ?? true,
              midRoll: videoConfig.midRoll ?? false,
              postRoll: videoConfig.postRoll ?? false,
              midRollIntervalSeconds: videoConfig.midRollIntervalSeconds ?? 600,
              midRollCuePoints: videoConfig.midRollCuePoints ?? [],
              frequencyCapPerHour: videoConfig.frequencyCapPerHour ?? 4,
            }
          : { enabled: false },
    };
  }

  listAll() {
    return this.prisma.adPlacement.findMany({ orderBy: [{ type: 'asc' }, { order: 'asc' }] });
  }

  async upsert(key: string, dto: UpsertAdPlacementDto) {
    const existing = await this.prisma.adPlacement.findUnique({ where: { key } });

    const data = {
      name: dto.name ?? existing?.name ?? key,
      description: dto.description ?? existing?.description ?? null,
      type: dto.type ?? existing?.type ?? AdType.DISPLAY,
      adClient: dto.adClient ?? existing?.adClient ?? null,
      adSlot: dto.adSlot ?? existing?.adSlot ?? null,
      format: dto.format ?? existing?.format ?? 'auto',
      fullWidthResponsive: dto.fullWidthResponsive ?? existing?.fullWidthResponsive ?? true,
      isEnabled: dto.isEnabled ?? existing?.isEnabled ?? false,
      order: dto.order ?? existing?.order ?? 0,
      config: (dto.config ?? existing?.config ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    };

    return this.prisma.adPlacement.upsert({
      where: { key },
      create: { key, ...data },
      update: data,
    });
  }

  async remove(key: string) {
    const existing = await this.prisma.adPlacement.findUnique({ where: { key } });
    if (!existing) throw new NotFoundException('Ad placement not found');
    await this.prisma.adPlacement.delete({ where: { key } });
    return { deleted: true };
  }
}
