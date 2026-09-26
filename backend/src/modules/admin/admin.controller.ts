import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ManaEvent, UserRole, UserStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { CurrentUser, Roles } from 'src/common/decorators';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import { AuthenticatedUser } from 'src/common/types/authenticated-user';
import { AnalyticsService } from '../analytics/analytics.service';
import { MediaProviderRegistry } from '../media/media-provider.registry';
import { AdminAnimeService } from './admin-anime.service';
import { AdminEpisodesService } from './admin-episodes.service';
import { AdminSeasonsService } from './admin-seasons.service';
import { AdminTaxonomyService } from './admin-taxonomy.service';
import { AdminUsersService } from './admin-users.service';
import { AdminAnimeQueryDto, CreateAnimeDto, UpdateAnimeDto } from './dto/admin-anime.dto';
import { CreateEpisodeDto, UpdateEpisodeDto } from './dto/admin-episode.dto';
import { AssignEpisodesDto, UpdateSeasonDto, UpsertSeasonDto } from './dto/admin-season.dto';

class SetRoleDto {
  @IsEnum(UserRole) role!: UserRole;
}

class SetStatusDto {
  @IsEnum(UserStatus) status!: UserStatus;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsDateString() suspendedUntil?: string;
}

class AdjustManaDto {
  @Type(() => Number) @IsInt() amount!: number;
  @IsString() @MaxLength(200) reason!: string;
}

class TaxonomyDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(400) description?: string;
  @IsOptional() @IsString() @MaxLength(16) color?: string;
  @IsOptional() @IsString() @MaxLength(500) logoUrl?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) order?: number;
}

class ManaRuleDto {
  @IsEnum(ManaEvent) event!: ManaEvent;
  @Type(() => Number) @IsInt() amount!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) dailyLimit?: number;
}

class RankDto {
  @IsString() @MaxLength(60) name!: string;
  @Type(() => Number) @IsInt() @Min(0) requiredMana!: number;
  @IsOptional() @IsString() @MaxLength(60) icon?: string;
  @IsOptional() @IsString() @MaxLength(16) color?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}

