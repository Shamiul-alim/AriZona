# Step-by-step guide: admin panel, video files, Google Drive, first episode

Follow the parts in order. Each part ends with a check so you know it worked
before moving on.

---

## Part 1 — Get into the admin panel

1. Make sure the site is running. In PowerShell:
   ```powershell
   cd E:\tofayel_project
   docker compose ps
   ```
   All five containers should say **healthy**. If not: `docker compose up -d`.

2. Clear the old broken login cookie once (only needed the first time, because
   of the bug fixed on 18 Sep):
   - Chrome / Edge: press `Ctrl+Shift+Delete` → **Cookies and other site data**
     → time range **All time** → **Clear data**.
   - Or simply open a **private / incognito** window.

3. Open **http://localhost:3000/auth/login** and sign in:
   | Field | Value |
   |---|---|
   | Email or username | `admin@anizora.local` |
   | Password | `ChangeMe123!` |

4. Open **http://localhost:3000/admin**. You should see the Dashboard with
   numbers (14 anime, 134 episodes…).
   You can also use the round avatar at the top right → **Admin Dashboard**.

5. **Change the password now:** avatar (top right) → **Settings** → Security →
   Change password. Use something only you know.

**Check:** reload the admin page with `F5`. You should stay signed in.

**Still sent back to the login page?**
- Use exactly `http://localhost:3000` — not `127.0.0.1:3000` (they are
  different sites to the browser, so the cookie does not carry over).
- Try an incognito window.
- "Too many requests" → wait 5 minutes (login is limited to 8 attempts per
  5 minutes to stop password guessing).

---

## Part 2 — Where the video, subtitles and dub come from

### The rule

You may only upload videos you have **the right to stream publicly**: content
you licensed from the rights holder (or that your client licensed and hands to
you), content you produced yourself, or content released under a licence that
allows it. Streaming anime you downloaded from other streaming or torrent sites
is copyright infringement — Google Drive will also suspend files and accounts for
it, and AdSense/Ad Manager will reject or ban the site.

### Real content (your client's)

For a licensed series, the licensor or your client delivers, per episode:

| File | What it is |
|---|---|
| Master video | Usually `.mkv` or `.mov`, high quality, Japanese audio |
| Dub audio | English (or other) audio — either as a second audio track inside the master, or a separate `.wav`/`.aac`/`.mka` file |
| Subtitles | `.srt`, `.ass` or `.vtt` per language (English, Bangla…) |

Ask your client for exactly those. That is all this platform needs.

### Test content (free and legal, for trying the system today)

The Blender Foundation's open films are released under **Creative Commons
Attribution**, so you may stream them (credit "Blender Foundation"):

- **Sintel** (animated, 15 min) — https://studio.blender.org/films/sintel/
- **Big Buck Bunny** (animated, 10 min) — https://studio.blender.org/films/big-buck-bunny/
- **Tears of Steel** (live action) — https://studio.blender.org/films/tears-of-steel/

Download the highest-quality MP4/MKV offered. Sintel also has official subtitle
files on the same page — good for testing subtitles.

They have one audio language, so to **test** the DUB feature you can make a
second copy with different audio (see Part 3, step 4) or simply configure only
SUB for now.

### Making your own subtitles

If you do not receive subtitle files, create them with free tools:

- **Subtitle Edit** (Windows, easiest) — https://www.nikse.dk/subtitleedit
- **Aegisub** — https://aegisub.org

Both save to `.srt`. The site accepts `.srt` and `.vtt` and converts SRT for you.
Bangla works — just save the file as **UTF-8**.

---

## Part 3 — Prepare the files

### What you need per episode

| File | Needed? | Example name |
|---|---|---|
| SUB video, 1080p | yes | `ep01-sub-1080p.mp4` |
| SUB video, 720p | recommended | `ep01-sub-720p.mp4` |
| SUB video, 480p | recommended (mobile data) | `ep01-sub-480p.mp4` |
| DUB video, 1080p / 720p | only if you have a dub | `ep01-dub-720p.mp4` |
| English subtitles | yes | `ep01-en.srt` |
| Bangla subtitles | optional | `ep01-bn.srt` |

Why separate files per quality and per audio? A normal MP4 has one resolution
and one audio track. The player switches quality/audio by switching file and
keeps your position — so each needs its own file.

Two or three qualities is plenty. Every file costs Drive space and upload time.

### Tool: ffmpeg (already installed on this PC) or HandBrake

**Option A — HandBrake (no typing):** https://handbrake.fr
Preset **Web → "Creator 1080p60"** (and 720p, 480p). Tick **Web Optimized**
(this is important — it makes seeking fast). Choose the audio track in the Audio
tab. Output format MP4.

**Option B — ffmpeg (commands below).** Open PowerShell in the folder with your
files. Replace `input.mkv` with your file name.

