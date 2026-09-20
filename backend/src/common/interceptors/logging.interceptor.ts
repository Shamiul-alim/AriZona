import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const started = Date.now();

    return next.handle().pipe(
      tap(() => {
        const res = http.getResponse<Response>();
        const ms = Date.now() - started;
        if (ms > 1000) {
          this.logger.warn(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms (slow)`);
        } else {
          this.logger.debug(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
        }
      }),
    );
  }
}
