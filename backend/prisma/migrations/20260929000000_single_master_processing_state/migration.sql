-- SINGLE_MASTER processing state.
--
-- Purely additive: a new enum, four nullable columns on media_sources and one
-- index. Every existing row defaults to NOT_APPLICABLE, which is the
-- MANUAL_VARIANTS behaviour that was already in place, so nothing that works
-- today changes.

CREATE TYPE "MediaProcessingState" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'PROCESSING', 'READY', 'FAILED');

ALTER TABLE "media_sources"
  ADD COLUMN "masterDriveFileId" TEXT,
  ADD COLUMN "processingState" "MediaProcessingState" NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN "processingError" TEXT,
  ADD COLUMN "processedAt" TIMESTAMP(3);

-- The worker polls for pending work; this keeps that a single indexed scan.
CREATE INDEX "media_sources_processingState_idx" ON "media_sources"("processingState");
