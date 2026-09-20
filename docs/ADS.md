# Advertising

Two independent systems: AdSense display slots around the site, and IMA
in-stream video ads inside the player. Both are off until you supply your own
identifiers.

---

## The thing to know first

**A standard Google AdSense display account does not grant in-stream video
advertising.**

This is worth stating plainly because it is a common and expensive assumption.
Pre-roll, mid-roll and post-roll ads inside a video player are served against
*video ad units*, which are a Google Ad Manager product. AdSense alone will not
fill them.

| You want | You need |
|---|---|
| Banner / rectangle ads around the site | **Google AdSense** — a publisher ID and per-unit slot IDs |
| Pre / mid / post-roll inside the player | **Google Ad Manager** — a video ad unit and a VAST or VMAP tag, plus publisher eligibility |

The IMA integration in this project is complete and working. What it needs from
you is a tag URL. If you only have AdSense, the display slots will work and the
video slot will stay empty — not because the integration is broken, but because
there is no inventory to serve.

Neither system's approval is something this software can guarantee. Approval
depends on your content, traffic and compliance with Google's policies.

---

## Display ads (AdSense)

### Getting your identifiers

1. Sign up at [adsense.google.com](https://adsense.google.com) and add your site.
2. Once approved, find your **publisher ID** under **Account → Settings**. It
   looks like `ca-pub-0000000000000000`.
3. Create an ad unit per placement under **Ads → By ad unit → Display ads**.
   Each gives you a **slot ID** — a numeric string.

### Configuring them

**Admin → Advertising**.

1. Paste the publisher ID into the field at the top and press **Apply to all
   display slots**.
2. For each placement you want live, paste its slot ID and tick **Enabled**.

A placement that is enabled but missing a slot ID is flagged in the UI and
renders nothing — better an empty gap than a broken unit.

### Available placements

| Key | Where |
|---|---|
| `home_below_hero` | Under the homepage slider |
| `home_in_feed` | Between homepage rails |
| `home_between_grids` | Between catalogue grids |
| `home_footer` | Bottom of the homepage |
| `browse_top` | Above browse results |
| `browse_in_grid` | Within the results grid |
| `anime_detail_top` | On the anime page |
| `anime_detail_episodes` | Between episode sections |
| `watch_above_player` | Above the player |
| `watch_below_player` | Below the player |
| `watch_sidebar` | Watch page sidebar, large screens |
| `watch_below_comments` | Under the comments |
| `community_list` | In the community board |
| `search_results` | On search results |

### How slots behave

Each slot reserves its height before the ad loads, so a slow or blocked ad never
shifts the page. Every unit is labelled "Advertisement". Nothing is styled to
resemble a button, a play control or site navigation.

In development an unconfigured slot shows a labelled placeholder so you can
check layout. In production it renders nothing at all.

### Policy notes

Google's programme policies prohibit, among other things, clicking your own ads,
encouraging clicks, and placing ads so they can be mistaken for content or
controls. This implementation is built to stay on the right side of that — do
not undo it by restyling slots to blend into the UI.

---

## In-stream video ads (IMA)

### Getting a tag

1. Open [Google Ad Manager](https://admanager.google.com).
2. **Inventory → Ad units** → create a unit with the **Video** environment.
3. **Inventory → Video → Generate tag**, choose VAST or VMAP, and copy the URL.

It will look something like:

```
https://pubads.g.doubleclick.net/gampad/ads?iu=/NETWORK/UNIT&sz=640x480&...&output=vast
```

### Configuring it

**Admin → Advertising → In-stream video ads**:

1. Paste the tag URL.
2. Tick **Enable in-stream video advertising**.
3. Choose which breaks to serve: pre-roll, mid-roll, post-roll.
4. Set mid-roll cue points — explicit seconds such as `300, 900`, or leave the
   list empty to use the fallback interval.
5. Set a frequency cap (impressions per hour per browser). `0` disables the cap.

### Development testing

There is a **Use Google's sample tag** button. It fills in Google's documented
sample VAST tag, which serves a test creative so you can exercise the whole flow
without Ad Manager.

**Never leave it in a production configuration.** It serves test creatives, earns
nothing, and is not intended for live traffic. The production checklist in the
README calls this out for the same reason.

### Failure behaviour

An advert must never be able to stop someone watching. Every failure path
resolves to content:

| Failure | What happens |
|---|---|
| Ad blocker blocks the IMA SDK | Content plays immediately |
| Tag returns no ad | Content plays immediately |
| Tag does not respond | 8-second timeout, then content plays |
| Ad errors during playback | Content resumes from where it paused |
| SDK throws unexpectedly | Content resumes |

### Behaviour details

- The pre-roll is requested inside the user's click on the play button. Outside
  a user gesture, browsers block the ad's own playback attempt.
- Each mid-roll cue point fires at most once per episode.
- Seeking past a cue point skips that break rather than triggering it late.
- While an ad plays, the player's own controls are hidden — you cannot seek past
  an advert, which is what the ad server expects.
- A skip button appears only when the creative declares a skip offset, and only
  once that offset has elapsed. A non-skippable ad shows a countdown instead.

---

## Adsterra popunder (no visible advertising)

This is the one format that shows **nothing** on the site. No banner, no widget,
no reserved space. The script arms itself on the page and, on a qualifying
click, opens the advert in its own window — AniZora stays open and usable.

Popunder was chosen over Adsterra's other formats for exactly that reason:
Social Bar and Native Banner both render visible units, and Direct Link needs a
link or button of your own to point at the advert. Nothing here hijacks a link,
rewrites a click or redirects the page; the vendor script owns that behaviour,
which is what keeps this a supported integration rather than a home-made
redirect.

### Getting your script URL

1. Sign in at <https://publishers.adsterra.com/>.
2. **Websites → Add website**, enter your domain and wait for approval.
3. **Websites → your site → Add ad unit → Popunder**.
4. Adsterra gives you a snippet like
   `<script type='text/javascript' src='//your-subdomain.example/xxxxxxxx/invoke.js'></script>`.
   Copy **only the `src` value**, keeping the leading `//`.

### Configuring it

```env
NEXT_PUBLIC_ADSTERRA_ENABLED=true
NEXT_PUBLIC_ADSTERRA_POPUNDER_SRC=//your-subdomain.example/xxxxxxxx/invoke.js
NEXT_PUBLIC_ADSTERRA_FREQUENCY_HOURS=12
```

Then rebuild the frontend, because these are compiled into the browser bundle:

```bash
docker compose up -d --build frontend
```

With `NEXT_PUBLIC_ADSTERRA_ENABLED=false` (the default) or an empty script URL,
nothing whatsoever is loaded.

### Where it is deliberately not armed

| Situation | Why |
|---|---|
| `/admin/*` | The dashboard must never be interrupted mid-edit |
| `/auth/*` | Sign-in, sign-up and password resets stay clean |
| Moderator / admin accounts, anywhere | Staff run the site; they never see adverts |
| Before the session is known | So a staff member is never armed by accident |
| Within `FREQUENCY_HOURS` of the last arming | One browser is not pestered repeatedly |

It also injects at most once per page load, so it cannot stack popunders or
loop. Those rules live in `frontend/src/lib/adsterra.ts` as a pure function and
are covered by unit tests in `adsterra.test.ts`; the component
(`components/ads/AdsterraPopunder.tsx`) only gathers the inputs and injects the
script. Adsterra's own dashboard has an additional frequency cap — set it there
too, since it applies across every visitor rather than per browser.

Note that popunders are blocked by most popup blockers and by many ad blockers.
That is expected: the site must keep working normally when the advert never
opens, and it does.

---

## Environment variables

Runtime configuration lives in the database and is edited in the admin panel.
The environment variables are only bootstrap defaults:

```env
NEXT_PUBLIC_ADS_ENABLED=false
NEXT_PUBLIC_ADSENSE_CLIENT_ID=
NEXT_PUBLIC_ADSENSE_TEST_MODE=true
NEXT_PUBLIC_VIDEO_ADS_ENABLED=false
NEXT_PUBLIC_IMA_VAST_TAG_URL=
NEXT_PUBLIC_ADSTERRA_ENABLED=false
NEXT_PUBLIC_ADSTERRA_POPUNDER_SRC=
NEXT_PUBLIC_ADSTERRA_FREQUENCY_HOURS=12
```

`NEXT_PUBLIC_ADSENSE_TEST_MODE=true` adds `data-adtest="on"` to display units,
which tells Google these are test requests. Set it to `false` for live traffic.

---

## Troubleshooting

**Display ads never appear.** Check that the placement is enabled *and* has a
slot ID; check the publisher ID is right; confirm the site is approved in
AdSense. New units can take hours to start filling.

**Video ads never appear.** Confirm the tag is from Ad Manager with a video ad
unit, not an AdSense display unit. Test the tag in Google's own
[VAST inspector](https://googleads.github.io/googleads-ima-html5/vsi/) first —
if it does not work there, it is a tag problem, not an integration problem.

**Ads work locally but not in production.** `NEXT_PUBLIC_*` values are compiled
into the browser bundle at build time. In Docker they are build args — rebuild
the frontend image after changing them.

**Everything is blank and the console mentions blocked requests.** An ad blocker.
This is expected and handled; content plays normally.
