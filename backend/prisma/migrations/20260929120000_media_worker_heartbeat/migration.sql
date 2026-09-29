-- Media worker heartbeat.
--
-- Purely additive: one new table, no change to any existing one, so applying
-- this cannot affect playback, the catalogue or a job already in flight.
CREATE TABLE "media_workers" (
    "id" VARCHAR(64) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'IDLE',
    "currentJobLabel" VARCHAR(200),
    "currentStep" VARCHAR(60),
    "version" VARCHAR(40),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_workers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "media_workers_lastSeenAt_idx" ON "media_workers"("lastSeenAt" DESC);
