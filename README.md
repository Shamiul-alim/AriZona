# AniZora

An anime streaming platform: Next.js frontend, NestJS API, PostgreSQL, and a
provider-independent media layer that streams from Google Drive today and from
object storage or HLS tomorrow without rewriting the application.

> **Branding.** "AniZora" is an original placeholder identity created for this
> project. Change `SITE_NAME` / `NEXT_PUBLIC_SITE_NAME` in `.env` and the name
> updates everywhere — logo wordmark, page titles, emails and metadata.

---

## Contents

- [What is here](#what-is-here)
- [Architecture at a glance](#architecture-at-a-glance)
- [Requirements](#requirements)
- [Quick start with Docker](#quick-start-with-docker)
- [Quick start without Docker](#quick-start-without-docker)
- [Project structure](#project-structure)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Admin access](#admin-access)
- [Media setup](#media-setup)
- [Advertising setup](#advertising-setup)
- [Email setup](#email-setup)
- [Testing](#testing)
- [Deployment](#deployment)
- [Backups](#backups)
- [Troubleshooting](#troubleshooting)
- [Production checklist](#production-checklist)
- [Known limitations](#known-limitations)

---

## What is here

**Viewing**
- Home page with an animated hero slider, latest episodes (All / Sub / Dub /
  Trending / Random), trending, new releases, newly added, upcoming, just
  completed, top anime by day/week/month, most viewed, and an A-Z index
- Catalogue browsing with server-side pagination and filters for genre, type,
  status, season, year, language, age rating, source and episode count — all
  reflected in the URL so any view is shareable
- Search across English, Japanese and alternative titles
- Anime detail pages with full metadata, episode lists, relations,
  recommendations, ratings and comments
- Watch pages with a purpose-built player (see below)

**The player**
- Real quality switching, real audio switching, real seeking — see
  [docs/PLAYER.md](docs/PLAYER.md) for exactly how, and what the limits are
- Configurable subtitles: language, size, colour, background, position, edge
- SUB/DUB and server selection, playback speed, PiP, fullscreen, theatre mode,
  lights-off, keyboard shortcuts
- Skip intro / skip outro, shown only when markers are configured
- Resume playback, autoplay next, next-episode overlay
- Pre-, mid- and post-roll advertising through the Google IMA SDK

**Accounts and community**
- Register / sign in / password reset / email confirmation, optional Google OAuth
- Watchlist (5 states), favourites, ratings, watch history, continue watching
- Comments with replies, votes and spoiler tagging
- Community board: discussions, polls, matchups, tier lists and recommendations
- Mana points, configurable ranks, leaderboards
- Anime requests and a support inbox

**Operations**
- Full admin dashboard: catalogue, episodes and media, users, moderation
  queues, advertising, gamification, site settings and an audit log
- Everything is managed by hand — no paid anime metadata API is required or used

**Deliberately absent:** Watch2Gether. It appears nowhere in the schema, API,
frontend, admin or documentation.

---

## Architecture at a glance

```
                        ┌──────────────────────────┐
  Browser ──────────────▶  Next.js 15 (App Router) │
                        │  SSR + RSC + static       │
                        └───────────┬──────────────┘
                                    │  REST (JSON)
                        ┌───────────▼──────────────┐
                        │  NestJS 11 API            │
                        │  ├ auth (JWT + rotation)  │
                        │  ├ catalogue / episodes   │
                        │  ├ media proxy  ◀─────────┼── Range requests
                        │  ├ community / comments   │
                        │  ├ analytics / mana       │
                        │  └ admin                  │
                        └──┬────────────────┬───────┘
                           │                │
                  ┌────────▼─────┐   ┌──────▼──────────────┐
                  │ PostgreSQL 16│   │ MediaProvider layer │
                  │ (Prisma)     │   │ ├ GOOGLE_DRIVE      │
                  └──────────────┘   │ ├ DIRECT_FILE       │
                                     │ ├ OBJECT_STORAGE    │
                                     │ ├ HLS               │
                                     │ └ EXTERNAL_EMBED    │
                                     └─────────────────────┘
```

The media layer is the part worth understanding before anything else — read
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/PLAYER.md](docs/PLAYER.md).

---

## Requirements

| Tool | Version | Needed for |
|---|---|---|
| Docker + Compose | 24+ / v2+ | The containerised path |
| Node.js | 22 LTS | Running without Docker |
| PostgreSQL | 16+ | Running without Docker |
| ffmpeg | any recent | Only to regenerate the demo media |

---

## Quick start with Docker

```bash
cp .env.example .env
```

Generate three secrets and paste them into `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Set `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `MEDIA_SIGNING_SECRET` to three
**different** values, then:

```bash
docker compose up --build
```

Migrations run automatically on container start. To load the demo catalogue as
well, start once with seeding enabled:

```bash
RUN_SEED=true docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API | http://localhost:4000/api |
| API docs (Swagger) | http://localhost:4000/api/docs |
| Mail catcher | http://localhost:8025 |

Optional reverse proxy on port 8080, putting both behind one origin:

```bash
docker compose --profile proxy up -d
```

---

## Quick start without Docker

**1. Database.** Point `DATABASE_URL` at any PostgreSQL 16 instance. On Windows,
`scripts/setup-dev-db.ps1` will download PostgreSQL and run a throwaway instance
inside `.dev-db/` on port 55432, touching nothing else on the machine:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-dev-db.ps1
```

**2. Backend.**

```bash
cd backend
cp .env.example .env          # set DATABASE_URL and the three secrets
npm install
npx prisma generate
npm run db:deploy             # apply migrations
npm run db:seed               # optional demo catalogue
npm run start:dev             # http://localhost:4000
```

**3. Frontend.**

```bash
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

**4. Demo media (optional).** The seed references six short video files that are
generated locally — a test pattern plus a sine tone, entirely synthetic:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-demo-media.ps1
```

They exist so quality switching, audio switching, seeking and the skip markers
are genuinely verifiable before you have real content.

---

## Project structure

```
.
├── backend/                  NestJS API
│   ├── prisma/
│   │   ├── schema.prisma     40+ models — the source of truth
│   │   ├── migrations/
│   │   ├── seed.ts           Demo catalogue
│   │   ├── seed-data.ts      Original invented titles and content
│   │   └── seed-art.ts       Procedural placeholder artwork
│   ├── src/
│   │   ├── common/           Guards, filters, DTOs, utilities
│   │   ├── config/           Typed, validated environment
│   │   ├── prisma/
│   │   └── modules/
│   │       ├── auth/         JWT + rotating refresh tokens
│   │       ├── media/        Provider abstraction + streaming proxy
│   │       ├── anime/ episodes/ watch/ watchlist/ ratings/
│   │       ├── comments/ community/ reports/
│   │       ├── mana/ leaderboard/ requests/ contact/
│   │       ├── ads/ analytics/ settings/ storage/
│   │       └── admin/
│   ├── storage/uploads/      Posters, banners, thumbnails, subtitles
│   └── Dockerfile
│
├── frontend/                 Next.js App Router
│   ├── src/app/              Routes
│   ├── src/components/
│   │   ├── player/           The video player
│   │   ├── anime/ community/ admin/ auth/ ads/
│   │   └── layout/ ui/
│   ├── src/lib/              API client, auth store, types, utils
│   └── Dockerfile
│
├── docs/                     Detailed documentation
├── nginx/                    Optional reverse proxy
├── scripts/                  Dev database + demo media generation
├── docker-compose.yml
└── .env.example
```

---

## Environment variables

`.env.example` documents every variable inline. The ones that matter most:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Token signing. **Generate your own.** |
| `MEDIA_SIGNING_SECRET` | Signs playback URLs. **Generate your own.** |
| `SITE_NAME` / `NEXT_PUBLIC_SITE_NAME` | Branding, used everywhere |
| `NEXT_PUBLIC_API_URL` | Browser → API |
| `INTERNAL_API_URL` | SSR container → API (Docker service name) |
| `GOOGLE_DRIVE_*` | Drive credentials — see [docs/GOOGLE_DRIVE.md](docs/GOOGLE_DRIVE.md) |
| `NEXT_PUBLIC_ADSENSE_CLIENT_ID` | AdSense publisher ID |
| `MAIL_*` | SMTP; `MAIL_DRIVER=log` prints emails instead of sending |

> `NEXT_PUBLIC_*` values are compiled into the browser bundle at **build** time.
> In Docker they are build args, not runtime variables — changing one means
> rebuilding the frontend image.

---

## Database

```bash
cd backend
npm run db:migrate      # create a migration during development
npm run db:deploy       # apply pending migrations (used in production)
npm run db:seed         # load demo content (idempotent)
npm run db:reset        # DROP EVERYTHING and rebuild — development only
npm run db:studio       # browse the data
```

Schema documentation: [docs/DATABASE.md](docs/DATABASE.md).

---

## Admin access

The seed creates a super-admin from your `.env`:

| Setting | Default |
|---|---|
| `ADMIN_EMAIL` | `admin@anizora.local` |
| `ADMIN_PASSWORD` | `ChangeMe123!` |

Sign in at `/auth/login`, then open `/admin`. **Change the password before
exposing the site to anyone.**

Demo accounts (only created by the seed) use `<username>@example.com` with the
password `Password123` — `hikari`, `tatsuya`, `nozomi`, `kenji`, `ayame`, `rei_t`.

Roles: `USER` → `MODERATOR` → `ADMIN` → `SUPER_ADMIN`. You can never grant a role
at or above your own, and never modify your own account's role or status.

---

## Media setup

Full detail in [docs/GOOGLE_DRIVE.md](docs/GOOGLE_DRIVE.md). The short version:

1. Create a Google Cloud project and enable the **Google Drive API**.
2. Create a **service account** and download its JSON key.
3. Share your video files (or the folder containing them) with the service
   account's email address as **Viewer**.
4. Mount the key into the backend container and set:
   ```
   GOOGLE_DRIVE_ENABLED=true
   GOOGLE_DRIVE_AUTH_MODE=service_account
   GOOGLE_SERVICE_ACCOUNT_FILE=/run/secrets/google-service-account.json
   ```
5. In **Admin → Episodes**, add a media source per audio flavour and one file
   per quality.

Two facts that shape everything else, explained properly in
[docs/PLAYER.md](docs/PLAYER.md):

- A progressive MP4 carries **one** audio track, so SUB and DUB are separate
  files, modelled as separate media sources.
- There is no adaptive bitrate in a plain MP4, so **each quality is its own
  file**. Switching quality swaps the file and restores your position.

---

## Advertising setup

[docs/ADS.md](docs/ADS.md) covers this in full. Two things to know up front:

- **Display ads** need an AdSense publisher ID and per-slot IDs, entered in
  **Admin → Advertising**. Nothing renders until they are set.
- **In-stream video ads** (pre/mid/post-roll) require **Google Ad Manager** with
  a video ad unit and the corresponding publisher eligibility. A standard
  AdSense display account does not grant in-stream video inventory. The IMA
  integration is built and working; it needs a VAST tag you supply.

---

## Email setup

`MAIL_DRIVER=log` (the default in development) prints emails to the application
log, so the password-reset flow can be exercised end to end without an SMTP
account. In Docker, MailPit catches mail at http://localhost:8025.

For production set `MAIL_DRIVER=smtp` and fill in `MAIL_HOST`, `MAIL_PORT`,
`MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`.

---

## Testing

```bash
cd backend  && npm test        # 63 unit tests
cd frontend && npm test        # 38 unit + component tests
```

Type checking and linting:

```bash
cd backend  && npm run typecheck && npm run lint
cd frontend && npm run typecheck && npm run lint
```

Coverage focuses on the parts where a silent bug would be worst: HTTP Range
parsing, playback URL signing, Drive ID extraction, SRT→VTT conversion, the
role hierarchy, input sanitisation, and the Mana daily caps and idempotency.

---

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Summary:

```bash
cp .env.example .env     # set real secrets, real domain, NODE_ENV=production
docker compose up --build -d
docker compose --profile proxy up -d    # optional nginx
```

---

## Backups

```bash
# Database
docker compose exec -T postgres pg_dump -U anizora anizora | gzip > backup.sql.gz

# Restore
gunzip -c backup.sql.gz | docker compose exec -T postgres psql -U anizora anizora

# Uploaded images and subtitles
docker run --rm -v anizora_uploads-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads.tar.gz -C /data .
```

---

## Troubleshooting

**The frontend builds but every page is empty.** The API was unreachable at build
time. Rails and pages fall back to empty rather than failing the build — start
the backend and rebuild.

**`Environment variable not found: DATABASE_URL`.** Prisma reads
`backend/.env`. Copy `backend/.env.example` to `backend/.env`.

**Playback returns 404 from Drive.** The file is not shared with the configured
service account, or the ID is wrong. Check **Admin → Dashboard → Media
providers** first — it shows whether Drive is configured at all.

**Playback returns 403 on the stream URL.** The signed link expired. Reload the
page; links are re-signed on every request. `MEDIA_SIGNED_URL_TTL` controls the
lifetime.

**Ads never appear.** Expected until you enter your own IDs. In development a
labelled placeholder is shown instead; in production the slot renders nothing.

**Seeking does not work.** Check the source's provider. `EXTERNAL_EMBED` cannot
be controlled by our code, and the player deliberately hides its controls rather
than showing ones that would not work.

---

## Production checklist

- [ ] `NODE_ENV=production`
- [ ] All three secrets regenerated, each different
- [ ] `ADMIN_PASSWORD` changed, and changed again after first sign-in
- [ ] `POSTGRES_PASSWORD` changed
- [ ] `SITE_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL`, `CORS_ORIGINS`
      all pointing at the real domain
- [ ] TLS terminated (nginx block in `nginx/conf.d/anizora.conf`)
- [ ] `SWAGGER_ENABLED=false`
- [ ] Real SMTP configured
- [ ] Drive credentials mounted read-only and outside version control
- [ ] Production VAST tag set — **never** the sample tag
- [ ] Database backups scheduled
- [ ] Demo content removed or replaced

---

## Known limitations

These are stated plainly rather than papered over:

1. **Google Drive is not a CDN.** It enforces per-file and per-project download
   quotas. It is fine for launch and low traffic; plan to migrate to object
   storage plus a CDN as you grow. The `MediaProvider` abstraction exists
   precisely so that migration is a data change, not a rewrite.
2. **Progressive files cannot adapt.** Quality switching is a file swap with
   position restore, not adaptive bitrate. Configure an HLS source for true ABR.
3. **Audio switching reloads.** One audio track per MP4 means switching audio
   switches file. HLS sources switch seamlessly.
4. **In-stream video ads need Google Ad Manager**, not just AdSense.
5. **Search uses substring matching.** Good to a few thousand titles; beyond
   that, move to PostgreSQL full-text search or a dedicated index.
6. **View counting is deduplicated, not fraud-proof.** A pseudonymous
   fingerprint limits one view per title per 30 minutes. A determined attacker
   with many addresses could still inflate counts.
7. **Docker images have not been built on the development machine** used to
   author this project, because it lacks WSL2/Hyper-V. The Dockerfiles and
   compose stack are written and reviewed but should be verified on your host
   with `docker compose up --build`.

---

## Licence and content

This software is delivered to the project owner. **You are responsible for
holding the rights to any content you stream through it.** The demo catalogue
ships with entirely original placeholder material — invented titles, synopses
written for this project, procedurally generated abstract artwork, and synthetic
video generated by ffmpeg. No third-party content is bundled.
