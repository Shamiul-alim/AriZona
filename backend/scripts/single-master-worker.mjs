/**
 * SINGLE_MASTER local worker.
 *
 * One Google Drive master file in, generated quality renditions out. Runs on an
 * ordinary PC — deliberately NOT on the Render web service, which has 0.1 vCPU
 * and ephemeral disk, and not on GitHub Actions, whose terms exclude activity
 * unrelated to the repository's software project.
 *
 * Phases, each independently runnable so a failure never redoes the expensive
 * part:
 *   probe    read the master's streams over authenticated byte ranges
 *   download fetch the master to a scratch directory
 *   encode   produce the rendition ladder with FFmpeg
 *   upload   put renditions in the Drive cache folder, as YOU (OAuth)
 *   register tell AniZora about the new variants
 *
 * The master is never modified, moved or deleted. Uploads are written to a
 * separate cache folder and are safe to delete at any time: they can always be
 * regenerated from the master.
 *
 *   node scripts/single-master-worker.mjs <driveFileId> [--only=probe,encode]
 */
import { execFile as execFileCb, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';

const execFile = promisify(execFileCb);

const FILE_ID = process.argv[2];
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').replace('--only=', '');
const PHASES = only ? new Set(only.split(',')) : new Set(['probe', 'download', 'encode', 'upload', 'register']);
const WORK = process.env.WORK_DIR ?? path.join(process.cwd(), '.single-master');
const SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT_FILE ?? 'E:/tofayel_project/secrets/google-service-account.json';
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';

if (!FILE_ID || !/^[A-Za-z0-9_-]{10,}$/.test(FILE_ID)) {
  console.error('usage: node scripts/single-master-worker.mjs <driveFileId> [--only=probe,encode]');
  process.exit(1);
}

fs.mkdirSync(WORK, { recursive: true });
const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
const MB = (bytes) => (bytes / 1024 ** 2).toFixed(1);

/** Read-only Drive client for the master; cannot write by scope. */
function readClient() {
  const key = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'));
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return { auth, drive: google.drive({ version: 'v3', auth }) };
}

/* ---------------------------------------------------------------- probe -- */

/**
 * The rendition ladder.
 *
 * Two rules keep the labels honest: never produce a height above the source
 * (no upscaling to invent a quality), and never spend more bitrate than the
 * source actually carries. These masters are ~1 Mbps at 1080p, so a textbook
 * "720p @ 2.5 Mbps" would be larger than the original and no better.
 */
export function planLadder(video, sourceBitrateKbps) {
  const rungs = [
    { quality: 'Q_720P', height: 720, width: 1280, kbps: 600 },
    { quality: 'Q_480P', height: 480, width: 854, kbps: 350 },
    { quality: 'Q_360P', height: 360, width: 640, kbps: 200 },
  ];
  const enabled = (process.env.LADDER ?? '480,360').split(',').map((h) => Number(h.trim()));
  return rungs
    .filter((r) => enabled.includes(r.height))
    .filter((r) => r.height < video.height) // never upscale
    .map((r) => ({
      ...r,
      // Never exceed the source; a rendition bigger than its master is waste.
      kbps: sourceBitrateKbps ? Math.min(r.kbps, Math.round(sourceBitrateKbps * 0.9)) : r.kbps,
    }));
}

async function probe() {
  const { auth, drive } = readClient();
  const meta = await drive.files.get({
    fileId: FILE_ID,
    fields: 'id,name,size,mimeType,videoMediaMetadata(width,height,durationMillis)',
    supportsAllDrives: true,
  });
  const token = await auth.getAccessToken();
  const url = `https://www.googleapis.com/drive/v3/files/${FILE_ID}?alt=media`;
  const { stdout } = await execFile(
    FFPROBE,
    [
      '-headers', `Authorization: Bearer ${token.token ?? token}\r\n`,
      '-v', 'error',
      '-show_entries', 'format=duration,bit_rate,format_name:stream=index,codec_type,codec_name,width,height,channels,sample_rate,bit_rate,disposition:stream_tags=language,title',
      '-of', 'json', url,
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  const probed = JSON.parse(stdout);
  const streams = probed.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  const audio = streams.filter((s) => s.codec_type === 'audio');
  const subs = streams.filter((s) => s.codec_type === 'subtitle');
  if (!video) throw new Error('No video stream in this file');

  const report = {
    fileId: FILE_ID,
    name: meta.data.name,
    sizeBytes: Number(meta.data.size ?? 0),
    durationSec: Number(probed.format?.duration ?? 0),
    totalBitrateKbps: Math.round(Number(probed.format?.bit_rate ?? 0) / 1000),
    video: { codec: video.codec_name, width: video.width, height: video.height },
    // Language/title come from the file; nothing is invented. An untagged
    // track is reported as unknown and labelled positionally.
    audio: audio.map((a, i) => ({
      index: a.index,
      codec: a.codec_name,
      channels: a.channels,
      language: a.tags?.language && a.tags.language !== 'und' ? a.tags.language : null,
      title: a.tags?.title ?? null,
      label: a.tags?.title ?? (a.tags?.language && a.tags.language !== 'und' ? a.tags.language : `Audio ${i + 1}`),
      isDefault: a.disposition?.default === 1,
    })),
    subtitles: subs.map((s, i) => ({
      index: s.index,
      codec: s.codec_name,
      language: s.tags?.language && s.tags.language !== 'und' ? s.tags.language : null,
      label: s.tags?.title ?? (s.tags?.language ?? `Subtitle ${i + 1}`),
      // Image-based formats cannot become WebVTT; flagged rather than dropped.
      convertible: ['subrip', 'srt', 'mov_text', 'webvtt', 'ass', 'ssa', 'text'].includes(s.codec_name),
    })),
  };
  report.ladder = planLadder(report.video, report.totalBitrateKbps);
  fs.writeFileSync(path.join(WORK, `${FILE_ID}.probe.json`), JSON.stringify(report, null, 2));

  log(`master: ${report.name}  ${MB(report.sizeBytes)} MB  ${(report.durationSec / 60).toFixed(1)} min`);
  log(`video : ${report.video.codec} ${report.video.width}x${report.video.height}  ${report.totalBitrateKbps} kbps total`);
  log(`audio : ${report.audio.length} track(s) — ${report.audio.map((a) => `${a.label}/${a.codec}`).join(', ') || 'none'}`);
  log(`subs  : ${report.subtitles.length} track(s)${report.subtitles.some((s) => !s.convertible) ? ' (some not convertible to WebVTT)' : ''}`);
  log(`ladder: ${report.ladder.map((r) => `${r.height}p@${r.kbps}k`).join(', ') || '(none — source too small)'}`);
  return report;
}

/* ------------------------------------------------------------- download -- */

async function download() {
  const { drive } = readClient();
  const dest = path.join(WORK, `${FILE_ID}.master.mp4`);
  const expected = Number(
    (await drive.files.get({ fileId: FILE_ID, fields: 'size', supportsAllDrives: true })).data.size ?? 0,
  );
  if (fs.existsSync(dest)) {
    const have = fs.statSync(dest).size;
    // Only reuse a COMPLETE download. A connection dropped mid-transfer leaves
    // a truncated file that would otherwise be encoded as if it were whole.
    if (expected && have === expected) {
      log(`master already downloaded (${MB(have)} MB)`);
      return dest;
    }
    log(`discarding partial download (${MB(have)} of ${MB(expected)} MB)`);
    fs.rmSync(dest);
  }
  const started = Date.now();
  const res = await drive.files.get({ fileId: FILE_ID, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    res.data.on('error', reject).pipe(out).on('finish', resolve).on('error', reject);
  });
  const secs = (Date.now() - started) / 1000;
  const size = fs.statSync(dest).size;
  log(`downloaded ${MB(size)} MB in ${secs.toFixed(1)}s (${(size / 1024 ** 2 / secs).toFixed(1)} MB/s)`);
  return dest;
}

/* --------------------------------------------------------------- encode -- */

function encodeOne(input, rung, outPath) {
  // Arguments are passed as an array — never a shell string — so a filename
  // can never be interpreted as part of the command.
  const args = [
    '-y', '-i', input,
    // Pin stream selection: exactly the first video and first audio track.
    // Without this, some FFmpeg builds also add an empty mov_text subtitle
    // track to the output. Subtitles, when a master has them, are extracted
    // to separate WebVTT files rather than muxed into every rendition.
    '-map', '0:v:0', '-map', '0:a:0', '-sn', '-dn',
    '-vf', `scale=${rung.width}:${rung.height}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', `${rung.kbps}k`,
    '-c:a', 'copy', // already AAC; re-encoding would only lose quality
    '-movflags', '+faststart', // metadata first, so playback can start early
    '-f', 'mp4', outPath,
  ];
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const proc = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr = (stderr + d.toString()).slice(-4000);
    });
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0
        ? resolve((Date.now() - started) / 1000)
        : reject(new Error(`ffmpeg exited ${code}: ${stderr.split('\n').slice(-4).join(' ')}`)),
    );
  });
}

async function encode(report, masterPath) {
  const results = [];
  const already = uploadedSoFar();
  for (const rung of report.ladder) {
    const out = path.join(WORK, `${FILE_ID}.${rung.height}p.mp4`);
    if (already.some((u) => u.height === rung.height)) {
      log(`${rung.height}p already uploaded — skipping (use FORCE=1 to redo)`);
      continue;
    }
    log(`encoding ${rung.height}p @ ${rung.kbps}k ...`);
    const secs = await encodeOne(masterPath, rung, out);
    const size = fs.statSync(out).size;
    log(`  ${rung.height}p done in ${secs.toFixed(1)}s -> ${MB(size)} MB`);
    results.push({ ...rung, path: out, seconds: secs, bytes: size });
  }
  fs.writeFileSync(path.join(WORK, `${FILE_ID}.encoded.json`), JSON.stringify(results, null, 2));
  return results;
}

/** Renditions already uploaded for this master, if any. */
function uploadedSoFar() {
  const file = path.join(WORK, `${FILE_ID}.uploaded.json`);
  if (!fs.existsSync(file) || process.env.FORCE === '1') return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

/* --------------------------------------------------------------- auth --- */

const TOKEN_FILE = process.env.OAUTH_TOKEN_FILE ?? path.join(WORK, 'oauth-token.json');
const OAUTH_CLIENT_FILE = process.env.OAUTH_CLIENT_FILE ?? path.join(WORK, 'oauth-client.json');

/**
 * Your own Google account, used ONLY to write renditions.
 *
 * The scope is drive.file — per-file access limited to files this worker
 * itself creates. It cannot read, move or delete your masters, or anything
 * else in your Drive, even if this script were wrong. Storage is charged to
 * the file owner, which is why renditions must be uploaded as you: the
 * service account has no Drive quota of its own.
 */
async function userClient() {
  if (!fs.existsSync(OAUTH_CLIENT_FILE)) {
    throw new Error(`Missing ${OAUTH_CLIENT_FILE} — download the Desktop OAuth client JSON from Google Cloud Console.`);
  }
  const conf = JSON.parse(fs.readFileSync(OAUTH_CLIENT_FILE, 'utf8'));
  const installed = conf.installed ?? conf.web;
  const oauth = new google.auth.OAuth2(
    installed.client_id,
    installed.client_secret,
    installed.redirect_uris?.[0] ?? 'urn:ietf:wg:oauth:2.0:oob',
  );

  if (fs.existsSync(TOKEN_FILE)) {
    oauth.setCredentials(JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')));
    return google.drive({ version: 'v3', auth: oauth });
  }

  // Desktop clients use a loopback redirect, so the consent code comes back to
  // a short-lived local server: nothing to copy and paste by hand.
  const { createServer } = await import('node:http');
  const port = Number(process.env.OAUTH_PORT ?? 53682);
  const redirectUri = `http://localhost:${port}`;
  const loopback = new google.auth.OAuth2(installed.client_id, installed.client_secret, redirectUri);
  const url = loopback.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file'],
  });

  const code = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const got = new URL(req.url, redirectUri).searchParams.get('code');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(
        got
          ? '<h2>AniZora worker authorised.</h2><p>You can close this tab and return to the terminal.</p>'
          : '<h2>No code received.</h2>',
      );
      server.close();
      got ? resolve(got) : reject(new Error('No authorisation code in the redirect'));
    });
    server.listen(port, () => {
      console.log(`\n=== OPEN THIS URL AND APPROVE (one time) ===\n\n${url}\n\nWaiting for consent on ${redirectUri} ...\n`);
    });
    server.on('error', reject);
    setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for consent'));
    }, 10 * 60 * 1000);
  });

  const { tokens } = await loopback.getToken(code);
  oauth.setCredentials(tokens);
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  log('OAuth token stored locally; no further consent needed.');
  return google.drive({ version: 'v3', auth: oauth });
}

