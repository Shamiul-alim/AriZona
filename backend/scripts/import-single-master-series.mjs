/**
 * Imports a processed SINGLE_MASTER series: anime -> seasons -> episodes ->
 * native + generated variants. Idempotent at every level, so a re-run after a
 * failure links to what already exists instead of duplicating it.
 *
 * Metadata comes only from the Drive folder and file names. Nothing is
 * invented, and the anime stays DRAFT until a human publishes it.
 *
 * Episode numbers run continuously across seasons (S1: 1-3, S2: 4-6) because
 * Episode has @@unique([animeId, number]) and the public watch URL is
 * /watch/:slug/ep-:number — two "episode 1"s under one anime would collide and
 * make that URL ambiguous. Seasons provide the grouping.
 */
import fs from 'node:fs';

const API = process.env.API ?? 'https://arizona-3.onrender.com/api';
const WORK = process.env.WORK_DIR;
const TITLE = 'DATE A LIVE';
const SLUG = 'date-a-live';

/** Straight from the Drive folder and file names — nothing added. */
const SERIES = [
  {
    season: 1,
    seasonTitle: 'DATE A LIVE (2013)',
    episodes: [
      { number: 1, masterId: '1R4Br0smFHavEnhxjqmFkSboc7c2uNaqL' },
      { number: 2, masterId: '17PWMySOIFdqZywAa4wh36JWMOtM-GRIW' },
      { number: 3, masterId: '16Z-FzswSzQKMtt6Zarkeng_SbFZvk9f9' },
    ],
  },
  {
    season: 2,
    seasonTitle: 'DATE A LIVE II (2014)',
    episodes: [
      { number: 4, masterId: '1doMFtuDKDZRGt1ZgSp8ZSJLryMA3_tSG' },
      { number: 5, masterId: '1aMQhcs08UFex1tUjbrdRcdXocg96u-FA' },
      { number: 6, masterId: '1N_xmLdRDuxqvkqtXiriN0nyj1okoHGYA' },
    ],
  },
];

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ identifier: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
}).then((r) => r.json());
if (!login.accessToken) throw new Error('admin login failed');
const auth = { authorization: `Bearer ${login.accessToken}`, 'content-type': 'application/json' };

const api = async (path, init = {}) => {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...auth, ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

// --- anime ------------------------------------------------------------------
const found = await api(`/admin/anime?q=${encodeURIComponent(TITLE)}&limit=20`);
let anime = (found.data ?? []).find((a) => a.slug === SLUG);
if (!anime) {
  anime = await api('/admin/anime', {
    method: 'POST',
    body: JSON.stringify({ titleEnglish: TITLE, slug: SLUG, publishStatus: 'DRAFT' }),
  });
  console.log(`created anime ${TITLE} (DRAFT)`);
} else {
  console.log(`anime exists: ${TITLE}`);
}

const existingEpisodes = (await api(`/admin/episodes?animeId=${anime.id}&limit=100`)).data ?? [];

for (const block of SERIES) {
  // Upsert on (anime, number): running this twice cannot make a second season.
  const season = await api('/admin/seasons', {
    method: 'POST',
    body: JSON.stringify({ animeId: anime.id, number: block.season, title: block.seasonTitle }),
  });
  console.log(`season ${block.season}: ${season.title} (${season.id})`);

  for (const ep of block.episodes) {
    let episode = existingEpisodes.find((e) => Number(e.number) === ep.number);
    if (!episode) {
      episode = await api('/admin/episodes', {
        method: 'POST',
        body: JSON.stringify({ animeId: anime.id, number: ep.number, seasonId: season.id }),
      });
      existingEpisodes.push(episode);
      console.log(`  created episode ${ep.number}`);
    }

    const uploaded = JSON.parse(fs.readFileSync(`${WORK}/${ep.masterId}.uploaded.json`, 'utf8'));
    const probe = JSON.parse(fs.readFileSync(`${WORK}/${ep.masterId}.probe.json`, 'utf8'));
    const nativeQuality = probe.video.height >= 1080 ? 'Q_1080P' : probe.video.height >= 720 ? 'Q_720P' : 'Q_480P';

    await api(`/admin/episodes/${episode.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        animeId: anime.id,
        number: ep.number,
        seasonId: season.id,
        mediaSources: [
          {
            label: 'Server 1',
            provider: 'GOOGLE_DRIVE',
            kind: 'SUB',
            audioLanguage: 'ja',
            // The master carries no language tag, so the label is positional.
            audioLabel: probe.audio[0]?.label ?? 'Audio 1',
            isDefault: true,
            variants: [
              { quality: nativeQuality, driveFileIdOrUrl: ep.masterId, isDefault: true },
              ...uploaded.map((u) => ({ quality: u.quality, driveFileIdOrUrl: u.driveFileId })),
            ],
          },
        ],
      }),
    });
    console.log(`  episode ${ep.number}: ${nativeQuality} + ${uploaded.map((u) => u.quality).join(' + ')} -> season ${block.season}`);
  }
}

console.log('\nimport complete (anime remains DRAFT)');
