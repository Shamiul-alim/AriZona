# Google Drive media setup

How to configure Drive as the video source, and what to expect from it.

---

## What this does

The backend authenticates to Google with **your** credentials and streams file
bytes through its own endpoint, forwarding the browser's HTTP `Range` header to
Drive and relaying the `206 Partial Content` response back.

That is what makes the player's seeking, quality switching and progress tracking
real rather than decorative. The reasoning is in [PLAYER.md](PLAYER.md).

**Only documented Google APIs are used.** No scraping, no `uc?export=download`
confirm-token workarounds, no undocumented endpoints, and no attempt to bypass
any access control. Files must be shared with the configured identity through
normal Drive permissions.

---

## Choosing an auth mode

| | Service account | OAuth refresh token |
|---|---|---|
| Best for | Production | Personal Drive you cannot share from |
| Setup | Share files with a robot email | One-time browser consent |
| Token expiry | Never | Refresh token can be revoked |
| Works with Shared Drives | Yes, add it as a member | Yes |
| Recommended | **Yes** | Only if the above will not work |

A service account is a robot identity with its own email address. Sharing a file
with that address is exactly like sharing it with a colleague.

---

## Service account setup (recommended)

### 1. Create a project and enable the API

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (or pick an existing one).
3. **APIs & Services → Library**, search for **Google Drive API**, click
   **Enable**.

### 2. Create the service account

1. **APIs & Services → Credentials → Create Credentials → Service account**.
2. Give it a name such as `anizora-media`. No project role is required — it gets
   access purely from Drive sharing.
3. Open the account, go to **Keys → Add key → Create new key → JSON**, and
   download it.

The file looks like this. Treat it as a password:

```json
{
  "type": "service_account",
  "project_id": "your-project",
  "client_email": "anizora-media@your-project.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n"
}
```

Note the `client_email` — that is the address you share files with.

### 3. Share your media

**Per folder (recommended).** Right-click the folder in Drive → **Share** →
paste the `client_email` → **Viewer** → Send. Everything inside inherits access,
including files you add later.

**Per file.** Same, on individual files.

**Shared Drive.** Add the `client_email` as a member with at least Viewer.

> A service account has no storage quota of its own, so it cannot own files.
> It only ever reads what you share with it.

### 4. Configure the backend

Put the key somewhere outside version control — `secrets/` is already ignored by
git:

```
your-project/
└── secrets/
    └── google-service-account.json
```

Mount it in `docker-compose.yml` (the line is present, commented out):

```yaml
backend:
  volumes:
    - uploads-data:/app/storage/uploads
    - ./secrets/google-service-account.json:/run/secrets/google-service-account.json:ro
```

Then in `.env`:

```env
GOOGLE_DRIVE_ENABLED=true
GOOGLE_DRIVE_AUTH_MODE=service_account
GOOGLE_SERVICE_ACCOUNT_FILE=/run/secrets/google-service-account.json
```

For platforms where mounting a file is awkward, base64-encode it instead:

```bash
base64 -w0 secrets/google-service-account.json
```

```env
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50Iiw...
```

### 5. Confirm it worked

Restart the backend and open **Admin → Dashboard → Media providers**. Google
Drive should read **Ready**. If it says **Not configured**, the credentials were
not loaded — check the backend log, which names the specific reason.

---

## OAuth setup (alternative)

