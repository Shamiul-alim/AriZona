import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController, ApiOperation } from '@nestjs/swagger';
import { Public } from 'src/common/decorators';
import { AdminMediaJobsService } from './admin-media-jobs.service';
import { MediaWorkerGuard } from './media-worker.guard';
import { CompleteMediaJobDto, RegisterMediaDto, ReportProgressDto } from './dto/admin-media-job.dto';

/**
 * The media worker's entire API surface.
 *
 * Deliberately separate from /admin: the worker holds a service token, not an
 * admin session, so it can claim work, say how far it has got, register what it
 * produced and finish — and nothing else. It cannot read users, edit the
 * catalogue or delete anything.
 *
 * `@Public` here only means "no JWT"; MediaWorkerGuard still demands the token.
 */
@ApiExcludeController()
@Public()
@UseGuards(MediaWorkerGuard)
@Controller('media-worker')
export class MediaWorkerController {
  constructor(private readonly jobs: AdminMediaJobsService) {}

  @Get('jobs')
  @ApiOperation({ summary: 'Masters waiting to be processed' })
  pending(@Query('limit') limit = '20') {
    return this.jobs.pending(Number(limit) || 20);
  }

  @Post('jobs/:id/claim')
  @ApiOperation({ summary: 'Take a job. Null when another worker already has it.' })
  claim(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.claim(id);
  }

  @Post('jobs/:id/progress')
  @ApiOperation({ summary: 'Heartbeat plus the step currently running' })
  progress(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReportProgressDto) {
    return this.jobs.reportProgress(id, dto.step, dto.detail);
  }

  @Post('jobs/:id/media')
  @ApiOperation({ summary: 'Register the renditions and tracks this job produced' })
  registerMedia(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RegisterMediaDto) {
    return this.jobs.registerProducedMedia(id, dto);
  }

  @Post('jobs/:id/complete')
  @ApiOperation({ summary: 'Finish. Ready is refused until renditions exist.' })
  complete(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteMediaJobDto) {
    return this.jobs.complete(id, dto.ready, dto.error);
  }
}
