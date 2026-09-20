import { BadRequestException, Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, OptionalAuth, Public } from 'src/common/decorators';
import { AuthenticatedUser } from 'src/common/types/authenticated-user';
import { AnalyticsService } from '../analytics/analytics.service';
import { EpisodesService } from './episodes.service';

@ApiTags('episodes')
@Controller()
export class EpisodesController {
  constructor(
    private readonly episodes: EpisodesService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Public()
  @Get('episodes/latest')
  @ApiQuery({ name: 'filter', enum: ['all', 'sub', 'dub'], required: false })
  @ApiOperation({ summary: 'Most recently published episodes across the catalogue' })
  latest(
    @Query('filter') filter: 'all' | 'sub' | 'dub' = 'all',
    @Query('limit') limit = '24',
    @Query('page') page = '1',
  ) {
    return this.episodes.latest(filter, clamp(limit, 24, 60), clamp(page, 1, 10_000));
  }

  @Public()
  @Get('anime/:slug/episodes')
  @ApiOperation({ summary: 'Episode list for one title, with optional search' })
  list(
    @Param('slug') slug: string,
    @Query('page') page = '1',
    @Query('limit') limit = '100',
    @Query('search') search?: string,
  ) {
    return this.episodes.listForAnime(slug, clamp(page, 1, 10_000), clamp(limit, 100, 500), search);
  }

  @OptionalAuth()
  @Get('watch/:slug/ep-:number')
  @ApiOperation({ summary: 'Full watch-page payload: episode, neighbours and signed playback manifest' })
  async watch(
    @Param('slug') slug: string,
    @Param('number') number: string,
    @Req() req: Request,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const episodeNumber = Number(number);
    if (!Number.isFinite(episodeNumber)) {
      throw new BadRequestException('Episode number must be numeric');
    }

    const payload = await this.episodes.watchPayload(slug, episodeNumber, user?.id);
    void this.analytics.recordEpisodeView(payload.episode.id, payload.anime.id, req, user?.id);
    return payload;
  }
}

function clamp(raw: string, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(max, Math.floor(n));
}
