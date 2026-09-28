/**
 * The SINGLE_MASTER local worker.
 *
 *   npm run media:worker
 *
 * It asks the API for sources that have a master but no renditions, claims one,
 * and builds everything the master implies: the quality ladder, one playable
 * file per embedded audio stream, and a WebVTT file per embedded text subtitle.
 * Then it registers the lot and marks the job ready.
 *
 * Why a worker at all: transcoding is the one part of AniZora that cannot run on
 * free hosting. It runs here, on the operator's own machine, and the results are
 * cached in Drive. Nothing in this file costs money.
 *
 * It is safe to stop with Ctrl+C and start again later. Work already finished is
 * detected from what the API reports and skipped, so a restart resumes rather
 * than redoing — and a job left claimed by a killed worker returns to the queue
 * on its own.
 *
 * Nothing secret is ever printed: not the access token, not the refresh token,
 * not the service-account key.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { google } from 'googleapis';
import {
  canServeMasterDirectly,
  planLadder,
  summariseMaster,
  type MasterSummary,
  type ProbeResult,
} from '../src/modules/media/probe';

// --- configuration ----------------------------------------------------------

const API = process.env.API ?? 'https://arizona-3.onrender.com/api';
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE ?? 'ffprobe';
const WORK_DIR = process.env.WORK_DIR ?? path.join(os.tmpdir(), 'anizora-media');
const CACHE_FOLDER_NAME = process.env.RENDITION_FOLDER ?? 'AniZora _renditions';
const MAX_CACHE_BYTES = Number(process.env.MAX_CACHE_BYTES ?? 8 * 1024 ** 3);
const POLL_SECONDS = Number(process.env.POLL_SECONDS ?? 30);
const ONCE = process.argv.includes('--once');

const MB = (n: number) => (n / 1024 ** 2).toFixed(1);
const log = (msg: string) => console.log(msg);
/** Fixed-width step line, so a run reads like a checklist. */
const step = (name: string, result: string) => console.log(`  ${name.padEnd(18, '.')} ${result}`);

let stopping = false;
process.on('SIGINT', () => {
  if (stopping) process.exit(130);
  stopping = true;
  log('\nFinishing the current step, then stopping. Press Ctrl+C again to quit now.');
});

// --- API --------------------------------------------------------------------

let accessToken = '';

async function api<T>(pathname: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${pathname}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    // Never echo the request headers — they carry the bearer token.
    throw new Error(`${init.method ?? 'GET'} ${pathname} -> ${res.status} ${text.slice(0, 300)}`);
  }
  return text ? (JSON.parse(text) as T) : (null as T);
}

async function signIn(): Promise<void> {
  const identifier = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!identifier || !password) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment before running the worker.');
  }
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) throw new Error(`Sign-in failed with ${res.status}`);
  const body = (await res.json()) as { accessToken?: string; user?: { role?: string } };
  if (!body.accessToken) throw new Error('Sign-in returned no access token');
  accessToken = body.accessToken;
  log(`Signed in as ${body.user?.role ?? 'unknown role'}.`);
}

// --- ffmpeg -----------------------------------------------------------------

function run(bin: string, args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let tail = '';
    child.stderr.on('data', (chunk: Buffer) => {
      tail = (tail + chunk.toString()).slice(-4000);
    });
    child.on('error', (err) => reject(new Error(`${label}: ${bin} could not start (${err.message})`)));
    child.on('close', (code) => {
      if (code === 0) return resolve();
      // ffmpeg's last lines are where the real reason lives.
      reject(new Error(`${label}: ${bin} exited ${code}\n${tail.split('\n').slice(-6).join('\n')}`));
    });
  });
}

