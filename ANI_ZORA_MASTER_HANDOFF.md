# AniZora Master Project Handoff

> **Generated:** 2026-09-20 · **Last updated:** 2026-09-20 (after deployment + full acceptance testing)
> **Purpose:** This file replaces access to the original Claude conversation. It documents the **actual, inspected state** of the code on disk, not the plan.
> **Golden rule for the next Claude:** where this file says *UNVERIFIED*, it means code exists but **was never executed in a browser**. Do not report it as working.

---

## 1. Executive Summary

AniZora is a self-hosted anime streaming platform (catalogue + player + community + admin) built as:

- `frontend/` — Next.js 15 App Router, React 19, TypeScript, Tailwind v4
- `backend/` — NestJS 11, TypeScript, Prisma 6, PostgreSQL 16
- `docker-compose.yml` — postgres, redis, mailpit, backend, frontend, optional nginx

The platform is functionally inspired by public anime-streaming sites (section layout, watch page structure), but all branding, design, code and demo content are original. **Watch2Gether was explicitly removed from scope and must never be re-added.**

Media is served from **Google Drive** through a backend proxy (service account + Drive v3 `files.get?alt=media` with HTTP Range), behind short-lived HMAC-signed URLs. The provider layer is abstracted so Drive can later be swapped for object storage / HLS / CDN without rewriting the player or the schema.

**Current development phase:** a large 8-issue bug-fix/feature batch was implemented in the working tree. All of it **compiles, lints and passes unit tests**, but:

- the Docker containers currently running were built **2 days before** these changes → **the running site does NOT contain them**;
- migration `20260919000000_audio_tracks_and_relative_media_urls` is **written but NOT applied** to the database;
- **no browser/E2E acceptance testing has been done on the new code**.

That is the single most important fact in this handoff. See §32, §34, §40.

---

## 2. Project Goal

An admin-managed anime streaming site with:

- anime catalogue, hero slider, latest episodes, newly added, trending, top, upcoming, completed, A–Z, genres, random
- search, pagination, advanced filters
- anime details, episode lists, watch page
- user accounts, watch history, Continue Watching, resume playback
- watchlist statuses, favourites, ratings, comments
- community board (posts, comments, votes, polls, tier lists), Mana points + ranks + leaderboard
- admin dashboard with full manual content management (no paid metadata API is required or used)
- Google Drive media sources, quality switching, subtitles, separate audio-language tracks, SUB/DUB
- AdSense display ads + IMA/VAST in-video ad architecture
- Docker deployment

Content is **manually entered by an admin**. Demo content shipped with the seed is **original invented material** (invented titles, procedurally generated SVG art, synthetic ffmpeg-generated media) — no third-party assets.

---

## 3. Current Status

| Area | State |
|---|---|
| Codebase compiles | ✅ `backend: tsc --noEmit` clean, `frontend: tsc --noEmit` clean |
| Backend unit tests | ✅ `npx jest` → **6 suites, 71 tests passing** (run 2026-09-20) |
| Frontend unit tests | ✅ `npx vitest run` → **5 files, 53 tests passing** (run 2026-09-20) |
| Frontend lint | ✅ `npx eslint .` → 0 errors, 1 pre-existing warning (unused `kind` param in `useImaAds.ts`) |
| Docker running | ✅ Rebuilt and deployed; all 5 services healthy |
| DB migrations applied | ✅ Both `20260918000000_init` and `20260919000000_audio_tracks_and_relative_media_urls` |
| Drive playback + quality switching | ✅ Re-verified in-browser **after** this change batch (720→480→360→720, drift <1 s) |
| The 8 new fixes | ✅ Deployed and acceptance-tested in a real browser (107/107 checks) — except Google login |
| Google OAuth | ❌ **Blocked** — needs client ID/secret from the project owner (see `docs/GOOGLE_LOGIN.md`) |
| Git | ❌ **Not a git repository** (see §37) |

---

## 4. Technology Stack

**Frontend** (`frontend/package.json`)
- next 15.5.4 (App Router, `output: 'standalone'`), react 19.1.1
- typescript, tailwindcss v4 (`@tailwindcss/postcss`)
- zustand 5 (auth store), @tanstack/react-query 5 (client cache)
- hls.js 1.6 (HLS sources), framer-motion 12, zod 4, clsx + tailwind-merge
- tests: vitest 3 + @testing-library/react + jsdom
- lint: eslint 9 flat config (`frontend/eslint.config.mjs`, **added 2026-09-20** — before that `npm run lint` could not run at all)

**Backend** (`backend/package.json`)
- @nestjs/core 11.1.6, @nestjs/throttler 6.4
- prisma + @prisma/client 6.16.2
- googleapis 161 (Drive v3), passport-google-oauth20 2 (OAuth), multer via `@nestjs/platform-express`
- image-size 2 (upload dimension validation), bcrypt, helmet, cookie-parser, nodemailer
- tests: jest (`*.spec.ts` under `src/`)

**Infrastructure**
- postgres:16-alpine, redis:7-alpine, axllent/mailpit, node:22-alpine build/runtime images, nginx:1.27-alpine (optional profile)

---

## 5. Folder Structure

```
E:\tofayel_project\
├─ ANI_ZORA_MASTER_HANDOFF.md      ← this file
├─ README.md
├─ docker-compose.yml
├─ .env                            ← real local env (NOT committed, contains secrets)
├─ .env.example                    ← placeholder template (safe)
├─ .gitignore                      ← ignores .env, secrets/, *-service-account*.json
├─ .gitattributes
├─ .dev-db/                        ← leftover from an abandoned portable-Postgres attempt (unused)
├─ Drive link.txt                  ← owner's personal note of Drive links (not code)
├─ secrets/
│  ├─ README.txt
│  └─ google-service-account.json  ← REAL PRIVATE KEY. Never commit, never print.
├─ scripts/
│  ├─ generate-demo-media.ps1      ← builds synthetic demo video/audio with ffmpeg
│  └─ setup-dev-db.ps1
├─ nginx/                          ← optional reverse proxy config (profile: proxy)
├─ docs/
│  ├─ ADMIN_GUIDE.md  ADS.md  ARCHITECTURE.md  DATABASE.md
│  ├─ DEPLOYMENT.md   GOOGLE_DRIVE.md  PLAYER.md  STEP_BY_STEP_GUIDE.md
├─ backend/
│  ├─ Dockerfile, docker-entrypoint.sh, .env.example
│  ├─ prisma/{schema.prisma, migrations/, seed.ts, seed-data.ts, seed-art.ts}
│  └─ src/{main.ts, app.module.ts, common/, config/, prisma/, modules/}
└─ frontend/
   ├─ Dockerfile, next.config.ts, eslint.config.mjs, vitest config
   └─ src/{app/, components/, lib/, styles/}
```

---

## 6. Architecture

```
Browser ──► Next.js (3000)  ──SSR fetch──►  NestJS API (4000, prefix /api)  ──►  PostgreSQL (5432 in-network)
   │            │                                   │                              Redis (cache/throttle)
   │            └── /uploads/* proxy route ──────────┤                              Mailpit (SMTP 1025 / UI 8025)
   │                                                 │
   └── <video src="/api/media/stream/:id?exp&sig"> ──┴──► Google Drive v3 files.get?alt=media (Range proxied)
```

Key decisions:

1. **Server-side rendering uses the in-network URL** `INTERNAL_API_URL=http://backend:4000/api`; the browser uses `NEXT_PUBLIC_API_URL=http://localhost:4000/api`. `frontend/src/lib/config.ts:apiBase()` picks per environment.
2. **SSR requests carry `x-internal-token`** (`INTERNAL_API_TOKEN`) so the rate limiter does not throttle the server rendering many pages for many users (`AppThrottlerGuard`).
3. **Media never exposes raw Drive URLs.** The backend mints `.../api/media/{stream|audio|subtitle}/:id?exp=…&sig=…` (HMAC, TTL `MEDIA_SIGNED_URL_TTL`, default 6 h).
4. **Uploaded images are stored as root-relative URLs** (`/uploads/posters/x.jpg`) and served to the browser through a Next route handler, because the Next image optimizer runs *inside* the frontend container where `localhost:4000` is unreachable (this was the root cause of "posters don't show").
5. **Provider abstraction**: `MediaProviderAdapter` (`google-drive`, `direct-file`) keeps Drive swappable for S3/R2/HLS later.

---

## 7. Docker / Local Environment

### Services, ports, volumes (from `docker-compose.yml`, verified)

| Service | Container | Host port → container | Notes |
|---|---|---|---|
| `postgres` | anizora-postgres | **55432** → 5432 | Host port is 55432 because a host PostgreSQL 18 already owns 5432. Healthcheck `pg_isready`. Volume `postgres-data`. |
| `redis` | anizora-redis | 6379 → 6379 | appendonly, 256mb LRU. Volume `redis-data`. |
| `mailhog` | anizora-mailhog | 1025 (SMTP), **8025** (UI) | Image is actually **axllent/mailpit** (service name kept as `mailhog`). |
| `backend` | anizora-backend | **4000** → 4000 | Healthcheck `GET /api/health`. Volume `uploads-data:/app/storage/uploads`. Mounts `./secrets/google-service-account.json` → `/run/secrets/google-service-account.json:ro`. |
| `frontend` | anizora-frontend | **3000** → 3000 | Healthcheck `GET /api/healthz`. Depends on backend healthy. |
| `nginx` | anizora-nginx | 8080 → 80 | **Only** with `--profile proxy`. Not needed for local dev. |

### URLs

- Website: **http://localhost:3000**
- Admin: **http://localhost:3000/admin**
- API: **http://localhost:4000/api** — Swagger at **http://localhost:4000/api/docs** (when `SWAGGER_ENABLED=true`)
- Health: `http://localhost:4000/api/health`, `http://localhost:3000/api/healthz`
- Test inbox (Mailpit): **http://localhost:8025**
- Database (DBeaver): `localhost:55432`, db/user `anizora`

### Correct workflow (Docker only)

```bash
cd E:/tofayel_project
docker compose up -d --build            # build + start everything
docker compose ps                       # verify all healthy
docker compose logs backend --tail=100 -f
```

