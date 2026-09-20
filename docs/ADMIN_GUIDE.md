# Admin guide

Everything you need to run the site without touching code.

Sign in at `/auth/login`, then open `/admin`.

---

## Roles

| Role | Can do |
|---|---|
| `USER` | Nothing in the admin |
| `MODERATOR` | Reports, and removing comments and posts |
| `ADMIN` | Everything except changing roles |
| `SUPER_ADMIN` | Everything, including roles |

You can never grant a role at or above your own, and you can never change your
own role or status. That is deliberate — it makes lockout and self-escalation
impossible.

---

## Adding an anime

**Admin → Anime → New anime.**

### Required

- **English title** — everything else can wait.

### Worth filling in

| Field | Notes |
|---|---|
| Japanese title | Also searchable |
| URL slug | Leave blank to generate one. **Changing it later breaks existing links.** |
| Synopsis | Shown on the detail page and used as the fallback meta description |
| Type, Status | Drive filtering and the badges on cards |
| Season + Release year | Drive the season filter |
| Duration | Average minutes per episode |
| Total episodes | Leave blank and published episodes are counted automatically |
| Studio, Producers | Become browsable links |
| Genres | Drive filtering, genre pages **and the recommendation engine** — worth getting right |
| Age rating, Source | Filterable |

### Artwork

- **Poster** — portrait, roughly 2:3. Shown on every card. 400×600 or larger.
- **Banner** — wide backdrop for the hero and detail page. 1600×600 or larger.

Drag and drop onto the upload box, or paste a URL. Accepted: JPEG, PNG, WebP,
AVIF, up to 15 MB. The file's actual content is checked, not just its extension.

### Publishing

**Draft** is invisible to everyone but you. **Published** is live. **Archived**
is hidden but recoverable.

Tick **Feature on the homepage** to add it to the hero slider.

---

## Adding an episode

**Admin → Episodes → New episode**, or **Episodes** from an anime's row.

### Details

Pick the anime and set the number — decimals such as `7.5` are valid for recaps
and specials. Add a title, description and thumbnail (16:9).

Set **Duration** in seconds. The player uses it, and the completion threshold
(90%) depends on it.

Tick **Has subtitles** / **Has dub** to match what you are actually configuring.
These drive the SUB/DUB badges and counts.

### Intro and outro markers

Four optional numbers, in seconds from the start:

| Field | Example |
|---|---|
| Intro start | `85` |
| Intro end | `175` |
| Outro start | `1290` |
| Outro end | `1380` |

The Skip Intro button appears only while playback is inside the marked range. If
you leave a pair blank, no button appears — the player never shows a control
that would do nothing. The form rejects a half-configured pair for that reason.

Markers are also drawn on the seek bar.

### Media sources — the important part

**One source is one server *and* one audio flavour.**

This is not an arbitrary rule. A normal video file carries a single audio track,
so the subbed version and the dubbed version are genuinely two different files.
Modelling them as two sources is what makes the audio switch in the player
actually work.

**Source 1 — subtitled**

| Field | Value |
|---|---|
| Label | `Server 1` |
| Provider | Google Drive |
| SUB or DUB | SUB |
| Lang | `ja` |
| Audio label | `Japanese` |

Then add one **quality file** row per resolution, pasting the Drive share link
(or bare file ID) for each. Each quality is a separate file, which is what makes
quality switching work.

**Source 2 — dubbed**

The same, with SUB/DUB set to DUB, lang `en`, audio label `English Dub`, and its
own quality files.

**Providers**

| Provider | Use for |
|---|---|
| Google Drive | Files in Drive, shared with the service account |
| Direct file / URL | A file on an HTTP origin, or one you uploaded |
| Object storage | S3, R2, Bunny and similar |
| HLS stream | An `.m3u8` master playlist — the only option with true adaptive quality and seamless audio switching |
| External embed | A last resort. Our player cannot control an embed, so its controls are hidden rather than shown non-functional. |

### Subtitles

Add one row per language: a tag (`en`, `bn`), a display label, the format, and
either a URL or a Drive link. SRT is converted to WebVTT automatically. Mark one
as default.

