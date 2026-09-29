# Media worker — deployment and operation

The media worker turns one uploaded master video into everything the player
needs: a quality ladder, one playable file per embedded audio stream, and a
WebVTT file per embedded text subtitle.

It exists as a separate service because transcoding is CPU-bound and runs for
tens of minutes. It cannot live in the API's request path — it would block the
API and exceed the request timeout of every host worth using.

**Normal admin usage is: upload one master and save.** Everything below is
one-time deployment setup.

---

## What the admin does, per episode

1. Admin → Anime → Season → Episode
2. Media mode → **SINGLE_MASTER**
3. Master source → **Upload file** (or paste an existing Drive link)
4. Save

That is all. The episode becomes `PENDING`, a running worker claims it within
one poll interval, and the episode reaches `READY` on its own. Progress is
visible on the episode page.

---

## Architecture

```
Browser ──upload──> API ──stream──> Google Drive (masters/)
                     │
                     │ creates a PENDING job on the MediaSource
                     ▼
                  Database
                     ▲
                     │ claim / progress / register / complete
                     │
              Media worker (container)
                     │
                     ├─ ffprobe the master
                     ├─ encode the ladder      ─┐
                     ├─ extract each audio      ├─> Google Drive (_renditions/)
                     └─ convert each subtitle  ─┘
```

A master is a job: a `MediaSource` row with `masterDriveFileId` set and a
`processingState`. There is no separate queue table, so what should play and
what still needs building can never disagree.

Uploading and pasting a Drive link converge on the same field, so both feed one
pipeline.

---

## Required configuration

### API (backend)

| Variable | Purpose |
| --- | --- |
| `MEDIA_WORKER_TOKEN` | Shared secret the worker presents. **Unset closes the worker endpoints** rather than leaving them open. |
| `GOOGLE_DRIVE_CLIENT_ID` | OAuth client used to store masters. |
| `GOOGLE_DRIVE_CLIENT_SECRET` | — |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | — |

Uploads are owned by the OAuth account, not the service account: a service
account has no Drive storage quota of its own, so anything it creates has
nowhere to live.

### Worker

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `API_URL` | yes | — | e.g. `https://api.example.com/api` |
| `MEDIA_WORKER_TOKEN` | yes | — | Must match the API's. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | one of | — | Raw service-account JSON. |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | these | — | Same, base64 — easiest for most secret stores. |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | three | — | Path, for hosts that mount secrets as files. |
| `GOOGLE_DRIVE_CLIENT_ID` | yes | — | Uploading generated media. |
| `GOOGLE_DRIVE_CLIENT_SECRET` | yes | — | — |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | yes | — | — |
| `WORK_DIR` | no | `/var/tmp/anizora-media` | Scratch space. Put it on a real disk. |
| `MEDIA_WORKER_CONCURRENCY` | no | `1` | See *Resource limits*. |
| `MIN_FREE_DISK_BYTES` | no | `12884901888` (12 GB) | A job is refused below this. |
| `MAX_CACHE_BYTES` | no | `8589934592` (8 GB) | Rendition cache ceiling in Drive. |
| `POLL_SECONDS` | no | `30` | Queue poll interval. |
| `RENDITION_FOLDER` | no | `AniZora _renditions` | Drive folder for generated media. |
| `FFMPEG_PRESET` / `FFMPEG_CRF` | no | `veryfast` / `23` | Speed/size trade-off. |

The worker holds **no database credentials and no admin account**. Its token
authorises exactly five endpoints: list jobs, claim, report progress, register
produced media, complete. It cannot read users or edit the catalogue.

Generate a token with:

```bash
openssl rand -base64 32
```

---

## Running it

### Docker Compose (bundled)

```bash
# Required in .env: MEDIA_WORKER_TOKEN and the Drive credentials above.
docker compose --profile media up -d media-worker
docker compose logs -f media-worker
```

The worker is behind the `media` profile, so the rest of the stack runs without
it.

### Standalone container

```bash
docker build -f backend/Dockerfile.media-worker -t anizora-media-worker ./backend

docker run -d --name anizora-media-worker --restart unless-stopped \
  -e API_URL=https://api.example.com/api \
  -e MEDIA_WORKER_TOKEN=... \
  -e GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=... \
  -e GOOGLE_DRIVE_CLIENT_ID=... \
  -e GOOGLE_DRIVE_CLIENT_SECRET=... \
  -e GOOGLE_DRIVE_REFRESH_TOKEN=... \
  -v anizora-media-work:/var/tmp/anizora-media \
  --cpus 2 --memory 2g \
  anizora-media-worker
```

Any host that runs a container works: a VPS, a spare machine, a container
service with a disk. The worker reaches the API over HTTPS and needs no inbound
port.

