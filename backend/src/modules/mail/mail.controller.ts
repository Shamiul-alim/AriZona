import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { Roles } from 'src/common/decorators';
import { MailService } from './mail.service';

class MailTestDto {
  @Transform(({ value }) => String(value).trim().toLowerCase())
  @IsEmail({}, { message: 'Enter a valid email address' })
  to!: string;
}

/**
 * Operator-only view of the outgoing mail path.
 *
 * Password reset deliberately answers identically whether or not an account
 * exists, which also hides genuine delivery failures. This is where an
 * administrator can see what actually happened without reading process logs —
 * and without ever exposing a reset code, the SMTP password or a recipient
 * address.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/mail')
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Get('diagnostics')
  @ApiOperation({ summary: 'Effective mail configuration, SMTP handshake state and recent delivery outcomes' })
  async diagnostics() {
    const config = this.mail.describeConfig();
    const verify = await this.mail.verifyTransport();
    return {
      config,
      verify,
      /** Which submission ports this host can actually reach. */
      ports: this.mail.portResults(),
      // Common misconfigurations, named rather than left for the reader to spot.
      warnings: [
        config.driver !== 'smtp' && 'MAIL_DRIVER is not "smtp": mail is logged, never delivered.',
        config.driver === 'smtp' && !config.userSet && 'MAIL_USER is empty: the provider cannot authenticate.',
        config.driver === 'smtp' && !config.passwordSet && 'MAIL_PASSWORD is empty: the provider cannot authenticate.',
        config.fromDomain.endsWith('.local') &&
          `MAIL_FROM_ADDRESS is ${config.fromAddress}: no provider will relay an unverifiable sender domain.`,
        !verify.ok && verify.error && `SMTP handshake failed: ${verify.error}`,
        config.activePort !== null &&
          config.activePort !== config.port &&
          `Reaching the provider on fallback port ${config.activePort}; the configured port ${config.port} is blocked from this host.`,
      ].filter(Boolean),
      recentAttempts: this.mail.recentAttempts(),
    };
  }

  @Post('test')
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({ summary: 'Send a test message and report the provider response verbatim' })
  async test(@Body() dto: MailTestDto) {
    const attempt = await this.mail.sendTest(dto.to);
    return {
      ...attempt,
      // "Accepted" is the provider taking custody, not proof of inbox delivery.
      note: attempt.ok
        ? 'The provider accepted the message. Confirm it in the inbox — acceptance is not delivery.'
        : 'The provider did not accept the message.',
    };
  }
}
