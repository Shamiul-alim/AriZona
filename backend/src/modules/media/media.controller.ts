import {
  Controller,
  Get,
  Head,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { Public, Roles } from 'src/common/decorators';
import {
  MediaNotFoundError,
  MediaProviderNotConfiguredError,
} from './providers/media-provider.interface';
import { MediaService } from './media.service';

@ApiTags('media')
@SkipThrottle()
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /**
   * The video endpoint. Relays Range requests to the configured provider and
   * mirrors its 206/Content-Range response, which is what makes the player's
   * seek bar, buffering indicator and progress tracking work for real.
   */
  @Public()
  @Get('stream/:variantId')
  @ApiExcludeEndpoint()
  async stream(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    this.media.verify('variant', variantId, exp, sig);

    const controller = new AbortController();
    // A viewer who seeks away mid-download should not leave us pulling bytes
    // from Drive for a response nobody will read.
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      const result = await this.media.openVariantStream(variantId, {
        range: req.headers.range,
        signal: controller.signal,
      });

      res.status(result.status);
      for (const [key, value] of Object.entries(result.headers)) {
        res.setHeader(key, value);
      }
      await pipeline(result.stream, res);
    } catch (error) {
      this.handleStreamError(error, res);
    }
  }

  /** Lets the browser discover size and Range support before it plays. */
  @Public()
  @Head('stream/:variantId')
  @ApiExcludeEndpoint()
  async streamHead(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ): Promise<void> {
    this.media.verify('variant', variantId, exp, sig);
    try {
      const result = await this.media.openVariantStream(variantId, { range: 'bytes=0-0' });
      result.stream.destroy();
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', result.headers['Content-Type'] ?? 'video/mp4');
      const total = result.headers['Content-Range']?.split('/')[1];
      if (total) res.setHeader('Content-Length', total);
      res.status(200).end();
    } catch (error) {
      this.handleStreamError(error, res);
    }
  }

  /** Separate audio files, streamed exactly like video (Range + 206). */
  @Public()
  @Get('audio/:trackId')
  @ApiExcludeEndpoint()
  async audio(
    @Param('trackId', ParseUUIDPipe) trackId: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    this.media.verify('audio', trackId, exp, sig);

    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      const result = await this.media.openAudioStream(trackId, {
        range: req.headers.range,
        signal: controller.signal,
      });
      res.status(result.status);
      for (const [key, value] of Object.entries(result.headers)) {
        res.setHeader(key, value);
      }
      await pipeline(result.stream, res);
    } catch (error) {
      this.handleStreamError(error, res);
    }
  }

  @Public()
  @Get('subtitle/:trackId')
  @Header('Cache-Control', 'public, max-age=3600')
  @ApiExcludeEndpoint()
  async subtitle(
    @Param('trackId', ParseUUIDPipe) trackId: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ): Promise<void> {
    this.media.verify('subtitle', trackId, exp, sig);
    try {
      const { body, contentType } = await this.media.readSubtitle(trackId);
      res.setHeader('Content-Type', contentType);
      res.status(200).send(body);
    } catch (error) {
      this.handleStreamError(error, res);
    }
  }

  @Get('providers')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Which media providers are wired up on this server' })
  providers() {
    return this.media.providerStatus();
  }

  private handleStreamError(error: unknown, res: Response): void {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (error instanceof RangeError) {
      res.status(416).setHeader('Content-Range', 'bytes */0');
      res.end();
      return;
    }
    if (error instanceof MediaNotFoundError || error instanceof NotFoundException) {
      res.status(404).json({ statusCode: 404, message: (error as Error).message, error: 'Not Found' });
      return;
    }
    if (error instanceof MediaProviderNotConfiguredError) {
      res.status(503).json({
        statusCode: 503,
        message: error.message,
        error: 'Service Unavailable',
      });
      return;
    }
    if ((error as { name?: string }).name === 'AbortError') {
      res.destroy();
      return;
    }
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({
      statusCode: status,
      message: (error as Error).message || 'Playback failed',
      error: 'Playback Error',
    });
  }
}