#### Step 1 — see what is inside the file
```powershell
ffprobe -hide_banner input.mkv
```
Look for lines like:
```
Stream #0:1(jpn): Audio: aac ...      <- Japanese audio  = audio track 0
Stream #0:2(eng): Audio: aac ...      <- English dub     = audio track 1
Stream #0:3(eng): Subtitle: subrip    <- text subtitles  = subtitle track 0
```
(Count audio tracks from 0 in order; ignore the video line.)

#### Step 2 — SUB versions (Japanese audio)
```powershell
ffmpeg -i input.mkv -map 0:v:0 -map 0:a:0 -c:v libx264 -crf 21 -preset slow -vf scale=-2:1080 -pix_fmt yuv420p -c:a aac -strict -2 -b:a 192k -movflags +faststart ep01-sub-1080p.mp4
ffmpeg -i input.mkv -map 0:v:0 -map 0:a:0 -c:v libx264 -crf 22 -preset slow -vf scale=-2:720  -pix_fmt yuv420p -c:a aac -strict -2 -b:a 160k -movflags +faststart ep01-sub-720p.mp4
ffmpeg -i input.mkv -map 0:v:0 -map 0:a:0 -c:v libx264 -crf 23 -preset slow -vf scale=-2:480  -pix_fmt yuv420p -c:a aac -strict -2 -b:a 128k -movflags +faststart ep01-sub-480p.mp4
```

#### Step 3 — DUB versions, when the dub is a second track in the same file
Same commands, but `-map 0:a:1` (the English track) and `dub` in the name:
```powershell
ffmpeg -i input.mkv -map 0:v:0 -map 0:a:1 -c:v libx264 -crf 22 -preset slow -vf scale=-2:720 -pix_fmt yuv420p -c:a aac -strict -2 -b:a 160k -movflags +faststart ep01-dub-720p.mp4
```

#### Step 4 — DUB versions, when the dub is a separate audio file
Reuse the already-encoded video (fast, no quality loss) and swap the audio:
```powershell
ffmpeg -i ep01-sub-720p.mp4 -i ep01-english.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -strict -2 -b:a 160k -shortest -movflags +faststart ep01-dub-720p.mp4
```

#### Step 5 — subtitles
If the subtitles are **inside** the `.mkv` as text:
```powershell
ffmpeg -i input.mkv -map 0:s:0 ep01-en.srt
```
If you got separate `.srt`/`.vtt` files, just rename them. `.ass` files:
convert to `.srt` in Subtitle Edit (File → Save as → SubRip).

> `-movflags +faststart` matters: without it, seeking in the player is slow.
> `-strict -2` is only needed because this PC has an older ffmpeg; newer
> versions ignore it.

**Check:** double-click each MP4 — it plays, the right language is heard, and
it jumps instantly when you drag the timeline.

---

## Part 4 — Build the Drive folder

1. Go to https://drive.google.com with the Google account that owns the files.
2. Create this structure (**New → New folder**):
   ```
   AniZora Media/
   └── Sintel/                     <- one folder per anime
       └── Episode 01/             <- one folder per episode
           ├── ep01-sub-1080p.mp4
           ├── ep01-sub-720p.mp4
           ├── ep01-sub-480p.mp4
           ├── ep01-dub-720p.mp4
           ├── ep01-en.srt
           └── ep01-bn.srt
   ```
3. Upload: open the episode folder → drag the files in (or **New → File
   upload**). Wait until every file shows as finished. Large videos can take
   a while.

---

## Part 5 — Share the folder with the website (the step that is missing now)

The website reads your Drive through a robot account. Right now it can see
**0 files** because nothing is shared with it yet.

1. In Drive, right-click the top folder **AniZora Media** → **Share** → **Share**.
2. In "Add people", paste exactly:
   ```
   anizora-media@anizora.iam.gserviceaccount.com
   ```
3. Set the role to **Viewer**.
4. Untick **Notify people** (a robot cannot read email).
5. Click **Share** (if Google warns it is outside your organisation, click
   **Share anyway**).

Sharing the top folder covers every subfolder and every file you add later.

You do **not** need "Anyone with the link". Leave general access **Restricted**
— safer, and the site does not need it.

**Check:** tell Claude "I shared the folder" and it will list what the website
can see, or wait until Part 8 and test it in the player.

---

## Part 6 — Copy the links you will paste

For each file (videos **and** subtitles):

1. Right-click the file → **Share** → **Copy link**.
2. You get something like
   `https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view?usp=drive_link`

Paste either the whole link or just the long ID in the middle — the admin panel
accepts both.

Tip: open a Notepad file and paste the links next to their file names as you go:
```
ep01-sub-1080p  https://drive.google.com/file/d/1Ab.../view
ep01-sub-720p   https://drive.google.com/file/d/1Cd.../view
ep01-dub-720p   https://drive.google.com/file/d/1Ef.../view
ep01-en.srt     https://drive.google.com/file/d/1Gh.../view
```

---

## Part 7 — Create the anime and the episode in the admin panel

### 7a. Create the anime (once per series)

**Admin → Anime → + New anime**

