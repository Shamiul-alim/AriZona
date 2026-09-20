/**
 * One-off migration: move locally-stored artwork to Cloudinary.
 *
 * When the site moves from Docker (where uploads live on a volume) to a host
 * with an ephemeral filesystem, every `/uploads/...` URL already in the
 * database would 404. This uploads each referenced file and rewrites the row
 * to Cloudinary's delivery URL.
 *
 * Safe to re-run: rows already pointing at an absolute http(s) URL are skipped,
 * and each distinct local file is uploaded only once.
 *
 * Usage (from backend/):
 *   DATABASE_URL=... CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... \
 *   CLOUDINARY_API_SECRET=... node scripts/migrate-uploads-to-cloudinary.mjs [--dry-run]
 */
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';

const DRY_RUN = process.argv.includes('--dry-run');
const UPLOADS_ROOT = resolve(process.env.UPLOADS_ROOT ?? 'storage/uploads');
const FOLDER = process.env.CLOUDINARY_FOLDER ?? 'anizora';

/** Every column that can hold an uploaded image URL. */
const TARGETS = [
  { table: 'anime', columns: ['posterUrl', 'bannerUrl'] },
  { table: 'episodes', columns: ['thumbnailUrl'] },
  { table: 'users', columns: ['avatarUrl', 'bannerUrl'] },
  { table: 'featured_anime', columns: ['backdropUrl'] },
  { table: 'studios', columns: ['logoUrl'] },
];

const prisma = new PrismaClient();
const uploaded = new Map(); // local path -> delivery URL

function localPathFor(url) {
  // Accepts "/uploads/posters/x.svg" and "http://host/uploads/posters/x.svg".
  const match = /\/uploads\/(.+)$/.exec(url);
  if (!match) return null;
  return join(UPLOADS_ROOT, match[1]);
}

async function uploadOnce(localPath, kindFolder) {
  if (uploaded.has(localPath)) return uploaded.get(localPath);

  const buffer = await readFile(localPath);
  const baseName = localPath.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');

  const result = await new Promise((done, fail) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `${FOLDER}/${kindFolder}`,
        public_id: baseName,
        resource_type: 'image',
        overwrite: true,
        use_filename: false,
        unique_filename: false,
      },
      (error, response) => (error || !response ? fail(error ?? new Error('no response')) : done(response)),
    );
    stream.end(buffer);
  });

  uploaded.set(localPath, result.secure_url);
  return result.secure_url;
}

async function main() {
  if (!DRY_RUN) {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      throw new Error('CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET are required');
    }
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  let rewritten = 0;
  let missing = 0;

  for (const { table, columns } of TARGETS) {
    for (const column of columns) {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT id, "${column}" AS value FROM "${table}" WHERE "${column}" LIKE '%/uploads/%'`,
      );
      if (rows.length === 0) continue;
      console.log(`\n${table}.${column}: ${rows.length} row(s) to migrate`);

      for (const row of rows) {
        const localPath = localPathFor(row.value);
        if (!localPath) continue;

        try {
          await stat(localPath);
        } catch {
          console.warn(`  ! missing file, leaving as-is: ${row.value}`);
          missing += 1;
          continue;
        }

        // posters/banners/thumbnails/avatars -> same folder name on Cloudinary
        const kindFolder = /\/uploads\/([^/]+)\//.exec(row.value)?.[1] ?? 'misc';

        if (DRY_RUN) {
          console.log(`  would upload ${localPath} -> ${FOLDER}/${kindFolder}`);
          rewritten += 1;
          continue;
        }

        const url = await uploadOnce(localPath, kindFolder);
        await prisma.$executeRawUnsafe(`UPDATE "${table}" SET "${column}" = $1 WHERE id = $2::uuid`, url, row.id);
        rewritten += 1;
        console.log(`  ${row.value}  ->  ${url}`);
      }
    }
  }

  console.log(
    `\n${DRY_RUN ? '[dry run] ' : ''}${rewritten} reference(s) ${DRY_RUN ? 'would be' : ''} rewritten, ` +
      `${uploaded.size} file(s) uploaded, ${missing} missing local file(s).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
