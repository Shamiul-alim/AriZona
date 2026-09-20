# The video player

This document explains how the player works, what each control genuinely does,
and where the real limits are. It is deliberately specific about the limits,
because the difference between a control that works and one that only looks like
it works is the difference between a product and a demo.

---

## Design rule

**No control is rendered unless it can actually do its job.**

- An episode with no intro markers shows no Skip Intro button.
- A source with no dub offers no audio switch.
- An `EXTERNAL_EMBED` source hides the custom control bar entirely, because an
  iframe from another origin cannot be driven by our code.
- A source with one quality shows no quality menu.

This is why the API returns a `seekable` flag per source and why the manifest
lists real qualities rather than a fixed menu.

---

## How playback actually happens

### The problem with the obvious approach

The simplest way to play a Google Drive video is to embed
`https://drive.google.com/file/d/{id}/preview` in an iframe. That gives you a
working picture and nothing else. It is a cross-origin iframe, so your code
cannot read or set `currentTime`, cannot switch quality, cannot render your own
subtitles, cannot report progress, and cannot insert a mid-roll ad.

You could still *draw* all those buttons. They would do nothing. That is the
approach this project rejects.

### What we do instead

The backend proxies the media through a signed endpoint:

```
GET /api/media/stream/{variantId}?exp={unix}&sig={hmac}
Range: bytes=1048576-2097151
```

The proxy authenticates to Google with the operator's own credentials, calls the
documented Drive API endpoint `files.get?alt=media`, **forwards the browser's
`Range` header untouched**, and relays the response — status `206`, the
`Content-Range` header, and the bytes.

The browser therefore sees an ordinary seekable HTTP video source. Everything a
`<video>` element can normally do, it can do here: byte-accurate seeking,
buffering, progress events, playback rate, PiP, fullscreen.

Verified behaviour on the running system:

| Request | Response |
|---|---|
| `GET` with no Range | `200`, `Content-Length: 2233860`, `Accept-Ranges: bytes` |
| `Range: bytes=0-1023` | `206`, `Content-Range: bytes 0-1023/2233860` |
| `Range: bytes=1048576-1050623` | `206`, `Content-Range: bytes 1048576-1050623/2233860` |
| Tampered signature | `403` |

### What we do not do

No scraping. No `uc?export=download` confirm-token tricks. No undocumented
endpoints. No attempt to bypass any Drive access control. Files must be shared
with the configured identity through ordinary Drive permissions, or the proxy
returns a clear 404 explaining that.

---

## Quality switching

### Why each quality is a separate file

A progressive MP4 encodes one resolution. There is no mechanism to switch
resolution inside a single MP4 the way an adaptive stream can. So "1080p" and
"720p" are two different files, and the data model reflects that:

```
Episode
└── MediaSource  "Server 1", SUB, Japanese
    ├── MediaVariant  1080p → drive file A
    ├── MediaVariant  720p  → drive file B
    ├── MediaVariant  480p  → drive file C
    └── MediaVariant  360p  → drive file D
```

### What happens when you switch

1. The current `currentTime` and play/pause state are captured.
2. The `<video>` `src` is swapped to the new variant's signed URL.
3. On `loadedmetadata`, the captured position is restored.
4. If it was playing, playback resumes.

The viewer sees a brief reload and lands back at the same moment. This is real
— the position genuinely carries across — but it is **not** seamless the way
adaptive bitrate is, and it does not adapt automatically to bandwidth.

### When it *is* seamless

If the source is `HLS`, the player uses `hls.js` and switches renditions via
`hls.currentLevel` with no reload at all, and `Auto` lets the engine adapt to the
connection. Configure an HLS source and you get true ABR.

---

## Audio switching (SUB / DUB / separate dub files)

The HTML5 `audioTracks` API, which would let you switch audio inside one file,
is effectively unimplemented in Chrome and Firefox, and a progressive MP4
delivered for web playback carries a single audio track anyway. The player
therefore supports two mechanisms, and prefers the first when it is configured.

### 1. Separate audio files (preferred, seamless)

An episode can carry any number of **`AudioTrack` rows of its own** — one file
per language, independent of the video files:

```
Episode
├── MediaSource "Server 1"  → 720p.mp4, 480p.mp4, 360p.mp4   (video, muted)
└── AudioTrack  ja "Japanese (Original)"  → Japanese.m4a      ← default
    AudioTrack  en "English Dub"          → English-Dub.m4a
    AudioTrack  bn "Bangla Dub"           → Bangla-Dub.m4a
```

Each track is added in the admin episode form ("Audio Tracks"), stores a
language code, label, provider (Google Drive / direct file / object storage),
file reference, MIME type, optional codec note, a default flag and a sort order,
and is streamed through the same signed, Range-capable endpoint as video
(`/api/media/audio/:trackId`).

At playback the video element is **muted** and the chosen audio file plays in a
hidden `<audio>` element locked to it (`useExternalAudio.ts`):

- play / pause / seek / playback-rate are mirrored from video to audio;
- if the audio genuinely stalls, the video is held briefly so the two never
  separate;
- drift is measured every 500 ms — over 0.3 s it hard-resyncs, over 0.06 s it
  nudges `playbackRate` by ±3 %.

Switching language swaps **only the audio element's source**, so the video is
never touched: position, quality, subtitle, play state and volume all persist,
and there is no reload. Measured drift on the demo content is ~25 ms.

Because the two elements drive each other, the sync code is deliberately
defensive: a stall must persist for 350 ms *and* the audio must still lack
buffered data before the video is held, every handler is idempotent, and after
six holds the hook stops holding entirely and relies on drift correction. Early
versions without those rules oscillated — `waiting` → pause → `canplay` → play →
`waiting` — thousands of times a second.

