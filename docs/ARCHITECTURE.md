# Architecture

Why the system is shaped the way it is, and where the seams are.

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Next.js 15, App Router, React 19 | Server components keep catalogue pages fast and crawlable; the watch page is a client island where it needs to be |
| Styling | Tailwind CSS v4 | Design tokens live in one `@theme` block, so rebranding is a single file |
| State | Zustand + TanStack Query | Zustand for session; Query for server data. No global store for things that are really cache |
| API | NestJS 11 | Modules, DI and guards map cleanly onto a system with this many bounded features |
| ORM | Prisma 6 | Type-safe queries, a readable schema file, and a migration story that is safe to run unattended |
| Database | PostgreSQL 16 | Relational data with real constraints; JSON columns where genuinely appropriate |
| Video | Custom player over `<video>` + hls.js | See [PLAYER.md](PLAYER.md) |

### Why Prisma

The brief asked for a justification if something other than Prisma was chosen.
Prisma was chosen. Its schema file doubles as readable documentation of a
40-table domain, the generated client makes the query layer type-safe end to
end, and `migrate deploy` only ever plays forward already-reviewed migrations —
which is what makes it safe to run automatically on container start.

---

## Request paths

### A catalogue page

```
Browser → Next.js server component
              │  fetch (server-side, internal network)
              ▼
          NestJS → Prisma → PostgreSQL
              │
              ▼
          HTML streamed to the browser
```

Rendered on the server, so it is indexable and fast on a cold load. The
homepage revalidates on a 120-second window.

### A watch page

```
Browser → Next.js (SSR shell + metadata + JSON-LD)
              │
              ▼
          WatchClient (client component)
              │  signed playback URLs, already in the payload
              ▼
          <video src="/api/media/stream/{id}?exp=…&sig=…">
              │  Range: bytes=…
              ▼
          NestJS media proxy → provider → Drive / storage / origin
```

The shell renders on the server for SEO; playback is entirely client-side
because it has to be.

---

## Module map

```
backend/src/modules/
├── auth/          JWT access + rotating refresh tokens, Google OAuth
├── users/         Profiles, public profiles, preferences
├── anime/         Catalogue, filtering, trending, recommendations
├── episodes/      Episode lists and the watch payload
├── media/         Provider abstraction + streaming proxy   ← the interesting one
├── taxonomy/      Genres, studios, producers
├── watch/         Progress and history
├── watchlist/     Lists and favourites
├── ratings/       Scores and distribution
├── comments/      Anime and episode comments
├── community/     Board, polls, tier lists, matchups
├── reports/       Moderation queue
├── mana/          Points economy
├── leaderboard/   Rankings
├── requests/      Anime requests
├── contact/       Support inbox
├── ads/           Placement configuration
├── analytics/     Views, trending, dashboard metrics
├── settings/      Runtime site configuration
├── storage/       Upload abstraction
├── mail/          Transactional email
└── admin/         CRUD and moderation surfaces
```

---

## The media abstraction

This is the part of the design that earns its keep, because it is what makes
"start on Drive, move to a CDN later" a data migration rather than a rewrite.

```ts
interface MediaProviderAdapter {
  readonly provider: MediaProvider;
  readonly proxied: boolean;        // do bytes flow through us?
  isConfigured(): boolean;
  probe(ref: MediaRef): Promise<MediaFileInfo>;
  openStream(ref: MediaRef, options: OpenStreamOptions): Promise<MediaStreamResult>;
}
```

| Provider | Adapter | Proxied | Notes |
|---|---|---|---|
| `GOOGLE_DRIVE` | `GoogleDriveProvider` | Yes | Drive API v3, Range forwarded |
| `DIRECT_FILE` | `DirectFileProvider` | Yes | HTTP origin or local uploads |
| `OBJECT_STORAGE` | `DirectFileProvider` | Yes | An S3 object is just an HTTPS URL |
| `HLS` | — | No | Player fetches segments itself |
| `EXTERNAL_EMBED` | — | No | Cannot be controlled; controls hidden |

Adding a backend means writing one class. Nothing in the catalogue, the admin,
the frontend or the business logic knows or cares which provider a given episode
uses — the only thing that changes is which adapter `MediaProviderRegistry`
hands back.

### Data model consequence

Two physical realities drive the schema, and pretending otherwise is what
produces fake player controls:

1. A progressive MP4 carries **one audio track** → alternative audio is a
   separate `MediaSource`, not a track.
2. A progressive MP4 has **one resolution** → each quality is a separate
   `MediaVariant` row pointing at a different file.

