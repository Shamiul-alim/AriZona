/**
 * Help content, authored here rather than in the database because it documents
 * how this software behaves — it ships and versions with the code.
 *
 * Every claim below describes something the platform actually does. Where a
 * capability depends on how the operator configured a source, that is stated
 * plainly rather than promised.
 */

export interface GuideSection {
  heading: string;
  body: string[];
  list?: string[];
}

export interface Guide {
  slug: string;
  title: string;
  summary: string;
  category: 'Watching' | 'Account' | 'Community' | 'Legal';
  sections: GuideSection[];
}

export const GUIDES: Guide[] = [
  {
    slug: 'how-to-watch',
    title: 'How to watch',
    summary: 'Finding a title, starting an episode, and what the player controls do.',
    category: 'Watching',
    sections: [
      {
        heading: 'Finding something',
        body: [
          'Use the search box in the header for a quick look-up, or open Browse for the full filter set: genre, season, year, type, status, language, age rating, source and episode count. Every filter you apply is written into the page URL, so you can bookmark or share a filtered view and it will come back exactly as you left it.',
          'The A-Z list is there when you know roughly what you are after, and Random will drop you on a title at, well, random.',
        ],
      },
      {
        heading: 'Starting an episode',
        body: [
          'Open a title and press Watch, or pick an episode from the list. If you have watched part of an episode before while signed in, the play button offers to resume from where you stopped.',
        ],
      },
      {
        heading: 'Player controls',
        body: ['The control bar carries the essentials, and the gear icon opens everything else.'],
        list: [
          'Play/pause, seek, volume, mute, fullscreen and picture-in-picture',
          'Previous and next episode, with optional autoplay',
          'Quality, audio language, subtitle track and subtitle styling',
          'Playback speed from 0.25× to 2×',
          'Theatre mode for a wider layout, and lights-off to dim everything around the video',
        ],
      },
      {
        heading: 'Keyboard shortcuts',
        body: ['These work whenever the player is on screen and you are not typing in a text box.'],
        list: [
          'Space or K — play/pause',
          '← / → — back or forward 10 seconds (hold Shift for 30)',
          'J / L — back or forward 10 seconds',
          '↑ / ↓ — volume',
          'M — mute, F — fullscreen, P — picture-in-picture',
          'C — toggle subtitles, T — theatre mode, N — next episode',
          '0–9 — jump to that tenth of the episode',
        ],
      },
    ],
  },
  {
    slug: 'player-troubleshooting',
    title: 'Player troubleshooting',
    summary: 'What to try when video will not play, stutters, or the picture and sound drift apart.',
    category: 'Watching',
    sections: [
      {
        heading: 'The video will not start',
        body: [
          'Try a different server from the gear menu — most episodes have more than one, and the player will also fail over automatically if a source errors outright.',
          'If every server fails, the source is genuinely broken rather than slow. Use the Report button; it attaches the episode, the server you were on, the quality and your timestamp, which is what a moderator needs to fix it.',
        ],
      },
      {
        heading: 'It keeps buffering',
        body: [
          'Drop the quality a step in the gear menu. Playback position is preserved across the switch, so you will not lose your place.',
          'Progressive sources (a single file per quality) do not adapt to your connection on their own — if the operator has configured an adaptive stream for a title, choosing Auto will let it adjust automatically instead.',
        ],
      },
      {
        heading: 'Audio and video are out of sync',
        body: [
          'This is almost always a problem with the source file rather than your browser, so switching quality or server is worth a try. If it persists, report it as "Audio out of sync" so it can be re-encoded.',
        ],
      },
      {
        heading: 'Subtitles are late or early',
        body: [
          'Report it as "Subtitles out of sync" and include roughly where the drift starts. Subtitle files are corrected and replaced separately from the video, so this is usually a quick fix.',
        ],
      },
      {
        heading: 'Skip Intro jumps too far',
        body: [
          'Intro and outro markers are set per episode by hand, so they can be wrong. Report it as "Intro/outro markers are wrong" and mention the correct times if you noticed them.',
          'If an episode has no markers configured, the skip buttons simply do not appear — that is deliberate, rather than a button that would do nothing.',
        ],
      },
    ],
  },
  {
    slug: 'sub-vs-dub',
    title: 'SUB and DUB explained',
    summary: 'What the badges mean and how audio switching works here.',
    category: 'Watching',
    sections: [
      {
        heading: 'What the badges mean',
        body: [
          'SUB means the original audio with subtitles. DUB means the dialogue has been re-recorded in another language. The number next to each badge is how many episodes are available in that form — they are often different, because dubs are usually produced later.',
        ],
      },
      {
        heading: 'Switching between them',
        body: [
          'Open the gear menu and pick under Audio. Your position is kept, so you can switch mid-episode and carry on from the same moment.',
          'A technical note, because it explains why switching briefly reloads: a standard video file carries one audio track, so the subbed and dubbed versions are genuinely separate files. Switching audio swaps the file and restores your position rather than flipping a track inside one stream. Where the operator has configured an adaptive stream that does carry multiple audio tracks, switching is seamless.',
        ],
      },
      {
        heading: 'Remembering your choice',
        body: [
          'Your preference is stored in your browser, and on your account as well if you are signed in, so it follows you to the next episode and to other devices.',
        ],
      },
    ],
  },
  {
    slug: 'subtitles',
    title: 'Subtitle help',
    summary: 'Choosing a language and making subtitles comfortable to read.',
    category: 'Watching',
    sections: [
      {
        heading: 'Choosing a track',
        body: [
          'Open the gear menu, then Subtitles. Available languages depend on what has been uploaded for that episode. Off is always an option.',
          'The CC button on the control bar toggles subtitles on and off without opening the menu, and C does the same from the keyboard.',
        ],
      },
      {
        heading: 'Making them readable',
        body: [
          'Under Subtitle style you can change size, colour, background opacity, vertical position and edge treatment (outline or shadow).',
          'These settings are ours rather than the browser default, which is why they actually take effect consistently — browsers only let you style built-in subtitles to a limited and inconsistent degree.',
        ],
        list: [
          'Size — 75% to 200%',
          'Colour — six presets chosen for contrast against video',
          'Background — none, light, medium or heavy',
          'Position — bottom, middle or top',
          'Edge — none, outline or shadow',
        ],
      },
      {
        heading: 'They are saved',
        body: ['Your language choice and styling persist in your browser, so you only set them once.'],
      },
    ],
  },
  {
    slug: 'watchlist',
    title: 'Using your list',
    summary: 'Tracking what you are watching, planning, or have finished.',
    category: 'Account',
    sections: [
      {
        heading: 'The five states',
        body: ['Any title can sit in exactly one of these at a time.'],
        list: ['Watching', 'Completed', 'Plan to Watch', 'On Hold', 'Dropped'],
      },
      {
        heading: 'Progress updates itself',
        body: [
          'When you finish an episode while signed in, your progress for that title advances automatically, and a title you start watching is added to your list as Watching if it was not there already.',
        ],
      },
      {
        heading: 'Favourites are separate',
        body: [
          'The heart is independent of the list states, so you can favourite something you have already completed or have not started.',
        ],
      },
      {
        heading: 'Hiding what you have already added',
        body: [
          'On the Browse page, signed-in users get a "Hide titles already on my list" option — useful when you are hunting for something new.',
        ],
      },
    ],
  },
  {
    slug: 'account',
    title: 'Account help',
    summary: 'Signing in, passwords, and what is stored about you.',
    category: 'Account',
    sections: [
      {
        heading: 'Forgotten password',
        body: [
          'Request a reset link from the sign-in page. The link is valid for one hour and can be used once. Setting a new password signs out every other session on your account.',
        ],
      },
      {
        heading: 'Staying signed in',
        body: [
          'Tick "Remember me" and your session lasts considerably longer. You can end every session at once from your account settings if you think someone else has access.',
        ],
      },
      {
        heading: 'What we store',
        body: [
          'Your email, username, profile details, what you have watched and your community activity. View counting uses a one-way fingerprint rather than storing your IP address.',
        ],
      },
    ],
  },
  {
    slug: 'community-rules',
    title: 'Community rules',
    summary: 'What is expected on the board and in comments.',
    category: 'Community',
    sections: [
      {
        heading: 'The short version',
        body: ['Be someone other people want to read.'],
        list: [
          'Tag spoilers — there is a checkbox on comments, use it',
          'No harassment, slurs, or personal attacks',
          'No spam, advertising or referral links',
          'Keep discussion in the category that fits it',
          'Report rather than argue with someone who is clearly baiting',
        ],
      },
      {
        heading: 'Moderation',
        body: [
          'Moderators can remove posts and comments and suspend accounts. Removed content is retained internally so that reports about it remain meaningful, but it is no longer publicly visible.',
        ],
      },
      {
        heading: 'Mana and ranks',
        body: [
          'Mana is earned by taking part — commenting, posting, receiving upvotes, voting in polls and finishing episodes. Daily caps exist to make farming pointless. Ranks are purely cosmetic and confer no special powers.',
        ],
      },
    ],
  },
  {
    slug: 'anime-requests',
    title: 'Requesting an anime',
    summary: 'How to ask for a title and what happens next.',
    category: 'Community',
    sections: [
      {
        heading: 'Before you request',
        body: [
          'Search first — including the Japanese title, since a title may be listed under a name you did not expect. Then check the request queue so you do not duplicate something already in progress.',
        ],
      },
      {
        heading: 'What happens next',
        body: ['Every request is reviewed by hand and moves through these states.'],
        list: [
          'Pending — submitted, not yet looked at',
          'Reviewing — being assessed',
          'Approved — accepted, being prepared',
          'Available — live on the site',
          'Rejected — not something we can add, usually for rights reasons',
        ],
      },
      {
        heading: 'A caveat worth stating',
        body: [
          'Not everything can be added. Availability depends on what the operator of this site is licensed to stream, and a rejection is usually about rights rather than about the request.',
        ],
      },
    ],
  },
  {
    slug: 'report-episode',
    title: 'Reporting a broken episode',
    summary: 'How to report, and what makes a report useful.',
    category: 'Watching',
    sections: [
      {
        heading: 'Where the button is',
        body: [
          'Next to the episode navigation on the watch page, and inside the player error message if playback failed outright.',
        ],
      },
      {
        heading: 'What gets attached automatically',
        body: [
          'The episode, the server you were on, the quality you had selected and your timestamp. You do not need to write any of that out.',
        ],
      },
      {
        heading: 'What to add yourself',
        body: [
          'Anything a moderator would need to reproduce it: roughly when the problem starts, whether other servers behave the same way, and what device and browser you are on.',
        ],
      },
    ],
  },
  {
    slug: 'contact-support',
    title: 'Contacting support',
    summary: 'When to use the contact form and when there is a faster route.',
    category: 'Account',
    sections: [
      {
        heading: 'Faster routes first',
        body: [
          'A broken episode should go through the Report button, not the contact form — it carries the playback context with it. A missing title should go through the request queue. A sign-in problem is usually solved by a password reset.',
        ],
      },
      {
        heading: 'Use the form for',
        body: [
          'Advertising enquiries, account problems a reset will not fix, content notices, and anything that does not fit the routes above.',
        ],
      },
    ],
  },
  {
    slug: 'dmca',
    title: 'Content notices',
    summary: 'How rights holders can raise a concern.',
    category: 'Legal',
    sections: [
      {
        heading: 'Raising a notice',
        body: [
          'Use the contact form and select the "Content notice / DMCA" category. Include the specific URLs concerned, a description of the work, your relationship to the rights holder and contact details.',
        ],
      },
      {
        heading: 'What happens',
        body: [
          'Valid notices are acted on promptly and the material is taken down. The operator of this installation is responsible for what is published here.',
        ],
      },
    ],
  },
  {
    slug: 'privacy',
    title: 'Privacy',
    summary: 'What this platform stores and why.',
    category: 'Legal',
    sections: [
      {
        heading: 'Account data',
        body: [
          'Your email, username, profile details, your list, your watch history and your community activity. All of it exists to make features work.',
        ],
      },
      {
        heading: 'Analytics',
        body: [
          'View counts use a one-way fingerprint derived from your IP address, user agent and a server secret, kept only long enough to stop the same visitor inflating a count within a short window. The raw IP address is never stored.',
        ],
      },
      {
        heading: 'Advertising',
        body: [
          'Where the operator has enabled advertising, Google serves those ads and their own privacy policy applies to them. Ad slots are off by default until configured.',
        ],
      },
      {
        heading: 'Local storage',
        body: [
          'Player preferences — volume, quality, subtitle language and styling — are kept in your browser and never sent to us unless you are signed in, in which case audio and subtitle preferences are also stored on your account so they follow you across devices.',
        ],
      },
    ],
  },
  {
    slug: 'terms',
    title: 'Terms of use',
    summary: 'The basics of using this site.',
    category: 'Legal',
    sections: [
      {
        heading: 'Your account',
        body: [
          'You are responsible for what happens under your account and for keeping your password to yourself. Accounts that break the community rules may be suspended or removed.',
        ],
      },
      {
        heading: 'Content',
        body: [
          'Content is provided by the operator of this installation, who is responsible for holding the rights to stream it. Comments and community posts belong to the people who wrote them.',
        ],
      },
      {
        heading: 'Availability',
        body: [
          'Nothing here is guaranteed to be available at any particular time. Titles can be added or removed.',
        ],
      },
    ],
  },
];

export function findGuide(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}