**Do NOT** also run `npm run dev` in `frontend/` — that was done once by mistake, started a second site on **port 3001**, and broke auth because `CORS_ORIGINS`/`SITE_URL` only allow `http://localhost:3000`. Use Docker for the running site; use host `npm` only for `typecheck` / `lint` / `test`.

The backend entrypoint (`backend/docker-entrypoint.sh`) on every start:
1. runs `prisma migrate deploy` (forward-only; never resets — safe),
2. copies baked-in demo media into the `uploads-data` volume if missing,
3. optionally runs the seed when `RUN_SEED=true` (executes compiled `dist-seed/seed.js`).

> **Dockerfile note:** both images use `npm install` (not `npm ci`) on purpose — the lockfile is generated on Windows and `npm ci` fails in Linux containers over optional platform packages (`@emnapi`, swc).

---

## 8. Database

PostgreSQL 16. Schema: `backend/prisma/schema.prisma` (**1470 lines**, 54 models, 24 enums).

### Migration history

| Migration | Applied to running DB? | Contents |
|---|---|---|
| `20260918000000_init` | ✅ Yes (2026-09-18) | Whole initial schema |
| `20260919000000_audio_tracks_and_relative_media_urls` | ❌ **NO — pending** | Reshapes `audio_tracks` for episode-level separate audio files; rewrites absolute `http://localhost:4000/uploads/...` image URLs to root-relative `/uploads/...` |

Verified live DB state (`\d audio_tracks`): still the **old** shape — `mediaSourceId NOT NULL`, no `episodeId`, no `provider`, no `url`. So the new audio feature **cannot work until the migration is applied** (it applies automatically on the next `docker compose up --build -d backend`).

### Core models that EXIST NOW

**Identity & auth**
- `User` — email, username, displayName, avatarUrl, bannerUrl, bio, `passwordHash`, `googleId` (unique, nullable), `role` (UserRole), `status` (UserStatus), `emailVerifiedAt`, `mana`, `rankId`, `lastLoginAt`, soft-delete `deletedAt`.
- `RefreshToken` — **opaque token, stored only as SHA-256 `tokenHash`**, `expiresAt`, `revokedAt`, device/ip metadata. Rotated on every refresh; replay of a consumed token revokes the whole family.
- `PasswordResetToken`, `EmailVerificationToken` — same hashed-token pattern.
- `Rank` — Mana thresholds, icon, colour.

**Catalogue**
- `Anime` — titleEnglish/titleJapanese, slug (unique), synopsis, `posterUrl`, `bannerUrl`, `type`, `status`, `season`, `releaseYear`, `startDate`/`endDate`, `ageRating`, `score`, `source`, `durationMinutes`, `totalEpisodes`, `isFeatured`, `isTrending`, `publishStatus`, counters, `deletedAt`.
- `AnimeTitle` (alt titles), `Genre` + `AnimeGenre`, `Studio`, `Producer` + `AnimeProducer`, `AnimeRelation`, `AnimeRecommendation`, `Season`, `FeaturedAnime` (homepage hero: order, backdropUrl, tagline).
- `Episode` — animeId, `number` (Decimal), title, description, `thumbnailUrl`, `durationSeconds`, `airDate`, `hasSub`, `hasDub`, `isFiller`, `introStart`/`introEnd`/`outroStart`/`outroEnd`, `viewCount`, `publishStatus`, `deletedAt`. Unique `(animeId, number)`.

**Media**
- `MediaSource` — one "server"/flavour per episode: `provider` (GOOGLE_DRIVE | DIRECT_FILE | OBJECT_STORAGE | HLS | EXTERNAL_EMBED), `kind` (SUB/DUB), `audioLanguage`, `audioLabel`, `hlsUrl`, `embedUrl`, `isDefault`.
- `MediaVariant` — one file per quality: `quality` (VideoQuality enum Q_2160P…Q_240P), `driveFileId`, `directUrl`, `sizeBytes`, `isDefault`.
- `AudioTrack` — **schema rewritten in the pending migration**: now `episodeId` (nullable FK, cascade) *or* `mediaSourceId` (nullable), `language`, `label`, `provider`, `driveFileId`, `url`, `mimeType` (default `audio/mp4`), `codec`, `hlsGroupId`, `isDefault`, `isActive`, `sortOrder`. Index `(episodeId, isActive, sortOrder)`.
- `SubtitleTrack` — `language`, `label`, `format` (VTT/SRT/ASS), `url` or `driveFileId`, `isDefault`, `isForced`; may hang off an episode (`mediaSourceId = null`) or a specific source.
- `DownloadSource` — label, quality, kind, url.

**Watching**
- `WatchProgress` — **unique `(userId, episodeId)`**; `animeId`, `positionSeconds`, `durationSeconds`, `percent`, `completed`, `lastWatchedAt`. This is the authoritative resume/Continue-Watching record.
- `WatchHistory` — append-only "episode opened" rows for the activity feed (deliberately separate from progress).
- `WatchlistEntry` (status: WATCHING/COMPLETED/PLAN_TO_WATCH/ON_HOLD/DROPPED), `Favorite`, `Rating`.

**Social / community**
- `Comment` + `CommentVote` (episode/anime comments, threaded), `Report`, `CommunityCategory`, `CommunityPost`, `CommunityComment`, `CommunityVote`, `CommunityPostAnime`, `Poll`/`PollOption`/`PollVote`, `TierListItem`.

**Gamification / ops**
- `ManaRule`, `ManaTransaction`, `ActivityLog`, `AnimeView`/`EpisodeView` + `AnimeViewStat`/`EpisodeViewStat` (rollups), `AnimeRequest`, `ContactMessage`, `SiteSetting`, `AdPlacement`.

### PLANNED / NOT PRESENT
- No S3/R2 storage rows (the `S3_*` env vars exist; the driver is not implemented — `StorageService` has a local driver only).
- No subscription/billing models. No DRM. No CDN cache table.

---

## 9. Authentication

**Backend** (`backend/src/modules/auth/`)

- `POST /api/auth/login` → returns `{ accessToken, user }` (JWT access token, short TTL `JWT_ACCESS_TTL=15m`) **and** sets an httpOnly refresh cookie **`anizora_refresh`**.
- Refresh tokens are **opaque random strings**, stored hashed (`token.service.ts`), rotated on every `/auth/refresh`, revoked on logout; replay revokes all sessions for that user.
- Cookie flags are derived from whether `SITE_URL` is https: on plain http local dev → `secure:false, sameSite:'lax'` (an earlier bug set `SameSite=None; Secure` on http, so the browser silently dropped the cookie).
- Guards (global, in `app.module.ts`): `JwtAuthGuard` (bypassed by `@Public()`, relaxed by `@OptionalAuth()`), `RolesGuard` (`@Roles(...)`, role hierarchy USER < MODERATOR < ADMIN < SUPER_ADMIN), `AppThrottlerGuard` (skips requests carrying a valid `x-internal-token`; `@SkipThrottle()` on health + media streaming).
- Google OAuth: `google.strategy.ts` (passport-google-oauth20) with a **cookie-based OAuth state store** (`anizora_oauth_state`, httpOnly, 10 min, constant-time compare) + `google-oauth.guard.ts` (returns 404 when `GOOGLE_OAUTH_ENABLED=false`). Callback sets the refresh cookie and redirects to `/auth/callback` — **no token is ever placed in the URL**.

**Frontend**

- `src/lib/auth-store.ts` (zustand): access token held **in memory only**; `refresh()` exchanges the cookie for a session on load; `sessionGeneration` counter discards stale in-flight refreshes; `onLogout(listener)` lets subscribers clear caches.
- `src/components/Providers.tsx`: on logout → `queryClient.clear()`.
- `src/lib/auth-redirect.ts`: `safeReturnPath()` (rejects `//host`, `/\host`, `https://…`, `/auth/*`) and `postLoginPath(role, returnTo)` → staff (MODERATOR/ADMIN/SUPER_ADMIN) land on `/admin`, everyone else on `/` or their intended page; a non-staff user is never sent into `/admin`. **Role-based, never email-based.** Unit-tested (`auth-redirect.test.ts`).
- `src/components/auth/RequireAuth.tsx` guards client pages; `src/app/admin/layout.tsx` wraps the whole dashboard in `<RequireAuth role="MODERATOR">`, so MODERATOR and above may enter — which is why `postLoginPath()` also routes moderators to `/admin`.

---

## 10. Google Drive / Media Architecture

**Files:** `backend/src/modules/media/` — `media.service.ts`, `media.controller.ts`, `media-provider.registry.ts`, `providers/google-drive.provider.ts`, `providers/direct-file.provider.ts`, `providers/media-provider.interface.ts`.

**How auth works now**
- `GOOGLE_DRIVE_ENABLED=true`, `GOOGLE_DRIVE_AUTH_MODE=service_account`.
- The key file is mounted read-only into the backend container at `/run/secrets/google-service-account.json` (host path `./secrets/google-service-account.json`, gitignored). `GOOGLE_SERVICE_ACCOUNT_FILE` points at the container path. `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` is an alternative for hosts without file mounts.
- Scope: `https://www.googleapis.com/auth/drive.readonly`.
- An OAuth-refresh-token mode also exists (`GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN`) but is not in use.
- Service-account identity used during development (this address is **not** a secret): `anizora-media@anizora.iam.gserviceaccount.com`. Every Drive file/folder must be shared with it (Viewer is enough).

**How streaming works**
1. Admin stores a Drive **share link or bare file ID** per quality variant. `GoogleDriveProvider.extractFileId()` accepts `/file/d/<id>`, `?id=<id>`, `/d/<id>`, `/open?id=<id>`, or a raw ID (`^[A-Za-z0-9_-]{20,}$`).
2. The API returns a signed relative URL per quality: `/api/media/stream/:variantId?exp=…&sig=…` (HMAC-SHA256 over `kind:id:exp` with `MEDIA_SIGNING_SECRET`).
3. `GET /api/media/stream/:id` verifies the signature/expiry, then calls Drive `files.get({ alt: 'media' }, { responseType: 'stream', headers: { Range } })` and **mirrors Drive's 206 / `Content-Range` / `Accept-Ranges` headers**. A `HEAD` endpoint exists so the browser can discover size and range support.
4. Aborting: if the viewer seeks away, `res.on('close')` aborts the upstream Drive request.
5. File metadata (size/mime) is cached in-process for 30 min.
6. Same pattern for `GET /api/media/audio/:trackId` (separate audio files) and `GET /api/media/subtitle/:trackId` (SRT is converted to WebVTT on the fly).