function capture(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (c: Buffer) => (out += c.toString()));
    child.stderr.on('data', (c: Buffer) => (err = (err + c.toString()).slice(-2000)));
    child.on('error', (e) => reject(new Error(`${bin} could not start (${e.message})`)));
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${bin} exited ${code}: ${err.slice(-400)}`))));
  });
}

async function assertModernFfmpeg(): Promise<void> {
  const version = await capture(FFMPEG, ['-version']);
  const first = version.split('\n')[0];
  // The build date, not the copyright range: every build prints "(c) 2000-2026",
  // which says nothing about how old it is. Modern builds carry a -YYYYMMDD
  // suffix; older ones only a "built on <date>" line. The 2013 build on this
  // machine cannot decode 10-bit HEVC or write WebVTT, and fails in ways that
  // look like a corrupt source file.
  const suffix = /-(\d{4})\d{4}\b/.exec(first);
  const builtOn = /built on \w+\s+\d+\s+(\d{4})/.exec(version);
  const buildYear = Number(suffix?.[1] ?? builtOn?.[1] ?? 0);
  if (buildYear && buildYear < 2020) {
    throw new Error(
      `The ffmpeg on PATH is too old for this pipeline (${first.trim()}).
` +
        `Point FFMPEG and FFPROBE at a current build, e.g. FFMPEG=/path/to/ffmpeg.exe`,
    );
  }
  log(`Using ${first.trim()}`);
}

// --- Google Drive -----------------------------------------------------------

/** Read-only client for pulling masters. Service-account key stays server-side. */
function masterClient() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (!keyFile) throw new Error('Set GOOGLE_SERVICE_ACCOUNT_FILE to the service-account JSON path.');
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

/**
 * Upload client. Uses drive.file scope — per-file access to files this worker
 * created — so a mistake here cannot touch the operator's other Drive content,
 * and never the masters.
 */
function uploadClient() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Set GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET and GOOGLE_DRIVE_REFRESH_TOKEN.');
  }
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth });
}

type Drive = ReturnType<typeof uploadClient>;

async function cacheFolder(drive: Drive): Promise<string> {
  const found = await drive.files.list({
    q: `name='${CACHE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });
  if (found.data.files?.[0]?.id) return found.data.files[0].id;
  const made = await drive.files.create({
    requestBody: { name: CACHE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  return made.data.id!;
}

/**
 * Frees room for `needBytes`, oldest first. Only files in the rendition folder
 * are ever considered — a master lives elsewhere and is never touched.
 */
async function evictTo(drive: Drive, folderId: string, needBytes: number): Promise<number> {
  const list = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id,name,size,modifiedTime)',
    orderBy: 'modifiedTime',
    pageSize: 1000,
  });
  const files = list.data.files ?? [];
  let used = files.reduce((sum, f) => sum + Number(f.size ?? 0), 0);
  if (used + needBytes <= MAX_CACHE_BYTES) return used;

  for (const file of files) {
    if (used + needBytes <= MAX_CACHE_BYTES) break;
    await drive.files.delete({ fileId: file.id! });
    used -= Number(file.size ?? 0);
    log(`  evicted ${file.name} (${MB(Number(file.size ?? 0))} MB)`);
  }
  if (used + needBytes > MAX_CACHE_BYTES) {
    throw new Error(`Rendition cache is full: ${MB(used)} MB used, ${MB(needBytes)} MB needed, ceiling ${MB(MAX_CACHE_BYTES)} MB`);
  }
  return used;
}

async function uploadRendition(drive: Drive, folderId: string, filePath: string, name: string): Promise<string> {
  const size = fs.statSync(filePath).size;
  await evictTo(drive, folderId, size);
  const created = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { body: fs.createReadStream(filePath) },
    fields: 'id',
  });
  const id = created.data.id!;
  // Anyone with the link may read it; the app serves it through its own signed
  // proxy, so this is what makes that proxy able to fetch the bytes.
  await drive.permissions.create({ fileId: id, requestBody: { role: 'reader', type: 'anyone' } });
  return id;
}

