-- AlterTable
ALTER TABLE "audio_tracks" ADD COLUMN     "codec" VARCHAR(60),
ADD COLUMN     "driveFileId" TEXT,
ADD COLUMN     "episodeId" UUID,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mimeType" VARCHAR(80) DEFAULT 'audio/mp4',
ADD COLUMN     "provider" "MediaProvider" NOT NULL DEFAULT 'GOOGLE_DRIVE',
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "url" TEXT,
ALTER COLUMN "mediaSourceId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "audio_tracks_episodeId_isActive_sortOrder_idx" ON "audio_tracks"("episodeId", "isActive", "sortOrder");

-- AddForeignKey
ALTER TABLE "audio_tracks" ADD CONSTRAINT "audio_tracks_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data migration: store uploaded-image URLs as site-relative paths.
--
-- They used to be absolute (http://localhost:4000/uploads/...). An absolute
-- localhost URL only works from the visitor's own machine: the Next.js image
-- optimizer runs inside the frontend container, where localhost:4000 is not
-- the API, so every poster/banner failed to load. Relative "/uploads/..." paths
-- are served by the frontend (which proxies to the API over the Docker
-- network), so they work from the browser, from SSR, and on any real domain.
-- Only our own upload URLs on localhost are rewritten; external URLs are kept.
UPDATE "anime" SET "posterUrl" = regexp_replace("posterUrl", '^https?://(localhost|127\.0\.0\.1)(:\d+)?/uploads/', '/uploads/') WHERE "posterUrl" ~ '^https?://(localhost|127\.0\.0\.1)(:\d+)?/uploads/';
UPDATE "anime" SET "bannerUrl" = regexp_replace("bannerUrl", '^https?://(localhost|127\.0\.0\.1)(:\d+)?/uploads/', '/uploads/') WHERE "bannerUrl" ~ '^https?://(localhost|127\.0\.0\.1)(:\d+)?/uploads/';
UPDATE "episodes" SET "thumbnailUrl" = regexp_replace("thumbnailUrl", '^https?://(localhost|127\.0\.0\.1)(:\d+)?/uploads/', '/uploads/') WHERE "thumbnailUrl" ~ '^https?://(localhost|127\.0\.0\.1)(:\d+)?/uploads/';
UPDATE "users" SET "avatarUrl" = regexp_replace("avatarUrl", '^https?://(localhost|127\.0\.0\.1)(:\d+)?/uploads/', '/uploads/') WHERE "avatarUrl" ~ '^https?://(localhost|127\.0\.0\.1)(:\d+)?/uploads/';
UPDATE "users" SET "bannerUrl" = regexp_replace("bannerUrl", '^https?://(localhost|127\.0\.0\.1)(:\d+)?/uploads/', '/uploads/') WHERE "bannerUrl" ~ '^https?://(localhost|127\.0\.0\.1)(:\d+)?/uploads/';
UPDATE "featured_anime" SET "backdropUrl" = regexp_replace("backdropUrl", '^https?://(localhost|127\.0\.0\.1)(:\d+)?/uploads/', '/uploads/') WHERE "backdropUrl" ~ '^https?://(localhost|127\.0\.0\.1)(:\d+)?/uploads/';
UPDATE "studios" SET "logoUrl" = regexp_replace("logoUrl", '^https?://(localhost|127\.0\.0\.1)(:\d+)?/uploads/', '/uploads/') WHERE "logoUrl" ~ '^https?://(localhost|127\.0\.0\.1)(:\d+)?/uploads/';
UPDATE "subtitle_tracks" SET "url" = regexp_replace("url", '^https?://(localhost|127\.0\.0\.1)(:\d+)?/uploads/', '') WHERE "url" ~ '^https?://(localhost|127\.0\.0\.1)(:\d+)?/uploads/';