### FFmpeg

Bundled in the image — **FFmpeg 8.1.2** at the time of writing, from the Alpine
release `node:22-alpine` is pinned to. It moves only when the base image does.
Nothing depends on what is installed on the host. The worker refuses to start
against a build older than 2020, which cannot decode 10-bit HEVC correctly.

---

## Resources

| | |
| --- | --- |
| CPU | 2 cores is a sensible floor. FFmpeg uses everything it is given. |
| RAM | 2 GB. Transcoding is CPU- and disk-bound, not memory-hungry. |
| Disk | The master plus its renditions, several times over: **12 GB free** is the default floor. A 400 MB 1080p master produces roughly 525 MB of renditions and needs both on disk at once. |
| Time | Roughly 1.5–2× realtime per rendition at `veryfast`. A 24-minute episode takes ~35–50 minutes for four qualities on 2 cores. |

**Concurrency defaults to 1 deliberately.** FFmpeg already parallelises across
cores, so running several jobs at once makes them all slower and multiplies disk
use. Raise `MEDIA_WORKER_CONCURRENCY` only where CPU and disk genuinely allow.

---

## Queue behaviour

States: `NOT_APPLICABLE` (manual variants) → `PENDING` → `PROCESSING` →
`READY` | `FAILED`.

- **Claiming** is atomic. Several workers can poll the same queue safely; the
  loser skips the job.
- **Heartbeat.** Each step reports progress, which doubles as liveness.
- **Stale claims** return to the queue after 90 minutes, so a worker killed
  mid-encode does not park a job forever.
- **Failures** are recorded with their cause and shown on the episode page. A
  failed job is retried on the next poll.
- **`READY` is refused** until at least one rendition exists, so a job cannot
  report success with nothing to play.

### Resume and idempotency

Restarting mid-job costs only the step in flight:

- A rendition already registered is **reused**.
- A rendition already uploaded under its deterministic name is **adopted**,
  which covers a run that uploaded but failed before registering.
- Registration is keyed on `(source, quality)` and `(episode, language)`, so
  re-running updates rows instead of duplicating them.

Temporary files are removed when a job ends, successfully or not.

---

## Storage layout

```
AniZora masters/          masters, never evicted
AniZora _renditions/      generated media, LRU-evicted against MAX_CACHE_BYTES
    <slug>-e<N>-1080p.mp4
    <slug>-e<N>-720p.mp4
    <slug>-e<N>-<lang>.m4a
    <slug>-e<N>-<lang>.vtt
```

Only the rendition folder is ever evicted from, and only generated files.
Masters are the source of truth for rebuilding and are never touched.

---

## What gets produced

**Video** — never upscaled: a 1080p master yields 1080/720/480/360, a 720p
master 720/480/360. All renditions are H.264 8-bit, because the master may be
HEVC or 10-bit, which most browsers cannot play — so even a same-height
rendition is re-encoded rather than copied.

**Audio** — every embedded stream becomes a separate playable file when there is
more than one, labelled from its language tag (`jpn` → Japanese). Untagged
streams become `Audio 1`, `Audio 2`; no language is ever invented. A single
audio stream stays muxed in the video.

**Subtitles** — text streams (SubRip, ASS/SSA, mov_text) are converted to
WebVTT. Bitmap subtitles (PGS, VobSub) are **detected and reported as skipped**,
never silently dropped and never faked — they would need OCR, which this
pipeline does not do.

---

## Health and monitoring

The container has a `HEALTHCHECK` that confirms it can reach the API and that
FFmpeg is present — the two ways it silently stops being useful.

```bash
docker inspect --format '{{.State.Health.Status}}' anizora-media-worker
docker compose logs -f media-worker
```

Logs print one line per step. Nothing secret is ever logged: not the worker
token, not the refresh token, not the service-account key.

---

## Backup and recovery

Masters are the only irreplaceable artefact — everything else can be rebuilt
from them. Back up the `AniZora masters` folder.

To rebuild an episode: open it in the admin panel and save it again. That
re-queues the job; the worker adopts what already exists and regenerates only
what is missing.

---

## Scaling

Run more workers against the same API. Claims are atomic, so they will not
collide. Bound by disk and CPU on each host, not by the queue.

---

## Hosting note

This worker needs sustained CPU, several GB of scratch disk and a process that
lives for tens of minutes. Free tiers of typical app platforms — including the
Render free plan this project's API runs on — do not provide that: they cap
request duration, offer no persistent disk and idle the instance out.

The worker is therefore packaged to run anywhere a container can: a small VPS,
a spare machine, or any container host with a disk. The rest of AniZora is
unaffected and continues to run where it does today.
