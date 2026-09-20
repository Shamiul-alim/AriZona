import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Flat key/value map of settings marked public. Cached by the frontend. */
  async publicSettings(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.siteSetting.findMany({ where: { isPublic: true } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async all() {
    const rows = await this.prisma.siteSetting.findMany({ orderBy: [{ group: 'asc' }, { key: 'asc' }] });
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = grouped.get(row.group) ?? [];
      list.push(row);
      grouped.set(row.group, list);
    }
    return [...grouped.entries()].map(([group, settings]) => ({ group, settings }));
  }

  async set(key: string, value: unknown) {
    return this.prisma.siteSetting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue, group: 'general' },
      update: { value: value as Prisma.InputJsonValue },
    });
  }

  async setMany(values: Record<string, unknown>) {
    const keys = Object.keys(values);
    await this.prisma.$transaction(
      keys.map((key) =>
        this.prisma.siteSetting.upsert({
          where: { key },
          create: { key, value: values[key] as Prisma.InputJsonValue, group: 'general' },
          update: { value: values[key] as Prisma.InputJsonValue },
        }),
      ),
    );
    return { updated: keys.length };
  }

  async get<T>(key: string, fallback: T): Promise<T> {
    const row = await this.prisma.siteSetting.findUnique({ where: { key } });
    return row ? (row.value as T) : fallback;
  }
}