**Explicitly NOT done:** no scraping, no `uc?export=download` confirm-token tricks, no iframe `/preview` embedding, no bypassing of Drive permissions.

**Known limits (documented in `docs/GOOGLE_DRIVE.md`)**
- Drive enforces per-file/per-project download quotas — fine for launch, not a CDN.
- A progressive MP4 has one audio track → alternate languages must be separate MediaSources *or* the new separate-audio-file mechanism.
- No adaptive bitrate on Drive: quality switching swaps files, and the player restores the position.

---

## 11. Video Player

**Files:** `frontend/src/components/player/`
- `VideoPlayer.tsx` — the shell: layout, controls, overlays, settings menu wiring, ads layer, resume prompt.
- `useVideoPlayer.ts` — owns the `<video>` element: source loading (progressive vs HLS via hls.js), play/pause/seek/skip, volume/mute state, playback rate, fullscreen, PiP, HLS level switching, error handling with source failover, and the **quality-swap position restore**.
- `useExternalAudio.ts` — plays a separate audio file in a hidden `<audio>` locked to the video (see §14).
- `SubtitleLayer.tsx` — `SubtitleTrack` (inside `<video>`, so the browser parses the VTT) + `SubtitleCues` (custom renderer painted above the video).
- `SettingsMenu.tsx` — Quality / Subtitles / Subtitle style / Audio / Server / Speed panels + autoplay & auto-skip toggles.
- `usePlayerPreferences.ts` — localStorage preferences (versioned, v2).
- `useImaAds.ts` — Google IMA SDK integration.
- `icons.tsx`.

**Implemented controls (all real, none decorative):** play/pause, seek bar with buffered + intro/outro markers, ±10 s, previous/next episode, volume slider + mute, time display, quality menu, subtitle on/off + track choice, subtitle styling, audio menu, server menu, playback speed, lights-off, theatre mode, picture-in-picture, fullscreen, keyboard shortcuts (space/k, j/l, ←/→, ↑/↓, m, f, p, t, c, n, 0–9, Esc), skip-intro / skip-outro buttons, next-episode overlay, autoplay-next, auto-skip-intro, error state with retry + report, and (new, unverified) the Resume / Start Over prompt.

`EXTERNAL_EMBED` sources deliberately render a bare iframe with a notice, because none of those controls can genuinely drive a third-party embed.

---

## 12. Quality Switching — ✅ VERIFIED WORKING (protect this)

**How it works** (`useVideoPlayer.ts`): progressive sources have one file per quality, so switching means swapping `video.src`. Before the swap, `captureForSwap()` records `currentTime` (`pendingSeekRef`) and whether it was playing (`shouldResumeRef`); on the next `loadedmetadata` the position is restored and playback resumed. HLS sources instead set `hls.currentLevel` with no reload.

**Verified earlier in-browser** (headless Edge via Playwright, Drive-hosted demo episode): 720p → 480p → 360p → 720p, timestamp preserved across every switch, playback continued.

**Change made this session that touches this path:** `onTimeUpdate` now returns early while `pendingSeekRef.current > 0`, so the transient `currentTime = 0` during a swap can no longer be written to the database as the viewer's progress. The swap logic itself was left intact. **This needs re-testing (regression #1).**

---

## 13. Subtitle System

**Data:** `SubtitleTrack` rows (episode-level when `mediaSourceId` is null). `SubtitleFormat` enum = `VTT | SRT | ASS` (the admin form offers VTT and SRT; ASS exists in the schema but has no conversion path). Admin adds them in the Episode form: language tag, label, format (VTT/SRT), URL **or** Drive link, default flag. SRT is converted to WebVTT by the backend (`srtToVtt` in `media.service.ts`). Served signed via `/api/media/subtitle/:trackId`.

**Rendering:** cues are painted by our own overlay rather than native `::cue`, because `::cue` cannot reliably control background opacity, outline and vertical position. `SubtitleCues` reads the `TextTrack` in `mode: 'hidden'`, strips VTT inline markup, and re-attaches on the video's `loadedmetadata` (via a `sourceGeneration` counter) **so a quality switch does not drop subtitles**.

**Style model** (`usePlayerPreferences.ts`, `STORAGE_VERSION = 2`, key `anizora.player.preferences`):

```ts
SubtitleStyle = {
  size: 'small' | 'medium' | 'large' | 'xl',   // scales 0.8 / 1 / 1.25 / 1.55
  color: string,                               // hex
  backgroundColor: string,                     // hex
  backgroundOpacity: number,                   // 0..1 — DEFAULT 0 (no box)
  edge: 'none' | 'outline' | 'shadow' | 'outline-shadow',  // DEFAULT 'outline-shadow'
  offsetPercent: number,                       // 0..40, DEFAULT 7
}
```

Version 1 styles (which defaulted to a 60 % black box) are **discarded on read**, so existing browsers actually receive the new transparent default.

**Settings panel** (`SettingsMenu.tsx` → "Subtitle style"): live preview swatch, size presets, 6 colour swatches + custom colour picker, background colour + opacity slider (0 = none), outline/shadow presets, vertical position presets (Lower / Default / Higher) + a 0–40 % slider, and "Reset to default". Cues never overlap the control bar: while controls are visible the cue block sits at `max(offset%, 96px)`.

**Status:** implemented; unit tests cover the preference model (defaults, v1 migration, clamping, merge). **Visual behaviour in the browser is UNVERIFIED.** Bangla is supported as a language tag (`bn`) — it is just another `SubtitleTrack`; no Bangla demo file is seeded.

---

## 14. Audio / Dub System

Two mechanisms exist:

**(a) Legacy — one audio per source.** Each `MediaSource` carries `kind` (SUB/DUB) + `audioLanguage`; switching audio = switching source = video reloads (position preserved). This is what currently runs in Docker.

**(b) New — separate audio files per episode (implemented, NOT deployed).**
- **DB:** reshaped `AudioTrack` (episodeId, language, label, provider, driveFileId/url, mimeType, codec, isDefault, isActive, sortOrder) — *pending migration*.
- **Admin:** `EpisodeForm.tsx` → **"Audio Tracks"** card: add/remove/reorder (↑/↓), language code, label, provider (Google Drive / Direct file / Object storage), Drive link or URL, MIME type, optional codec note, default radio. Saved as `audioTracks[]` on the episode payload; the backend replaces the set atomically and enforces exactly one default.
- **API:** episode playback payload gains `playback.audioTracks[]` with signed `/api/media/audio/:id` URLs; `GET /api/media/audio/:trackId` streams with Range like video.
- **Player:** `useExternalAudio.ts` mutes the video and plays the chosen file in a hidden `<audio>`, kept in lock-step by: mirroring play/pause/seek/ratechange, pausing the audio while the video buffers (`waiting`) and pausing the **video** while the audio buffers, pausing audio on `emptied` (which is what a quality swap fires), and a 500 ms drift corrector — >0.3 s drift hard-resyncs, >0.06 s nudges `playbackRate` ±3 %.
- **Switching audio changes only the `<audio>` source**, so the video never reloads: timestamp, quality, subtitle, play state and volume all persist by construction.
- Volume/mute became player **state** applied to whichever element is audible.

**Status: NOT VERIFIED.** Blocked by: (1) pending migration, (2) no demo audio files generated yet, (3) no browser test. Browsers cannot attach a second fetched audio file to `<video>` (the `audioTracks` API is unimplemented in Chrome/Firefox), which is why this synchronised-element approach was chosen; expect to tune drift thresholds against real files.

---

## 15. Watch Progress / Continue Watching

**Storage:** `WatchProgress`, unique per `(userId, episodeId)`; completion threshold is **90 %** (`COMPLETION_THRESHOLD` in `watch.service.ts`); `MIN_RESUME_SECONDS = 10`.

**Saving (frontend, `WatchClient.tsx` — rewritten this session):**
- periodic save every **15 s** (`PROGRESS_INTERVAL_MS`), driven by the player's `onTimeUpdate` and a `lastSavedAt` stamp (the old throttle helper could fire with stale arguments);
- immediate save on **pause** and **ended** (`onProgressCheckpoint`);
- flush on **tab hidden** (`visibilitychange`), **pagehide** (with `keepalive`), and on **unmount / episode change**;
- the latest position is tagged with its `episodeId`, so navigating between episodes can never write one episode's position onto another;
- positions below 2 s are ignored, except a deliberate `force` save of 0 for **Start Over**.

**Reading:** `GET /api/watch-history/continue?limit=12` → one entry per anime, most recent first:
- unfinished and ≥10 s and below 90 % → `state: 'resume'` with `positionSeconds`, `durationSeconds`, `percent`, `remainingSeconds`, anime + episode summaries;
- finished (or ≥90 %) → the **next published episode** with `state: 'next'`; if there is none, the title is dropped from the row (completed series disappear).

**Homepage UI:** `frontend/src/components/home/ContinueWatchingRail.tsx` (new), rendered in `src/app/page.tsx` right below the hero. It is a client component (the homepage itself is statically revalidated every 120 s), fetches only when authenticated, re-fetches when the tab becomes visible, and renders nothing for guests or an empty list. Cards: 16:9 backdrop (episode thumbnail → anime banner → poster), "EP n" / "Up next" badge, title, episode line, progress bar with `role="progressbar"`, hover play button, and "`n`% watched · `m` min left". Links to `/watch/<slug>/ep-<n>`. A "History" link points at `/profile/history`.

**Full history page:** `frontend/src/app/profile/history/page.tsx` — paginated list, remove one, clear all. Navbar has **My List** and **Watch History** entries.

**Status: code complete, UNVERIFIED in browser.**

---

## 16. Resume / Start Over

**Original bug:** the watch page is server-rendered without the viewer's session, so `payload.progress` was always `null` and every episode began at 00:00 — no prompt ever appeared.

