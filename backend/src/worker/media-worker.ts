/**
 * AniZora media worker.
 *
 * A long-running service that turns one master video into everything the player
 * needs: a quality ladder, one playable file per embedded audio stream, and a
 * WebVTT per embedded text subtitle. It polls the API for work, so nothing is
 * scheduled by hand and no operator command is needed per episode.
 *
 * It is a normal deployable component. Everything it needs comes from the
 * environment, it carries its own FFmpeg in the image, and it holds a service
 * token rather than an admin session — so a compromised transcoder cannot touch
 * the catalogue or users.
 *
 * Why it is separate from the API at all: transcoding is CPU-bound and runs for
 * tens of minutes. Putting it in the request path would block the API and
 * exceed the request timeouts of most hosts. Running it as its own container
 * lets it be placed wherever there is CPU and disk, independently of the API.
 *
 * Nothing secret is ever logged: not the service token, not the refresh token,
 * not the service-account key.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { google } from 'googleapis';
import {
  planLadder,
  summariseMaster,
  type MasterSummary,
  type ProbeResult,
} from '../modules/media/probe';

// --- configuration ----------------------------------------------------------

/** Required. Fails fast with a clear message rather than misbehaving later. */
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required. See docs/MEDIA_WORKER_DEPLOYMENT.md.`);
  return value;
}

const API = (process.env.API_URL ?? '').replace(/\/$/, '') || required('API_URL');
const TOKEN = required('MEDIA_WORKER_TOKEN');
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';
const WORK_DIR = process.env.WORK_DIR ?? path.join(os.tmpdir(), 'anizora-media');
const CACHE_FOLDER_NAME = process.env.RENDITION_FOLDER ?? 'AniZora _renditions';
const MAX_CACHE_BYTES = Number(process.env.MAX_CACHE_BYTES ?? 8 * 1024 ** 3);
const POLL_SECONDS = Number(process.env.POLL_SECONDS ?? 30);
/**
 * One encode at a time by default. FFmpeg will use every core it is given, so
 * running several at once makes them all slower and can exhaust disk. Raise it
 * only on a host with the headroom.
 */
const CONCURRENCY = Math.max(1, Number(process.env.MEDIA_WORKER_CONCURRENCY ?? 1));
/** Refuse to start a job without room for the master plus its renditions. */
const MIN_FREE_BYTES = Number(process.env.MIN_FREE_DISK_BYTES ?? 12 * 1024 ** 3);
const ONCE = process.argv.includes('--once');
/** Validate the configuration and exit. What the installer runs to prove setup works. */
const CHECK = process.argv.includes('--check');
/** Reported with the heartbeat so a support question can start from a build. */
const WORKER_VERSION = process.env.MEDIA_WORKER_VERSION ?? '1.0.0';

const MB = (n: number) => (n / 1024 ** 2).toFixed(1);
const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);
const step = (name: string, result: string) => console.log(`  ${name.padEnd(18, '.')} ${result}`);

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(130);
    stopping = true;
    log(`${signal} received — finishing the current step, then stopping.`);
  });
}

// --- API --------------------------------------------------------------------

async function api<T>(pathname: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${pathname}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    // The token is the only credential, and it never appears in a log line.
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${pathname} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as T) : (null as T);
}

/** What this worker is on, for the heartbeat. Null between jobs. */
let currentJobLabel: string | null = null;

/**
 * Best-effort progress. A failed report must never fail the job.
 *
 * Also refreshes this worker's presence, so “what is it doing” and “is it
 * still there” are answered by one call and cannot drift apart.
 */
async function progress(jobId: string, stepName: string, detail?: string): Promise<void> {
  await Promise.all([
    api(`/media-worker/jobs/${jobId}/progress`, { body: { step: stepName, detail } }).catch(() => undefined),
    heartbeat('BUSY', currentJobLabel, stepName),
  ]);
}

// --- identity ---------------------------------------------------------------

/**
 * A stable id for this worker, so the admin panel can say a worker is online
 * rather than only that a job is queued.
 *
 * It is not a credential and grants nothing — the token does that. It lives in
 * the work directory so a restart keeps the same identity, and a machine that
 * is replaced simply introduces a new one. MEDIA_WORKER_ID overrides it for
 * deployments that would rather set identity explicitly.
 */
function workerIdentity(): string {
  const configured = process.env.MEDIA_WORKER_ID?.trim();
  if (configured) return configured.slice(0, 64);

  const file = path.join(WORK_DIR, 'worker-id');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing.slice(0, 64);
  } catch {
    // First run on this machine.
  }
  const fresh = randomUUID();
  try {
    fs.mkdirSync(WORK_DIR, { recursive: true });
    fs.writeFileSync(file, fresh, 'utf8');
  } catch {
    // A read-only work dir means a new id each restart, which is worse but not
    // worth refusing to run over.
  }
  return fresh;
}

const WORKER_ID = workerIdentity();

/**
 * “Still here.” Sent whether or not there is work, because a quiet queue and a
 * switched-off machine otherwise look identical to an admin.
 *
 * Best-effort throughout: presence is a convenience, and failing to report it
 * must never stop a job or kill the loop.
 */
async function heartbeat(status: 'IDLE' | 'BUSY', jobLabel?: string | null, stepName?: string | null): Promise<void> {
  await api('/media-worker/heartbeat', {
    body: {
      workerId: WORKER_ID,
      status,
      currentJobLabel: jobLabel ?? undefined,
      currentStep: stepName ?? undefined,
      version: WORKER_VERSION,
    },
  }).catch(() => undefined);
}

// --- process helpers --------------------------------------------------------

/**
 * Runs a binary with an argument array — never a shell string — so a filename
 * can never be interpreted as a command.
 */
function run(bin: string, args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let tail = '';
    child.stderr.on('data', (chunk: Buffer) => {
      tail = (tail + chunk.toString()).slice(-4000);
    });
    child.on('error', (err) => reject(new Error(`${label}: ${bin} could not start (${err.message})`)));
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${label}: ${bin} exited ${code}\n${tail.split('\n').slice(-6).join('\n')}`)),
    );
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

