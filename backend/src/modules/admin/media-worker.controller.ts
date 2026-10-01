import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { ApiExcludeController, ApiOperation } from '@nestjs/swagger';
import { Public } from 'src/common/decorators';
import { AdminMediaJobsService } from './admin-media-jobs.service';
import { MediaWorkerGuard } from './media-worker.guard';
import { MediaWorkerPresenceService } from './media-worker-presence.service';
import {
  CompleteMediaJobDto,
  RegisterMediaDto,
  ReportProgressDto,
  WorkerHeartbeatDto,
} from './dto/admin-media-job.dto';

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
  constructor(
    private readonly jobs: AdminMediaJobsService,
    private readonly presence: MediaWorkerPresenceService,
  ) {}

  /**
   * “Still here.” Sent whether or not there is work, which is the point: a
   * quiet queue and a switched-off machine look identical otherwise, and the
   * admin panel should not call the first one a failure.
   */
  @Post('heartbeat')
  @ApiOperation({ summary: 'Report that this worker is listening' })
  heartbeat(@Body() dto: WorkerHeartbeatDto) {
    return this.presence.record(dto);
  }

  /**
   * The bytes of the file this job reads its tracks from.
   *
   * A worker normally opens the file in Drive itself. It cannot when the admin
   * pasted a link to a file they created: a credential scoped to the app's own
   * files gets 404 on it, however valid the link. This API can read it — it has
   * to, or the episode would not play — so the worker falls back to here
   * instead of the deployment needing a worker credential with read access to
   * someone's whole Drive.
   *
   * Scoped to this job's own track source, so the token cannot be used to pull
   * an arbitrary Drive file through the API.
   */
  @Get('jobs/:id/source')
  @ApiOperation({ summary: "Stream the file a track job reads, for a worker that cannot open it directly" })
  async trackSource(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      const result = await this.jobs.openTrackSourceStream(id, {
        range: req.headers.range,
        signal: controller.signal,
      });
      res.status(result.status);
      for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
      await pipeline(result.stream, res);
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const status = (error as { status?: number }).status ?? 500;
      res.status(status).json({ statusCode: status, message: (error as Error).message });
    }
  }

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