**Fix implemented (unverified):**
1. New endpoint `GET /api/watch-history/progress/:episodeId` → `{ progress }` for the signed-in user (the DB is authoritative).
2. `WatchClient.tsx` fetches it client-side per episode and passes `resume` + `resumeReady` to the player. The big play button shows a spinner and is disabled until the lookup resolves, so a click can never race the answer.
3. `VideoPlayer.tsx` shows a modal over the poster: **"Resume watching from MM:SS?"** with a progress bar and **[Resume]** / **[Start Over]** buttons (`data-testid="resume-prompt"`).
4. `resumeOffer(progress, fallbackDuration)` (exported, unit-tested) decides: nothing saved → no prompt; `< 10 s` → no prompt; `≥ 90 %` of duration → no prompt (plays from the start, and a completed episode shows "Watched · plays again from the start"); a mid-episode rewatch of a completed episode **does** offer resume.
5. Resume seeks via the new `actions.startAt(seconds)` (seeks immediately if metadata is loaded, otherwise defers to `pendingSeekRef`). Start Over calls `onStartOver()` → writes position 0 to the DB → plays from 0.
6. Because the position now lives in the DB and the player no longer reads the SSR payload, it survives refresh, quality/subtitle/audio switches and logout/login.

Backend `continueWatching` was aligned to the same rule (a mid-episode rewatch counts as resumable).

**Status: code complete, UNVERIFIED in browser.**

---

## 17. Anime / Episode Management

**Anime form** (`frontend/src/components/admin/AnimeForm.tsx`) — fields that exist: English title, Japanese title, alternative titles, slug, synopsis, poster (upload), banner (upload), type, genres, status, season, release year, start/end air dates, age rating, score, studio, producers, source, duration, total episodes, featured, trending, publish status (Draft/Published/Archived).

**Episode form** (`EpisodeForm.tsx`) — anime selector, episode number, title, description, thumbnail (upload), duration, air date, hasSub/hasDub, isFiller, publish status, intro start/end, outro start/end, **media sources** (label, provider, SUB/DUB, audio language/label, HLS url, embed url, default) each with **quality variants** (quality enum + Drive link/ID or direct URL + default), **Audio Tracks** (new, §14), **subtitle tracks**, **download links**, and a completeness checklist sidebar.

Backend: `admin-anime.service.ts`, `admin-episodes.service.ts` (media replacement happens inside one transaction), DTOs in `admin/dto/`.

---

## 18. Poster / Banner Uploads

**Root causes found for "images don't show / upload fails":**
1. `POST /api/uploads/:kind` returned **404** because `main.ts` called `setGlobalPrefix(apiPrefix, { exclude: ['uploads/(.*)'] })` — the exclusion removed the upload *API* route from the `/api` prefix while the frontend called `/api/uploads/...`. **Fixed:** the exclusion was removed; static files are served by `useStaticAssets` instead.
2. Images 404'd/ECONNREFUSED because stored URLs were absolute `http://localhost:4000/uploads/...` and the **Next image optimizer runs inside the frontend container**, where `localhost:4000` is the container itself. **Fixed by:** `STORAGE_PUBLIC_BASE_URL=/uploads` (root-relative URLs), a Next route handler `frontend/src/app/uploads/[...path]/route.ts` that proxies `/uploads/*` to the backend over the internal network (path segments validated against `^[A-Za-z0-9._-]+$`, immutable cache headers, `nosniff`), and migration SQL that rewrites existing absolute URLs to relative ones.

**Upload pipeline now:** admin picks a file → `ImageUploadField.tsx` validates MIME (JPG/PNG/WebP/AVIF), size (≤ 15 MB, matching `MAX_UPLOAD_SIZE_MB`) and **dimensions/shape** client-side, shows an immediate local `blob:` preview, POSTs multipart to `/api/uploads/:kind` with the bearer token → `StorageService.save()` re-validates MIME, size and dimensions with `image-size` (poster ≥ 300×420 portrait, banner ≥ 960×300 landscape, thumbnail ≥ 320×180 landscape, avatar ≥ 64×64), writes into `/app/storage/uploads/<kind>s/` (the **`uploads-data` Docker volume** → survives restarts) and returns `{ url: '/uploads/<kind>s/<name>' }`. The field then swaps the preview to the stored URL and offers **Replace** / remove. Server validation messages are surfaced inline.

Previews use a plain `<img>` (not `next/image`) because the source may be a `blob:` URL or an arbitrary pasted host.

**Status: code complete, UNVERIFIED end-to-end** (needs redeploy + migration, then an actual upload in the browser and a `docker compose restart` persistence check).

---

## 19. Admin Dashboard

Routes that EXIST (`frontend/src/app/admin/`): `/admin` (dashboard), `anime`, `anime/new`, `anime/[id]`, `episodes`, `episodes/new`, `episodes/[id]`, `taxonomy` (genres/studios/producers), `users`, `featured`, `ads`, `reports`, `requests`, `contact`, `gamification` (mana rules + ranks), `activity`, `settings`, plus `admin/layout.tsx` (`RequireAuth role="MODERATOR"` + `AdminNav`).

Backend `/api/admin/*` (see §25) covers dashboard stats, anime CRUD + restore, episode CRUD, users (list, role — SUPER_ADMIN only, status, mana grant), genres/studios/producers CRUD, mana rules, ranks CRUD, featured slider, activity log. Reports/requests/contact/ads/settings live in their own modules with `@Roles` protection.

**Not built:** community moderation has report handling but no dedicated community-post moderation screen; comments are moderated via reports rather than a comment browser.

---

## 20. Ads

**Display (AdSense):** `frontend/src/components/ads/AdSlot.tsx` renders a placement by key. The keys actually used in the UI are: `home_below_hero`, `home_in_feed`, `home_between_grids`, `home_footer`, `anime_detail_top`, `anime_detail_episodes`, `watch_above_player`, `watch_below_player`, `watch_below_comments`, `watch_sidebar`, `browse_top`, `browse_in_grid`, `search_results`, `community_list`. Placements are rows in `AdPlacement`, editable at `/admin/ads`; `GET /api/ads/config` returns only enabled, fully-configured placements. Gated by `NEXT_PUBLIC_ADS_ENABLED`, `NEXT_PUBLIC_ADSENSE_CLIENT_ID`, `NEXT_PUBLIC_ADSENSE_TEST_MODE`. **Currently disabled** (no publisher ID configured) → slots render a neutral placeholder or nothing.

**In-video (IMA/VAST):** `frontend/src/components/player/useImaAds.ts` loads Google's IMA SDK and supports pre-roll, mid-roll (interval or explicit cue points), post-roll, skippable countdown, frequency cap per hour, ad error fallback (content resumes) and content pause/resume. Config comes from the `VIDEO` ad placement (`vastTagUrl`, `preRoll`, `midRoll`, `postRoll`, `midRollIntervalSeconds`, `midRollCuePoints`, `frequencyCapPerHour`). **Currently disabled** — `NEXT_PUBLIC_VIDEO_ADS_ENABLED=false` and no VAST tag configured, so this path is **untested against a real ad server**.

⚠️ Reminder for the owner: a standard AdSense account does **not** grant in-stream video ads. In-video ads need Ad Manager / an approved video ad partner supplying a VAST tag.

---

## 21. Search / Browse

Implemented pages: homepage (`/`) with hero slider (`FeaturedAnime`), Latest Episodes, Trending, New Releases, Newly Added, Upcoming, Just Completed, Top Anime sidebar, community teaser, A–Z strip; `/browse` (grid + filters + pagination); `/az`; `/genres/[slug]`; `/anime/[slug]`; `/watch/[slug]/[episode]`; `/random` (route handler); `/leaderboard`; `/community`; `/guides`; `/request`; `/contact`; profile pages.

Filter parameters accepted by `GET /api/anime` (exact names from `backend/src/modules/anime/dto/anime-query.dto.ts`):
`q`, `genres[]`, `type[]`, `status[]`, `season`, `year`, `ageRating[]`, `source[]`, `language` (MediaKind `SUB`/`DUB`), `studio`, `producer`, `minEpisodes`, `maxEpisodes`, `minScore`, `letter`, `hideInList`, `page`, `limit`.
Sort values (`sort=`): `default`, `updated`, `added`, `score`, `name`, `name_desc`, `release`, `views`, `episodes`, `trending`.
Array params accept `a,b,c` or repeated keys. Responses carry pagination meta (`page`, `limit`, `total`, `totalPages`, `hasNext`, `hasPrevious`).
Note: there is a `minScore` but **no** `maxScore`.

---

## 22. Community

Implemented: categories, posts (kinds incl. discussion/poll/tier-list), post comments with replies, up/down votes, reports, polls with voting, tier-list items, Mana awards for activity, ranks and `/leaderboard`. Admin sees reports at `/admin/reports`.

**Watch2Gether: intentionally absent. Do not add it.**

---

## 23. Important Frontend Files

