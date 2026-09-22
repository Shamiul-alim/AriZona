import { MailService } from './mail.service';

/**
 * The reset subject deliberately leads with the code so it shows in a phone's
 * notification preview. That makes the subject sensitive, and it is recorded
 * in the delivery history the admin diagnostic serves — so it must be masked
 * before it is stored anywhere.
 */
describe('MailService delivery records', () => {
  function service(driver: 'smtp' | 'log' = 'log', nodeEnv = 'production') {
    const config = {
      values: {
        nodeEnv,
        siteName: 'AniZora',
        siteUrl: 'https://anizora.test',
        mail: {
          driver,
          host: 'smtp-relay.brevo.test',
          port: 587,
          secure: false,
          user: 'relay-login@smtp-brevo.test',
          password: 'super-secret',
          fromName: 'AniZora',
          fromAddress: 'no-reply@anizora.test',
        },
      },
    };
    return new MailService(config as never);
  }

  it('masks the reset code out of the recorded subject', async () => {
    const mail = service();
    await mail.sendPasswordResetCode('viewer@example.com', 'viewer', '760468', 10);

    const [attempt] = mail.recentAttempts();
    expect(attempt.subject).not.toContain('760468');
    expect(attempt.subject).toBe('•••••• is your AniZora password reset code');
  });

  it('records only the recipient domain, never the address', async () => {
    const mail = service();
    await mail.sendPasswordResetCode('someone.private@example.com', 'viewer', '111111', 10);

    const [attempt] = mail.recentAttempts();
    expect(JSON.stringify(attempt)).not.toContain('someone.private');
    expect(attempt.recipientDomain).toBe('example.com');
  });

  it('reports a dropped message as a failure rather than success', async () => {
    const mail = service();
    const attempt = await mail.sendPasswordResetCode('viewer@example.com', 'viewer', '222222', 10);

    // MAIL_DRIVER=log means nothing was delivered; that must not read as sent.
    expect(attempt.ok).toBe(false);
    expect(attempt.driver).toBe('log');
  });

  it('never exposes the SMTP password, and truncates the login', () => {
    const described = service('smtp').describeConfig();

    expect(JSON.stringify(described)).not.toContain('super-secret');
    expect(described.passwordSet).toBe(true);
    expect(described.userHint).toBe('rel***@smtp-brevo.test');
  });

  it('keeps a bounded history', async () => {
    const mail = service();
    for (let i = 0; i < 25; i += 1) {
      await mail.sendPasswordResetCode('viewer@example.com', 'viewer', '333333', 10);
    }
    expect(mail.recentAttempts().length).toBeLessThanOrEqual(20);
  });
});