```
Episode
├── MediaSource (Server 1, SUB, ja)
│   ├── MediaVariant 1080p → file
│   ├── MediaVariant 720p  → file
│   └── MediaVariant 480p  → file
├── MediaSource (Server 1, DUB, en)
│   └── MediaVariant 720p  → file
└── SubtitleTrack en, SubtitleTrack bn
```

---

## Authentication

Access tokens are short-lived JWTs held **in memory only**, never in
localStorage — an XSS bug cannot read a token out of storage that does not hold
one. Persistence comes from an httpOnly refresh cookie that JavaScript cannot
touch; on boot the app trades that cookie for a fresh access token.

Refresh tokens are opaque random strings, stored only as a SHA-256 hash, and
**rotated on every use**. Replaying a consumed token revokes the entire session
family, which turns a stolen token into a detectable, self-limiting event.

The JWT strategy re-reads the user on every request rather than trusting the
token body, so a ban or role change takes effect immediately instead of waiting
out the token's lifetime.

Guards run in order: authenticate → authorise → rate-limit. Roles are
hierarchical, so `@Roles(MODERATOR)` is satisfied by an admin.

---

## Analytics

Counting every page view as a row and then aggregating it would not survive
contact with traffic. So:

- Raw `AnimeView` / `EpisodeView` rows exist only for the 30-minute
  de-duplication window and are pruned after seven days.
- Daily rollups (`AnimeViewStat`, `EpisodeViewStat`) are what "trending this
  month" actually reads — one indexed scan over ~30 rows per title.
- A pseudonymous fingerprint (hashed IP + user agent + server secret) limits one
  view per title per 30 minutes. The raw IP is never stored.
- An hourly cron recomputes a rolling popularity score.

---

## Frontend rendering strategy

| Route | Strategy | Why |
|---|---|---|
| `/` | ISR, 120s | Catalogue data changes on publish, not per request |
| `/anime/[slug]` | ISR, 120s | Same, plus it is the main SEO surface |
| `/browse`, `/az`, `/genres/[slug]` | Dynamic | Filters are per-request |
| `/watch/[slug]/[episode]` | Dynamic | Playback URLs are signed per request |
| `/guides/[slug]` | SSG | Static content, generated at build |
| `/profile/*`, `/admin/*` | Client | Account-only, never indexed |

Every server-side fetch on the homepage is individually wrapped so that one
failing rail cannot take the page down — verified by the fact that the
production build succeeds even with the API offline.

---

## Security posture

| Concern | Measure |
|---|---|
| Passwords | bcrypt, configurable cost |
| Account enumeration | Password reset and login respond identically whether or not the account exists; login compares against a dummy hash for timing parity |
| XSS | All user text sanitised server-side on write; comments stored and rendered as plain text; community bodies allow a small safe tag subset |
| SQL injection | Prisma parameterises everything; the few raw queries are tagged templates |
| CSRF | Refresh cookie is `sameSite` (`none` + `secure` in production), and mutations require a bearer token |
| Rate limiting | Global throttle plus tighter per-route limits on auth, comments, reports and requests |
| Upload abuse | Magic-byte sniffing — the browser's Content-Type is advisory only; size caps; path traversal blocked on read |
| Media hot-linking | HMAC-signed, expiring playback URLs |
| Privilege escalation | You cannot grant a role at or above your own, nor modify your own role or status |
| Audit | Sensitive admin actions recorded in `ActivityLog` |
| Headers | Helmet, with `crossOriginResourcePolicy` relaxed only as far as media streaming requires |

---

## Performance

- Server-side pagination everywhere; no endpoint returns an unbounded list
- Composite indexes matching the actual sort/filter combinations in use
- `$transaction` for the list+count pairs so pagination is consistent
- Denormalised counters (`score`, `subEpisodeCount`, `viewCount`) recomputed on
  write, so cards never trigger N+1 aggregates
- Next.js image optimisation with AVIF/WebP
- `optimizePackageImports` for framer-motion
- hls.js loaded dynamically, only for HLS sources
- IMA SDK loaded only when a VAST tag is configured
- Scroll-snap rails instead of a JS carousel
- `prefers-reduced-motion` disables decorative animation wholesale

---

## What is deliberately not here

**Watch2Gether.** Excluded by requirement, and genuinely absent — not hidden
behind a flag. There is no schema table, no module, no endpoint, no route and no
navigation entry for it.

**Third-party metadata APIs.** No AniList, MyAnimeList, TMDB or similar is ever
contacted. External IDs can be stored on a title, but purely as a reference note
for the operator. Everything is managed by hand, which is what the brief asked
for and what keeps the platform free of a paid dependency.
