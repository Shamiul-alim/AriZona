import { HttpStatus } from '@nestjs/common';
import { HealthController } from './health.controller';
import type { AppConfigService } from 'src/config/app-config.service';
import type { PrismaService } from 'src/prisma/prisma.service';

const config = { values: { siteName: 'AniZora', nodeEnv: 'production' } } as AppConfigService;

function controller(queryRaw: jest.Mock) {
  return new HealthController({ $queryRaw: queryRaw } as unknown as PrismaService, config);
}
const response = () => {
  const res = { status: jest.fn() };
  return res as unknown as Parameters<HealthController['check']>[0] & { status: jest.Mock };
};

describe('HealthController', () => {
  it('reports ok and leaves the status line alone when the database answers', async () => {
    const res = response();
    const body = await controller(jest.fn().mockResolvedValue([{ 1: 1 }])).check(res);

    expect(body.status).toBe('ok');
    expect(body.database).toBe('up');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('answers 503 when the database is unreachable', async () => {
    // "degraded" inside a 200 is a body nothing reads: monitors and load
    // balancers look at the status line.
    const res = response();
    const body = await controller(jest.fn().mockRejectedValue(Object.assign(new Error('nope'), { code: 'P1001' }))).check(res);

    expect(body.status).toBe('degraded');
    expect(body.database).toBe('down');
    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it('names the failure class without leaking the connection details', async () => {
    const res = response();
    const secret = 'postgresql://user:hunter2@db.example.com:5432/postgres';
    const body = await controller(
      jest.fn().mockRejectedValue(Object.assign(new Error(`Can't reach database server at ${secret}`), { code: 'P1001' })),
    ).check(res);

    expect(body.databaseError).toBe('P1001');
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(JSON.stringify(body)).not.toContain('db.example.com');
  });

  it('falls back to a generic reason when Prisma gives no code', async () => {
    const res = response();
    const body = await controller(jest.fn().mockRejectedValue(new Error('socket hang up'))).check(res);

    expect(body.databaseError).toBe('unreachable');
    expect(JSON.stringify(body)).not.toContain('socket hang up');
  });
});
