import { ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppConfigService } from 'src/config/app-config.service';

/**
 * Wraps passport's Google guard so that:
 *  * the routes 404 cleanly when Google sign-in is not configured, instead of
 *    passport throwing "Unknown authentication strategy" (a 500), and
 *  * a failed or cancelled callback does not surface as a raw JSON error — the
 *    controller sees no user and redirects back to the login page.
 */
@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: AppConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (!this.config.values.googleOAuth.enabled) {
      throw new NotFoundException('Google sign-in is not configured on this server');
    }
    return super.canActivate(context);
  }

  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) return null as TUser;
    return user;
  }
}