### Downloads

Only add links you are authorised to distribute. When the list is empty, the
download control does not appear at all.

### Checklist

The sidebar shows a live checklist — anime selected, a playable source, a
subtitle track, intro markers, duration, published. Use it as a pre-flight.

---

## Replacing a broken source

1. **Admin → Episodes**, find the episode (rows with no source are flagged).
2. **Edit** → replace the file ID or URL on the affected quality row.
3. Save.

To take a server out of service without deleting it, add a replacement source
and set the new one as **Default**. The player also fails over automatically to
the next healthy source if one errors during playback.

---

## Reports

**Admin → Reports**, defaulting to Pending.

Each report carries the episode, the server, the quality and the viewer's
timestamp automatically, so you can reproduce the fault rather than guess.

Press **Handle**, optionally add a note, then:

- **Investigating** — you are working on it
- **Resolved** — fixed
- **Reject** — not a real problem

---

## Anime requests

**Admin → Anime Requests.**

Move a request through Pending → Reviewing → Approved → Available, or Reject it.
Notes are visible to you, not the requester.

Marking one **Available** awards the requester Mana, once. Requests for titles
already on the site are rejected automatically at submission.

---

## Users

**Admin → Users.**

Search by username, email or display name; filter by role and status.

- **Suspend** — temporary; sessions are revoked immediately
- **Ban** — permanent, with a reason shown to the user; sessions revoked
- **Reactivate** — restores access
- **Mana** — manual adjustment, positive or negative, with a reason that is
  recorded in the audit trail
- **Role** — SUPER_ADMIN only

---

## Advertising

**Admin → Advertising.** Full detail in [ADS.md](ADS.md).

1. Paste your AdSense publisher ID and press **Apply to all display slots**.
2. Enable the placements you want and give each its slot ID.
3. For in-stream video, paste a **Google Ad Manager** VAST tag and choose which
   breaks to serve.

A standard AdSense account does not grant in-stream video inventory — that needs
Ad Manager. The sample tag button is for development only.

---

## Mana and ranks

**Admin → Mana & Ranks.**

Set the amount per event and a daily cap. Amount `0` disables an event; cap `0`
means unlimited. The caps are what make farming pointless, so lower them rather
than removing events if abuse appears.

Ranks are cosmetic and confer no permissions. Members are promoted automatically
when their Mana crosses a threshold. The starting rank (0 Mana) cannot be
deleted; deleting any other drops its members to the rank below.

---

## Homepage slider

**Admin → Homepage Slider.**

Search for a title to add it. Set a headline, a tagline and a button label, and
reorder with the arrows. Three to five entries reads best. An empty slider hides
the hero entirely.

---

## Genres, studios and producers

**Admin → Genres & Studios.**

Genres drive filtering, genre pages and recommendations. A genre still assigned
to a title cannot be deleted — remove it from those titles first. Deleting a
studio clears the reference on its titles rather than deleting them.

---

## Site settings

**Admin → Site Settings.**

Site name and tagline, default title language, player defaults, and feature
toggles for the community, comments, requests and downloads. Public settings are
readable by the browser; the rest stay server-side.

---

## Support inbox

**Admin → Support Inbox.** Messages from the contact form. Reply by email, then
mark Open, Resolved or Closed. Internal notes are not visible to the sender.

---

## Audit log

**Admin → Audit Log.** A record of sensitive administrative operations — who did
what, when.

---

## Routine checks

**Daily** — pending reports, new support messages.

**Weekly** — anime requests, new users, episodes flagged as having no source.

**Monthly** — check the dashboard view chart for anything odd, verify backups
restore, and review the Mana economy if the leaderboard looks distorted.

---

## First-day checklist

- [ ] Change the admin password
- [ ] Set the site name and tagline
- [ ] Archive or delete the demo catalogue
- [ ] Add your real genres and studios
- [ ] Add your first title and episode, and **watch it end to end** — seek,
      switch quality, switch audio, toggle subtitles
- [ ] Configure advertising if you are using it
- [ ] Confirm password-reset email actually arrives
- [ ] Take a database backup and confirm it restores
