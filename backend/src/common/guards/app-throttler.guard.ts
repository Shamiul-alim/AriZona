import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { safeEquals } from '../utils/crypto.util';

export const INTERNAL_TOKEN_HEADER = 'x-internal-token';

/**
 * Per-IP rate limiting, minus trusted server-side rendering traffic.
 *
 * Every page a visitor loads is rendered by the Next.js container, so all of
 * those API calls arrive from one IP. Without this exemption the per-IP limit
 * would treat the whole audience as a single client and lock the site up.
 * The SSR server proves itself with a shared secret the browser never sees.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const token = process.env.INTERNAL_API_TOKEN;
    if (token && token.length >= 16) {
      const req = context.switchToHttp().getRequest<Request>();
      const presented = req.headers[INTERNAL_TOKEN_HEADER];
      if (typeof presented === 'string' && safeEquals(presented, token)) return true;
    }
    return super.shouldSkip(context);
  }
}
