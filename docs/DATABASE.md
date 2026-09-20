# Database

PostgreSQL 16 via Prisma. The authoritative definition is
`backend/prisma/schema.prisma`; this document explains the decisions behind it.

---

## Commands

```bash
cd backend
npm run db:migrate    # create a migration from schema changes (development)
npm run db:deploy     # apply pending migrations (production; forward-only)
npm run db:seed       # load demo content (idempotent upserts)
npm run db:reset      # DROP EVERYTHING and rebuild — development only
npm run db:studio     # browse and edit data
```

`migrate deploy` never generates, resets or drops anything — it only plays
forward migrations that already exist. That is what makes it safe to run
unattended from the container entrypoint on every start.

---

## Domain groups

| Group | Tables |
|---|---|
| Identity | `users`, `refresh_tokens`, `password_reset_tokens`, `email_verification_tokens`, `ranks` |
| Catalogue | `anime`, `anime_titles`, `genres`, `anime_genres`, `studios`, `producers`, `anime_producers`, `anime_relations`, `anime_recommendations`, `seasons`, `episodes` |
| Media | `media_sources`, `media_variants`, `audio_tracks`, `subtitle_tracks`, `download_sources` |
| Activity | `watch_progress`, `watch_history`, `watchlist_entries`, `favorites`, `ratings` |
| Social | `comments`, `comment_votes`, `reports` |
| Community | `community_categories`, `community_posts`, `community_comments`, `community_votes`, `community_post_anime`, `polls`, `poll_options`, `poll_votes`, `tier_list_items` |
| Gamification | `mana_rules`, `mana_transactions` |
| Analytics | `anime_views`, `episode_views`, `anime_view_stats`, `episode_view_stats` |
| Support | `anime_requests`, `contact_messages` |
| Configuration | `site_settings`, `ad_placements`, `featured_anime`, `activity_logs` |

---

## Decisions worth explaining

### Media is three tables, not one URL column

```
episodes
   └── media_sources      one server AND one audio flavour
         └── media_variants   one row per quality, one file each
```

A `MediaSource` bundles a server with an audio flavour because a progressive MP4
carries exactly one audio track — so the Japanese and English-dub versions are
genuinely different files, not two tracks of one file. `MediaVariant` is one row
per quality for the same reason: an MP4 encodes one resolution.

Modelling it any other way would force the player to pretend it can do things it
cannot. `audio_tracks` exists separately for HLS sources, where in-container
switching *is* possible.

### Views are counted twice, on purpose

`anime_views` is an append-only log kept only for the 30-minute de-duplication
window and pruned after seven days. `anime_view_stats` is a daily rollup with a
unique `(animeId, day)` key.

"Trending this month" reads the rollup: one indexed scan over roughly 30 rows
per title, rather than counting millions of raw rows. Without this split,
trending becomes the slowest query in the system within weeks of launch.

### Reports do not use foreign keys

`reports.targetType` + `reports.targetId` is a deliberate polymorphic pair with
no FK constraint. A report must survive the deletion of the thing it describes —
otherwise removing an abusive comment destroys the evidence for why it was
removed. The service resolves the target explicitly when displaying a report.

### Soft deletes where moderation needs history

`anime`, `episodes` use `deletedAt`. `comments`, `community_posts` and
`community_comments` use an `isDeleted` flag plus a reason. Content disappears
from the public site but remains available to moderators, and reply threads keep
their structure instead of collapsing.

### Denormalised counters

`anime.score`, `scoreCount`, `viewCount`, `favoriteCount`, `subEpisodeCount`,
`dubEpisodeCount` are all maintained on write. A grid of 28 cards would
otherwise fire 28 aggregate subqueries. `AdminAnimeService.refreshCounters()`
recomputes the episode counts after any episode change so they cannot drift.

### Mana idempotency

`mana_transactions` has a unique constraint on `(userId, dedupeKey)`. Awards that
must happen only once — finishing an episode, an upvote on a specific comment,
the daily login bonus — pass a key like `EPISODE_COMPLETED:{episodeId}`. A
concurrent duplicate hits the unique constraint and is treated as "already
awarded" rather than as an error.

### Episode numbers are decimal

`episodes.number` is `Decimal(6,1)`, so recap and special episodes numbered 7.5
are representable. The unique constraint is `(animeId, number)`.

---

## Indexes

Chosen to match the queries that actually run, not speculatively:

```prisma
// Catalogue browsing, one per sort option offered in the UI
@@index([publishStatus, updatedAt(sort: Desc)])
@@index([publishStatus, createdAt(sort: Desc)])
@@index([publishStatus, viewCount(sort: Desc)])
@@index([publishStatus, score(sort: Desc)])
@@index([publishStatus, popularity(sort: Desc)])

// Trending rollups
@@unique([animeId, day])
@@index([day, views(sort: Desc)])

// Comment threads, both sort orders
@@index([episodeId, isDeleted, createdAt(sort: Desc)])
@@index([episodeId, isDeleted, upvoteCount(sort: Desc)])

// Resume and continue-watching
@@unique([userId, episodeId])
@@index([userId, lastWatchedAt(sort: Desc)])
```

---

## Cascade behaviour

Chosen per relation rather than applied uniformly:

| Relation | On delete | Why |
|---|---|---|
| `Anime → Episode` | Cascade | An episode has no meaning without its title |
| `Episode → MediaSource → MediaVariant` | Cascade | Media configuration belongs to its episode |
| `User → Comment` | Cascade | Deleting an account removes its contributions |
| `Anime → Studio` | SetNull | Removing a studio must not delete titles |
| `Report → User` | SetNull | A report outlives its reporter |
| `CommunityPost → Category` | **Restrict** | A category with posts cannot be deleted by accident |

---

## Seed data

`npm run db:seed` loads a demo catalogue built entirely from original material:
invented titles, synopses written for this project, procedurally generated
abstract artwork (gradients and geometry, no figures), and synthetic video
generated by ffmpeg. Nothing is scraped and no third-party content is bundled.

It seeds 14 titles, 134 episodes, 218 media sources, 704 quality variants, 268
subtitle tracks, 7 users, 10 community posts and 30 days of view history so that
trending, filtering and the leaderboards have real data to work against on a
fresh install.

Every write is an upsert, so re-running it is safe.

---

## Backups

```bash
# Dump
docker compose exec -T postgres pg_dump -U anizora anizora | gzip > backup-$(date +%F).sql.gz

# Restore
gunzip -c backup-2026-09-18.sql.gz | docker compose exec -T postgres psql -U anizora anizora

# Schema only
docker compose exec -T postgres pg_dump -U anizora --schema-only anizora > schema.sql
```

Uploaded images and subtitle files live on the `uploads-data` volume and must be
backed up separately — see the README.