| Path | Role | Notes / issues |
|---|---|---|
| `src/app/page.tsx` | Homepage (SSR, `revalidate = 120`) | Now renders `<ContinueWatchingRail />` under the hero |
| `src/app/watch/[slug]/[episode]/page.tsx` | Watch page (SSR) | Payload has **no** user progress by design (guest-cacheable) |
| `src/components/watch/WatchClient.tsx` | Watch page client shell | **Rewritten:** progress fetch, 15 s saves, pause/hidden/pagehide/unmount flushes, Start Over |
| `src/components/player/VideoPlayer.tsx` | Player shell | **Modified:** resume prompt, external-audio wiring, `resumeOffer()` exported for tests |
| `src/components/player/useVideoPlayer.ts` | `<video>` controller | **Modified:** volume/mute as state, `startAt()`, swap-safe `onTimeUpdate`, `onPause`. Quality-swap logic untouched — protect it |
| `src/components/player/useExternalAudio.ts` | Separate audio sync | **New, untested** |
| `src/components/player/SubtitleLayer.tsx` | Cue renderer | **Rewritten** for the v2 style model; re-attaches after source swaps |
| `src/components/player/usePlayerPreferences.ts` | localStorage prefs | **Rewritten**, `STORAGE_VERSION = 2` |
| `src/components/player/SettingsMenu.tsx` | Settings panels | **Rewritten:** new subtitle-style panel, external-audio menu |
| `src/components/player/useImaAds.ts` | IMA/VAST ads | Untested against a real tag; 1 lint warning |
| `src/components/home/ContinueWatchingRail.tsx` | Continue Watching row | **New, untested** |
| `src/components/layout/SiteHeader.tsx` | Navbar + account menu | **Fixed:** `accountRef` added to the click-outside check (root cause of "logout does nothing"); `handleLogout` closes the menu, awaits logout, `router.replace('/')` + `refresh()` |
| `src/components/auth/LoginForm.tsx` | Sign in | Role-based redirect via `postLoginPath`, `?error=` display, "Continue with Google" when `/auth/providers` reports it enabled |
| `src/components/auth/RegisterForm.tsx` | Sign up | Same Google button + role redirect |
| `src/app/auth/callback/page.tsx` | OAuth landing | `refresh()` → route by role; no token in URL |
| `src/lib/auth-store.ts` | Zustand auth | Access token in memory, `sessionGeneration`, `onLogout` listeners |
| `src/components/Providers.tsx` | React Query provider | Clears the query cache on logout |
| `src/lib/auth-redirect.ts` | Redirect rules | Unit-tested |
| `src/lib/api.ts`, `src/lib/config.ts` | API client | SSR vs browser base URL, `x-internal-token` on SSR |
| `src/lib/types.ts` | Shared types | Added `ExternalAudioTrack`, `EpisodeProgress`, `ContinueWatchingItem`, `playback.audioTracks` |
| `src/app/uploads/[...path]/route.ts` | `/uploads/*` proxy | **New** — fixes images inside Docker |
| `src/components/admin/ImageUploadField.tsx` | Upload widget | **Rewritten:** local preview, client validation, server error display, Replace |
| `src/components/admin/EpisodeForm.tsx` | Episode admin | **Modified:** Audio Tracks card |
| `src/components/admin/AnimeForm.tsx` | Anime admin | Uses `ImageUploadField` for poster/banner |
| `frontend/eslint.config.mjs` | Lint config | **New** — `npm run lint` was previously impossible |

---

## 24. Important Backend Files

| Path | Role | Notes / issues |
|---|---|---|
| `src/main.ts` | Bootstrap | helmet, cookie-parser, CORS from `CORS_ORIGINS`, global prefix `api`, `useStaticAssets(resolve(storage.localPath))`, Swagger at `/api/docs`. **Fixed:** removed the `exclude: ['uploads/(.*)']` that 404'd uploads |
| `src/app.module.ts` | Module graph + global guards | JwtAuthGuard, RolesGuard, AppThrottlerGuard |
| `src/common/guards/app-throttler.guard.ts` | Rate limiting | Skips requests with a valid `x-internal-token` (SSR) |
| `src/modules/auth/auth.service.ts` | Login/register/reset + `loginWithGoogle` | Google linking rules unit-tested (`auth.service.google.spec.ts`) |
| `src/modules/auth/token.service.ts` | Refresh tokens | Hashed, rotated, family revocation |
| `src/modules/auth/strategies/google.strategy.ts` | OAuth | Cookie state store, `openid email profile`, carries `email_verified` |
| `src/modules/auth/google-oauth.guard.ts` | OAuth guard | 404 when disabled; redirects instead of throwing on failure |
| `src/modules/auth/auth.controller.ts` | Auth routes | Callback sets cookie, redirects to `/auth/callback` |
| `src/modules/media/media.service.ts` | Signing + stream opening | `sign('variant'\|'audio'\|'subtitle', id)`, `openVariantStream`, **`openAudioStream`** (new), SRT→VTT |
| `src/modules/media/media.controller.ts` | Streaming endpoints | GET/HEAD stream, **GET audio** (new), GET subtitle |
| `src/modules/media/providers/google-drive.provider.ts` | Drive adapter | Range proxying, ID extraction, metadata cache |
| `src/modules/media/providers/direct-file.provider.ts` | Local/remote files | Used by demo media and `DIRECT_FILE` audio |
| `src/modules/episodes/episodes.service.ts` | Watch payload | Now includes `playback.audioTracks` with signed URLs |
| `src/modules/watch/watch.service.ts` | Progress | `updateProgress`, **`progressFor`** (new), **`continueWatching`** (rewritten), history, clear |
| `src/modules/watch/watch.controller.ts` | Watch routes | **New** `GET progress/:episodeId` |
| `src/modules/admin/admin-episodes.service.ts` | Episode admin | `replaceMedia` transaction; **`audioRow()`** validates provider/Drive ID/URL, forces exactly one default |
| `src/modules/admin/dto/admin-episode.dto.ts` | Episode DTOs | **`EpisodeAudioTrackDto`** (new), `audioTracks?` on create/update (max 30) |
| `src/modules/storage/storage.service.ts` | Uploads | MIME + size + **dimension** validation (`image-size`), local driver, `/uploads/...` URLs. S3 branch not implemented |
| `src/modules/storage/storage.controller.ts` | `POST /api/uploads/:kind` | `@Roles(ADMIN)`, multipart via `FileInterceptor` |
| `src/modules/ads/ads.service.ts` | Ad config | Returns only enabled+configured placements |
| `prisma/schema.prisma` | Schema | 54 models; `AudioTrack` reshaped (migration pending) |
| `prisma/seed.ts` + `seed-data.ts` + `seed-art.ts` | Seed | Admin + demo users + 14 original demo anime + procedural SVG art |
| `docker-entrypoint.sh` | Startup | `migrate deploy`, demo media copy, optional seed |

---

## 25. API Endpoints

Base: `http://localhost:4000/api`. Auth = Bearer access token unless noted; `@Public` = no auth; cookie = `anizora_refresh`.

**Auth** — `POST /auth/register` (public), `POST /auth/login` (public), `POST /auth/refresh` (public, cookie), `POST /auth/logout` (public, cookie), `POST /auth/logout-all` (auth), `POST /auth/forgot-password` (public), `POST /auth/reset-password` (public), `POST /auth/change-password` (auth), `POST /auth/verify-email` (public), `POST /auth/resend-verification` (auth), `GET /auth/me` (auth), `GET /auth/providers` (public → `{ google: boolean }`), `GET /auth/google` (public, redirect), `GET /auth/google/callback` (public, redirect).

**Anime** — `GET /anime` (optional auth; filters+sorts+pagination), `GET /anime/featured`, `GET /anime/trending`, `GET /anime/top`, `GET /anime/az-index`, `GET /anime/random`, `GET /anime/:slug` (optional auth), `GET /anime/:slug/recommendations`, `GET /anime/:slug/episodes`, `GET /anime/:slug/rating` (GET/PUT/DELETE).

**Episodes / watch payload** — `GET /episodes/latest`, `GET /watch/:slug/ep-:number` (optional auth → anime, episode, navigation, playback {sources, defaultSourceId, hasSub, hasDub, **audioTracks**}, downloads, progress).

**Media (signed, public)** — `GET|HEAD /media/stream/:variantId?exp&sig`, `GET /media/audio/:trackId?exp&sig`, `GET /media/subtitle/:trackId?exp&sig`, `GET /media/providers` (ADMIN).

**Watch history** (all auth) — `POST /watch-history/progress`, `POST /watch-history/open`, `GET /watch-history/continue?limit=`, **`GET /watch-history/progress/:episodeId`**, `GET /watch-history?page&limit`, `DELETE /watch-history[?episodeId=]`.

**Watchlist / favourites** (auth) — `GET /watchlist`, `GET /watchlist/counts`, `PUT /watchlist/:slug`, `DELETE /watchlist/:slug`, `POST /favorites/:slug/toggle`, `GET /favorites`.

**Users** — `GET /users/me`, `PATCH /users/me`, `PATCH /users/me/preferences` (auth); `GET /users/:username`, `GET /users/:username/activity` (public).

**Comments** — `GET /comments` (optional), `GET /comments/:id/replies`, `POST /comments`, `PATCH /comments/:id`, `DELETE /comments/:id`, `POST /comments/:id/upvote|downvote`.

**Community** — categories, posts (list/create/read/update/delete/vote), post comments, comment upvote/delete, polls read/vote.

**Taxonomy (public)** — `GET /genres`, `GET /studios`, `GET /producers`, `GET /years`.

**Uploads** — `POST /uploads/:kind` (ADMIN; kinds poster|banner|thumbnail|avatar|subtitle).

**Ads** — `GET /ads/config` (public); `GET|PUT|DELETE /ads/placements[...]` (ADMIN).

**Reports / requests / contact / settings / leaderboard / mana / health** — see §23 route dump; reports & moderation need MODERATOR, admin config needs ADMIN, `GET /health` is public.

**Admin (`/admin/*`, ADMIN unless noted)** — `GET dashboard`, anime `GET/POST/PUT/DELETE/:id/restore`, episodes `GET list/:id`, `POST`, `PUT /:id`, `DELETE /:id`, users `GET`, `PATCH users/:id/role` (**SUPER_ADMIN**), `PATCH users/:id/status`, `POST users/:id/mana`, genres/studios/producers CRUD, `GET/PUT mana-rules`, ranks CRUD, `GET/PUT featured`, `DELETE featured/:animeId`, `GET activity-log`.

---

## 26. Environment Variables

Files: root `.env` (real, gitignored) ← used by `docker compose`; root `.env.example` (safe template); `backend/.env`, `backend/.env.example` (for running the API outside Docker).

**No real values are reproduced here.** "Configured?" reflects the local `.env` on this machine.