async function assertFfmpeg(): Promise<string> {
  const version = await capture(FFMPEG, ['-version']);
  const first = version.split('\n')[0];
  // The build date, not the copyright range: every build prints "(c) 2000-…",
  // which says nothing about its age.
  const suffix = /-(\d{4})\d{4}\b/.exec(first);
  const builtOn = /built on \w+\s+\d+\s+(\d{4})/.exec(version);
  const year = Number(suffix?.[1] ?? builtOn?.[1] ?? 0);
  if (year && year < 2020) {
    throw new Error(
      `FFmpeg is too old for this pipeline (${first.trim()}). The bundled image ships a current build; ` +
        `set FFMPEG_PATH/FFPROBE_PATH if you are running outside it.`,
    );
  }
  return first.trim();
}

/** Free bytes on the work volume. */
async function freeSpace(dir: string): Promise<number> {
  await fsp.mkdir(dir, { recursive: true });
  const stats = await fsp.statfs(dir);
  return stats.bavail * stats.bsize;
}

// --- Google Drive -----------------------------------------------------------

/**
 * Service-account credentials, supplied as a deployment secret. A file path is
 * still accepted for hosts that mount secrets as files, but no path is baked in
 * anywhere.
 */
function serviceAccountCredentials(): Record<string, unknown> {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) return JSON.parse(inline) as Record<string, unknown>;

  const base64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (base64) return JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as Record<string, unknown>;

  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  if (file) return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;

  throw new Error(
    'No Drive credentials. Set GOOGLE_SERVICE_ACCOUNT_JSON (or _BASE64, or _FILE). See docs/MEDIA_WORKER_DEPLOYMENT.md.',
  );
}

/** Read-only client for pulling masters. */
function masterClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccountCredentials(),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

/**
 * Upload client, scoped to drive.file — per-file access to files this worker
 * created. A mistake here cannot reach anything else in the account, and never
 * a master.
 */
function uploadClient() {
  const auth = new google.auth.OAuth2(required('GOOGLE_DRIVE_CLIENT_ID'), required('GOOGLE_DRIVE_CLIENT_SECRET'));
  auth.setCredentials({ refresh_token: required('GOOGLE_DRIVE_REFRESH_TOKEN') });
  return google.drive({ version: 'v3', auth });
}

type Drive = ReturnType<typeof uploadClient>;

