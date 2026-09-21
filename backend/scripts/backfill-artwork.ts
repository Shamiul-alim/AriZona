/**
 * Gives every title a poster and a banner.
 *
 * Titles added through the admin panel without artwork render as empty grey
 * cards, and titles pointing at someone else's image host break as soon as that
 * host blocks hotlinking. This generates original procedural artwork for any
 * title that needs it, uploads it to Cloudinary and updates the row.
 *
 * Usage (from backend/):
 *   DATABASE_URL=... CLOUDINARY_* =... npx ts-node --transpile-only scripts/backfill-artwork.ts [--replace-external] [--dry-run]
 *
 *   --replace-external  also replaces artwork hosted somewhere other than
 *                       Cloudinary (e.g. hotlinked third-party images)
 */
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { bannerSvg, posterSvg } from '../prisma/seed-art';

const DRY_RUN = process.argv.includes('--dry-run');
const REPLACE_EXTERNAL = process.argv.includes('--replace-external');
const FOLDER = process.env.CLOUDINARY_FOLDER ?? 'anizora';

const prisma = new PrismaClient();

function needsArtwork(url: string | null): boolean {
  if (!url || !url.trim()) return true;
  return REPLACE_EXTERNAL && !url.includes('res.cloudinary.com');
}

async function upload(svg: string, kind: 'posters' | 'banners', slug: string): Promise<string> {
  const result = await new Promise<UploadApiResponse>((done, fail) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `${FOLDER}/${kind}`,
        public_id: slug,
        resource_type: 'image',
        overwrite: true,
        use_filename: false,
        unique_filename: false,
      },
      (error, response) => (error || !response ? fail(error ?? new Error('no response')) : done(response)),
    );
    stream.end(Buffer.from(svg, 'utf8'));
  });
  return result.secure_url;
}

async function main(): Promise<void> {
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

  const titles = await prisma.anime.findMany({
    select: { id: true, slug: true, titleEnglish: true, titleJapanese: true, posterUrl: true, bannerUrl: true },
    orderBy: { titleEnglish: 'asc' },
  });

  let changed = 0;

  for (const title of titles) {
    const wantsPoster = needsArtwork(title.posterUrl);
    const wantsBanner = needsArtwork(title.bannerUrl);
    if (!wantsPoster && !wantsBanner) continue;

    const subtitle = title.titleJapanese ?? undefined;
    const data: { posterUrl?: string; bannerUrl?: string } = {};

    if (DRY_RUN) {
      console.log(`  would generate for ${title.slug}: ${[wantsPoster && 'poster', wantsBanner && 'banner'].filter(Boolean).join(' + ')}`);
      changed += 1;
      continue;
    }

    if (wantsPoster) {
      data.posterUrl = await upload(posterSvg(title.titleEnglish, subtitle), 'posters', title.slug);
    }
    if (wantsBanner) {
      data.bannerUrl = await upload(bannerSvg(title.titleEnglish, subtitle), 'banners', title.slug);
    }

    await prisma.anime.update({ where: { id: title.id }, data });
    changed += 1;
    console.log(`  ${title.slug}: ${Object.keys(data).join(' + ')} generated`);
  }

  console.log(`\n${DRY_RUN ? '[dry run] ' : ''}${changed} title(s) ${DRY_RUN ? 'would be' : ''} updated.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