| Variable | Side | Purpose | Required | Configured now | Placeholder |
|---|---|---|---|---|---|
| `SITE_NAME`, `SITE_TAGLINE` | both | Branding | no | yes | `AniZora` |
| `SITE_URL` | backend | Public site URL; decides cookie `Secure`/`SameSite` | yes | yes | `http://localhost:3000` |
| `FRONTEND_PORT` / `BACKEND_PORT` / `POSTGRES_PORT` / `REDIS_PORT` / `MAILHOG_*_PORT` / `NGINX_HTTP_PORT` | compose | Host port mapping | no | yes (`3000/4000/55432/6379/1025/8025/8080`) | — |
| `POSTGRES_USER` / `POSTGRES_DB` | db | Credentials | yes | yes (`anizora`) | `anizora` |
| `POSTGRES_PASSWORD` | db | DB password | yes | **SET (secret)** | `<REDACTED>` |
| `DATABASE_URL` | backend | Prisma connection | yes | yes (compose builds it) | `postgresql://user:pass@postgres:5432/anizora?schema=public` |
| `REDIS_ENABLED` / `REDIS_URL` | backend | Cache/throttle store | no | `true` / in-network | `redis://redis:6379` |
| `NODE_ENV` | both | Mode | yes | `production` | `production` |
| `API_PREFIX` | backend | Route prefix | yes | `api` | `api` |
| `SWAGGER_ENABLED` | backend | `/api/docs` | no | yes | `true` |
| `BACKEND_PUBLIC_URL` | backend | Base for signed media URLs | yes | yes | `http://localhost:4000` |
| `CORS_ORIGINS` | backend | Allowed browser origins | yes | yes | `http://localhost:3000` |
| `JWT_ACCESS_SECRET` | backend | Access-token signing | yes | **SET (secret)** | `<REQUIRED — 32+ random chars>` |
| `JWT_REFRESH_SECRET` | backend | Refresh signing | yes | **SET (secret)** | `<REQUIRED>` |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` / `JWT_REFRESH_TTL_REMEMBER` | backend | Token lifetimes | no | `15m` / `30d` / `90d` | — |
| `BCRYPT_ROUNDS` | backend | Hash cost | no | `12` | `12` |
| `ADMIN_EMAIL` / `ADMIN_USERNAME` | backend seed | Seeded admin identity | yes | `admin@anizora.local` / `admin` | — |
| `ADMIN_PASSWORD` | backend seed | Seeded admin password | yes | **SET (secret)** | `<REQUIRED>` |
| `INTERNAL_API_TOKEN` | both | SSR calls bypass rate limiting | yes (compose fails without it) | **SET (secret)** | `<REQUIRED>` |
| `MEDIA_SIGNING_SECRET` | backend | HMAC for media URLs | yes | **SET (secret)** | `<REQUIRED>` |
| `MEDIA_SIGNED_URL_TTL` / `MEDIA_MAX_RANGE_CHUNK` | backend | 21600 s / 8 MB | no | defaults | — |
| `GOOGLE_DRIVE_ENABLED` | backend | Turn Drive on | for Drive media | **`true`** | `true` |
| `GOOGLE_DRIVE_AUTH_MODE` | backend | `service_account` \| `oauth` | yes w/ Drive | `service_account` | `service_account` |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | backend | Path **inside the container** to the key | yes w/ Drive | `/run/secrets/google-service-account.json` | same |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | backend | Alternative to the file | no | empty | `<BASE64_OF_KEY_JSON>` |
| `GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN` | backend | OAuth Drive mode | no | empty | `<REDACTED>` |
| `GOOGLE_OAUTH_ENABLED` | backend | "Continue with Google" | for Google login | **`false`** | `true` |
| `GOOGLE_OAUTH_CLIENT_ID` | backend | OAuth client | for Google login | ❌ **EMPTY** | `<REQUIRED_FROM_USER>` |
| `GOOGLE_OAUTH_CLIENT_SECRET` | backend | OAuth secret | for Google login | ❌ **EMPTY** | `<REQUIRED_FROM_USER>` |
| `GOOGLE_OAUTH_CALLBACK_URL` | backend | Redirect URI | for Google login | empty | `http://localhost:4000/api/auth/google/callback` |
| `STORAGE_DRIVER` | backend | `local` (only one implemented) | yes | `local` | `local` |
| `STORAGE_LOCAL_PATH` | backend | Upload dir in container | yes | `/app/storage/uploads` | same |
| `STORAGE_PUBLIC_BASE_URL` | backend | Prefix written into image URLs | yes | **`/uploads`** (must stay relative) | `/uploads` |
| `MAX_UPLOAD_SIZE_MB` | backend | Upload limit | no | `15` | `15` |
| `S3_*` (6 vars) | backend | Future object storage | no | empty | `<OPTIONAL>` |
| `MAIL_DRIVER` / `MAIL_HOST` / `MAIL_PORT` / `MAIL_SECURE` / `MAIL_USER` / `MAIL_PASSWORD` / `MAIL_FROM_*` | backend | Outgoing mail (Mailpit locally) | yes | `smtp` / `mailhog` / `1025` | `<REDACTED for real SMTP>` |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` / `AUTH_THROTTLE_LIMIT` | backend | Rate limits | no | `60` / `120` / `8` | — |
| `NEXT_PUBLIC_SITE_NAME` / `NEXT_PUBLIC_SITE_URL` | frontend | Branding/canonical | yes | yes | — |
| `NEXT_PUBLIC_API_URL` | frontend | Browser → API | yes | `http://localhost:4000/api` | same |
| `INTERNAL_API_URL` | frontend | SSR → API (in-network) | yes | `http://backend:4000/api` | same |
| `NEXT_PUBLIC_ADS_ENABLED` | frontend | Display ads master switch | no | `false` | `false` |
| `NEXT_PUBLIC_ADSENSE_CLIENT_ID` | frontend | AdSense publisher ID (`ca-pub-…`) | for AdSense | ❌ empty | `<REQUIRED_FROM_USER>` |
| `NEXT_PUBLIC_ADSENSE_TEST_MODE` | frontend | Test ads | no | `true` | `true` |
| `NEXT_PUBLIC_VIDEO_ADS_ENABLED` | frontend | In-video ads switch | for IMA | `false` | `false` |
| `NEXT_PUBLIC_IMA_VAST_TAG_URL` | frontend | VAST/Ad Manager tag | for IMA | ❌ empty | `<REQUIRED_FROM_USER>` |

> Frontend variables are **build args** in `docker-compose.yml`: changing a `NEXT_PUBLIC_*` value requires `docker compose up -d --build frontend`.

---

## 27. Docker Volumes / Persistence

| Volume | Mounted at | Holds | Survives `docker compose down`? |
|---|---|---|---|
| `postgres-data` | `/var/lib/postgresql/data` | Entire database | Yes (lost only with `down -v`) |
| `redis-data` | `/data` | Redis AOF | Yes |
| `uploads-data` | `/app/storage/uploads` | **Uploaded posters/banners/thumbnails/avatars/subtitles + demo media** | Yes |
| bind mount | `./secrets/google-service-account.json` → `/run/secrets/…:ro` | Drive key | Host file |

**Never run `docker compose down -v`** — it destroys the database and all uploads. Do not reset migrations.

---

## 28. Seed Accounts / Development Data

Seeding: `backend/prisma/seed.ts` (+ `seed-data.ts`, `seed-art.ts`), compiled to `dist-seed/seed.js` in the image and run when `RUN_SEED=true`. Outside Docker: `npm run db:seed`.