async function folderId(drive: Drive, name: string): Promise<string> {
  const found = await drive.files.list({
    q: `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });
  if (found.data.files?.[0]?.id) return found.data.files[0].id;
  const made = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  return made.data.id!;
}

/** A file this worker already uploaded under the same deterministic name. */
async function existingUpload(drive: Drive, parent: string, name: string): Promise<string | null> {
  const found = await drive.files.list({
    q: `name='${name.replace(/'/g, "\\'")}' and '${parent}' in parents and trashed=false`,
    fields: 'files(id,size)',
  });
  const file = found.data.files?.[0];
  return file?.id && Number(file.size ?? 0) > 0 ? file.id : null;
}

/** Frees room, oldest first. Only rendition-folder files are ever removed. */
async function evictTo(drive: Drive, parent: string, needBytes: number): Promise<void> {
  const list = await drive.files.list({
    q: `'${parent}' in parents and trashed=false`,
    fields: 'files(id,name,size,modifiedTime)',
    orderBy: 'modifiedTime',
    pageSize: 1000,
  });
  const files = list.data.files ?? [];
  let used = files.reduce((sum, f) => sum + Number(f.size ?? 0), 0);
  if (used + needBytes <= MAX_CACHE_BYTES) return;

  for (const file of files) {
    if (used + needBytes <= MAX_CACHE_BYTES) break;
    await drive.files.delete({ fileId: file.id! });
    used -= Number(file.size ?? 0);
    step('evicted', `${file.name} (${MB(Number(file.size ?? 0))} MB)`);
  }
  if (used + needBytes > MAX_CACHE_BYTES) {
    throw new Error(
      `Rendition cache is full: ${MB(used)} MB used, ${MB(needBytes)} MB needed, ceiling ${MB(MAX_CACHE_BYTES)} MB. ` +
        `Raise MAX_CACHE_BYTES or free space in Drive.`,
    );
  }
}

async function upload(drive: Drive, parent: string, filePath: string, name: string): Promise<string> {
  const size = fs.statSync(filePath).size;
  await evictTo(drive, parent, size);
  const created = await drive.files.create({
    requestBody: { name, parents: [parent] },
    media: { body: fs.createReadStream(filePath) },
    fields: 'id',
  });
  const id = created.data.id!;
  // Readable by link: the app serves these through its own signed proxy, which
  // is what needs to be able to fetch the bytes.
  await drive.permissions.create({ fileId: id, requestBody: { role: 'reader', type: 'anyone' } });
  return id;
}

async function downloadMaster(fileId: string, dest: string): Promise<void> {
  const drive = masterClient();
  const meta = await drive.files.get({ fileId, fields: 'size,name', supportsAllDrives: true });
  const expected = Number(meta.data.size ?? 0);

  if (fs.existsSync(dest) && expected > 0 && fs.statSync(dest).size === expected) {
    step('download', `cached (${MB(expected)} MB)`);
    return;
  }

  const res = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    (res.data as NodeJS.ReadableStream).on('error', reject).pipe(out).on('finish', resolve).on('error', reject);
  });

  // A truncated download is indistinguishable from a corrupt master later on.
  const got = fs.statSync(dest).size;
  if (expected > 0 && got !== expected) {
    fs.rmSync(dest, { force: true });
    throw new Error(`Master download incomplete: expected ${expected} bytes, got ${got}`);
  }
  step('download', `${MB(got)} MB`);
}

// --- encoding ---------------------------------------------------------------

/**
 * One video rendition: H.264 8-bit, the only combination every browser plays.
 * The master may be HEVC or 10-bit, which is why even a same-height rendition
 * is re-encoded rather than copied.
 *
 * Only the default audio is muxed in, so the file stands alone. Alternate
 * languages travel as separate audio files rather than multiplying every
 * quality by every language.
 */
async function encodeVideo(master: string, height: number, kbps: number, out: string): Promise<void> {
  await run(
    FFMPEG,
    [
      '-y', '-i', master,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', `scale=-2:${height}:flags=bicubic`,
      '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-preset', process.env.FFMPEG_PRESET ?? 'veryfast',
      '-crf', process.env.FFMPEG_CRF ?? '23',
      '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`,
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
      '-sn', '-dn',
      '-movflags', '+faststart',
      out,
    ],
    `${height}p`,
  );
}