async function downloadMaster(drive: ReturnType<typeof masterClient>, fileId: string, dest: string): Promise<void> {
  const meta = await drive.files.get({ fileId, fields: 'size,name', supportsAllDrives: true });
  const expected = Number(meta.data.size ?? 0);

  if (fs.existsSync(dest) && expected > 0 && fs.statSync(dest).size === expected) {
    step('download', `cached (${MB(expected)} MB)`);
    return;
  }

  const res = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    let seen = 0;
    let lastLogged = 0;
    (res.data as NodeJS.ReadableStream)
      .on('data', (chunk: Buffer) => {
        seen += chunk.length;
        if (expected && seen - lastLogged > expected / 10) {
          lastLogged = seen;
          process.stdout.write(`\r  download ......... ${Math.round((seen / expected) * 100)}%`);
        }
      })
      .on('error', reject)
      .pipe(out)
      .on('finish', () => {
        process.stdout.write('\r');
        resolve();
      })
      .on('error', reject);
  });

  // A truncated download looks exactly like a corrupt master later on.
  const got = fs.statSync(dest).size;
  if (expected > 0 && got !== expected) {
    fs.rmSync(dest, { force: true });
    throw new Error(`Master download incomplete: expected ${expected} bytes, got ${got}`);
  }
  step('download', `${MB(got)} MB`);
}

// --- encoding ---------------------------------------------------------------

/**
 * One video rendition: H.264 8-bit, which is the only combination every browser
 * plays. The master may be HEVC or 10-bit — that is exactly why even a
 * same-height rendition has to be re-encoded rather than copied.
 *
 * Only the default audio stream is muxed in, so the file plays on its own. The
 * alternate languages travel as separate audio files instead of multiplying
 * every quality by every language.
 */
async function encodeVideo(master: string, height: number, kbps: number, out: string): Promise<void> {
  await run(
    FFMPEG,
    [
      '-y',
      '-i', master,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      // Even height, preserved aspect ratio, never upscaled.
      '-vf', `scale=-2:${height}:flags=bicubic`,
      '-c:v', 'libx264',
      '-profile:v', 'high',
      '-pix_fmt', 'yuv420p',
      '-preset', 'veryfast',
      '-crf', '23',
      '-maxrate', `${kbps}k`,
      '-bufsize', `${kbps * 2}k`,
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', '2',
      // No subtitle or data streams: subtitles ship as WebVTT files.
      '-sn', '-dn',
      // Moves the index to the front so the browser can start without the tail.
      '-movflags', '+faststart',
      out,
    ],
    `${height}p`,
  );
}

/** One audio stream as a standalone m4a the player can sync against the video. */
async function encodeAudio(master: string, streamIndex: number, out: string): Promise<void> {
  await run(
    FFMPEG,
    ['-y', '-i', master, '-map', `0:${streamIndex}`, '-vn', '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-movflags', '+faststart', out],
    `audio stream ${streamIndex}`,
  );
}

/** One text subtitle stream as WebVTT, which is what <track> accepts. */
async function encodeSubtitle(master: string, streamIndex: number, out: string): Promise<void> {
  await run(FFMPEG, ['-y', '-i', master, '-map', `0:${streamIndex}`, '-c:s', 'webvtt', out], `subtitle stream ${streamIndex}`);
}

async function probeMaster(file: string): Promise<MasterSummary> {
  const raw = await capture(FFPROBE, ['-v', 'error', '-show_format', '-show_streams', '-print_format', 'json', file]);
  return summariseMaster(JSON.parse(raw) as ProbeResult);
}

// --- job shape --------------------------------------------------------------

interface Job {
  id: string;
  masterDriveFileId: string;
  label: string;
  kind: string;
  audioLanguage: string;
  audioLabel: string;
  episode: {
    id: string;
    number: number;
    title: string | null;
    anime: { id: string; slug: string; titleEnglish: string };
    season: { number: number; title: string | null } | null;
  };
  variants: Array<{ quality: string; driveFileId: string | null; isActive: boolean }>;
  audioTracks: Array<{ language: string; driveFileId: string | null }>;
  subtitleTracks: Array<{ language: string; driveFileId: string | null; url: string | null }>;
}

function describe(job: Job): string {
  const season = job.episode.season ? `S${job.episode.season.number}` : '';
  return `${job.episode.anime.titleEnglish} ${season}E${job.episode.number}`.replace(/\s+/g, ' ').trim();
}

// --- one job ----------------------------------------------------------------