1. **Credentials → Create Credentials → OAuth client ID → Web application**.
2. Add `https://developers.google.com/oauthplayground` as a redirect URI.
3. Open the [OAuth Playground](https://developers.google.com/oauthplayground/),
   click the gear icon, tick **Use your own OAuth credentials**, paste your
   client ID and secret.
4. Authorise the scope `https://www.googleapis.com/auth/drive.readonly`.
5. Exchange the authorisation code for tokens and copy the **refresh token**.

```env
GOOGLE_DRIVE_ENABLED=true
GOOGLE_DRIVE_AUTH_MODE=oauth
GOOGLE_DRIVE_CLIENT_ID=…apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=…
GOOGLE_DRIVE_REFRESH_TOKEN=1//…
```

---

## Adding video to an episode

Upload your files to Drive first. For a single episode with subs, dubs and four
qualities, that is six files:

```
Crimson Vanguard/
└── Episode 01/
    ├── ep01-sub-1080p.mp4
    ├── ep01-sub-720p.mp4
    ├── ep01-sub-480p.mp4
    ├── ep01-sub-360p.mp4
    ├── ep01-dub-1080p.mp4
    └── ep01-dub-720p.mp4
```

Then in **Admin → Episodes → New episode**:

1. Pick the anime and episode number.
2. **Source 1** — provider *Google Drive*, kind *SUB*, language `ja`, label
   `Japanese`. Add one quality row per file and paste each share link. The
   admin form accepts either a full share URL or a bare file ID.
3. **Source 2** — the same, with kind *DUB*, language `en`, label
   `English Dub`.
4. Add subtitle tracks, intro/outro markers and the duration.
5. Set the status to **Published**.

### Recommended encoding

| Setting | Value | Why |
|---|---|---|
| Container | MP4 | Universally supported |
| Video | H.264 High, `yuv420p` | Widest browser and device support |
| Audio | AAC-LC, 128–192 kbps | Same |
| `faststart` | **Yes** | Puts the index at the front of the file so playback can start before the whole file is fetched — without this, seeking is slow |

```bash
ffmpeg -i input.mkv \
  -c:v libx264 -profile:v high -crf 21 -preset slow -pix_fmt yuv420p \
  -vf "scale=-2:1080" \
  -c:a aac -b:a 192k \
  -movflags +faststart \
  ep01-sub-1080p.mp4
```

---

## Limits you should plan around

**Drive is a file store, not a CDN.** This is the single most important thing to
understand before launching on it.

| Limit | Consequence |
|---|---|
| Per-file daily download cap | A popular episode can become temporarily unavailable |
| Per-project API quota | Heavy concurrent viewing can hit rate limits |
| No edge caching | Every viewer streams from Google's origin via your server |
| Bandwidth passes through your server | Your egress costs scale with viewers |

It is genuinely fine for launch, for a small audience, and for validating the
product. It will not carry a large audience. Plan the migration before you need
it, not after.

---

## Moving to the client's Drive

Because nothing is hardcoded to a particular account:

1. Create a service account in the client's Google Cloud project.
2. Share the client's files with its `client_email`.
3. Replace the key file and restart the backend.
4. Update the file IDs on the affected media variants — by hand in the admin, or
   in bulk with SQL against `media_variants.driveFileId`.

No schema change. No code change. No redeploy of the frontend.

---

## Moving off Drive entirely

The `MediaProvider` abstraction exists for this. To move to object storage plus
a CDN:

1. Upload the files to your bucket.
2. For each variant, set `provider = 'OBJECT_STORAGE'`, clear `driveFileId`, and
   set `directUrl` to the public URL.

```sql
UPDATE media_sources SET "provider" = 'OBJECT_STORAGE' WHERE "provider" = 'GOOGLE_DRIVE';

UPDATE media_variants
SET "directUrl"   = 'https://cdn.example.com/' || "driveFileId" || '.mp4',
    "driveFileId" = NULL
WHERE "driveFileId" IS NOT NULL;
```

Everything else — the catalogue, users, watch history, watchlists, comments,
community, ratings, ads — is untouched. Object storage reuses the same streaming
adapter as direct files, so Range handling continues to work identically.

For adaptive bitrate, transcode to HLS, set the source `provider = 'HLS'` and
put the master playlist URL in `hlsUrl`. The player then switches quality and
audio seamlessly with no reload at all.

---

## Troubleshooting

**404: "not found, or it has not been shared".** The file is not shared with the
service account, or the ID is wrong. Open the share dialog and confirm the
`client_email` is listed.

**403: "Drive denied access".** Either the daily download quota for that file is
exhausted, or the Drive API is not enabled on the project.

**"Provider is not configured".** The credentials did not load. The backend log
states the specific reason — missing file, unreadable file, or malformed JSON.

**Playback starts but seeking is slow.** The file was not encoded with
`+movflags faststart`, so its index sits at the end. Re-encode.

**"Could not read a Drive file ID".** The pasted value was not recognisable as a
Drive link or ID. Copy the share link again, or paste just the ID.