### 2. Separate sources (fallback)

When an episode has no `AudioTrack` rows, audio is chosen by picking a different
**MediaSource** (`kind` SUB/DUB plus `audioLanguage`), which is the same
operation as a quality switch: capture position, swap source, restore position.
The menu says so, because that path does reload the video.

For `HLS` sources with multiple in-manifest audio renditions, `AudioTrack` rows
attached to the source describe the groups and the engine switches natively.

---

## Subtitles

### Why we render cues ourselves

The browser can display a `<track>` on its own, but the `::cue` pseudo-element is
only partially styleable and behaves differently in every engine. Cue position
and background opacity in particular cannot be controlled reliably — and those
are exactly the settings users want.

So the `<track>` is loaded in `hidden` mode. The browser still fetches and parses
the WebVTT and fires `cuechange` with the active cues; we read those cues and
paint them into our own DOM. The result is that every setting genuinely applies:

| Setting | Options |
|---|---|
| Size | 75% – 200% |
| Colour | Six presets chosen for contrast against video |
| Background | None / light / medium / heavy |
| Position | Bottom / middle / top |
| Edge | None / outline / shadow |

A `<track>` must be a direct child of `<video>`, but the rendered cues must sit
in an overlay above it. That is why the implementation is split into
`SubtitleTrack` (inside the video, invisible) and `SubtitleCues` (the overlay).

### Format handling

WebVTT is served as-is. SRT is converted to WebVTT server-side on the fly —
timestamps get periods instead of commas and the numeric cue indices are
stripped. Subtitle files are served through the same signed proxy as video, so
Drive-hosted subtitles work identically to uploaded ones.

---

## Skip intro and outro

Four optional fields per episode: `introStart`, `introEnd`, `outroStart`,
`outroEnd`, all in seconds.

- The button appears **only** while playback is inside the marked range.
- If a pair is not configured, the button never appears. The API validates that
  markers come in ordered pairs, so a half-configured marker is rejected at the
  admin form rather than producing a broken button.
- Markers are also drawn onto the seek bar so they are visible before you reach
  them.
- "Auto-skip intro" is off by default and is per-user.

---

## Progress and resume

While playing, the client sends the current position to
`POST /api/watch-history/progress` on a 15-second throttle, and flushes once more
on `pagehide` so navigating away does not lose the last few seconds.

An episode counts as finished past 90% of its duration. On completion the
platform advances the viewer's watchlist progress and awards Mana **once**, keyed
by episode ID.

Progress is only recorded for sources we actually stream. There is no attempt to
guess a position for an embed we cannot observe.

---

## Advertising

The IMA SDK is loaded lazily, only when a VAST tag is configured. Everything
about the integration is failure-tolerant, because an ad must never be able to
stop someone watching:

| Failure | Behaviour |
|---|---|
| Ad blocker blocks the SDK | Content plays immediately |
| Tag returns no ad | Content plays immediately |
| Tag does not respond | 8-second timeout, then content plays |
| Ad errors mid-roll | Content resumes |

Mid-roll cue points fire once each. Seeking past a cue point skips it rather than
triggering it late. A frequency cap limits impressions per hour per browser.

The pre-roll is requested from inside the user's click on the play button —
outside a user gesture the browser blocks the ad's own playback attempt.

See [ADS.md](ADS.md) for what you need from Google.

---

## Keyboard shortcuts

Active whenever the player is on screen and focus is not in a text field.

| Key | Action |
|---|---|
| `Space` / `K` | Play / pause |
| `←` / `→` | ∓10 seconds (`Shift` for 30) |
| `J` / `L` | ∓10 seconds |
| `↑` / `↓` | Volume |
| `M` | Mute |
| `F` | Fullscreen |
| `P` | Picture-in-picture |
| `T` | Theatre mode |
| `C` | Toggle subtitles |
| `N` | Next episode |
| `0`–`9` | Jump to that tenth of the episode |
| `Esc` | Close the settings menu |

---

## Error handling and failover

If a source errors, the player marks it failed and automatically tries the next
healthy source, preserving position. Only when every source has failed does it
show an error, and that error offers **Try again** and **Report this** — the
report carries the source, quality, position and error text automatically.

---

## Persistence

| Setting | Stored where |
|---|---|
| Volume, mute, playback rate | Browser |
| Preferred quality | Browser |
| Subtitle styling | Browser |
| Theatre mode | Browser |
| Preferred audio language | Browser **and** account |
| Preferred subtitle language | Browser **and** account |
| Autoplay next, auto-skip intro | Browser **and** account |

Signed-in users get the account copy, so those choices follow them between
devices. Guests keep the browser copy. Every storage access is wrapped in
try/catch, so private browsing or blocked storage degrades to in-memory state
rather than breaking playback.

---

## Verifying it yourself

With the demo media seeded, every claim above is checkable:

1. **Seeking** — the test pattern has a running timer burnt into the picture.
   Drag the scrub bar; the timer must match.
2. **Quality switching** — each file has its resolution burnt in. Switch quality
   mid-episode: the label changes, the position does not.
3. **Audio switching** — SUB is a 440 Hz tone, DUB is 660 Hz. The pitch changes
   audibly, and the position holds.
4. **Subtitles** — English and Bangla tracks are included; the Bangla track also
   confirms non-Latin glyph rendering.
5. **Skip markers** — intro 5–15s, outro 78–88s.
6. **Mid-roll** — a cue point is seeded at 45s.
