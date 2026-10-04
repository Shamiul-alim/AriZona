import { Controller, Get, HttpStatus, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/decorators';
import { AppConfigService } from 'src/config/app-config.service';
import { PrismaService } from 'src/prisma/prisma.service';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness and database connectivity — used by the Docker healthcheck' })
  async check(@Res({ passthrough: true }) res: Response) {
    let database = 'down';
    let reason: string | undefined;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch (error) {
      // The class of failure, never the connection string: Prisma puts the host
      // and the user in its message, and this endpoint is public.
      reason = (error as { code?: string }).code ?? 'unreachable';
      this.logger.error(`Database health check failed (${reason})`);
    }

    // A body that says "degraded" under a 200 is a body nothing reads: an
    // uptime monitor, a load balancer and Render's own health check all look at
    // the status line. Answering 503 is what makes a database outage visible
    // without anyone watching the JSON.
    if (database !== 'up') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      service: this.config.values.siteName,
      environment: this.config.values.nodeEnv,
      database,
      ...(reason ? { databaseError: reason } : {}),
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
