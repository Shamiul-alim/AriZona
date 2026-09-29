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

The worker is therefore packaged to run anywhere a container can: a spare
machine, a mini PC, a NAS, or a VPS if one is ever bought. The rest of AniZora
is unaffected and continues to run where it does today.

---

# NO-CARD DEPLOYMENT — CLIENT-OWNED WORKER

The deployment this project actually ships with. It needs no credit card, no
cloud account and no subscription, because the encoding runs on a machine the
recipient already owns.

Everything else stays hosted: **Vercel** (site), **Render** (API), **Supabase**
(database), **Google Drive** (media). Only the FFmpeg compute moves.

Ready-made installers live in [`deploy/media-worker/`](../deploy/media-worker/),
with a recipient-facing guide in its own
[README](../deploy/media-worker/README.md). What follows is the operator's view.

## Why a machine and not a free cloud tier

Several platforms advertise a free tier that looks like it would do. None of
them will: a 24-minute episode needs roughly 35–50 minutes of uninterrupted CPU
and about 1 GB of scratch space held for the duration. Free tiers cap request
duration, sleep idle instances, and give no persistent disk. Picking one would
mean jobs that die halfway with no clear reason.

An ordinary desktop does the job well and costs nothing extra.

## A. Windows installation

Primary target, because it is what a recipient most likely already has.

1. Install **Docker Desktop** and leave *"Start Docker Desktop when you log in"*
   ticked. That single setting is what makes the worker survive a reboot.
2. Open PowerShell in `deploy/media-worker/windows`.
3. `.\install-worker.ps1`

FFmpeg is inside the image — nothing to install, no PATH to configure, no
version to match.

## B. Linux installation

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER            # log out and back in
sudo systemctl enable --now docker       # starts with the machine
cd deploy/media-worker/linux && ./install-worker.sh
```

Same image, same configuration, same behaviour. Nothing in the worker is
Windows-specific.

## C. One-time secrets

The installer prompts for these and writes them to `.env.worker`, which it
restricts to the installing user. Nothing is echoed to the screen or left in
shell history.

| | |
| --- | --- |
| `API_URL` | `https://arizona-3.onrender.com/api` |
| `MEDIA_WORKER_TOKEN` | Must match the Render backend exactly |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | Reading masters |
| `GOOGLE_DRIVE_CLIENT_ID` / `_SECRET` / `_REFRESH_TOKEN` | Writing generated media |

Base64 is preferred over a file path so no machine-specific path is ever baked
into a deployment. `GOOGLE_SERVICE_ACCOUNT_FILE` still works for anyone who
would rather mount a file.

### Generating and placing the token

```bash
openssl rand -base64 32
```

The same value goes in exactly two places: the Render backend environment, and
the worker's `.env.worker`. It must never appear in the frontend, in any
`NEXT_PUBLIC_*` variable, in Git, or in a document.

Until it is set on Render, the worker endpoints stay closed — the guard fails
shut rather than open, so a half-finished setup is never a hole.

## D. Day-to-day commands

Run from `deploy/media-worker/windows` or `.../linux`:

| | Windows | Linux |
| --- | --- | --- |
| Status | `.\status-worker.ps1` | `./status-worker.sh` |
| Logs | `.\logs-worker.ps1` | `./logs-worker.sh` |
| Start | `.\start-worker.ps1` | `./start-worker.sh` |
| Stop | `.\stop-worker.ps1` | `./stop-worker.sh` |
| Update | `.\update-worker.ps1` | `./update-worker.sh` |
| Remove | `.\uninstall-worker.ps1` | `./uninstall-worker.sh` |

None of these is needed per episode. They exist for the rare day something
looks wrong.

## E. Automatic startup

Two layers, both needed:

- The container is `restart: unless-stopped`, so Docker brings it back after a
  crash, a reboot or a Docker restart.
- Docker itself must start with the machine — Docker Desktop's login setting on
  Windows, `systemctl enable docker` on Linux. The installer checks this and
  says so if it is off.

No Scheduled Task is installed. Docker's own restart policy already covers
every case one would handle, and a task that races the Docker daemon at boot
causes more trouble than it solves.

No terminal window needs to stay open.

## F. Offline queue behaviour

A worker machine that is switched off is a normal state, not a fault:

| | |
| --- | --- |
| Admin uploads a master | Works. |
| Episode state | `PENDING`. |
| Admin panel | *Worker offline — processing begins automatically when a worker comes online.* |
| When the machine starts | Docker starts → worker starts → queue drains. |

Nothing is lost, nothing needs re-saving, and a wait is never reported as a
failure. The worker heartbeats every poll, which is what lets the panel tell a
quiet queue apart from a broken pipeline.

Stopping mid-encode is equally safe: the claim goes stale after 90 minutes and
the job returns to the queue, where finished renditions are reused rather than
rebuilt.

## G. Moving the worker to another machine

The worker holds no permanent state — only scratch files for the job in hand.

1. Old machine: `uninstall-worker`.
2. New machine: install Docker, run the installer, give the same answers.

Queued jobs continue on the new machine. No database migration, no media
re-upload, no library rebuild. The same is true of moving to a VPS later: the
identical container runs there with no code change.

## H. Backup and recovery

Masters are the only irreplaceable artefact; everything else is rebuilt from
them. Back up the `AniZora masters` Drive folder.

To rebuild an episode, open it in the admin panel and save it again. That
re-queues the job, and the worker regenerates only what is missing.

The worker needs no backup at all.

## I. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Docker is not running` | Docker Desktop not started | Start it; the worker follows on its own |
| `Authentication: Rejected` | Token mismatch, or Render has none set | Re-run the installer; check Render |
| `Backend: Unreachable` | No internet on the worker machine | It retries by itself; nothing is lost |
| Container keeps exiting | Usually disk space | `logs` names it; the worker refuses jobs below the floor |
| Episode `FAILED` | Shown with its cause in the admin panel | Fix the cause; it retries on the next poll |
| Admin says worker offline but it is running | Clock skew or no network | Check `status` on the machine |

`status` also runs the worker's own preflight checks, so it reports the same
verdict the worker itself would reach.
