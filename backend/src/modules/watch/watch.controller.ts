import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import { AuthenticatedUser } from 'src/common/types/authenticated-user';
import { RecordOpenDto, UpdateProgressDto } from './dto/watch.dto';
import { WatchService } from './watch.service';

@ApiTags('watch-history')
@ApiBearerAuth()
@Controller('watch-history')
export class WatchController {
  constructor(private readonly watch: WatchService) {}

  @Post('progress')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save the current playback position' })
  updateProgress(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProgressDto) {
    return this.watch.updateProgress(user.id, dto);
  }

  @Post('open')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record that an episode was opened' })
  recordOpen(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordOpenDto) {
    return this.watch.recordOpen(user.id, dto.episodeId);
  }

  @Get('continue')
  @ApiOperation({ summary: 'Continue-watching rail' })
  continueWatching(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    const n = Number(limit);
    return this.watch.continueWatching(user.id, Number.isFinite(n) ? Math.min(24, Math.max(1, n)) : 12);
  }

  @Get('progress/:episodeId')
  @ApiOperation({ summary: "The signed-in user's saved position for one episode (null if none)" })
  async progress(@CurrentUser() user: AuthenticatedUser, @Param('episodeId', ParseUUIDPipe) episodeId: string) {
    return { progress: await this.watch.progressFor(user.id, episodeId) };
  }

  @Get()
  @ApiOperation({ summary: 'Full watch history, paginated' })
  history(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.watch.history(user.id, query.page, query.limit);
  }

  @Delete()
  @ApiOperation({ summary: 'Clear the whole history, or a single episode with ?episodeId=' })
  clear(@CurrentUser() user: AuthenticatedUser, @Query('episodeId') episodeId?: string) {
    return this.watch.clearHistory(user.id, episodeId);
  }
}
