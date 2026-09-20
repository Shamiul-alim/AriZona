-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED', 'PENDING_VERIFICATION');

-- CreateEnum
CREATE TYPE "TitlePreference" AS ENUM ('ENGLISH', 'JAPANESE');

-- CreateEnum
CREATE TYPE "AnimeType" AS ENUM ('TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'TV_SHORT', 'TV_SPECIAL', 'MUSIC', 'OTHER');

-- CreateEnum
CREATE TYPE "AnimeStatus" AS ENUM ('ONGOING', 'COMPLETED', 'UPCOMING', 'HIATUS', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AnimeSeason" AS ENUM ('WINTER', 'SPRING', 'SUMMER', 'FALL');

-- CreateEnum
CREATE TYPE "AgeRating" AS ENUM ('G', 'PG', 'PG_13', 'R_17', 'R_PLUS', 'RX');

-- CreateEnum
CREATE TYPE "AnimeSource" AS ENUM ('ORIGINAL', 'MANGA', 'LIGHT_NOVEL', 'NOVEL', 'VISUAL_NOVEL', 'GAME', 'WEB_MANGA', 'FOUR_KOMA', 'MUSIC', 'OTHER');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AnimeTitleKind" AS ENUM ('ENGLISH', 'JAPANESE', 'ROMAJI', 'SYNONYM');

-- CreateEnum
CREATE TYPE "RelationKind" AS ENUM ('SEQUEL', 'PREQUEL', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE', 'SUMMARY', 'PARENT_STORY', 'FULL_STORY', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaProvider" AS ENUM ('GOOGLE_DRIVE', 'HLS', 'DIRECT_FILE', 'OBJECT_STORAGE', 'EXTERNAL_EMBED');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('SUB', 'DUB');

-- CreateEnum
CREATE TYPE "VideoQuality" AS ENUM ('Q_2160P', 'Q_1440P', 'Q_1080P', 'Q_720P', 'Q_480P', 'Q_360P', 'Q_240P', 'AUTO');

-- CreateEnum
CREATE TYPE "SubtitleFormat" AS ENUM ('VTT', 'SRT', 'ASS');

-- CreateEnum
CREATE TYPE "WatchStatus" AS ENUM ('WATCHING', 'COMPLETED', 'PLAN_TO_WATCH', 'ON_HOLD', 'DROPPED');

-- CreateEnum
CREATE TYPE "ReportKind" AS ENUM ('VIDEO_BROKEN', 'WRONG_EPISODE', 'AUDIO_NOT_SYNCED', 'SUBTITLE_NOT_SYNCED', 'INCORRECT_TIMESTAMPS', 'SOURCE_UNAVAILABLE', 'INAPPROPRIATE_CONTENT', 'SPAM', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'INVESTIGATING', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('EPISODE', 'ANIME', 'COMMENT', 'COMMUNITY_POST', 'COMMUNITY_COMMENT', 'USER');

-- CreateEnum
CREATE TYPE "CommunityPostKind" AS ENUM ('TEXT', 'POLL', 'TIER_LIST', 'MATCHUP', 'RECOMMENDATION');

-- CreateEnum
CREATE TYPE "TierLevel" AS ENUM ('S', 'A', 'B', 'C', 'D', 'F');

-- CreateEnum
CREATE TYPE "ManaEvent" AS ENUM ('EPISODE_COMMENT', 'COMMUNITY_COMMENT', 'COMMUNITY_POST', 'RECEIVED_UPVOTE', 'POLL_VOTE', 'EPISODE_COMPLETED', 'DAILY_LOGIN', 'RATING_SUBMITTED', 'ANIME_REQUEST_APPROVED', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'REVIEWING', 'APPROVED', 'AVAILABLE', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContactCategory" AS ENUM ('GENERAL', 'TECHNICAL', 'DMCA', 'ADVERTISING', 'ACCOUNT', 'FEEDBACK', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('NEW', 'OPEN', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AdType" AS ENUM ('DISPLAY', 'IN_ARTICLE', 'IN_FEED', 'MULTIPLEX', 'VIDEO');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "bannerUrl" TEXT,
    "bio" VARCHAR(500),
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailVerifiedAt" TIMESTAMP(3),
    "googleId" TEXT,
    "mana" INTEGER NOT NULL DEFAULT 0,
    "rankId" UUID,
    "titlePreference" "TitlePreference" NOT NULL DEFAULT 'ENGLISH',
    "preferredAudio" VARCHAR(16),
    "preferredSubtitle" VARCHAR(16),
    "autoplayNext" BOOLEAN NOT NULL DEFAULT true,
    "autoSkipIntro" BOOLEAN NOT NULL DEFAULT false,
    "suspendedUntil" TIMESTAMP(3),
    "banReason" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "lastManaLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranks" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "requiredMana" INTEGER NOT NULL,
    "icon" TEXT,
    "color" VARCHAR(16),
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ranks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anime" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "titleEnglish" TEXT NOT NULL,
    "titleJapanese" TEXT,
    "titleRomaji" TEXT,
    "synopsis" TEXT,
    "posterUrl" TEXT,
    "bannerUrl" TEXT,
    "trailerUrl" TEXT,
    "type" "AnimeType" NOT NULL DEFAULT 'TV',
    "status" "AnimeStatus" NOT NULL DEFAULT 'ONGOING',
    "season" "AnimeSeason",
    "releaseYear" INTEGER,
    "airStartDate" TIMESTAMP(3),
    "airEndDate" TIMESTAMP(3),
    "ageRating" "AgeRating",
    "source" "AnimeSource" DEFAULT 'ORIGINAL',
    "durationMinutes" INTEGER,
    "totalEpisodes" INTEGER,
    "subEpisodeCount" INTEGER NOT NULL DEFAULT 0,
    "dubEpisodeCount" INTEGER NOT NULL DEFAULT 0,
    "score" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "scoreCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "favoriteCount" INTEGER NOT NULL DEFAULT 0,
    "popularity" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isTrending" BOOLEAN NOT NULL DEFAULT false,
    "publishStatus" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "seoTitle" TEXT,
    "seoDescription" VARCHAR(320),
    "malId" INTEGER,
    "anilistId" INTEGER,
    "studioId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "anime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anime_titles" (
    "id" UUID NOT NULL,
    "animeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "AnimeTitleKind" NOT NULL DEFAULT 'SYNONYM',

    CONSTRAINT "anime_titles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genres" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" VARCHAR(16),
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "genres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anime_genres" (
    "animeId" UUID NOT NULL,
    "genreId" UUID NOT NULL,

    CONSTRAINT "anime_genres_pkey" PRIMARY KEY ("animeId","genreId")
);

-- CreateTable
CREATE TABLE "studios" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "websiteUrl" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anime_producers" (
    "animeId" UUID NOT NULL,
    "producerId" UUID NOT NULL,

    CONSTRAINT "anime_producers_pkey" PRIMARY KEY ("animeId","producerId")
);

-- CreateTable
CREATE TABLE "anime_relations" (
    "id" UUID NOT NULL,
    "animeId" UUID NOT NULL,
    "relatedAnimeId" UUID NOT NULL,
    "kind" "RelationKind" NOT NULL DEFAULT 'OTHER',

    CONSTRAINT "anime_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anime_recommendations" (
    "id" UUID NOT NULL,
    "animeId" UUID NOT NULL,
    "recommendedAnimeId" UUID NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "anime_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" UUID NOT NULL,
    "animeId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT,
    "posterUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episodes" (
    "id" UUID NOT NULL,
    "animeId" UUID NOT NULL,
    "seasonId" UUID,
    "number" DECIMAL(6,1) NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "durationSeconds" INTEGER,
    "airDate" TIMESTAMP(3),
    "isFiller" BOOLEAN NOT NULL DEFAULT false,
    "hasSub" BOOLEAN NOT NULL DEFAULT true,
    "hasDub" BOOLEAN NOT NULL DEFAULT false,
    "introStart" INTEGER,
    "introEnd" INTEGER,
    "outroStart" INTEGER,
    "outroEnd" INTEGER,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "publishStatus" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_sources" (
    "id" UUID NOT NULL,
    "episodeId" UUID NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Server 1',
    "provider" "MediaProvider" NOT NULL DEFAULT 'GOOGLE_DRIVE',
    "kind" "MediaKind" NOT NULL DEFAULT 'SUB',
    "audioLanguage" VARCHAR(16) NOT NULL DEFAULT 'ja',
    "audioLabel" TEXT NOT NULL DEFAULT 'Japanese',
    "hlsUrl" TEXT,
    "embedUrl" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_variants" (
    "id" UUID NOT NULL,
    "mediaSourceId" UUID NOT NULL,
    "quality" "VideoQuality" NOT NULL DEFAULT 'Q_720P',
    "driveFileId" TEXT,
    "directUrl" TEXT,
    "mimeType" TEXT DEFAULT 'video/mp4',
    "fileSizeBytes" BIGINT,
    "bitrateKbps" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audio_tracks" (
    "id" UUID NOT NULL,
    "mediaSourceId" UUID NOT NULL,
    "language" VARCHAR(16) NOT NULL,
    "label" TEXT NOT NULL,
    "hlsGroupId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audio_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subtitle_tracks" (
    "id" UUID NOT NULL,
    "episodeId" UUID NOT NULL,
    "mediaSourceId" UUID,
    "language" VARCHAR(16) NOT NULL,
    "label" TEXT NOT NULL,
    "format" "SubtitleFormat" NOT NULL DEFAULT 'VTT',
    "url" TEXT,
    "driveFileId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isForced" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subtitle_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "download_sources" (
    "id" UUID NOT NULL,
    "episodeId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "quality" "VideoQuality" NOT NULL DEFAULT 'Q_720P',
    "kind" "MediaKind" NOT NULL DEFAULT 'SUB',
    "url" TEXT NOT NULL,
    "sizeBytes" BIGINT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "download_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watch_progress" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "episodeId" UUID NOT NULL,
    "animeId" UUID NOT NULL,
    "positionSeconds" INTEGER NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER,
    "percent" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "lastWatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watch_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watch_history" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "episodeId" UUID NOT NULL,
    "animeId" UUID NOT NULL,
    "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watch_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlist_entries" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "animeId" UUID NOT NULL,
    "status" "WatchStatus" NOT NULL DEFAULT 'PLAN_TO_WATCH',
    "progressEpisodes" INTEGER NOT NULL DEFAULT 0,
    "note" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watchlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "animeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "animeId" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "animeId" UUID,
    "episodeId" UUID,
    "parentId" UUID,
    "body" VARCHAR(2000) NOT NULL,
    "upvoteCount" INTEGER NOT NULL DEFAULT 0,
    "downvoteCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "isSpoiler" BOOLEAN NOT NULL DEFAULT false,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_votes" (
    "id" UUID NOT NULL,
    "commentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" UUID NOT NULL,
    "kind" "ReportKind" NOT NULL DEFAULT 'OTHER',
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "message" VARCHAR(1000),
    "context" JSONB,
    "adminNote" TEXT,
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anime_views" (
    "id" UUID NOT NULL,
    "animeId" UUID NOT NULL,
    "userId" UUID,
    "visitorHash" VARCHAR(64) NOT NULL,
    "referrer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anime_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episode_views" (
    "id" UUID NOT NULL,
    "episodeId" UUID NOT NULL,
    "userId" UUID,
    "visitorHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "episode_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anime_view_stats" (
    "id" UUID NOT NULL,
    "animeId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "anime_view_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episode_view_stats" (
    "id" UUID NOT NULL,
    "episodeId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "episode_view_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" VARCHAR(16),
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "staffOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_posts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "slug" TEXT NOT NULL,
    "body" VARCHAR(20000) NOT NULL,
    "kind" "CommunityPostKind" NOT NULL DEFAULT 'TEXT',
    "upvoteCount" INTEGER NOT NULL DEFAULT 0,
    "downvoteCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "deletedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_comments" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "parentId" UUID,
    "body" VARCHAR(5000) NOT NULL,
    "upvoteCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_votes" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "postId" UUID,
    "commentId" UUID,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_post_anime" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "animeId" UUID NOT NULL,
    "note" VARCHAR(500),
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "community_post_anime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "polls" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "question" VARCHAR(300) NOT NULL,
    "allowMultiple" BOOLEAN NOT NULL DEFAULT false,
    "totalVotes" INTEGER NOT NULL DEFAULT 0,
    "closesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_options" (
    "id" UUID NOT NULL,
    "pollId" UUID NOT NULL,
    "text" VARCHAR(200) NOT NULL,
    "imageUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "animeId" UUID,

    CONSTRAINT "poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_votes" (
    "id" UUID NOT NULL,
    "pollId" UUID NOT NULL,
    "pollOptionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tier_list_items" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "tier" "TierLevel" NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "animeId" UUID,

    CONSTRAINT "tier_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mana_rules" (
    "id" UUID NOT NULL,
    "event" "ManaEvent" NOT NULL,
    "amount" INTEGER NOT NULL,
    "dailyLimit" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mana_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mana_transactions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "event" "ManaEvent" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "dedupeKey" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mana_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anime_requests" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "title" VARCHAR(250) NOT NULL,
    "titleJapanese" VARCHAR(250),
    "malUrl" TEXT,
    "anilistUrl" TEXT,
    "message" VARCHAR(1000),
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "fulfilledAnimeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "anime_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "category" "ContactCategory" NOT NULL DEFAULT 'GENERAL',
    "message" VARCHAR(5000) NOT NULL,
    "status" "ContactStatus" NOT NULL DEFAULT 'NEW',
    "adminNote" TEXT,
    "ipHash" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'general',
    "label" TEXT,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ad_placements" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "AdType" NOT NULL DEFAULT 'DISPLAY',
    "adClient" TEXT,
    "adSlot" TEXT,
    "format" TEXT DEFAULT 'auto',
    "fullWidthResponsive" BOOLEAN NOT NULL DEFAULT true,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "featured_anime" (
    "id" UUID NOT NULL,
    "animeId" UUID NOT NULL,
    "headline" TEXT,
    "subtitle" TEXT,
    "ctaLabel" TEXT DEFAULT 'Watch Now',
    "backdropUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "featured_anime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipHash" VARCHAR(64),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "users_mana_idx" ON "users"("mana" DESC);

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_revokedAt_idx" ON "refresh_tokens"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_tokenHash_key" ON "email_verification_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_userId_idx" ON "email_verification_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ranks_name_key" ON "ranks"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ranks_slug_key" ON "ranks"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ranks_requiredMana_key" ON "ranks"("requiredMana");

-- CreateIndex
CREATE INDEX "ranks_requiredMana_idx" ON "ranks"("requiredMana");

-- CreateIndex
CREATE UNIQUE INDEX "anime_slug_key" ON "anime"("slug");

-- CreateIndex
CREATE INDEX "anime_publishStatus_deletedAt_idx" ON "anime"("publishStatus", "deletedAt");

-- CreateIndex
CREATE INDEX "anime_publishStatus_updatedAt_idx" ON "anime"("publishStatus", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "anime_publishStatus_createdAt_idx" ON "anime"("publishStatus", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "anime_publishStatus_viewCount_idx" ON "anime"("publishStatus", "viewCount" DESC);

-- CreateIndex
CREATE INDEX "anime_publishStatus_score_idx" ON "anime"("publishStatus", "score" DESC);

-- CreateIndex
CREATE INDEX "anime_publishStatus_popularity_idx" ON "anime"("publishStatus", "popularity" DESC);

-- CreateIndex
CREATE INDEX "anime_type_idx" ON "anime"("type");

-- CreateIndex
CREATE INDEX "anime_status_idx" ON "anime"("status");

-- CreateIndex
CREATE INDEX "anime_releaseYear_season_idx" ON "anime"("releaseYear", "season");

-- CreateIndex
CREATE INDEX "anime_titleEnglish_idx" ON "anime"("titleEnglish");

-- CreateIndex
CREATE INDEX "anime_studioId_idx" ON "anime"("studioId");

-- CreateIndex
CREATE INDEX "anime_titles_title_idx" ON "anime_titles"("title");

-- CreateIndex
CREATE UNIQUE INDEX "anime_titles_animeId_title_kind_key" ON "anime_titles"("animeId", "title", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "genres_name_key" ON "genres"("name");

-- CreateIndex
CREATE UNIQUE INDEX "genres_slug_key" ON "genres"("slug");

-- CreateIndex
CREATE INDEX "anime_genres_genreId_idx" ON "anime_genres"("genreId");

-- CreateIndex
CREATE UNIQUE INDEX "studios_name_key" ON "studios"("name");

-- CreateIndex
CREATE UNIQUE INDEX "studios_slug_key" ON "studios"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "producers_name_key" ON "producers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "producers_slug_key" ON "producers"("slug");

-- CreateIndex
CREATE INDEX "anime_producers_producerId_idx" ON "anime_producers"("producerId");

-- CreateIndex
CREATE INDEX "anime_relations_relatedAnimeId_idx" ON "anime_relations"("relatedAnimeId");

-- CreateIndex
CREATE UNIQUE INDEX "anime_relations_animeId_relatedAnimeId_key" ON "anime_relations"("animeId", "relatedAnimeId");

-- CreateIndex
CREATE INDEX "anime_recommendations_recommendedAnimeId_idx" ON "anime_recommendations"("recommendedAnimeId");

-- CreateIndex
CREATE UNIQUE INDEX "anime_recommendations_animeId_recommendedAnimeId_key" ON "anime_recommendations"("animeId", "recommendedAnimeId");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_animeId_number_key" ON "seasons"("animeId", "number");

-- CreateIndex
CREATE INDEX "episodes_animeId_publishStatus_idx" ON "episodes"("animeId", "publishStatus");

-- CreateIndex
CREATE INDEX "episodes_publishStatus_createdAt_idx" ON "episodes"("publishStatus", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "episodes_publishStatus_airDate_idx" ON "episodes"("publishStatus", "airDate" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "episodes_animeId_number_key" ON "episodes"("animeId", "number");

-- CreateIndex
CREATE INDEX "media_sources_episodeId_isActive_priority_idx" ON "media_sources"("episodeId", "isActive", "priority");

-- CreateIndex
CREATE INDEX "media_sources_episodeId_kind_idx" ON "media_sources"("episodeId", "kind");

-- CreateIndex
CREATE INDEX "media_variants_mediaSourceId_isActive_idx" ON "media_variants"("mediaSourceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "media_variants_mediaSourceId_quality_key" ON "media_variants"("mediaSourceId", "quality");

-- CreateIndex
CREATE UNIQUE INDEX "audio_tracks_mediaSourceId_language_key" ON "audio_tracks"("mediaSourceId", "language");

-- CreateIndex
CREATE INDEX "subtitle_tracks_episodeId_isActive_idx" ON "subtitle_tracks"("episodeId", "isActive");

-- CreateIndex
CREATE INDEX "download_sources_episodeId_isActive_idx" ON "download_sources"("episodeId", "isActive");

-- CreateIndex
CREATE INDEX "watch_progress_userId_lastWatchedAt_idx" ON "watch_progress"("userId", "lastWatchedAt" DESC);

-- CreateIndex
CREATE INDEX "watch_progress_userId_animeId_idx" ON "watch_progress"("userId", "animeId");

-- CreateIndex
CREATE UNIQUE INDEX "watch_progress_userId_episodeId_key" ON "watch_progress"("userId", "episodeId");

-- CreateIndex
CREATE INDEX "watch_history_userId_watchedAt_idx" ON "watch_history"("userId", "watchedAt" DESC);

-- CreateIndex
CREATE INDEX "watchlist_entries_userId_status_idx" ON "watchlist_entries"("userId", "status");

-- CreateIndex
CREATE INDEX "watchlist_entries_animeId_idx" ON "watchlist_entries"("animeId");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_entries_userId_animeId_key" ON "watchlist_entries"("userId", "animeId");

-- CreateIndex
CREATE INDEX "favorites_animeId_idx" ON "favorites"("animeId");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_userId_animeId_key" ON "favorites"("userId", "animeId");

-- CreateIndex
CREATE INDEX "ratings_animeId_idx" ON "ratings"("animeId");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_userId_animeId_key" ON "ratings"("userId", "animeId");

-- CreateIndex
CREATE INDEX "comments_animeId_isDeleted_createdAt_idx" ON "comments"("animeId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "comments_episodeId_isDeleted_createdAt_idx" ON "comments"("episodeId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "comments_episodeId_isDeleted_upvoteCount_idx" ON "comments"("episodeId", "isDeleted", "upvoteCount" DESC);

-- CreateIndex
CREATE INDEX "comments_parentId_idx" ON "comments"("parentId");

-- CreateIndex
CREATE INDEX "comments_userId_createdAt_idx" ON "comments"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "comment_votes_commentId_userId_key" ON "comment_votes"("commentId", "userId");

-- CreateIndex
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "reports_targetType_targetId_idx" ON "reports"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "reports_kind_idx" ON "reports"("kind");

-- CreateIndex
CREATE INDEX "anime_views_animeId_createdAt_idx" ON "anime_views"("animeId", "createdAt");

-- CreateIndex
CREATE INDEX "anime_views_visitorHash_animeId_createdAt_idx" ON "anime_views"("visitorHash", "animeId", "createdAt");

-- CreateIndex
CREATE INDEX "episode_views_episodeId_createdAt_idx" ON "episode_views"("episodeId", "createdAt");

-- CreateIndex
CREATE INDEX "episode_views_visitorHash_episodeId_createdAt_idx" ON "episode_views"("visitorHash", "episodeId", "createdAt");

-- CreateIndex
CREATE INDEX "anime_view_stats_day_views_idx" ON "anime_view_stats"("day", "views" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "anime_view_stats_animeId_day_key" ON "anime_view_stats"("animeId", "day");

-- CreateIndex
CREATE INDEX "episode_view_stats_day_views_idx" ON "episode_view_stats"("day", "views" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "episode_view_stats_episodeId_day_key" ON "episode_view_stats"("episodeId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "community_categories_name_key" ON "community_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "community_categories_slug_key" ON "community_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "community_posts_slug_key" ON "community_posts"("slug");

-- CreateIndex
CREATE INDEX "community_posts_categoryId_isDeleted_createdAt_idx" ON "community_posts"("categoryId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "community_posts_isDeleted_isPinned_createdAt_idx" ON "community_posts"("isDeleted", "isPinned", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "community_posts_isDeleted_upvoteCount_idx" ON "community_posts"("isDeleted", "upvoteCount" DESC);

-- CreateIndex
CREATE INDEX "community_posts_userId_createdAt_idx" ON "community_posts"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "community_comments_postId_isDeleted_createdAt_idx" ON "community_comments"("postId", "isDeleted", "createdAt");

-- CreateIndex
CREATE INDEX "community_comments_parentId_idx" ON "community_comments"("parentId");

-- CreateIndex
CREATE INDEX "community_comments_userId_createdAt_idx" ON "community_comments"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "community_votes_userId_postId_key" ON "community_votes"("userId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "community_votes_userId_commentId_key" ON "community_votes"("userId", "commentId");

-- CreateIndex
CREATE UNIQUE INDEX "community_post_anime_postId_animeId_key" ON "community_post_anime"("postId", "animeId");

-- CreateIndex
CREATE UNIQUE INDEX "polls_postId_key" ON "polls"("postId");

-- CreateIndex
CREATE INDEX "poll_options_pollId_order_idx" ON "poll_options"("pollId", "order");

-- CreateIndex
CREATE INDEX "poll_votes_pollId_userId_idx" ON "poll_votes"("pollId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "poll_votes_pollOptionId_userId_key" ON "poll_votes"("pollOptionId", "userId");

-- CreateIndex
CREATE INDEX "tier_list_items_postId_tier_order_idx" ON "tier_list_items"("postId", "tier", "order");

-- CreateIndex
CREATE UNIQUE INDEX "mana_rules_event_key" ON "mana_rules"("event");

-- CreateIndex
CREATE INDEX "mana_transactions_userId_createdAt_idx" ON "mana_transactions"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "mana_transactions_event_createdAt_idx" ON "mana_transactions"("event", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "mana_transactions_userId_dedupeKey_key" ON "mana_transactions"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "anime_requests_status_createdAt_idx" ON "anime_requests"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "anime_requests_userId_idx" ON "anime_requests"("userId");

-- CreateIndex
CREATE INDEX "contact_messages_status_createdAt_idx" ON "contact_messages"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "site_settings_group_idx" ON "site_settings"("group");

-- CreateIndex
CREATE UNIQUE INDEX "ad_placements_key_key" ON "ad_placements"("key");

-- CreateIndex
CREATE INDEX "ad_placements_type_isEnabled_idx" ON "ad_placements"("type", "isEnabled");

-- CreateIndex
CREATE INDEX "featured_anime_isActive_order_idx" ON "featured_anime"("isActive", "order");

-- CreateIndex
CREATE UNIQUE INDEX "featured_anime_animeId_key" ON "featured_anime"("animeId");

-- CreateIndex
CREATE INDEX "activity_logs_userId_createdAt_idx" ON "activity_logs"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "activity_logs_entityType_entityId_idx" ON "activity_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "activity_logs_createdAt_idx" ON "activity_logs"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_rankId_fkey" FOREIGN KEY ("rankId") REFERENCES "ranks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anime" ADD CONSTRAINT "anime_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "studios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anime_titles" ADD CONSTRAINT "anime_titles_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anime_genres" ADD CONSTRAINT "anime_genres_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anime_genres" ADD CONSTRAINT "anime_genres_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anime_producers" ADD CONSTRAINT "anime_producers_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anime_producers" ADD CONSTRAINT "anime_producers_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "producers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anime_relations" ADD CONSTRAINT "anime_relations_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anime_relations" ADD CONSTRAINT "anime_relations_relatedAnimeId_fkey" FOREIGN KEY ("relatedAnimeId") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anime_recommendations" ADD CONSTRAINT "anime_recommendations_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anime_recommendations" ADD CONSTRAINT "anime_recommendations_recommendedAnimeId_fkey" FOREIGN KEY ("recommendedAnimeId") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_sources" ADD CONSTRAINT "media_sources_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_mediaSourceId_fkey" FOREIGN KEY ("mediaSourceId") REFERENCES "media_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_tracks" ADD CONSTRAINT "audio_tracks_mediaSourceId_fkey" FOREIGN KEY ("mediaSourceId") REFERENCES "media_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtitle_tracks" ADD CONSTRAINT "subtitle_tracks_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtitle_tracks" ADD CONSTRAINT "subtitle_tracks_mediaSourceId_fkey" FOREIGN KEY ("mediaSourceId") REFERENCES "media_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download_sources" ADD CONSTRAINT "download_sources_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_entries" ADD CONSTRAINT "watchlist_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_entries" ADD CONSTRAINT "watchlist_entries_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anime_views" ADD CONSTRAINT "anime_views_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anime_views" ADD CONSTRAINT "anime_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_views" ADD CONSTRAINT "episode_views_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_views" ADD CONSTRAINT "episode_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anime_view_stats" ADD CONSTRAINT "anime_view_stats_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_view_stats" ADD CONSTRAINT "episode_view_stats_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "community_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "community_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_votes" ADD CONSTRAINT "community_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_votes" ADD CONSTRAINT "community_votes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_votes" ADD CONSTRAINT "community_votes_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "community_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_post_anime" ADD CONSTRAINT "community_post_anime_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_post_anime" ADD CONSTRAINT "community_post_anime_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "anime"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_pollOptionId_fkey" FOREIGN KEY ("pollOptionId") REFERENCES "poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tier_list_items" ADD CONSTRAINT "tier_list_items_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tier_list_items" ADD CONSTRAINT "tier_list_items_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "anime"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mana_transactions" ADD CONSTRAINT "mana_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anime_requests" ADD CONSTRAINT "anime_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anime_requests" ADD CONSTRAINT "anime_requests_fulfilledAnimeId_fkey" FOREIGN KEY ("fulfilledAnimeId") REFERENCES "anime"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "featured_anime" ADD CONSTRAINT "featured_anime_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

