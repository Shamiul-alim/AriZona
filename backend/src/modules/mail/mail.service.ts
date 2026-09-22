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
 * The outcome of one delivery attempt, kept so an operator can tell the
 * difference between "we never tried", "the provider refused it" and "the
 * provider accepted it" without access to the raw process log.
 */
export interface MailAttempt {
  at: string;
  subject: string;
  /** Recipient domain only — never the full address. */
  recipientDomain: string;
  driver: 'smtp' | 'log';
  ok: boolean;
  messageId?: string;
  /** The provider's own reply, e.g. "250 2.0.0 OK: queued as ...". */
  providerResponse?: string;
  accepted?: number;
  rejected?: number;
  error?: string;
  errorCode?: string;
}

const ATTEMPT_HISTORY = 20;

function recipientDomain(address: string): string {
  const at = address.lastIndexOf('@');
  return at === -1 ? 'unknown' : address.slice(at + 1).toLowerCase();
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
  private readonly attempts: MailAttempt[] = [];
  /** Result of the last SMTP handshake check, for the admin diagnostic. */
  private verifyState: { ok: boolean; checkedAt: string; error?: string } | null = null;

  constructor(private readonly config: AppConfigService) {}

  onModuleInit(): void {
    const mail = this.config.values.mail;
    if (mail.driver !== 'smtp') {
      // In production this is almost certainly a misconfiguration rather than a
      // choice: every password reset will be silently dropped. Say so loudly,
      // because the user-facing response is deliberately indistinguishable
      // from success.
      const message =
        'MAIL_DRIVER is not "smtp" — outgoing email is written to the log and NEVER delivered. ' +
        'Password reset codes will not reach anyone.';
      if (this.config.values.nodeEnv === 'production') this.logger.error(message);
      else this.logger.warn(message);
      return;
    }

    if (!mail.user || !mail.password) {
      this.logger.error('MAIL_DRIVER=smtp but MAIL_USER/MAIL_PASSWORD are empty — the provider will refuse to relay.');
    }

    this.transporter = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      auth: mail.user ? { user: mail.user, pass: mail.password } : undefined,
    });

    // Prove at boot that host/port/credentials actually work, rather than
    // discovering it only when someone is locked out of their account.
    void this.verifyTransport();
  }

  /** Opens a connection and authenticates, without sending anything. */
  async verifyTransport(): Promise<{ ok: boolean; checkedAt: string; error?: string }> {
    if (!this.transporter) {
      this.verifyState = { ok: false, checkedAt: new Date().toISOString(), error: 'No SMTP transport configured' };
      return this.verifyState;
    }
    try {
      await this.transporter.verify();
      this.verifyState = { ok: true, checkedAt: new Date().toISOString() };
      this.logger.log(`SMTP ready — ${this.config.values.mail.host}:${this.config.values.mail.port}`);
    } catch (error) {
      const err = error as Error & { code?: string };
      this.verifyState = {
        ok: false,
        checkedAt: new Date().toISOString(),
        error: `${err.code ? `${err.code}: ` : ''}${err.message}`,
      };
      this.logger.error(`SMTP verify failed — ${this.verifyState.error}`);
    }
    return this.verifyState;
  }

  private record(attempt: MailAttempt): MailAttempt {
    this.attempts.unshift(attempt);
    if (this.attempts.length > ATTEMPT_HISTORY) this.attempts.length = ATTEMPT_HISTORY;
    return attempt;
  }

  /** Recent delivery outcomes, newest first. Contains no addresses or codes. */
  recentAttempts(): MailAttempt[] {
    return [...this.attempts];
  }

  lastVerify(): { ok: boolean; checkedAt: string; error?: string } | null {
    return this.verifyState;
  }

  /**
   * Returns the outcome instead of throwing: a failed notification must never
   * break the user-facing request, but it must never be invisible either.
   */
  async send({ to, subject, html, text }: SendOptions): Promise<MailAttempt> {
    const { mail } = this.config.values;
    const from = `"${mail.fromName}" <${mail.fromAddress}>`;
    const base = { at: new Date().toISOString(), subject, recipientDomain: recipientDomain(to) };

    if (!this.transporter) {
      this.logger.log(`[mail:log] to=${to} subject="${subject}"\n${text}`);
      return this.record({
        ...base,
        driver: 'log',
        ok: false,
        error: 'MAIL_DRIVER=log — message was logged, not delivered',
      });
    }

    try {
      const info = (await this.transporter.sendMail({ from, to, subject, html, text })) as {
        messageId?: string;
        response?: string;
        accepted?: unknown[];
        rejected?: unknown[];
      };
      const attempt = this.record({
        ...base,
        driver: 'smtp',
        ok: (info.rejected?.length ?? 0) === 0 && (info.accepted?.length ?? 0) > 0,
        messageId: info.messageId,
        providerResponse: info.response,
        accepted: info.accepted?.length ?? 0,
        rejected: info.rejected?.length ?? 0,
      });
      this.logger.log(
        `mail sent subject="${subject}" domain=${attempt.recipientDomain} accepted=${attempt.accepted} ` +
          `rejected=${attempt.rejected} messageId=${attempt.messageId ?? 'none'} response="${attempt.providerResponse ?? ''}"`,
      );
      if (!attempt.ok) {
        this.logger.error(`mail REJECTED by provider subject="${subject}" domain=${attempt.recipientDomain}`);
      }
      return attempt;
    } catch (error) {
      const err = error as Error & { code?: string; responseCode?: number; response?: string };
      const attempt = this.record({
        ...base,
        driver: 'smtp',
        ok: false,
        error: err.message,
        errorCode: err.code ?? (err.responseCode ? String(err.responseCode) : undefined),
        providerResponse: err.response,
      });
      this.logger.error(
        `mail FAILED subject="${subject}" domain=${attempt.recipientDomain} ` +
          `code=${attempt.errorCode ?? 'none'} error="${err.message}" response="${err.response ?? ''}"`,
      );
      return attempt;
    }
  }

  /**
   * The effective mail settings, safe to show an administrator: the SMTP login
   * is truncated and the password is reported only as present or absent.
   */
  describeConfig() {
    const m = this.config.values.mail;
    return {
      driver: m.driver,
      host: m.host,
      port: m.port,
      secure: m.secure,
      userSet: Boolean(m.user),
      userHint: m.user ? `${m.user.slice(0, 3)}***@${recipientDomain(m.user)}` : null,
      passwordSet: Boolean(m.password),
      fromName: m.fromName,
      fromAddress: m.fromAddress,
      /** Brevo only relays for a sender it has verified — worth seeing. */
      fromDomain: recipientDomain(m.fromAddress),
      transportReady: this.transporter !== null,
    };
  }

  /** Sends a plain test message so an operator can confirm real delivery. */
  async sendTest(to: string): Promise<MailAttempt> {
    const siteName = this.config.values.siteName;
    const stamp = new Date().toISOString();
    return this.send({
      to,
      subject: `${siteName} mail delivery test`,
      text: `This is a delivery test from ${siteName} sent at ${stamp}. If you are reading it, SMTP delivery works.`,
      html: this.layout(
        siteName,
        `<p>This is a delivery test from ${escapeHtml(siteName)}.</p>
         <p>Sent at <strong>${escapeHtml(stamp)}</strong>. If you are reading this, SMTP delivery works.</p>`,
      ),
    });
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
  async sendPasswordResetCode(
    to: string,
    username: string,
    code: string,
    expiresInMinutes: number,
  ): Promise<MailAttempt> {
    const siteName = this.config.values.siteName;
    const spaced = code.split('').join(' ');
    return this.send({
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

  /**
   * Sent when someone asks to reset the password of an account that only has
   * Google sign-in. There is no password to reset, and creating one from an
   * email code would weaken an account that chose not to have one.
   */
  async sendGoogleAccountNotice(to: string, username: string): Promise<MailAttempt> {
    const siteName = this.config.values.siteName;
    const loginUrl = `${this.config.values.siteUrl}/auth/login`;
    return this.send({
      to,
      subject: `Signing in to ${siteName}`,
      text:
        `Hi ${username},\n\nSomeone asked to reset the password for your ${siteName} account. ` +
        `That account signs in with Google, so it has no password to reset.\n\n` +
        `Use "Continue with Google" at ${loginUrl}.\n\n` +
        `If this wasn't you, no action is needed — nothing about your account has changed.`,
      html: this.layout(
        siteName,
        `<p>Hi ${escapeHtml(username)},</p>
         <p>Someone asked to reset the password for your ${escapeHtml(siteName)} account. That account signs in with <strong>Google</strong>, so there is no password to reset.</p>
         <p style="margin:32px 0"><a href="${loginUrl}" style="background:#7c5cff;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block">Continue with Google</a></p>
         <p style="color:#9ba0b5;font-size:13px">If this wasn't you, no action is needed — nothing about your account has changed.</p>`,
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
