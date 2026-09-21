/**
 * Counts the SQL statements and wall time each catalogue query costs.
 *
 * Relation loading is the thing being measured: Prisma can fetch each relation
 * with its own round trip, which is cheap against a local database and
 * expensive when the database is in another region.
 *
 *   DATABASE_URL=... node scripts/bench-queries.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });

let count = 0;
prisma.$on('query', () => {
  count += 1;
});

const PUBLISHED = { publishStatus: 'PUBLISHED', deletedAt: null };

const cardSelect = {
  id: true,
  slug: true,
  titleEnglish: true,
  titleJapanese: true,
  posterUrl: true,
  type: true,
  status: true,
  score: true,
  scoreCount: true,
  releaseYear: true,
  season: true,
  totalEpisodes: true,
  subEpisodeCount: true,
  dubEpisodeCount: true,
  durationMinutes: true,
  ageRating: true,
  viewCount: true,
  updatedAt: true,
  genres: { select: { genre: { select: { name: true, slug: true } } } },
};

async function bench(label, fn) {
  await fn(); // warm the connection and any plan cache
  count = 0;
  const started = Date.now();
  const rows = await fn();
  const ms = Date.now() - started;
  console.log(`  ${label.padEnd(34)} ${String(count).padStart(2)} queries  ${String(ms).padStart(5)} ms  (${Array.isArray(rows) ? rows.length : 1} rows)`);
}

await bench('featured — OLD deep include', () =>
  prisma.featuredAnime.findMany({
    where: { isActive: true, anime: PUBLISHED },
    orderBy: { order: 'asc' },
    include: {
      anime: {
        include: {
          studio: true,
          genres: { select: { genre: true } },
          producers: { select: { producer: true } },
          titles: true,
          relationsFrom: { include: { relatedAnime: { select: cardSelect } } },
        },
      },
    },
    take: 8,
  }),
);

await bench('featured — NEW lean select', () =>
  prisma.featuredAnime.findMany({
    where: { isActive: true, anime: PUBLISHED },
    orderBy: { order: 'asc' },
    include: {
      anime: { select: { ...cardSelect, synopsis: true, bannerUrl: true, studio: { select: { name: true } } } },
    },
    take: 8,
  }),
);

await bench('anime list (cards, limit 14)', () =>
  prisma.anime.findMany({ where: PUBLISHED, select: cardSelect, take: 14, orderBy: { createdAt: 'desc' } }),
);

await bench('latest episodes (limit 12)', () =>
  prisma.episode.findMany({
    where: { publishStatus: 'PUBLISHED', deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 12,
    include: { anime: { select: { slug: true, titleEnglish: true, posterUrl: true } } },
  }),
);

await prisma.$disconnect();
