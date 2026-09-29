import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { MediaWorkerGuard } from './media-worker.guard';
import type { AppConfigService } from 'src/config/app-config.service';

const TOKEN = 'kd83Jd0al+Zq2vX9rTn7wEs4YbMcQh1PjLgUvKxNfA0=';

function context(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: authorization ? { authorization } : {} }) }),
  } as unknown as ExecutionContext;
}

function guard(mediaWorkerToken: string | undefined) {
  return new MediaWorkerGuard({ values: { mediaWorkerToken } } as unknown as AppConfigService);
}

describe('MediaWorkerGuard', () => {
  it('admits a worker presenting the configured token', () => {
    expect(guard(TOKEN).canActivate(context(`Bearer ${TOKEN}`))).toBe(true);
  });

  it('fails closed when no token is configured', () => {
    // An unconfigured deployment must not leave the job endpoints open to
    // anyone who finds the URL.
    expect(() => guard(undefined).canActivate(context(`Bearer ${TOKEN}`))).toThrow(UnauthorizedException);
    expect(() => guard('').canActivate(context(`Bearer ${TOKEN}`))).toThrow(UnauthorizedException);
  });

  it('rejects a wrong token, including one that only shares a prefix', () => {
    const g = guard(TOKEN);
    expect(() => g.canActivate(context('Bearer wrong'))).toThrow(UnauthorizedException);
    expect(() => g.canActivate(context(`Bearer ${TOKEN.slice(0, -1)}X`))).toThrow(UnauthorizedException);
    expect(() => g.canActivate(context(`Bearer ${TOKEN.slice(0, -1)}`))).toThrow(UnauthorizedException);
    expect(() => g.canActivate(context(`Bearer ${TOKEN}extra`))).toThrow(UnauthorizedException);
  });

  it('rejects a missing or malformed authorization header', () => {
    const g = guard(TOKEN);
    expect(() => g.canActivate(context())).toThrow(UnauthorizedException);
    expect(() => g.canActivate(context(''))).toThrow(UnauthorizedException);
    expect(() => g.canActivate(context(TOKEN))).toThrow(UnauthorizedException);
    expect(() => g.canActivate(context(`Basic ${TOKEN}`))).toThrow(UnauthorizedException);
    expect(() => g.canActivate(context(`bearer ${TOKEN}`))).toThrow(UnauthorizedException);
  });

  it('never reveals the expected token in its message', () => {
    try {
      guard(TOKEN).canActivate(context('Bearer wrong'));
      fail('expected a rejection');
    } catch (error) {
      expect((error as Error).message).not.toContain(TOKEN);
    }
  });
});
