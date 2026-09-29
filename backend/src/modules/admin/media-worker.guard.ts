import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { AppConfigService } from 'src/config/app-config.service';

/**
 * Authenticates the media worker, and nothing else.
 *
 * The worker used to sign in as a super admin, which handed a transcoding
 * process the ability to edit the catalogue, delete seasons and read users. It
 * now presents a shared secret that authorises exactly the job endpoints: claim
 * work, report progress, register what it produced, finish.
 *
 * With no token configured the endpoints are closed rather than open, so a
 * deployment that forgets to set one fails safe.
 */
@Injectable()
export class MediaWorkerGuard implements CanActivate {
  private readonly logger = new Logger(MediaWorkerGuard.name);

  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.values.mediaWorkerToken;
    if (!expected) {
      this.logger.warn('A media worker called in but MEDIA_WORKER_TOKEN is not configured; refusing.');
      throw new UnauthorizedException('Media worker access is not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!presented || !equals(presented, expected)) {
      throw new UnauthorizedException('Invalid media worker token');
    }
    return true;
  }
}

/** Constant-time comparison, so a wrong token cannot be found a byte at a time. */
function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    // timingSafeEqual throws on a length mismatch, and the length of a secret is
    // not worth leaking either, so compare against itself to keep the cost flat.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}
