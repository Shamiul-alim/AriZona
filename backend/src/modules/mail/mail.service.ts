import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { AppConfigService } from 'src/config/app-config.service';

interface SendOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * MAIL_DRIVER=log writes the message to the application log instead of sending
 * it. That is the development default so no SMTP account is required to
 * exercise the password-reset flow end to end.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: AppConfigService) {}

  onModuleInit(): void {
    const mail = this.config.values.mail;
    if (mail.driver !== 'smtp') {
      this.logger.warn('MAIL_DRIVER=log — outgoing email will be printed to the log, not delivered.');
      return;
    }
    this.transporter = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      auth: mail.user ? { user: mail.user, pass: mail.password } : undefined,
    });
  }

  async send({ to, subject, html, text }: SendOptions): Promise<void> {
    const { mail } = this.config.values;
    const from = `"${mail.fromName}" <${mail.fromAddress}>`;

    if (!this.transporter) {
      this.logger.log(`[mail:log] to=${to} subject="${subject}"\n${text}`);
      return;
    }

    try {
      await this.transporter.sendMail({ from, to, subject, html, text });
      this.logger.log(`Sent "${subject}" to ${to}`);
    } catch (error) {
      // A failed notification must never break the user-facing request.
      this.logger.error(`Failed to send "${subject}" to ${to}`, error as Error);
    }
  }

  async sendPasswordReset(to: string, username: string, resetUrl: string): Promise<void> {
    const siteName = this.config.values.siteName;
    await this.send({
      to,
      subject: `Reset your ${siteName} password`,
      text: `Hi ${username},\n\nReset your password using the link below. It expires in 1 hour.\n\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`,
      html: this.layout(
        siteName,
        `<p>Hi ${escapeHtml(username)},</p>
         <p>We received a request to reset your password. This link expires in <strong>1 hour</strong>.</p>
         <p style="margin:32px 0"><a href="${resetUrl}" style="background:#7c5cff;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block">Reset password</a></p>
         <p style="color:#9ba0b5;font-size:13px">If the button does not work, paste this into your browser:<br><span style="word-break:break-all">${resetUrl}</span></p>
         <p style="color:#9ba0b5;font-size:13px">If you did not request this, you can safely ignore this email.</p>`,
      ),
    });
  }

  /**
   * Sends the one-time password-reset code.
   *
   * The code is shown in the body rather than embedded in a link: nothing here
   * is clickable, so the message cannot be forwarded into a working reset, and
   * a password is never sent by email.
   */
  async sendPasswordResetCode(to: string, username: string, code: string, expiresInMinutes: number): Promise<void> {
    const siteName = this.config.values.siteName;
    const spaced = code.split('').join(' ');
    await this.send({
      to,
      subject: `${code} is your ${siteName} password reset code`,
      text: `Hi ${username},\n\nYour ${siteName} password reset code is ${code}.\nIt expires in ${expiresInMinutes} minutes and can be used once.\n\nIf you did not request this, ignore this email — your password will not change.`,
      html: this.layout(
        siteName,
        `<p>Hi ${escapeHtml(username)},</p>
         <p>Use this code to reset your ${escapeHtml(siteName)} password.</p>
         <p style="margin:32px 0">
           <span style="display:inline-block;background:#12121c;border:1px solid #2a2a3d;color:#fff;font-size:30px;font-weight:700;letter-spacing:10px;padding:18px 28px;border-radius:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(spaced)}</span>
         </p>
         <p>It expires in <strong>${expiresInMinutes} minutes</strong> and can only be used once.</p>
         <p style="color:#9ba0b5;font-size:13px">If you did not request this, ignore this email — your password will not change. Never share this code with anyone.</p>`,
      ),
    });
  }

  async sendEmailVerification(to: string, username: string, verifyUrl: string): Promise<void> {
    const siteName = this.config.values.siteName;
    await this.send({
      to,
      subject: `Confirm your ${siteName} account`,
      text: `Hi ${username},\n\nConfirm your email address:\n\n${verifyUrl}`,
      html: this.layout(
        siteName,
        `<p>Hi ${escapeHtml(username)},</p>
         <p>Welcome to ${escapeHtml(siteName)}. Confirm your email address to finish setting up your account.</p>
         <p style="margin:32px 0"><a href="${verifyUrl}" style="background:#7c5cff;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block">Confirm email</a></p>`,
      ),
    });
  }

  private layout(siteName: string, inner: string): string {
    return `<!doctype html><html><body style="margin:0;background:#07070c;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
        <table role="presentation" width="100%" style="max-width:520px;background:#0e0e17;border:1px solid #1e1f2e;border-radius:16px">
          <tr><td style="padding:32px">
            <div style="font-size:20px;font-weight:700;color:#ecedf5;margin-bottom:24px">${escapeHtml(siteName)}</div>
            <div style="color:#c7cad8;font-size:15px;line-height:1.6">${inner}</div>
          </td></tr>
        </table>
      </td></tr></table></body></html>`;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
