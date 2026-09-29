-- Automatic audio/subtitle detection for manually supplied qualities.
--
-- Purely additive. `autoTracks` defaults to false, so every existing row keeps
-- exactly the behaviour it has today: no worker will look at an episode that
-- was set up before this existed, and any hand-entered tracks stay untouched.
ALTER TABLE "media_sources" ADD COLUMN "autoTracks" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "media_sources" ADD COLUMN "trackSourceQuality" "VideoQuality";
ALTER TABLE "media_sources" ADD COLUMN "trackSourceFileId" TEXT;

-- The queue is read by state; this keeps that read cheap now that sources
-- without a master can also be jobs.
CREATE INDEX "media_sources_autoTracks_processingState_idx"
    ON "media_sources"("autoTracks", "processingState");