async function processJob(job: Job): Promise<void> {
  log(`\n${describe(job)}`);
  fs.mkdirSync(WORK_DIR, { recursive: true });

  const masterPath = path.join(WORK_DIR, `${job.masterDriveFileId}.master`);
  await downloadMaster(masterClient(), job.masterDriveFileId, masterPath);

  const summary = await probeMaster(masterPath);
  if (!summary.video) throw new Error('The master has no video stream');
  step('probe', `${summary.video.codec} ${summary.video.width}x${summary.video.height} ${summary.video.pixFmt}, ${summary.audio.length} audio, ${summary.subtitles.length} subtitle`);

  const ladder = planLadder(summary.video.height);
  if (ladder.length === 0) throw new Error(`Unusable source height ${summary.video.height}`);

  const drive = uploadClient();
  const folder = await cacheFolder(drive);
  const base = `${job.episode.anime.slug}-e${job.episode.number}`;

  // --- video ----------------------------------------------------------------
  const existingQualities = new Map(job.variants.filter((v) => v.driveFileId).map((v) => [v.quality, v.driveFileId!]));
  const variants: Array<{ quality: string; driveFileIdOrUrl: string; isDefault: boolean }> = [];

  for (const rung of ladder) {
    const already = existingQualities.get(rung.quality);
    if (already) {
      step(`${rung.height}p`, 'reused');
      variants.push({ quality: rung.quality, driveFileIdOrUrl: already, isDefault: false });
      continue;
    }
    if (stopping) throw new Error('Stopped before this rendition was built');

    const out = path.join(WORK_DIR, `${base}-${rung.height}.mp4`);
    await encodeVideo(masterPath, rung.height, rung.kbps, out);
    const id = await uploadRendition(drive, folder, out, `${base}-${rung.height}p.mp4`);
    step(`${rung.height}p`, `built ${MB(fs.statSync(out).size)} MB`);
    fs.rmSync(out, { force: true });
    variants.push({ quality: rung.quality, driveFileIdOrUrl: id, isDefault: false });
  }
  // Highest available quality is the default the player opens on.
  if (variants[0]) variants[0].isDefault = true;

  // --- audio ----------------------------------------------------------------
  const existingAudio = new Map(job.audioTracks.filter((a) => a.driveFileId).map((a) => [a.language, a.driveFileId!]));
  const audioTracks: Array<{ language: string; label: string; driveFileIdOrUrl: string; isDefault: boolean; sortOrder: number }> = [];

  // Only worth separating when there is a real choice to make.
  if (summary.audio.length > 1) {
    for (const [position, stream] of summary.audio.entries()) {
      const key = stream.language ?? `track${position + 1}`;
      const already = existingAudio.get(key);
      if (already) {
        step(`audio ${position + 1}`, `${stream.label} (reused)`);
        audioTracks.push({ language: key, label: stream.label, driveFileIdOrUrl: already, isDefault: stream.isDefault, sortOrder: position });
        continue;
      }
      if (stopping) throw new Error('Stopped before this audio track was built');

      const out = path.join(WORK_DIR, `${base}-audio-${position}.m4a`);
      await encodeAudio(masterPath, stream.index, out);
      const id = await uploadRendition(drive, folder, out, `${base}-${key}.m4a`);
      step(`audio ${position + 1}`, `${stream.label} ${MB(fs.statSync(out).size)} MB`);
      fs.rmSync(out, { force: true });
      audioTracks.push({ language: key, label: stream.label, driveFileIdOrUrl: id, isDefault: stream.isDefault, sortOrder: position });
    }
    if (!audioTracks.some((t) => t.isDefault) && audioTracks[0]) audioTracks[0].isDefault = true;
  } else {
    step('audio', summary.audio.length === 1 ? 'single track, muxed into the video' : 'none in the master');
  }

  // --- subtitles ------------------------------------------------------------
  const existingSubs = new Map(job.subtitleTracks.filter((s) => s.driveFileId).map((s) => [s.language, s.driveFileId!]));
  const subtitleTracks: Array<{ language: string; label: string; format: string; driveFileIdOrUrl: string; isDefault: boolean; isForced: boolean }> = [];
  const skippedSubs: string[] = [];

  for (const [position, stream] of summary.subtitles.entries()) {
    if (!stream.isTextBased) {
      // Bitmap subtitles would need OCR. Reported, never silently dropped.
      skippedSubs.push(`${stream.label} (${stream.codec} is a bitmap format)`);
      continue;
    }
    const key = stream.language ?? `sub${position + 1}`;
    const already = existingSubs.get(key);
    if (already) {
      step(`subtitle ${position + 1}`, `${stream.label} (reused)`);
      subtitleTracks.push({ language: key, label: stream.label, format: 'VTT', driveFileIdOrUrl: already, isDefault: stream.isDefault, isForced: stream.isForced });
      continue;
    }
    if (stopping) throw new Error('Stopped before this subtitle was built');

    const out = path.join(WORK_DIR, `${base}-sub-${position}.vtt`);
    await encodeSubtitle(masterPath, stream.index, out);
    const id = await uploadRendition(drive, folder, out, `${base}-${key}.vtt`);
    step(`subtitle ${position + 1}`, `${stream.label} ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
    fs.rmSync(out, { force: true });
    subtitleTracks.push({ language: key, label: stream.label, format: 'VTT', driveFileIdOrUrl: id, isDefault: stream.isDefault, isForced: stream.isForced });
  }
  if (summary.subtitles.length === 0) step('subtitles', 'none in the master (hardsubbed or absent)');
  for (const skipped of skippedSubs) step('subtitle', `skipped: ${skipped}`);

  // --- register -------------------------------------------------------------
  await api(`/admin/episodes/${job.episode.id}`, {
    method: 'PUT',
    body: {
      animeId: job.episode.anime.id,
      number: job.episode.number,
      mediaSources: [
        {
          label: job.label,
          provider: 'GOOGLE_DRIVE',
          kind: job.kind,
          audioLanguage: job.audioLanguage,
          audioLabel: job.audioLabel,
          isDefault: true,
          masterDriveFileIdOrUrl: job.masterDriveFileId,
          variants,
          audioTracks,
          subtitleTracks,
        },
      ],
    },
  });
  step('register', `${variants.length} quality, ${audioTracks.length} audio, ${subtitleTracks.length} subtitle`);

  // The PUT re-queued the source by design; this is what says it is done.
  const sources = await api<Array<{ id: string; isSingleMaster: boolean }>>(`/admin/episodes/${job.episode.id}/media-status`);
  const target = sources.find((s) => s.isSingleMaster) ?? sources[0];
  await api(`/admin/media/jobs/${target.id}/complete`, { body: { ready: true } });
  step('state', 'READY');
}

// --- loop -------------------------------------------------------------------

async function tick(): Promise<number> {
  const jobs = await api<Job[]>('/admin/media/jobs?limit=20');
  if (jobs.length === 0) return 0;

  let done = 0;
  for (const job of jobs) {
    if (stopping) break;
    const claimed = await api<Job | null>(`/admin/media/jobs/${job.id}/claim`, { body: {} });
    if (!claimed) continue; // another worker took it

    try {
      await processJob({ ...job, ...claimed });
      done++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A failure is recorded with its cause rather than left looking finished.
      step('state', `FAILED — ${message.split('\n')[0]}`);
      await api(`/admin/media/jobs/${job.id}/complete`, { body: { ready: false, error: message } }).catch(() => {});
    }
  }
  return done;
}

async function main(): Promise<void> {
  log('AniZora media worker');
  await assertModernFfmpeg();
  await signIn();

  if (ONCE) {
    const done = await tick();
    log(done > 0 ? `\nProcessed ${done} job(s).` : '\nNothing pending.');
    return;
  }

  log(`Watching for pending masters every ${POLL_SECONDS}s. Ctrl+C to stop.\n`);
  let idleNotice = false;
  while (!stopping) {
    const done = await tick();
    if (done === 0) {
      if (!idleNotice) {
        log('Nothing pending; waiting.');
        idleNotice = true;
      }
    } else {
      idleNotice = false;
    }
    if (stopping) break;
    await new Promise((r) => setTimeout(r, POLL_SECONDS * 1000));
  }
  log('Stopped.');
}

main().catch((error: unknown) => {
  console.error(`\nWorker stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
