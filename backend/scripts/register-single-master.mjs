/**
 * Registers a SINGLE_MASTER episode through the existing admin API, so the
 * generated renditions play through exactly the same path as MANUAL_VARIANTS.
 *
 * Idempotent: re-running finds the existing anime/episode by slug and number
 * instead of creating duplicates.
 *
 * Metadata is taken only from the Drive folder and file names. Nothing is
 * invented — no synopsis, score, genres, studio or artwork — and the anime is
 * created as DRAFT so nothing appears publicly until a human publishes it.
 *
 *   API=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/register-single-master.mjs
 */
import fs from 'node:fs';

const API = process.env.API ?? 'https://arizona-3.onrender.com/api';
const WORK = process.env.WORK_DIR;
const MASTER_ID = process.env.MASTER_ID;
const TITLE = process.env.ANIME_TITLE ?? 'DATE A LIVE';
const SLUG = process.env.ANIME_SLUG ?? 'date-a-live';
const EPISODE_NUMBER = Number(process.env.EPISODE_NUMBER ?? 1);

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
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return body;
};

// --- anime (find or create) -------------------------------------------------
const existing = await api(`/admin/anime?q=${encodeURIComponent(TITLE)}&limit=20`);
let anime = (existing.data ?? []).find((a) => a.slug === SLUG || a.titleEnglish === TITLE);
if (anime) {
  console.log(`anime exists: ${anime.titleEnglish} (${anime.id})`);
} else {
  anime = await api('/admin/anime', {
    method: 'POST',
    body: JSON.stringify({ titleEnglish: TITLE, slug: SLUG, publishStatus: 'DRAFT' }),
  });
  console.log(`created anime ${anime.titleEnglish} (${anime.id}) as DRAFT`);
}

// --- episode (find or create) -----------------------------------------------
const list = await api(`/admin/episodes?animeId=${anime.id}&limit=100`);
let episode = (list.data ?? []).find((e) => Number(e.number) === EPISODE_NUMBER);
if (episode) {
  console.log(`episode exists: #${episode.number} (${episode.id})`);
} else {
  episode = await api('/admin/episodes', {
    method: 'POST',
    body: JSON.stringify({ animeId: anime.id, number: EPISODE_NUMBER }),
  });
  console.log(`created episode #${EPISODE_NUMBER} (${episode.id})`);
}

// --- variants: native master + generated renditions -------------------------
const uploaded = JSON.parse(fs.readFileSync(`${WORK}/${MASTER_ID}.uploaded.json`, 'utf8'));
const probe = JSON.parse(fs.readFileSync(`${WORK}/${MASTER_ID}.probe.json`, 'utf8'));

const nativeQuality = probe.video.height >= 1080 ? 'Q_1080P' : probe.video.height >= 720 ? 'Q_720P' : 'Q_480P';
const variants = [
  // The master itself is the top rung — never duplicated into the cache.
  { quality: nativeQuality, driveFileIdOrUrl: MASTER_ID, isDefault: true },
  ...uploaded.map((u) => ({ quality: u.quality, driveFileIdOrUrl: u.driveFileId })),
];

const current = await api(`/admin/episodes/${episode.id}`);
const updated = await api(`/admin/episodes/${episode.id}`, {
  method: 'PUT',
  body: JSON.stringify({
    animeId: anime.id,
    number: EPISODE_NUMBER,
    title: current.title ?? undefined,
    mediaSources: [
      {
        label: 'Server 1',
        provider: 'GOOGLE_DRIVE',
        kind: 'SUB',
        // The master's audio carries no language tag, so it is not labelled
        // with one. Nothing is guessed.
        audioLanguage: 'ja',
        audioLabel: probe.audio[0]?.label ?? 'Audio 1',
        isDefault: true,
        variants,
      },
    ],
  }),
});

console.log(`registered: ${variants.map((v) => v.quality).join(', ')}`);
console.log(`episode id: ${episode.id}`);
console.log(`watch: /watch/${anime.slug}/ep-${EPISODE_NUMBER}`);
console.log(`variants persisted: ${JSON.stringify((updated.mediaSources ?? []).map((s) => (s.variants ?? []).map((v) => v.quality)))}`);