- **Admin**: email from `ADMIN_EMAIL` (default `admin@anizora.local`), username `admin`, role **SUPER_ADMIN**, password hashed from `ADMIN_PASSWORD`. The seed **upserts**, so re-running keeps the role but does not silently change an existing password unless the create path runs.
  **To set/reset the admin password:** set `ADMIN_PASSWORD` in `.env`, then either delete the user row and re-seed, or (safer) update the hash directly, e.g. inside the backend container:
  `node -e "const b=require('bcrypt');console.log(b.hashSync('NEW_PASSWORD',12))"` → `UPDATE users SET "passwordHash"='<hash>' WHERE email='admin@anizora.local';`
  (The actual development password is intentionally **not** recorded in this file; it is in the owner's `.env` as `ADMIN_PASSWORD`.)
- **Demo users**: `<username>@example.com` with a shared demo password (also not recorded here; see `prisma/seed.ts`, which prints both at the end of a seed run). The **first** demo user created by the seed gets the MODERATOR role (`prisma/seed.ts:198`), the rest are USER — useful for testing role behaviour.
- **Demo catalogue**: 14 original invented titles (e.g. *Crimson Vanguard*, *Starlight Requiem*, *The Last Alchemy Club*, *Neon Sakura Drift*, …), with procedurally generated SVG posters/banners, genres, studios, producers, ranks, mana rules, ad placements, featured entries and view stats.
- **Demo media**: synthetic video generated with ffmpeg, shipped in the image and copied into `uploads-data` on first start; plus one **real Drive-hosted test episode** used for the quality-switching regression (720p/480p/360p SUB variants).

---

## 29. Fixed & Verified Features

| Feature | Status | How it was tested | Files |
|---|---|---|---|
| Drive video playback (proxy + Range) | ✅ VERIFIED | Played a Drive-hosted episode in headless Edge; 206 responses, seek works | `media.controller.ts`, `google-drive.provider.ts` |
| Quality switching 720→480→360→720 with time preserved | ✅ VERIFIED | Scripted browser run before this change batch | `useVideoPlayer.ts`, `SettingsMenu.tsx` |
| Docker stack boots healthy | ✅ VERIFIED | `docker compose ps` → all 5 services healthy (current, stale build) | `docker-compose.yml`, `docker-entrypoint.sh` |
| Migrations run automatically on start | ✅ VERIFIED | `_prisma_migrations` contains the init migration applied by the entrypoint | `docker-entrypoint.sh` |
| Rate-limiting no longer blocks SSR | ✅ VERIFIED | Browsing many pages no longer returns 429 | `app-throttler.guard.ts`, `lib/api.ts` |
| Auth cookie works on http localhost | ✅ VERIFIED | Login persists across reloads | `auth.controller.ts` |
| Backend unit tests | ✅ VERIFIED | `npx jest` → 6 suites / 71 tests pass (2026-09-20) | `src/**/*.spec.ts` |
| Frontend unit tests | ✅ VERIFIED | `npx vitest run` → 5 files / 53 tests pass (2026-09-20) | `src/**/*.test.ts(x)` |
| Type safety (both apps) | ✅ VERIFIED | `tsc --noEmit` clean in both | — |
| Frontend lint runs at all | ✅ VERIFIED | `npx eslint .` → 0 errors (config added today) | `eslint.config.mjs` |
| Google-login linking rules | ✅ LOGIC VERIFIED (unit) | 8 jest cases: returning user, verified linking, unverified refusal, different-Google refusal, USER-only creation, role never changed, banned blocked | `auth.service.google.spec.ts` |
| Post-login redirect rules | ✅ LOGIC VERIFIED (unit) | 6 vitest cases incl. "USER never enters /admin" | `auth-redirect.test.ts` |
| Resume decision rule | ✅ LOGIC VERIFIED (unit) | 5 vitest cases (<10 s, ≥90 %, rewatch, duration fallback) | `resumeOffer.test.ts` |

**Additionally verified in-browser on the deployed stack (2026-09-20):**

| Feature | Evidence |
|---|---|
| Quality switching after the change batch | 720→480→360→720, timestamp drift 0.54–0.95 s, playback continues |
| Continue Watching | Card shows correct anime/episode, `aria-valuenow=47` for 42 s of 90 s, most-recent first |
| Resume / Start Over | Prompt reads "Resume watching from 0:42?"; Resume seeks to 42.0 s; Start Over restarts at 0 and clears the saved position |
| Subtitle default + styling | Default background `rgba(0,0,0,0)` with outline; size 30.4→47.1 px, colour, background, opacity 0.3, edge, position (18% vs 2%) all apply and persist across reload and quality switch |
| Separate audio tracks | Audio file swaps, **video src unchanged**, timestamp kept, drift ~49 ms, survives quality switch, volume drives the audio element |
| Admin logout | Navbar flips to Sign in, refresh cookie cleared, `/admin` bounces to login, refresh does not restore |
| Admin login redirect | Lands on `/admin` automatically; USER never routed there |
| Poster/banner upload | Uploads, previews, saves, renders on the public page; undersized image rejected with a clear message |
| Docker persistence | After `down` + `up` (no `-v`): images still served (200, exact byte counts), DB and audio tracks intact |
| Per-user isolation | A second account does not see another user's progress; anonymous gets 401 |

Everything else below is **not** verified.

---

## 30. Current Bugs / Open Issues

### RESOLVED-1 — Containers rebuilt and deployed (was a blocker)
`docker compose up -d --build` completed; all five services healthy.

### RESOLVED-2 — Migration applied (was a blocker)
`_prisma_migrations` now lists both migrations. `audio_tracks` carries
`episodeId`, `provider`, `url`, `isActive`, `sortOrder`; image URLs were
rewritten to site-relative `/uploads/...`.

### RESOLVED-3 — Demo audio exists
Two synthetic 90-second MP3 tones (440 Hz "Japanese (Original)", 660 Hz
"English Dub") live at `demo/audio-ja.mp3` and `demo/audio-en.mp3` in the
uploads volume and are attached to *The Last Alchemy Club* episode 1 as
`DIRECT_FILE` tracks. They are test tones, not real dubs — remove them from the
admin episode form when real audio is added. The Drive Sintel episode was left
untouched as the quality-switch baseline.

### OPEN-4 — Google OAuth cannot be enabled (**blocked on the owner**)
*Symptoms:* `/auth/providers` returns `{ google: false }`; the button is hidden; `/api/auth/google` returns 404 by design.
*Needs:* `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` from the owner's **own** Google Cloud project, `GOOGLE_OAUTH_ENABLED=true`, `GOOGLE_OAUTH_CALLBACK_URL=http://localhost:4000/api/auth/google/callback`; in Google Cloud Console → Credentials → OAuth client (Web): **Authorized JavaScript origin** `http://localhost:3000`, **Authorized redirect URI** `http://localhost:4000/api/auth/google/callback`.
*Status:* **NOT COMPLETE** — never executed against Google.

### RESOLVED-5 — The 8-issue batch is now browser-tested
107/107 automated browser and API checks pass on the deployed stack. See §29.

### OPEN-6 — Ads paths untested
No AdSense publisher ID and no VAST tag, so neither display nor in-video ads have ever rendered a real ad. IMA error handling is untested.

### OPEN-7 — Pre-existing lint warning
`frontend/src/components/player/useImaAds.ts:173` — unused `kind` parameter. Harmless.

### OPEN-8b — One anime record points at hotlinked third-party images
`crimson-vanguard` has `posterUrl`/`bannerUrl` pointing at `i.pinimg.com` and
`encrypted-tbn0.gstatic.com`. They now *render* (see the `SmartImage` fallback),
but hotlinking someone else's image host is fragile (those hosts block it at
will) and is a licensing risk. The owner's data was left unchanged — recommend
replacing them with uploaded artwork in the admin.

### OPEN-8 — Project is not under version control
No git history, so there is no way to diff or roll back the current changes. See §37.

### OPEN-9 — Minor: `throttle()` helper in `frontend/src/lib/utils.ts`
Its trailing call fires with the arguments captured when the timer was set, not the latest. `WatchClient` no longer uses it (it uses an explicit `lastSavedAt` stamp), but other callers may still be affected.

---

## 31. Incomplete Features

| Feature | State |
|---|---|
| Separate audio tracks (end-to-end) | Code complete; migration pending; no demo data; **untested** |
| Google login/signup | Backend + frontend complete; **needs credentials**; untested |
| S3 / R2 storage driver | Env vars exist, `StorageService` has **local only** |
| HLS sources | Player supports hls.js and admin accepts an `.m3u8`; **no HLS content has been tested** |
| In-video ads | Implemented, never run against a real VAST tag |
| AdSense display ads | Implemented, disabled, no publisher ID |
| Email delivery to real users | Works against Mailpit only; real SMTP untested |
| Community moderation screens | Reports exist; no dedicated comment/post moderation UI |
| Mobile/responsive polish for the new rail & resume modal | Written responsively, never viewed |
| E2E/Playwright suite | Ad-hoc scripts lived in the session scratchpad; **not committed to the repo** |

---

## 32. Latest User Requirements — status of the 8 reported issues

The owner reported 8 issues; each was implemented in the working tree but **not deployed or browser-tested**. Honest status:

| # | Issue | Status | Evidence |
|---|---|---|---|
| 1 | Netflix-style **Continue Watching** on the homepage | ✅ **COMPLETE (verified)** | Rail appears for signed-in viewers only; correct anime/episode/percentage/remaining time; sorted most-recent-first; finished episode rolls to "Up next"; finished series disappears |
| 2 | **Resume / Start Over** prompt | ✅ **COMPLETE (verified)** | "Resume watching from 0:42?" → Resume seeks to 42.0 s; Start Over restarts at 0 and clears the saved position; survives reload, quality/audio/subtitle switches and logout |
| 3 | **Subtitle** default background none + full styling | ✅ **COMPLETE (verified)** | Default `rgba(0,0,0,0)` + outline; size/colour/background/opacity/edge/position all work, persist across reload, and survive a quality switch; cues never cover the controls |
| 4 | Admin **Audio Tracks** + seamless audio switching | ✅ **COMPLETE (verified)** | Admin form round-trips tracks; switching swaps only the audio file (video src unchanged), keeps time/quality/subtitle/play state/volume; drift ~49 ms |
| 5 | **Logout** broken | ✅ **COMPLETE (verified)** | Refresh token revoked, cookie cleared, state + query cache cleared, navbar flips instantly, `/admin` blocked, refresh does not restore |
| 6 | **Admin login redirects to `/admin`** | ✅ **COMPLETE (verified)** | Role-based (`postLoginPath`), lands on `/admin`; USER goes home and can never enter `/admin` |
| 7 | **Continue with Google** | ⚠️ **NOT COMPLETE — blocked on credentials** | Fully implemented (CSRF state cookie, safe linking, USER-only creation) and unit-tested, plus `docs/GOOGLE_LOGIN.md`. Never executed against Google: no client ID/secret |
| 8 | **Poster/banner upload + display** | ✅ **COMPLETE (verified)** | Upload → preview → save → renders on card/detail; validation rejects bad images; survives container recreation |

Seven of eight are complete and verified. Issue 7 is the only one outstanding, and it cannot be finished without the owner's Google OAuth credentials.

---

## 33. Required External Credentials

Ask the owner for these; never substitute anyone else's account:

1. **Google OAuth client** (for "Continue with Google") — client ID + client secret from **their own** Google Cloud project, configured with origin `http://localhost:3000` and redirect URI `http://localhost:4000/api/auth/google/callback`.
2. **Google AdSense publisher ID** (`ca-pub-…`) + slot IDs, if display ads should run.
3. **VAST / Google Ad Manager tag URL**, if in-video ads should run (AdSense alone is not enough).
4. **Client's Google Drive** (later): a folder shared with the site's service account, plus a replacement service-account key if the account changes.
5. **Real SMTP credentials** (host/user/password/from) for production email.
6. **Production domain + TLS** details when deploying beyond localhost (affects `SITE_URL`, `CORS_ORIGINS`, `BACKEND_PUBLIC_URL`, cookie flags, OAuth redirect URIs).

Privacy rule carried over from the original brief: **only use credentials the owner explicitly provides for this project**; never reuse a third party's accounts, files, Drive links or keys; never commit secrets; `.env.example` holds placeholders only.

---

## 34. Next Development Steps (ordered)

**NEXT 1 — Deploy the current code and apply the pending migration**
Files: `backend/prisma/migrations/20260919000000_audio_tracks_and_relative_media_urls/migration.sql`, `docker-compose.yml`.
Commands: read the migration first, then `docker compose up -d --build backend frontend`, then `docker compose logs backend --tail=80` and confirm "Migrations applied".
Acceptance: `docker compose exec postgres psql -U anizora -d anizora -c "select migration_name from _prisma_migrations;"` lists **both** migrations; `\d audio_tracks` shows `episodeId`, `provider`, `url`, `isActive`, `sortOrder`; the site still loads at :3000.

**NEXT 2 — Regression-test Drive playback + quality switching (protect the crown jewels)**
Open the Drive-backed demo episode, play, switch 720 → 480 → 360 → 720, confirm the timestamp is preserved and playback continues, and confirm subtitles survive the switches.
If broken, suspect the new `onTimeUpdate` guard or the volume/mute effect in `useVideoPlayer.ts`.

**NEXT 3 — Verify images (issue 8)**
Homepage/anime cards render posters; admin upload of a poster and a banner shows a preview, saves, and displays; `docker compose restart backend frontend` → images still load (volume persistence); check that old absolute URLs were rewritten by the migration.

**NEXT 4 — Verify auth (issues 5 & 6)**
Admin login → lands on `/admin` automatically; logout from the account menu → navbar shows Sign in/Sign up, `/admin` redirects to login, a page refresh does **not** restore the session; normal user login → homepage or `returnTo`.