| Field | What to enter |
|---|---|
| English title | e.g. `Sintel` |
| Japanese title | optional |
| Synopsis | a short description |
| Type / Status | e.g. Movie / Completed |
| Season, Release year | e.g. Fall, 2010 |
| Duration (minutes) | e.g. 15 |
| Genres | click to select (they drive filters and recommendations) |
| Poster | right column → drag a portrait image (2:3, e.g. 600×900) |
| Banner | right column → drag a wide image (e.g. 1600×600) |
| Publishing → Status | **Published** |

Click **Create anime**.

### 7b. Create the episode

**Admin → Episodes → + New episode**

**Episode box**
| Field | Value |
|---|---|
| Anime | pick the one you just made |
| Number | `1` |
| Episode title | optional |
| Duration (seconds) | length of the video, e.g. 24 min = `1440`. Needed for progress/resume. |
| Has subtitles (SUB) | ✔ |
| Has dub (DUB) | ✔ only if you made DUB files |

**Intro & outro markers** (optional — leave empty if unsure)
Watch the video and note the seconds where the opening song starts/ends:
intro start `85`, intro end `175`, outro start `1290`, outro end `1380`.
The **Skip intro/outro** buttons only appear if you fill both boxes of a pair.

**Media sources — Source 1 (the SUB version)**
| Field | Value |
|---|---|
| Label | `Server 1` |
| Provider | **Google Drive** |
| SUB or DUB | **SUB — original audio** (Lang becomes `ja`, label `Japanese`) |
| Default | ● selected |

Quality files (click **+ Add quality** for each extra row):
| Quality | Paste |
|---|---|
| 1080p | link of `ep01-sub-1080p.mp4` |
| 720p | link of `ep01-sub-720p.mp4` — select **Start here** on this one |
| 480p | link of `ep01-sub-480p.mp4` |

"Start here" = the quality that plays first (720p is a good balance).

**Media sources — Source 2 (the DUB version, only if you have one)**
Click **+ Add source**, then:
| Field | Value |
|---|---|
| Label | `Server 1` |
| Provider | **Google Drive** |
| SUB or DUB | **DUB — dubbed audio** (Lang becomes `en`, label `English Dub`) |
| Quality 720p | link of `ep01-dub-720p.mp4` |

**Subtitles** — click **+ Add subtitle track** for each language:
| Lang | Label | Format | File | Default |
|---|---|---|---|---|
| `en` | `English` | SRT (or VTT) | link of `ep01-en.srt` | ● |
| `bn` | `Bangla` | SRT (or VTT) | link of `ep01-bn.srt` | |

**Right column**
- Thumbnail: a 16:9 picture from the episode (optional)
- Publishing → Status: **Published**
- The **Checklist** box should show green ticks.

Click **Create episode**.

---

## Part 8 — Test it

1. Open `http://localhost:3000/anime/<your-anime-slug>` (or find it via the search
   box) → **Watch Episode 1**.
2. Press play and check:
   - [ ] Video plays
   - [ ] Dragging the timeline jumps instantly
   - [ ] ⚙ → Quality → 480p: the picture changes, the time stays the same
   - [ ] ⚙ → Audio → English Dub: the voice language changes, the time stays
   - [ ] CC button / ⚙ → Subtitles → English / Bangla / Off all work
   - [ ] ⚙ → Subtitle style: size and colour change
   - [ ] Skip intro appears during the intro (if you set markers)

### If something fails

| What you see | Cause | Fix |
|---|---|---|
| "No working source for this episode", or 404 | File not shared with the robot account, or wrong link | Part 5 again; re-copy the link |
| "provider is not configured" (503) | Drive key not loaded | Ask Claude to check; `docker compose logs backend` |
| 403 / "denied access" | Drive's daily download limit for that file, or Drive API off | Wait a few hours; see docs/GOOGLE_DRIVE.md |
| Plays, but seeking is slow | File encoded without `faststart` | Re-encode with `-movflags +faststart` / HandBrake "Web Optimized" |
| Subtitles missing | Link wrong, not shared, or not UTF-8 | Re-save as UTF-8 in Subtitle Edit, re-upload |
| No sound in DUB | Wrong audio track picked | `ffprobe`, then use the right `-map 0:a:N` |

---

## Part 9 — Before real visitors

- [ ] Admin password changed (Part 1, step 5)
- [ ] Demo anime archived: **Admin → Anime** → **Archive** on each demo title
- [ ] Your real titles added and tested end to end (Part 8)
- [ ] AdSense: when approved, paste your `ca-pub-…` ID in **Admin → Advertising**
      and the slot IDs per placement (docs/ADS.md)
- [ ] Domain + HTTPS for public launch (docs/DEPLOYMENT.md)

Keep in mind Google Drive has daily download limits per file. It is fine for
launch and a small audience; for heavy traffic move to a CDN later — the site is
built so that is a settings change, not a rebuild (docs/GOOGLE_DRIVE.md).