async function encodeAudio(master: string, streamIndex: number, out: string): Promise<void> {
  await run(
    FFMPEG,
    ['-y', '-i', master, '-map', `0:${streamIndex}`, '-vn', '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-movflags', '+faststart', out],
    `audio stream ${streamIndex}`,
  );
}

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
  episode: {
    id: string;
    number: number;
    anime: { id: string; slug: string; titleEnglish: string };
    season: { number: number } | null;
  };
  variants: Array<{ quality: string; driveFileId: string | null; isActive: boolean }>;
  audioTracks: Array<{ language: string; driveFileId: string | null }>;
  subtitleTracks: Array<{ language: string; driveFileId: string | null }>;
}

const describe = (job: Job) =>
  `${job.episode.anime.titleEnglish} ${job.episode.season ? `S${job.episode.season.number}` : ''}E${job.episode.number}`
    .replace(/\s+/g, ' ')
    .trim();

/** A safe basename: derived from ids we control, never from a filename. */
const baseName = (job: Job) => `${job.episode.anime.slug.replace(/[^a-z0-9-]/gi, '')}-e${job.episode.number}`;

// --- one job ----------------------------------------------------------------

async function processJob(job: Job): Promise<void> {
  log(`\n${describe(job)}`);
  currentJobLabel = describe(job);
  const base = baseName(job);
  const jobDir = path.join(WORK_DIR, job.id);
  await fsp.mkdir(jobDir, { recursive: true });

  try {
    const free = await freeSpace(jobDir);
    if (free < MIN_FREE_BYTES) {
      throw new Error(
        `Only ${MB(free)} MB free on the work volume; ${MB(MIN_FREE_BYTES)} MB required. ` +
          `Free space or lower MIN_FREE_DISK_BYTES.`,
      );
    }

    await progress(job.id, 'DOWNLOADING');
    const masterPath = path.join(jobDir, 'master');
    await downloadMaster(job.masterDriveFileId, masterPath);

    await progress(job.id, 'PROBING');
    const summary = await probeMaster(masterPath);
    if (!summary.video) throw new Error('The master has no video stream');
    step(
      'probe',
      `${summary.video.codec} ${summary.video.width}x${summary.video.height} ${summary.video.pixFmt}, ` +
        `${summary.audio.length} audio, ${summary.subtitles.length} subtitle`,
    );

    const ladder = planLadder(summary.video.height);
    if (ladder.length === 0) throw new Error(`Unusable source height ${summary.video.height}`);

    const drive = uploadClient();
    const renditions = await folderId(drive, CACHE_FOLDER_NAME);

    // --- video --------------------------------------------------------------
    const known = new Map(job.variants.filter((v) => v.driveFileId).map((v) => [v.quality, v.driveFileId!]));
    const variants: Array<{ quality: string; driveFileId: string }> = [];

    for (const rung of ladder) {
      if (stopping) throw new Error('Stopped before this rendition was built');
      const already = known.get(rung.quality);
      if (already) {
        step(`${rung.height}p`, 'reused');
        variants.push({ quality: rung.quality, driveFileId: already });
        continue;
      }

      const name = `${base}-${rung.height}p.mp4`;
      const adopted = await existingUpload(drive, renditions, name);
      if (adopted) {
        step(`${rung.height}p`, 'adopted an earlier upload');
        variants.push({ quality: rung.quality, driveFileId: adopted });
        continue;
      }

      await progress(job.id, `ENCODING_${rung.height}P`, `${variants.length + 1} of ${ladder.length}`);
      const out = path.join(jobDir, name);
      await encodeVideo(masterPath, rung.height, rung.kbps, out);
      await progress(job.id, 'UPLOADING', `${rung.height}p`);
      const id = await upload(drive, renditions, out, name);
      step(`${rung.height}p`, `built ${MB(fs.statSync(out).size)} MB`);
      await fsp.rm(out, { force: true });
      variants.push({ quality: rung.quality, driveFileId: id });
    }

    // --- audio --------------------------------------------------------------
    const knownAudio = new Map(job.audioTracks.filter((a) => a.driveFileId).map((a) => [a.language, a.driveFileId!]));
    const audioTracks: Array<{ language: string; label: string; driveFileId: string; isDefault: boolean; sortOrder: number }> = [];

    if (summary.audio.length > 1) {
      await progress(job.id, 'EXTRACTING_AUDIO', `${summary.audio.length} tracks`);
      for (const [position, stream] of summary.audio.entries()) {
        if (stopping) throw new Error('Stopped before this audio track was built');
        const key = stream.language ?? `track${position + 1}`;
        const name = `${base}-${key}.m4a`;
        const already = knownAudio.get(key) ?? (await existingUpload(drive, renditions, name));
        if (already) {
          step(`audio ${position + 1}`, `${stream.label} (reused)`);
          audioTracks.push({ language: key, label: stream.label, driveFileId: already, isDefault: stream.isDefault, sortOrder: position });
          continue;
        }
        const out = path.join(jobDir, name);
        await encodeAudio(masterPath, stream.index, out);
        const id = await upload(drive, renditions, out, name);
        step(`audio ${position + 1}`, `${stream.label} ${MB(fs.statSync(out).size)} MB`);
        await fsp.rm(out, { force: true });
        audioTracks.push({ language: key, label: stream.label, driveFileId: id, isDefault: stream.isDefault, sortOrder: position });
      }
      if (!audioTracks.some((t) => t.isDefault) && audioTracks[0]) audioTracks[0].isDefault = true;
    } else {
      step('audio', summary.audio.length === 1 ? 'single track, muxed into the video' : 'none in the master');
    }

    // --- subtitles ----------------------------------------------------------
    const knownSubs = new Map(job.subtitleTracks.filter((s) => s.driveFileId).map((s) => [s.language, s.driveFileId!]));
    const subtitleTracks: Array<{ language: string; label: string; driveFileId: string; isDefault: boolean; isForced: boolean }> = [];
    const skipped: string[] = [];

    if (summary.subtitles.length > 0) await progress(job.id, 'CONVERTING_SUBTITLES');
    for (const [position, stream] of summary.subtitles.entries()) {
      if (!stream.isTextBased) {
        // A bitmap subtitle would need OCR. Reported, never silently dropped.
        skipped.push(`${stream.label} (${stream.codec} is a bitmap format and needs OCR)`);
        continue;
      }
      if (stopping) throw new Error('Stopped before this subtitle was built');
      const key = stream.language ?? `sub${position + 1}`;
      const name = `${base}-${key}.vtt`;
      const already = knownSubs.get(key) ?? (await existingUpload(drive, renditions, name));
      if (already) {
        step(`subtitle ${position + 1}`, `${stream.label} (reused)`);
        subtitleTracks.push({ language: key, label: stream.label, driveFileId: already, isDefault: stream.isDefault, isForced: stream.isForced });
        continue;
      }
      const out = path.join(jobDir, name);
      await encodeSubtitle(masterPath, stream.index, out);
      const id = await upload(drive, renditions, out, name);
      step(`subtitle ${position + 1}`, `${stream.label} ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
      await fsp.rm(out, { force: true });
      subtitleTracks.push({ language: key, label: stream.label, driveFileId: id, isDefault: stream.isDefault, isForced: stream.isForced });
    }
    if (summary.subtitles.length === 0) step('subtitles', 'none in the master (hardsubbed or absent)');
    for (const note of skipped) step('subtitle', `skipped: ${note}`);

    // --- register -----------------------------------------------------------
    await progress(job.id, 'REGISTERING');
    await api(`/media-worker/jobs/${job.id}/media`, { body: { variants, audioTracks, subtitleTracks } });
    step('register', `${variants.length} quality, ${audioTracks.length} audio, ${subtitleTracks.length} subtitle`);

    await api(`/media-worker/jobs/${job.id}/complete`, { body: { ready: true } });
    step('state', 'READY');
  } finally {
    // Temporary files never outlive the job, successful or not.
    await fsp.rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

// --- loop -------------------------------------------------------------------

async function tick(): Promise<number> {
  await heartbeat(currentJobLabel ? 'BUSY' : 'IDLE', currentJobLabel);
  const jobs = await api<Job[]>('/media-worker/jobs?limit=20');
  if (jobs.length === 0) return 0;

  let done = 0;
  for (const job of jobs.slice(0, CONCURRENCY)) {
    if (stopping) break;
    const claimed = await api<Job | null>(`/media-worker/jobs/${job.id}/claim`, { body: {} });
    if (!claimed) continue; // another worker got there first

    try {
      await processJob({ ...job, ...claimed });
      currentJobLabel = null;
      done++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      step('state', `FAILED — ${message.split('\n')[0]}`);
      // Recorded with its cause, so the admin panel can show why rather than
      // leaving an episode that looks finished with nothing to play.
      await api(`/media-worker/jobs/${job.id}/complete`, { body: { ready: false, error: message } }).catch(() => undefined);
      currentJobLabel = null;
    }
  }
  return done;
}

/**
 * Proves the configuration works, then exits.
 *
 * Every check here is something that would otherwise fail hours later, on the
 * first real job, with a worse error: a token that was mistyped, Drive
 * credentials that were never granted, a disk with no room. The installer runs
 * this so a bad setup is caught while the person is still sitting there.
 */
async function preflight(): Promise<void> {
  const results: Array<[string, string]> = [];
  let failed = false;
  const check = async (name: string, fn: () => Promise<string>) => {
    try {
      results.push([name, `OK    ${await fn()}`]);
    } catch (error) {
      failed = true;
      results.push([name, `FAIL  ${error instanceof Error ? error.message : String(error)}`]);
    }
  };

  await check('FFmpeg', async () => (await assertFfmpeg()).replace(/^ffmpeg version /, ''));
  await check('Backend', async () => {
    const res = await fetch(`${API}/health`);
    if (!res.ok) throw new Error(`${API}/health returned ${res.status}`);
    return API;
  });
  await check('Worker token', async () => {
    const res = await fetch(`${API}/media-worker/jobs?limit=1`, { headers: { authorization: `Bearer ${TOKEN}` } });
    if (res.status === 401) {
      const body = (await res.text()).includes('not configured')
        ? 'the backend has no MEDIA_WORKER_TOKEN set'
        : 'this token does not match the backend';
      throw new Error(`rejected — ${body}`);
    }
    if (!res.ok) throw new Error(`the queue returned ${res.status}`);
    return 'accepted';
  });
  await check('Drive (read masters)', async () => {
    await masterClient().files.list({ pageSize: 1, fields: 'files(id)' });
    return 'can read';
  });
  await check('Drive (write renditions)', async () => {
    const drive = uploadClient();
    await folderId(drive, CACHE_FOLDER_NAME);
    return `can write to “${CACHE_FOLDER_NAME}”`;
  });
  await check('Work directory', async () => {
    await fsp.mkdir(WORK_DIR, { recursive: true });
    const free = await freeSpace(WORK_DIR);
    if (free < MIN_FREE_BYTES) {
      throw new Error(`only ${MB(free)} MB free; ${MB(MIN_FREE_BYTES)} MB needed for a 1080p master`);
    }
    return `${WORK_DIR} (${MB(free)} MB free)`;
  });

  for (const [name, result] of results) console.log(`  ${name.padEnd(24, '.')} ${result}`);
  if (failed) {
    console.error('\nSetup is not complete. See docs/MEDIA_WORKER_DEPLOYMENT.md.');
    process.exit(1);
  }
  console.log('\nEverything checks out. The worker is ready to process jobs.');
}


async function main(): Promise<void> {
  if (CHECK) {
    log('AniZora media worker — checking configuration');
    await preflight();
    return;
  }

  log('AniZora media worker starting');
  log(`FFmpeg: ${await assertFfmpeg()}`);
  log(`API: ${API}`);
  log(`Work dir: ${WORK_DIR} (${MB(await freeSpace(WORK_DIR))} MB free), concurrency ${CONCURRENCY}`);

  if (ONCE) {
    const done = await tick();
    log(done > 0 ? `Processed ${done} job(s).` : 'Nothing pending.');
    return;
  }

  await heartbeat('IDLE');
  log(`Worker ${WORKER_ID.slice(0, 8)}… polling every ${POLL_SECONDS}s. SIGTERM or Ctrl+C to stop.`);
  let idle = false;
  while (!stopping) {
    try {
      const done = await tick();
      if (done === 0 && !idle) {
        log('Nothing pending; waiting.');
        idle = true;
      } else if (done > 0) {
        idle = false;
      }
    } catch (error) {
      // A transient API or network failure must not kill the service.
      log(`Poll failed, retrying: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (stopping) break;
    await new Promise((r) => setTimeout(r, POLL_SECONDS * 1000));
  }
  // One last beat with no job, so a clean stop is not mistaken for a worker
  // that died mid-encode.
  currentJobLabel = null;
  await heartbeat('IDLE');
  log('Stopped.');
}

main().catch((error: unknown) => {
  console.error(`Worker stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
