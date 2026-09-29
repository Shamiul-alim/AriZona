import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

/** What a worker says about itself when it calls in. */
export interface Heartbeat {
  workerId: string;
  status?: string;
  currentJobLabel?: string;
  currentStep?: string;
  version?: string;
}

/**
 * Whether a media worker is listening.
 *
 * The worker runs on hardware the operator owns — often a desktop that is
 * switched off overnight — so "queued for a while" is a normal state, not a
 * fault. Without this the admin panel cannot tell that apart from a broken
 * pipeline, and the honest message for each is different: one says processing
 * will start when a worker comes online, the other says something needs
 * fixing.
 *
 * Nothing private about the machine is stored: no hostname, no address, no
 * paths. The id is a random value the worker generates once and keeps.
 */
@Injectable()
export class MediaWorkerPresenceService {
  private readonly logger = new Logger(MediaWorkerPresenceService.name);

  /**
   * A worker polls every 30s by default. Three missed beats is long enough that
   * a slow network or a long ffprobe never shows as offline, and short enough
   * that a machine someone shut down stops claiming to be there.
   */
  private static readonly ONLINE_WINDOW_MS = 100 * 1000;

  /** A worker that has not called in for a week is gone, not quiet. */
  private static readonly FORGET_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async record(beat: Heartbeat) {
    const id = beat.workerId.slice(0, 64);
    const data = {
      lastSeenAt: new Date(),
      status: (beat.status ?? 'IDLE').slice(0, 16),
      currentJobLabel: beat.currentJobLabel?.slice(0, 200) ?? null,
      currentStep: beat.currentStep?.slice(0, 60) ?? null,
      version: beat.version?.slice(0, 40) ?? null,
    };

    const existed = await this.prisma.mediaWorker.findUnique({ where: { id }, select: { id: true } });
    await this.prisma.mediaWorker.upsert({ where: { id }, create: { id, ...data }, update: data });
    if (!existed) this.logger.log(`A media worker came online (${id.slice(0, 8)}…)`);

    return { ok: true as const, onlineWindowSeconds: MediaWorkerPresenceService.ONLINE_WINDOW_MS / 1000 };
  }

  /**
   * The presence summary the admin panel renders.
   *
   * `online` is the question that actually matters — whether any worker at all
   * is listening — so it is answered directly rather than left to the caller to
   * derive from a list of timestamps.
   */
  async status() {
    await this.forgetLongGoneWorkers();

    const cutoff = new Date(Date.now() - MediaWorkerPresenceService.ONLINE_WINDOW_MS);
    const workers = await this.prisma.mediaWorker.findMany({
      orderBy: { lastSeenAt: 'desc' },
      take: 10,
      select: {
        id: true,
        lastSeenAt: true,
        status: true,
        currentJobLabel: true,
        currentStep: true,
        version: true,
      },
    });

    const rows = workers.map((w) => ({
      // Enough to tell two workers apart in the UI without publishing the
      // token-adjacent full id.
      id: w.id.slice(0, 8),
      online: w.lastSeenAt >= cutoff,
      lastSeenAt: w.lastSeenAt.toISOString(),
      secondsSinceSeen: Math.max(0, Math.round((Date.now() - w.lastSeenAt.getTime()) / 1000)),
      status: w.status,
      currentJobLabel: w.currentJobLabel,
      currentStep: w.currentStep,
      version: w.version,
    }));

    return {
      online: rows.some((w) => w.online),
      onlineWindowSeconds: MediaWorkerPresenceService.ONLINE_WINDOW_MS / 1000,
      workers: rows,
    };
  }

  private async forgetLongGoneWorkers() {
    const cutoff = new Date(Date.now() - MediaWorkerPresenceService.FORGET_AFTER_MS);
    await this.prisma.mediaWorker.deleteMany({ where: { lastSeenAt: { lt: cutoff } } });
  }
}