class FeaturedDto {
  @IsUUID() animeId!: string;
  @IsOptional() @IsString() @MaxLength(120) headline?: string;
  @IsOptional() @IsString() @MaxLength(250) subtitle?: string;
  @IsOptional() @IsString() @MaxLength(40) ctaLabel?: string;
  @IsOptional() @IsString() @MaxLength(500) backdropUrl?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) order?: number;
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly animeService: AdminAnimeService,
    private readonly episodesService: AdminEpisodesService,
    private readonly usersService: AdminUsersService,
    private readonly taxonomy: AdminTaxonomyService,
    private readonly seasonsService: AdminSeasonsService,
    private readonly analytics: AnalyticsService,
    private readonly mediaRegistry: MediaProviderRegistry,
  ) {}

  // --- Dashboard ------------------------------------------------------------

  @Get('dashboard')
  @ApiOperation({ summary: 'Headline metrics, view chart and provider status' })
  async dashboard() {
    const [stats, series, popular] = await Promise.all([
      this.analytics.dashboardStats(),
      this.analytics.viewSeries(30),
      this.analytics.popularAnime(8),
    ]);
    return { stats, viewSeries: series, popularAnime: popular, mediaProviders: this.mediaRegistry.status() };
  }

  // --- Seasons --------------------------------------------------------------

  @Get('anime/:animeId/seasons')
  @ApiOperation({ summary: 'Seasons of one anime, with episode counts' })
  listSeasons(@Param('animeId', ParseUUIDPipe) animeId: string) {
    return this.seasonsService.list(animeId);
  }

  @Post('seasons')
  @ApiOperation({ summary: 'Create or update a season by (anime, number) — safe to re-run' })
  upsertSeason(@Body() dto: UpsertSeasonDto) {
    return this.seasonsService.upsert(dto);
  }

  @Put('seasons/:id')
  @ApiOperation({ summary: 'Rename or renumber a season' })
  updateSeason(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSeasonDto) {
    return this.seasonsService.update(id, dto);
  }

  @Post('seasons/:id/episodes')
  @ApiOperation({ summary: 'Attach episodes to a season' })
  assignSeasonEpisodes(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignEpisodesDto) {
    return this.seasonsService.assignEpisodes(id, dto.episodeIds);
  }

  @Delete('seasons/:id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a season. Its episodes are detached, never deleted.' })
  removeSeason(@Param('id', ParseUUIDPipe) id: string) {
    return this.seasonsService.remove(id);
  }

  // --- Anime ----------------------------------------------------------------

  @Get('anime')
  @ApiOperation({ summary: 'Catalogue list, including drafts' })
  listAnime(@Query() query: AdminAnimeQueryDto, @Query() pagination: PaginationQueryDto) {
    return this.animeService.list(query, pagination.page, pagination.limit);
  }

  @Get('anime/:id')
  @ApiOperation({ summary: 'One catalogue entry, in editable form' })
  getAnime(@Param('id', ParseUUIDPipe) id: string) {
    return this.animeService.findOne(id);
  }

  @Post('anime')
  @ApiOperation({ summary: 'Create a catalogue entry' })
  createAnime(@Body() dto: CreateAnimeDto) {
    return this.animeService.create(dto);
  }

  @Put('anime/:id')
  @ApiOperation({ summary: 'Update a catalogue entry' })
  updateAnime(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAnimeDto) {
    return this.animeService.update(id, dto);
  }

  @Delete('anime/:id')
  @ApiOperation({ summary: 'Archive a catalogue entry (soft delete)' })
  removeAnime(@Param('id', ParseUUIDPipe) id: string) {
    return this.animeService.remove(id);
  }

  @Post('anime/:id/restore')
  @ApiOperation({ summary: 'Restore an archived entry' })
  restoreAnime(@Param('id', ParseUUIDPipe) id: string) {
    return this.animeService.restore(id);
  }

  // --- Episodes -------------------------------------------------------------

  @Get('episodes')
  @ApiOperation({ summary: 'Episode list, optionally scoped to one title' })
  listEpisodes(
    @Query() pagination: PaginationQueryDto,
    @Query('animeId') animeId?: string,
    @Query('search') search?: string,
  ) {
    return this.episodesService.list(animeId, pagination.page, pagination.limit, search);
  }

  @Get('episodes/:id')
  @ApiOperation({ summary: 'One episode with its full media configuration' })
  getEpisode(@Param('id', ParseUUIDPipe) id: string) {
    return this.episodesService.findOne(id);
  }

  @Post('episodes')
  @ApiOperation({ summary: 'Create an episode with its sources, subtitles and downloads' })
  createEpisode(@Body() dto: CreateEpisodeDto) {
    return this.episodesService.create(dto);
  }

  @Put('episodes/:id')
  @ApiOperation({ summary: 'Update an episode. Media is only replaced when sent.' })
  updateEpisode(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEpisodeDto) {
    return this.episodesService.update(id, dto);
  }

  @Delete('episodes/:id')
  @ApiOperation({ summary: 'Archive an episode (soft delete)' })
  removeEpisode(@Param('id', ParseUUIDPipe) id: string) {
    return this.episodesService.remove(id);
  }

  // --- Users ----------------------------------------------------------------

  @Get('users')
  @ApiOperation({ summary: 'User directory' })
  listUsers(
    @Query() pagination: PaginationQueryDto,
    @Query('q') q?: string,
    @Query('role') role?: UserRole,
    @Query('status') status?: UserStatus,
  ) {
    return this.usersService.list({ q, role, status }, pagination.page, pagination.limit);
  }

  @Patch('users/:id/role')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Change a user’s role' })
  setRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRoleDto,
  ) {
    return this.usersService.setRole(actor, id, dto.role);
  }

  @Patch('users/:id/status')
  @ApiOperation({ summary: 'Suspend, ban or reactivate an account' })
  setStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStatusDto,
  ) {
    return this.usersService.setStatus(actor, id, dto.status, dto);
  }

  @Post('users/:id/mana')
  @ApiOperation({ summary: 'Manually adjust a Mana balance' })
  adjustMana(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustManaDto,
  ) {
    return this.usersService.adjustMana(actor, id, dto.amount, dto.reason);
  }

  // --- Taxonomy -------------------------------------------------------------

  @Post('genres')
  @ApiOperation({ summary: 'Create a genre' })
  createGenre(@Body() dto: TaxonomyDto) {
    return this.taxonomy.createGenre(dto);
  }

  @Put('genres/:id')
  @ApiOperation({ summary: 'Update a genre' })
  updateGenre(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TaxonomyDto) {
    return this.taxonomy.updateGenre(id, dto);
  }

  @Delete('genres/:id')
  @ApiOperation({ summary: 'Delete a genre' })
  removeGenre(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxonomy.removeGenre(id);
  }

  @Post('studios')
  @ApiOperation({ summary: 'Create a studio' })
  createStudio(@Body() dto: TaxonomyDto) {
    return this.taxonomy.createStudio(dto);
  }

  @Put('studios/:id')
  @ApiOperation({ summary: 'Update a studio' })
  updateStudio(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TaxonomyDto) {
    return this.taxonomy.updateStudio(id, dto);
  }

  @Delete('studios/:id')
  @ApiOperation({ summary: 'Delete a studio' })
  removeStudio(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxonomy.removeStudio(id);
  }

  @Post('producers')
  @ApiOperation({ summary: 'Create a producer' })
  createProducer(@Body() dto: TaxonomyDto) {
    return this.taxonomy.createProducer(dto);
  }

  @Put('producers/:id')
  @ApiOperation({ summary: 'Update a producer' })
  updateProducer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TaxonomyDto) {
    return this.taxonomy.updateProducer(id, dto);
  }

  @Delete('producers/:id')
  @ApiOperation({ summary: 'Delete a producer' })
  removeProducer(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxonomy.removeProducer(id);
  }

  // --- Gamification ---------------------------------------------------------

  @Get('mana-rules')
  @ApiOperation({ summary: 'The Mana economy' })
  manaRules() {
    return this.taxonomy.manaRules();
  }

  @Put('mana-rules')
  @ApiOperation({ summary: 'Retune a Mana rule' })
  setManaRule(@Body() dto: ManaRuleDto) {
    return this.taxonomy.setManaRule(dto.event, dto.amount, dto.dailyLimit ?? 0);
  }

  @Get('ranks')
  @ApiOperation({ summary: 'The rank ladder' })
  ranks() {
    return this.taxonomy.ranks();
  }

  @Post('ranks')
  @ApiOperation({ summary: 'Create a rank' })
  createRank(@Body() dto: RankDto) {
    return this.taxonomy.createRank(dto);
  }

  @Put('ranks/:id')
  @ApiOperation({ summary: 'Update a rank' })
  updateRank(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RankDto) {
    return this.taxonomy.updateRank(id, dto);
  }

  @Delete('ranks/:id')
  @ApiOperation({ summary: 'Delete a rank' })
  removeRank(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxonomy.removeRank(id);
  }

  // --- Homepage slider ------------------------------------------------------

  @Get('featured')
  @ApiOperation({ summary: 'Homepage slider entries' })
  featured() {
    return this.taxonomy.featured();
  }

  @Put('featured')
  @ApiOperation({ summary: 'Add or update a slider entry' })
  upsertFeatured(@Body() dto: FeaturedDto) {
    return this.taxonomy.upsertFeatured(dto);
  }

  @Delete('featured/:animeId')
  @ApiOperation({ summary: 'Remove a slider entry' })
  removeFeatured(@Param('animeId', ParseUUIDPipe) animeId: string) {
    return this.taxonomy.removeFeatured(animeId);
  }

  // --- Audit ----------------------------------------------------------------

  @Get('activity-log')
  @ApiOperation({ summary: 'Audit trail of sensitive admin operations' })
  activityLog(@Query() pagination: PaginationQueryDto) {
    return this.taxonomy.activityLog(pagination.page, pagination.limit);
  }
}