**NEXT 5 — Verify progress, Continue Watching and Resume (issues 1 & 2)**
Watch ~40 s, navigate away, return → "Resume watching from MM:SS?"; Resume seeks correctly; Start Over begins at 0 and clears the saved position; the homepage rail shows the title with the right percentage and remaining time; finishing an episode replaces the card with "Up next".

**NEXT 6 — Verify subtitle styling (issue 3)**
Default cues have **no** background box; change size/colour/opacity/edge/position and confirm each applies live and persists across reload and quality switches; cues never overlap the control bar.

**NEXT 7 — Build demo audio and verify audio switching (issue 4)**
Generate two audio files, attach them in the admin Audio Tracks card, then in the player switch audio mid-playback and confirm: video does **not** reload, timestamp/quality/subtitle/play state/volume all persist, and audio stays in sync for at least a minute.

**NEXT 8 — Google login (issue 7)**
Ask the owner for credentials, set the env vars, rebuild the backend, then test: first login creates a USER, second login reuses it, an existing password account with the same verified email links without duplicating, and no Google user ever gets an admin role.

**NEXT 9 — Commit the project to git** (see §37) so future work is diffable.

**NEXT 10 — Optional hardening**: remove the stale `.dev-db/` folder, add a committed Playwright suite, implement the S3 driver, test an HLS source, and wire real ad credentials.

---

## 35. Regression Test Checklist

Infrastructure
- [ ] `docker compose up -d --build` completes; `docker compose ps` shows 5 healthy services
- [ ] Backend health `http://localhost:4000/api/health` OK; frontend `http://localhost:3000/api/healthz` OK
- [ ] Both migrations present in `_prisma_migrations`
- [ ] Swagger loads at `/api/docs`
- [ ] Mailpit UI at :8025 receives a password-reset mail

Catalogue & browsing
- [ ] Homepage renders hero + all rails, no broken images
- [ ] Search returns results; `/browse` filters (genre, type, status, year, season, rating, sort) work with pagination
- [ ] `/az`, `/genres/[slug]`, `/random`, anime detail, episode list all work

Auth
- [ ] Register → verification mail; login; refresh survives reload
- [ ] Admin login redirects to `/admin`
- [ ] Normal user login goes home / to `returnTo`
- [ ] Logout clears navbar instantly, blocks `/admin`, and does not restore after refresh
- [ ] (After credentials) Google sign-in creates a USER; returning login reuses it; email linking is safe

Player
- [ ] Drive episode plays; seek bar works
- [ ] **720 → 480 → 360 → 720 preserves the timestamp** and play state
- [ ] Subtitles load and survive quality switches
- [ ] Subtitle default has no background box
- [ ] Subtitle styling (size, colour, background + opacity, outline/shadow, position) applies and persists
- [ ] Separate audio tracks appear and switching preserves time/quality/subtitle/volume without a video reload
- [ ] Skip intro / skip outro buttons appear in range and jump correctly
- [ ] Next-episode overlay + autoplay-next
- [ ] Volume, mute, speed, PiP, fullscreen, theatre, lights-off, keyboard shortcuts

Progress
- [ ] Progress saves roughly every 15 s and on pause/tab-hide/navigation/end
- [ ] Resume prompt appears with the right time; Resume seeks; Start Over restarts and resets the DB row
- [ ] Continue Watching row shows the right anime/episode/percentage/remaining, sorted by most recent
- [ ] Completed episode → card becomes "Up next"; finished series disappears
- [ ] `/profile/history` lists, removes one, clears all

Admin
- [ ] Create + edit an anime (all fields), publish, see it on the site
- [ ] Create + edit an episode with Drive variants, subtitles, audio tracks, intro/outro markers, downloads
- [ ] Poster upload, banner upload, thumbnail upload — preview, save, replace
- [ ] Rejected uploads show a clear message (wrong shape, too large, wrong type)
- [ ] Users, taxonomy, featured, reports, requests, contact, settings, gamification screens load and save

Persistence
- [ ] `docker compose restart` → uploads still served, data intact
- [ ] `docker compose down && docker compose up -d` (no `-v`) → data intact

---

## 36. Useful Commands

```bash
# --- Docker (from E:/tofayel_project) ---
docker compose up -d --build              # build + start
docker compose up -d --build backend frontend
docker compose ps
docker compose logs backend --tail=100 -f
docker compose logs frontend --tail=100
docker compose restart backend
docker compose down                       # stop (KEEPS volumes)
# docker compose down -v                  # NEVER: destroys DB + uploads

# --- Database ---
docker compose exec postgres psql -U anizora -d anizora
docker compose exec postgres psql -U anizora -d anizora -c "select migration_name, finished_at from _prisma_migrations;"
docker compose exec backend npx prisma migrate deploy      # apply pending migrations
docker compose exec backend node dist-seed/seed.js         # re-run the seed inside the container
# DBeaver: host localhost, port 55432, db anizora, user anizora

# --- Backend (host, for checks only) ---
cd backend
npm run typecheck        # tsc --noEmit
npm test                 # jest  (6 suites / 71 tests)
npm run lint
npx prisma generate      # after editing schema.prisma
npx prisma migrate dev --name <name>   # create a new migration (dev DB only)

# --- Frontend (host, for checks only) ---
cd frontend
npm run typecheck
npm test                 # vitest run (5 files / 53 tests)
npm run lint             # eslint . (needs eslint.config.mjs)
npm run build            # production build check
```

---

## 37. Git State

**`E:\tofayel_project` is NOT a git repository** — `git status` reports *fatal: not a git repository*. There is no branch, no history, no way to diff or revert. A `.gitignore` and `.gitattributes` exist (prepared for a future repo) and already exclude `.env`, `secrets/`, `*-service-account*.json`, `node_modules/`, build output.

Recommended first commit (only after confirming nothing secret is staged):

```bash
cd E:/tofayel_project
git init
git status --short          # verify .env and secrets/ are NOT listed
git add .
git commit -m "AniZora: initial import of the working tree"
```

Do **not** discard or reset any files — the current working tree is the only copy of the 8-issue fix batch.

---

## 38. Known Risks / Technical Debt

1. **No version control** — highest risk; a bad edit is unrecoverable.
2. **Untested batch of changes** across player, auth and uploads — regressions are plausible, especially around volume/mute state and the swap-guarded `onTimeUpdate`.
3. **External audio sync is heuristic** — drift correction thresholds (0.3 s / 0.06 s / ±3 %) were chosen analytically, never measured; long files or slow Drive responses may need tuning.
4. **Google Drive is not a CDN** — quotas will bite under real traffic; plan the move to object storage + HLS.
5. **Uploads live on one Docker volume** on one host; no backup strategy is defined.
6. **`npm install` instead of `npm ci`** in Docker builds → non-reproducible dependency trees.
7. **Seed upsert semantics** mean `RUN_SEED=true` on a populated database can rewrite demo rows; keep it off outside first-run.
8. **The `.dev-db/` folder and `Drive link.txt`** are leftovers; `Drive link.txt` contains the owner's personal Drive links and should not be committed.
9. **Frontend `NEXT_PUBLIC_*` values are baked at build time** — changing them requires a frontend rebuild, which is easy to forget.
10. **No automated E2E tests in the repo** — all browser testing so far was ad-hoc scripting in a temp directory that no longer belongs to the project.

---

## 39. New Claude Instructions

You are **continuing an existing project**, not starting one. Before changing anything:

1. Read this entire handoff.
2. Inspect the actual files (`backend/src`, `frontend/src`, `prisma/schema.prisma`, `docker-compose.yml`) — trust the code over this document where they disagree, and then fix this document.
3. Compare the code state with §32 so you know what is already implemented.
4. Run Docker (`docker compose up -d --build`) and confirm all services are healthy.
5. Run the existing tests (`backend: npm test`, `frontend: npm test`) and both typechecks.
6. Check git status (there is no repo yet — see §37).
7. **Do not rebuild features that already work.** Especially do not "simplify" the player.
8. **Preserve Google Drive playback and quality switching.** They are verified working; re-test them after every player change.
9. **Never delete database data or reset migrations.** Never run `docker compose down -v`. New schema changes get a new forward migration.
10. Ask the owner only for genuinely missing credentials/assets (see §33), and only use credentials they provide for **this** project.
11. Never use anyone else's Google account, Drive files, keys or tokens; never commit secrets; keep `.env.example` placeholders only.
12. Continue from §34 in order.
13. Update this handoff whenever a major architectural decision changes, a blocker is cleared, or a status in §29/§30/§32 changes.
14. Do not create fake UI controls, and do not report anything as fixed until you have actually observed it working.
15. Watch2Gether must never be added.

---

## 40. Final Continuation Point

### IF YOU ARE THE NEW CLAUDE, START HERE

**Current state:** the 8-issue batch is deployed and acceptance-tested — 107/107
browser and API checks pass, plus 71 backend and 53 frontend unit tests. The
stack is running (`docker compose ps` → five healthy services) with both
migrations applied.

**The only outstanding item is Issue 7, Google login.** It is fully implemented
but has never run against Google because it needs credentials from the owner.
Follow `docs/GOOGLE_LOGIN.md`: ask for `GOOGLE_OAUTH_CLIENT_ID` and
`GOOGLE_OAUTH_CLIENT_SECRET`, set `GOOGLE_OAUTH_ENABLED=true` in `.env`, run
`docker compose up -d backend`, confirm `curl http://localhost:4000/api/auth/providers`
returns `{"google":true}`, then test: new Google account creates a `USER`, a
second sign-in reuses it, and an existing verified email links without
duplicating.

**Before changing anything else**, re-run the regression suite (§35), above all
the Drive quality switch 720→480→360→720 with the timestamp preserved, and the
separate-audio switch. Those two are the features most easily broken.

**Watch out for:** the external-audio sync in
`frontend/src/components/player/useExternalAudio.ts` is deliberately defensive
(debounced holds, idempotent handlers, a hold cap). An earlier version without
those rules oscillated ~3,100 media events in 6 seconds. Do not simplify it
without re-running `t5-audio`.

**Start command:** `docker compose up -d --build`
**URLs:** http://localhost:3000 · /admin · http://localhost:4000/api/docs · http://localhost:8025

**Do not break:** Drive playback, quality switching with timestamp preservation,
separate audio switching, subtitle styling, admin CRUD, search/filters, Docker
volume persistence.