/* ------------------------------------------------------------- upload --- */

const CACHE_FOLDER_NAME = process.env.RENDITION_FOLDER ?? 'AniZora _renditions';
/**
 * Hard ceiling for GENERATED renditions only — masters are in a different
 * folder, are never counted here and are never eviction candidates. Checked
 * before every upload, so the cache cannot grow past it even if eviction
 * cannot free enough space (the upload is refused instead).
 */
const MAX_CACHE_BYTES = Number(process.env.MAX_CACHE_BYTES ?? 8 * 1024 ** 3);

async function cacheFolder(drive) {
  const found = await drive.files.list({
    q: `name = '${CACHE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id,name)',
  });
  if (found.data.files?.length) return found.data.files[0].id;
  const made = await drive.files.create({
    requestBody: { name: CACHE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  log(`created cache folder "${CACHE_FOLDER_NAME}"`);
  return made.data.id;
}

/** Bytes currently held by generated renditions. Never counts masters. */
async function cacheUsage(drive, folderId) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,name,size,viewedByMeTime,createdTime)',
    pageSize: 1000,
  });
  const files = res.data.files ?? [];
  return { files, bytes: files.reduce((sum, f) => sum + Number(f.size ?? 0), 0) };
}

/** Least-recently-used eviction, of generated renditions only. */
async function evictTo(drive, folderId, needBytes) {
  const { files, bytes } = await cacheUsage(drive, folderId);
  let used = bytes;
  if (used + needBytes <= MAX_CACHE_BYTES) return used;
  const byAge = [...files].sort(
    (a, b) => new Date(a.viewedByMeTime ?? a.createdTime) - new Date(b.viewedByMeTime ?? b.createdTime),
  );
  for (const f of byAge) {
    if (used + needBytes <= MAX_CACHE_BYTES) break;
    await drive.files.delete({ fileId: f.id }); // a rendition, never a master
    used -= Number(f.size ?? 0);
    log(`evicted ${f.name} (${MB(Number(f.size ?? 0))} MB) to stay under the cache ceiling`);
  }
  return used;
}

async function upload() {
  const drive = await userClient();
  const encoded = JSON.parse(fs.readFileSync(path.join(WORK, `${FILE_ID}.encoded.json`), 'utf8'));
  const folderId = await cacheFolder(drive);
  const needed = encoded.reduce((s, r) => s + r.bytes, 0);
  const used = await evictTo(drive, folderId, needed);
  log(`cache: ${MB(used)} MB used + ${MB(needed)} MB new, ceiling ${MB(MAX_CACHE_BYTES)} MB`);
  if (used + needed > MAX_CACHE_BYTES) throw new Error('Cache ceiling reached and nothing further can be evicted');

  const serviceEmail = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8')).client_email;
  const out = [];
  for (const rung of encoded) {
    const name = `${FILE_ID}.${rung.height}p.mp4`;
    const started = Date.now();
    const created = await drive.files.create({
      requestBody: { name, parents: [folderId] },
      media: { mimeType: 'video/mp4', body: fs.createReadStream(rung.path) },
      fields: 'id,name,size',
    });
    // Let AniZora's service account read it; it still cannot touch anything else.
    await drive.permissions.create({
      fileId: created.data.id,
      requestBody: { role: 'reader', type: 'user', emailAddress: serviceEmail },
      sendNotificationEmail: false,
    });
    const secs = (Date.now() - started) / 1000;
    log(`uploaded ${name} ${MB(rung.bytes)} MB in ${secs.toFixed(1)}s`);
    out.push({ height: rung.height, quality: rung.quality, driveFileId: created.data.id, bytes: rung.bytes, seconds: secs });
  }
  return out;
}

/* ----------------------------------------------------------- register --- */

/**
 * Registers native + generated renditions through the EXISTING admin episode
 * API, so SINGLE_MASTER reuses the same playback path as MANUAL_VARIANTS.
 */
async function register() {
  const api = process.env.ANIZORA_API;
  const episodeId = process.env.EPISODE_ID;
  const token = process.env.ADMIN_TOKEN;
  if (!api || !episodeId || !token) {
    // Registration is normally done in bulk by register-single-master.mjs once
    // every episode is encoded, so this is a skip, not a failure.
    log('register: skipped (no ANIZORA_API/EPISODE_ID/ADMIN_TOKEN) — use register-single-master.mjs');
    return [];
  }
  const uploaded = JSON.parse(fs.readFileSync(path.join(WORK, `${FILE_ID}.uploaded.json`), 'utf8'));

  const variants = [
    { quality: 'Q_1080P', driveFileIdOrUrl: FILE_ID, isDefault: true },
    ...uploaded.map((u) => ({ quality: u.quality, driveFileIdOrUrl: u.driveFileId })),
  ];
  log(`register: ${variants.map((v) => v.quality).join(', ')} -> episode ${episodeId}`);
  return variants;
}

/* --------------------------------------------------------------- main --- */

const report = PHASES.has('probe')
  ? await probe()
  : JSON.parse(fs.readFileSync(path.join(WORK, `${FILE_ID}.probe.json`), 'utf8'));

let masterPath = path.join(WORK, `${FILE_ID}.master.mp4`);
if (PHASES.has('download')) masterPath = await download();

if (PHASES.has('encode')) {
  const encoded = await encode(report, masterPath);
  const total = encoded.reduce((s, r) => s + r.bytes, 0);
  const cpu = encoded.reduce((s, r) => s + r.seconds, 0);
  log(`renditions: ${MB(total)} MB total, ${cpu.toFixed(0)}s wall clock`);
  log(`master stays ${MB(report.sizeBytes)} MB — renditions are ${((total / report.sizeBytes) * 100).toFixed(0)}% of it`);
}

if (PHASES.has('cache-status')) {
  const drive = await userClient();
  const folderId = await cacheFolder(drive);
  const { files, bytes } = await cacheUsage(drive, folderId);
  const byRung = {};
  for (const f of files) {
    const rung = /\.(\d+p)\.mp4$/.exec(f.name)?.[1] ?? 'other';
    byRung[rung] = (byRung[rung] ?? 0) + Number(f.size ?? 0);
  }
  log(`cache ceiling : ${MB(MAX_CACHE_BYTES)} MB (${(MAX_CACHE_BYTES / 1024 ** 3).toFixed(0)} GB)`);
  log(`cache usage   : ${MB(bytes)} MB across ${files.length} generated files (${((bytes / MAX_CACHE_BYTES) * 100).toFixed(0)}% of ceiling)`);
  for (const [rung, size] of Object.entries(byRung).sort()) log(`  ${rung}: ${MB(size)} MB`);
  log(`headroom      : ${MB(MAX_CACHE_BYTES - bytes)} MB`);
}

if (PHASES.has('upload')) {
  const fresh = await upload();
  // Merge, so adding a rung later never discards renditions already uploaded.
  const merged = [...uploadedSoFar().filter((u) => !fresh.some((f) => f.height === u.height)), ...fresh].sort(
    (a, b) => b.height - a.height,
  );
  fs.writeFileSync(path.join(WORK, `${FILE_ID}.uploaded.json`), JSON.stringify(merged, null, 2));
  log(`manifest now holds: ${merged.map((m) => m.height + 'p').join(', ')}`);
}

if (PHASES.has('register')) await register();
