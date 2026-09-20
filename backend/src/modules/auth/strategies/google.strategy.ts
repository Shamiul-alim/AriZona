import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { randomToken, safeEquals } from 'src/common/utils/crypto.util';
import { AppConfigService } from 'src/config/app-config.service';

export interface GoogleProfilePayload {
  googleId: string;
  email: string;
  /** Google's own `email_verified` claim. Account linking depends on it. */
  emailVerified: boolean;
  displayName?: string;
  avatarUrl?: string;
}

export const OAUTH_STATE_COOKIE = 'anizora_oauth_state';

/**
 * OAuth `state` bound to a short-lived httpOnly cookie.
 *
 * This is the CSRF protection for the login redirect: the callback is only
 * accepted if it carries the same random value we set on the browser that
 * started the flow. The app has no server-side sessions, so passport's default
 * session-backed store cannot be used.
 */
class CookieStateStore {
  constructor(private readonly secure: boolean) {}

  store(req: Request, _meta: unknown, callback: (err: Error | null, state?: string) => void): void {
    const state = randomToken(24);
    (req.res as Response).cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60 * 1000,
    });
    callback(null, state);
  }

  verify(
    req: Request,
    state: string,
    callback: (err: Error | null, ok: boolean, info?: { message: string }) => void,
  ): void {
    const expected = req.cookies?.[OAUTH_STATE_COOKIE] as string | undefined;
    (req.res as Response).clearCookie(OAUTH_STATE_COOKIE, { path: '/' });
    if (!expected || !state || !safeEquals(expected, state)) {
      callback(null, false, { message: 'Sign-in session expired or was tampered with. Please try again.' });
      return;
    }
    callback(null, true);
  }
}

/**
 * Registered only when GOOGLE_OAUTH_ENABLED is true AND the operator has
 * supplied their own client credentials — see AuthModule.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: AppConfigService) {
    const oauth = config.values.googleOAuth;
    super({
      clientID: oauth.clientId,
      clientSecret: oauth.clientSecret,
      callbackURL: oauth.callbackUrl,
      scope: ['openid', 'email', 'profile'],
      store: new CookieStateStore(config.values.siteUrl.startsWith('https://')),
    } as never);
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile, done: VerifyCallback): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new UnauthorizedException('Your Google account did not return an email address'), false);
      return;
    }
    const verifiedClaim = (profile.emails?.[0] as { verified?: boolean | string } | undefined)?.verified;
    const payload: GoogleProfilePayload = {
      googleId: profile.id,
      email: email.toLowerCase(),
      emailVerified: verifiedClaim === true || verifiedClaim === 'true',
      displayName: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value,
    };
    done(null, payload);
  }
}
