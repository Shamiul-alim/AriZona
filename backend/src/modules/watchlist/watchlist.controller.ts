import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WatchStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { CurrentUser } from 'src/common/decorators';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import { AuthenticatedUser } from 'src/common/types/authenticated-user';
import { WatchlistService } from './watchlist.service';

class UpsertWatchlistDto {
  @IsEnum(WatchStatus)
  status!: WatchStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  progressEpisodes?: number;
}

@ApiTags('watchlist')
@ApiBearerAuth()
@Controller()
export class WatchlistController {
  constructor(private readonly watchlist: WatchlistService) {}

  @Get('watchlist')
  @ApiOperation({ summary: 'The signed-in user’s list, optionally filtered by status' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
    @Query('status') status?: WatchStatus,
  ) {
    return this.watchlist.list(user.id, status, query.page, query.limit);
  }

  @Get('watchlist/counts')
  @ApiOperation({ summary: 'Per-status totals' })
  counts(@CurrentUser() user: AuthenticatedUser) {
    return this.watchlist.counts(user.id);
  }

  @Put('watchlist/:slug')
  @ApiOperation({ summary: 'Add a title to the list or change its status' })
  upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Body() dto: UpsertWatchlistDto,
  ) {
    return this.watchlist.upsert(user.id, slug, dto.status, dto.progressEpisodes);
  }

  @Delete('watchlist/:slug')
  @ApiOperation({ summary: 'Remove a title from the list' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    return this.watchlist.remove(user.id, slug);
  }

  @Post('favorites/:slug/toggle')
  @ApiOperation({ summary: 'Add or remove a favourite' })
  toggleFavorite(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    return this.watchlist.toggleFavorite(user.id, slug);
  }

  @Get('favorites')
  @ApiOperation({ summary: 'Favourited titles' })
  favorites(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.watchlist.favorites(user.id, query.page, query.limit);
  }
}
