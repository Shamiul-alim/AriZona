import { Controller, Get, NotFoundException, Param, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, OptionalAuth, Public } from 'src/common/decorators';
import { AuthenticatedUser } from 'src/common/types/authenticated-user';
import { AnalyticsService } from '../analytics/analytics.service';
import { AnimeQueryDto } from './dto/anime-query.dto';
import { AnimeService, TrendingPeriod } from './anime.service';

@ApiTags('anime')
@Controller('anime')
export class AnimeController {
  constructor(
    private readonly anime: AnimeService,
    private readonly analytics: AnalyticsService,
  ) {}

  @OptionalAuth()
  @Get()
  @ApiOperation({ summary: 'Browse and filter the catalogue (server-side pagination)' })
  list(@Query() query: AnimeQueryDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.anime.list(query, user?.id);
  }

  @Public()
  @Get('featured')
  @ApiOperation({ summary: 'Homepage hero slider entries' })
  featured() {
    return this.anime.featured();
  }

  @Public()
  @Get('trending')
  @ApiQuery({ name: 'period', enum: ['day', 'week', 'month', 'all'], required: false })
  @ApiOperation({ summary: 'Trending titles for a time window' })
  trending(@Query('period') period: TrendingPeriod = 'week', @Query('limit') limit?: string) {
    return this.anime.trending(period, clampLimit(limit, 12));
  }

  @Public()
  @Get('top')
  @ApiQuery({ name: 'period', enum: ['day', 'week', 'month', 'all'], required: false })
  @ApiOperation({ summary: 'Top anime leaderboard for a time window' })
  top(@Query('period') period: TrendingPeriod = 'week', @Query('limit') limit?: string) {
    return this.anime.topAnime(period, clampLimit(limit, 10));
  }

  @Public()
  @Get('az-index')
  @ApiOperation({ summary: 'Per-letter counts for the A-Z browser' })
  azIndex() {
    return this.anime.azIndex();
  }

  @Public()
  @Get('random')
  @ApiOperation({ summary: 'Slug of a random published title' })
  async random() {
    const result = await this.anime.random();
    if (!result) throw new NotFoundException('There are no published titles yet');
    return result;
  }

  @OptionalAuth()
  @Get(':slug')
  @ApiOperation({ summary: 'Full detail for one title' })
  async detail(@Param('slug') slug: string, @Req() req: Request, @CurrentUser() user?: AuthenticatedUser) {
    const anime = await this.anime.findBySlug(slug, user?.id);
    // Fire-and-forget: a slow or failing view write must never delay the page.
    void this.analytics.recordAnimeView(anime.id, req, user?.id);
    return anime;
  }

  @Public()
  @Get(':slug/recommendations')
  @ApiOperation({ summary: 'Similar titles, computed from our own catalogue' })
  async recommendations(@Param('slug') slug: string, @Query('limit') limit?: string) {
    const anime = await this.anime.findBySlug(slug);
    return this.anime.recommendations(anime.id, clampLimit(limit, 12));
  }
}

function clampLimit(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(50, Math.max(1, Math.floor(n)));
}
