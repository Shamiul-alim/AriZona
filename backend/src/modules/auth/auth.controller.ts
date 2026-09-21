import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser, Public } from 'src/common/decorators';
import { AuthenticatedUser } from 'src/common/types/authenticated-user';
import { sha256 } from 'src/common/utils/crypto.util';
import { AppConfigService } from 'src/config/app-config.service';
import { AuthResult, AuthService, SessionContext } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyResetCodeDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { GoogleOAuthGuard } from './google-oauth.guard';
import { GoogleProfilePayload } from './strategies/google.strategy';

const REFRESH_COOKIE = 'anizora_refresh';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @ApiOperation({ summary: 'Create an account' })
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(dto, this.contextOf(req));
    return this.respond(res, result);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 8, ttl: 300_000 } })
  @ApiOperation({ summary: 'Sign in with email/username and password' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto, this.contextOf(req));
    return this.respond(res, result, dto.rememberMe);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = dto.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);
    if (!token) throw new UnauthorizedException('No refresh token supplied');
    const result = await this.auth.refresh(token, this.contextOf(req));
    return this.respond(res, result);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current refresh token' })
  async logout(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = dto.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);
    await this.auth.logout(token);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke every session for the signed-in user' })
  async logoutAll(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutEverywhere(user.id);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 4, ttl: 900_000 } })
  @ApiOperation({ summary: 'Email a one-time password reset code' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
    // Deliberately identical whether or not the address exists.
    return { message: 'If an account exists for that address, a reset code has been sent.' };
  }

  @Public()
  @Post('verify-reset-code')
  @HttpCode(HttpStatus.OK)
  // Tighter than the reset itself: this is the endpoint an attacker would
  // hammer to walk a six-digit space. The per-code attempt ceiling is the
  // real defence; this keeps the volume down before it is reached.
  @Throttle({ default: { limit: 8, ttl: 900_000 } })
  @ApiOperation({ summary: 'Check a reset code without spending it' })
  async verifyResetCode(@Body() dto: VerifyResetCodeDto) {
    await this.auth.verifyResetCode(dto.email, dto.code);
    return { valid: true };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 6, ttl: 900_000 } })
  @ApiOperation({ summary: 'Set a new password using an emailed code' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.email, dto.code, dto.password);
    return { message: 'Your password has been updated. Please sign in.' };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change the password of the signed-in user' })
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(user.id, dto);
    return { message: 'Password changed. All other sessions have been signed out.' };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm an email address' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.auth.verifyEmail(dto.token);
    return { message: 'Email confirmed.' };
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: 900_000 } })
  @ApiOperation({ summary: 'Send the confirmation email again' })
  async resendVerification(@CurrentUser() user: AuthenticatedUser) {
    await this.auth.resendVerification(user.id);
    return { message: 'Confirmation email sent.' };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The currently authenticated user' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Public()
  @Get('providers')
  @ApiOperation({ summary: 'Which sign-in providers are configured' })
  providers() {
    return { google: this.config.values.googleOAuth.enabled };
  }

  // --- Google OAuth ---------------------------------------------------------
  // Both routes 404 unless the operator supplied their own credentials.

  @Public()
  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  @ApiExcludeEndpoint()
  googleStart(): void {
    // Passport performs the redirect to Google.
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  @ApiExcludeEndpoint()
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const loginPage = new URL('/auth/login', this.config.values.siteUrl);
    const profile = req.user as unknown as GoogleProfilePayload | null;
    if (!profile) {
      loginPage.searchParams.set('error', 'google_cancelled');
      return res.redirect(loginPage.toString());
    }

    try {
      const result = await this.auth.loginWithGoogle(profile, this.contextOf(req));
      res.cookie(REFRESH_COOKIE, result.refreshToken, this.cookieOptions(true));
      // No token in the URL: the frontend callback page restores the session
      // from the httpOnly refresh cookie set above, so no credential ever sits
      // in browser history, logs or the Referer header.
      return res.redirect(new URL('/auth/callback', this.config.values.siteUrl).toString());
    } catch (error) {
      loginPage.searchParams.set('error', (error as Error).message || 'google_failed');
      return res.redirect(loginPage.toString());
    }
  }

  private respond(res: Response, result: AuthResult, rememberMe = false) {
    res.cookie(REFRESH_COOKIE, result.refreshToken, this.cookieOptions(rememberMe));
    return result;
  }

  private cookieOptions(rememberMe = false) {
    // Keyed on the real scheme, not NODE_ENV: browsers drop `Secure` cookies
    // on plain http, which silently logs users out on the next page load.
    // `SameSite=None` is only needed (and only allowed) over https, for a
    // frontend and API on different domains.
    const https = this.config.values.siteUrl.startsWith('https://');
    return {
      httpOnly: true,
      secure: https,
      sameSite: https ? ('none' as const) : ('lax' as const),
      path: '/',
      maxAge: rememberMe ? 90 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000,
    };
  }

  private contextOf(req: Request): SessionContext {
    return {
      userAgent: req.headers['user-agent'],
      ipHash: sha256(`${req.ip ?? 'unknown'}:${this.config.values.media.signingSecret}`),
    };
  }
}
