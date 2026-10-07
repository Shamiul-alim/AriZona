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
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import {
  audioExtractionArgs,
  audioNeedsConversion,
  pickTrackSource,
  planLadder,
  qualityLabel,
  subtitleExtractionArgs,
  summariseMaster,
  type MasterSummary,
  type ProbeResult,
  distinguish,
  alreadyBuilt,
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
/** Refuse to start a transcoding job without room for the master plus its renditions. */
const MIN_FREE_BYTES = Number(process.env.MIN_FREE_DISK_BYTES ?? 12 * 1024 ** 3);
/**
 * A track job holds one video file and writes a few audio and subtitle files
 * beside it, so it needs a fraction of what a ladder does. Keeping the floor
 * low is the difference between running on a spare laptop and not.
 */
const MIN_FREE_BYTES_TRACKS = Number(process.env.MIN_FREE_DISK_TRACKS_BYTES ?? 3 * 1024 ** 3);
const ONCE = process.argv.includes('--once');
/** Validate the configuration and exit. What the installer runs to prove setup works. */
const CHECK = process.argv.includes('--check');
/** Reported with the heartbeat so a support question can start from a build. */
const WORKER_VERSION = process.env.MEDIA_WORKER_VERSION ?? '1.0.0';
/**
 * How often presence is reported. Must stay comfortably below the API's online
 * window (100s) so a missed beat or two does not read as a dead worker.
 */
const HEARTBEAT_SECONDS = Math.max(5, Number(process.env.HEARTBEAT_SECONDS ?? 25));
/**
 * Whether a source this worker cannot open in Drive may be pulled through the
 * API instead.
 *
 * It is the only thing that makes a pasted Drive link work for a worker whose
 * credential is scoped to its own files, so it defaults to on. It is also
 * expensive in a way nothing else here is: every byte of the source travels out
 * of the API's host, and a hosted backend's monthly transfer allowance is
 * measured in gigabytes while episodes are measured in hundreds of megabytes.
 * Granting the worker's Drive credential read access removes the need for it
 * entirely — see docs/GOOGLE_DRIVE.md.
 */
const ALLOW_API_SOURCE = process.env.MEDIA_WORKER_ALLOW_API_SOURCE !== 'false';

/**
 * A one-line version of an error body.
 *
 * When the API is reachable it answers JSON and the message is the useful part.
 * When the *platform* in front of it answers instead — suspended, rate limited,
 * sleeping — the body is an HTML page, and logging that verbatim buried the one
 * fact that mattered under a document.
 */
function summarise(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return '(no body)';
  if (trimmed.startsWith('<')) {
    const title = /<title[^>]*>([^<]+)<\/title>/i.exec(trimmed)?.[1]?.trim();
    const text = trimmed
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return `${title ? `${title}: ` : ''}${text.slice(0, 160)}`.trim() || '(html error page)';
  }
  return trimmed.slice(0, 300);
}

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
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${pathname} -> ${res.status} ${summarise(text)}`);
  return text ? (JSON.parse(text) as T) : (null as T);
}

/** What this worker is on, for the heartbeat. Null between jobs. */
let currentJobLabel: string | null = null;
/** The step it is on, so a beat sent by the timer can say so too. */
let currentStep: string | null = null;

/**
 * Best-effort progress. A failed report must never fail the job.
 *
 * Also refreshes this worker's presence, so “what is it doing” and “is it
 * still there” are answered by one call and cannot drift apart.
 */
async function progress(jobId: string, stepName: string, detail?: string): Promise<void> {
  currentStep = stepName;
  await Promise.all([
    api(`/media-worker/jobs/${jobId}/progress`, { body: { step: stepName, detail } }).catch(() => undefined),
    heartbeat('BUSY', currentJobLabel, stepName),
  ]);
}

/**
 * Reports presence on a clock rather than on progress.
 *
 * Beats used to be sent only when something happened: once per poll, and once
 * per step of a job. Any single step that outlasts the window the API counts a
 * worker as online for — downloading a 400MB source comfortably does — left
 * presence stale, and the admin panel said OFFLINE about a worker that was busy
 * working. The interval keeps that honest no matter how long a step takes, and
 * it is well inside the window so a couple of missed beats are survivable.
 */
function startHeartbeat(): () => void {
  const send = () => {
    void heartbeat(currentJobLabel ? 'BUSY' : 'IDLE', currentJobLabel, currentStep);
  };
  send();
  const timer = setInterval(send, HEARTBEAT_SECONDS * 1000);
  // Never hold the process open on this alone.
  timer.unref?.();
  return () => clearInterval(timer);
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
 * Service-account credentials, if any are configured.
 *
 * Optional. A service account cannot upload — it has no Drive storage quota of
 * its own, so anything it creates has nowhere to live — which means the OAuth
 * credential is needed regardless, and that one can read as well as write.
 * Keeping this supported costs nothing and avoids breaking a deployment that
 * already uses it.
 */
function serviceAccountCredentials(): Record<string, unknown> | null {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) return JSON.parse(inline) as Record<string, unknown>;

  const base64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (base64) return JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as Record<string, unknown>;

  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  if (file) return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;

  return null;
}

/**
 * Client for reading the file the tracks come from.
 *
 * Prefers a service account when one is configured, because read-only is the
 * narrower authority. Without one it reads with the same OAuth credential it
 * uploads with — which grants nothing extra, since the worker must hold that
 * credential either way.
 */
function readClient() {
  const credentials = serviceAccountCredentials();
  if (!credentials) return uploadClient();
  const auth = new google.auth.GoogleAuth({
    credentials,
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

/**
 * Whether Drive is saying "you have no grant for this file" rather than
 * anything about the file itself.
 *
 * Drive answers 404 for a file outside a per-file (drive.file) grant even when
 * the file exists and the same account owns it, so notFound here is not
 * evidence that the id is wrong.
 */
function isAccessRefusal(error: unknown): boolean {
  const status = (error as { code?: number; status?: number }).code ?? (error as { status?: number }).status;
  return status === 404 || status === 403;
}

/**
 * Downloads the file a job reads its tracks from.
 *
 * Tries Drive directly, which is the cheap path and the only one for a file
 * this worker uploaded itself. An administrator's own pasted link is a
 * different matter: a worker credential scoped to its own files cannot open it,
 * so the bytes come from the API instead, which can already read it because
 * playback depends on that. The alternative would be giving every worker read
 * access to the whole of someone's Drive.
 */
async function downloadTrackSource(jobId: string, fileId: string, dest: string): Promise<void> {
  const drive = readClient();
  let expected = 0;
  try {
    const meta = await drive.files.get({ fileId, fields: 'size,name', supportsAllDrives: true });
    expected = Number(meta.data.size ?? 0);

    if (fs.existsSync(dest) && expected > 0 && fs.statSync(dest).size === expected) {
      step('download', `cached (${MB(expected)} MB)`);
      return;
    }

    const res = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(dest);
      (res.data as NodeJS.ReadableStream).on('error', reject).pipe(out).on('finish', resolve).on('error', reject);
    });
  } catch (error) {
    if (!isAccessRefusal(error)) throw error;
    if (!ALLOW_API_SOURCE) {
      throw new Error(
        'This worker cannot open the source in Drive, and pulling it through AniZora is switched off ' +
          '(MEDIA_WORKER_ALLOW_API_SOURCE=false). Give the worker credential read access to the file, ' +
          'or re-enable the fallback.',
      );
    }
    step('download', 'not readable with this worker credential — asking AniZora for it');
    await downloadViaApi(jobId, dest);
    return;
  }

  // A truncated download is indistinguishable from a corrupt source later on.
  const got = fs.statSync(dest).size;
  if (expected > 0 && got !== expected) {
    fs.rmSync(dest, { force: true });
    throw new Error(`Download incomplete: expected ${expected} bytes, got ${got}`);
  }
  step('download', `${MB(got)} MB`);
}

/** The same bytes, proxied by the API, for a source this worker cannot open. */
async function downloadViaApi(jobId: string, dest: string): Promise<void> {
  const res = await fetch(`${API}/media-worker/jobs/${jobId}/source`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`Could not read the track source through AniZora -> ${res.status} ${text.slice(0, 200)}`);
  }
  const expected = Number(res.headers.get('content-length') ?? 0);
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    Readable.fromWeb(res.body as never).on('error', reject).pipe(out).on('finish', resolve).on('error', reject);
  });
  const got = fs.statSync(dest).size;
  if (expected > 0 && got !== expected) {
    fs.rmSync(dest, { force: true });
    throw new Error(`Download incomplete: expected ${expected} bytes, got ${got}`);
  }
  step(
    'download',
    `${MB(got)} MB (via AniZora — this much left the API's host; give the worker Drive read access to avoid it)`,
  );
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

/**
 * One embedded audio stream, pulled out as its own playable file.
 *
 * `-vn` is the important part: the video is never read, re-encoded or copied
 * here. An AAC stream is copied out bit for bit — no quality loss and seconds
 * rather than minutes — and anything else is converted to AAC, which is what
 * the player expects.
 */
async function extractAudio(source: string, streamIndex: number, out: string, copy: boolean): Promise<void> {
  await run(FFMPEG, audioExtractionArgs(source, streamIndex, out, copy), `audio stream ${streamIndex}`);
}

/** One embedded text subtitle, converted to WebVTT. Reads no video. */
async function extractSubtitle(source: string, streamIndex: number, out: string): Promise<void> {
  await run(FFMPEG, subtitleExtractionArgs(source, streamIndex, out), `subtitle stream ${streamIndex}`);
}

async function probeMedia(file: string): Promise<MasterSummary> {
  const raw = await capture(FFPROBE, ['-v', 'error', '-show_format', '-show_streams', '-print_format', 'json', file]);
  return summariseMaster(JSON.parse(raw) as ProbeResult);
}

// --- job shape --------------------------------------------------------------

interface Job {
  id: string;
  /** Legacy transcoding job when set; a track job otherwise. */
  masterDriveFileId: string | null;
  autoTracks: boolean;
  /** Which supplied quality to read tracks from. Null means the highest. */
  trackSourceQuality: string | null;
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

/**
 * Builds the quality ladder by transcoding.
 *
 * Only ever reached by a legacy master job. A normal job supplies its own
 * qualities and must never come through here — encoding somebody's video when
 * they asked for track detection would be both slow and wrong.
 */
async function buildLadder(
  job: Job,
  summary: MasterSummary,
  masterPath: string,
  jobDir: string,
  base: string,
  drive: Drive,
  renditions: string,
): Promise<Array<{ quality: string; driveFileId: string }>> {
  if (!summary.video) throw new Error('The master has no video stream');
  const ladder = planLadder(summary.video.height);
  if (ladder.length === 0) throw new Error(`Unusable source height ${summary.video.height}`);

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
  return variants;
}

interface BuiltTracks {
  audioTracks: Array<{ language: string; label: string; driveFileId: string; isDefault: boolean; sortOrder: number }>;
  subtitleTracks: Array<{ language: string; label: string; driveFileId: string; isDefault: boolean; isForced: boolean }>;
}

/**
 * Audio and subtitle files, from whatever video was inspected.
 *
 * Shared by both kinds of job, because the work is identical: the question
 * "what languages are in this file, and how do I make them playable" does not
 * depend on where the file came from. Nothing here touches the video stream.
 */
async function buildTracks(
  job: Job,
  summary: MasterSummary,
  sourcePath: string,
  jobDir: string,
  base: string,
  drive: Drive,
  renditions: string,
): Promise<BuiltTracks> {
  // --- audio ----------------------------------------------------------------
  const knownAudio = alreadyBuilt(job.audioTracks);
  const audioTracks: BuiltTracks['audioTracks'] = [];

  if (summary.audio.length > 1) {
    await progress(job.id, 'DETECTING_AUDIO', `${summary.audio.length} tracks`);
    const audioPerLanguage = new Map<string, number>();
    for (const [position, stream] of summary.audio.entries()) {
      if (stopping) throw new Error('Stopped before this audio track was built');
      const language = stream.language ?? `track${position + 1}`;
      const { slug, label } = distinguish(language, stream.label, audioPerLanguage);
      const name = `${base}-${slug}.m4a`;
      const already = knownAudio.get(slug) ?? (await existingUpload(drive, renditions, name));
      if (already) {
        step(`audio ${position + 1}`, `${label} (reused)`);
        audioTracks.push({ language, label, driveFileId: already, isDefault: stream.isDefault, sortOrder: position });
        continue;
      }
      await progress(job.id, 'EXTRACTING_AUDIO', `${label} (${position + 1} of ${summary.audio.length})`);
      const out = path.join(jobDir, name);
      const copied = !audioNeedsConversion(stream.codec);
      await extractAudio(sourcePath, stream.index, out, copied);
      const id = await upload(drive, renditions, out, name);
      step(`audio ${position + 1}`, `${label} ${MB(fs.statSync(out).size)} MB${copied ? ' (copied)' : ' (converted)'}`);
      await fsp.rm(out, { force: true });
      audioTracks.push({ language, label, driveFileId: id, isDefault: stream.isDefault, sortOrder: position });
    }
    if (!audioTracks.some((t) => t.isDefault) && audioTracks[0]) audioTracks[0].isDefault = true;
  } else {
    // One stream plays from the video itself, so a separate file would only
    // duplicate it and give the player a pointless language menu.
    step('audio', summary.audio.length === 1 ? 'single track, plays from the video itself' : 'none in the source');
  }

  // --- subtitles ------------------------------------------------------------
  const knownSubs = alreadyBuilt(job.subtitleTracks);
  const subtitleTracks: BuiltTracks['subtitleTracks'] = [];
  const skipped: string[] = [];
  /** How many streams of each language have been seen, to tell them apart. */
  const subsPerLanguage = new Map<string, number>();

  if (summary.subtitles.length > 0) await progress(job.id, 'DETECTING_SUBTITLES', `${summary.subtitles.length} found`);
  for (const [position, stream] of summary.subtitles.entries()) {
    if (!stream.isTextBased) {
      // A bitmap subtitle would need OCR. Reported, never silently dropped and
      // never registered as if it were available.
      skipped.push(`${stream.label} (${stream.codec} is a bitmap format and needs OCR)`);
      continue;
    }
    if (stopping) throw new Error('Stopped before this subtitle was built');
    const language = stream.language ?? `sub${position + 1}`;
    const { slug, label } = distinguish(language, stream.label, subsPerLanguage);
    const name = `${base}-${slug}.vtt`;
    const already = knownSubs.get(slug) ?? (await existingUpload(drive, renditions, name));
    if (already) {
      step(`subtitle ${position + 1}`, `${label} (reused)`);
      subtitleTracks.push({ language, label, driveFileId: already, isDefault: stream.isDefault, isForced: stream.isForced });
      continue;
    }
    await progress(job.id, 'CONVERTING_SUBTITLES', label);
    const out = path.join(jobDir, name);
    await extractSubtitle(sourcePath, stream.index, out);
    const id = await upload(drive, renditions, out, name);
    step(`subtitle ${position + 1}`, `${label} ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
    await fsp.rm(out, { force: true });
    subtitleTracks.push({ language, label, driveFileId: id, isDefault: stream.isDefault, isForced: stream.isForced });
  }
  if (summary.subtitles.length === 0) step('subtitles', 'none in the source (hardsubbed or absent)');
  for (const note of skipped) step('subtitle', `skipped: ${note}`);

  return { audioTracks, subtitleTracks };
}

/**
 * The scopes the OAuth refresh token was actually granted, or null if that
 * cannot be determined. Used to describe the credential's reach, never printed
 * with the token itself.
 */
async function grantedScopes(): Promise<string[] | null> {
  try {
    const auth = new google.auth.OAuth2(required('GOOGLE_DRIVE_CLIENT_ID'), required('GOOGLE_DRIVE_CLIENT_SECRET'));
    auth.setCredentials({ refresh_token: required('GOOGLE_DRIVE_REFRESH_TOKEN') });
    const { token } = await auth.getAccessToken();
    if (!token) return null;
    const res = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`);
    if (!res.ok) return null;
    const info = (await res.json()) as { scope?: string };
    return info.scope ? info.scope.split(/\s+/).filter(Boolean) : [];
  } catch {
    return null;
  }
}

// --- one job ----------------------------------------------------------------

async function processJob(job: Job): Promise<void> {
  log('');
  log(describe(job));
  currentJobLabel = describe(job);
  const base = baseName(job);
  const jobDir = path.join(WORK_DIR, job.id);
  await fsp.mkdir(jobDir, { recursive: true });

  // A master means transcode a ladder, the way episodes used to be made.
  // Otherwise the admin supplied the qualities and only the tracks are ours.
  const isMasterJob = Boolean(job.masterDriveFileId);

  try {
    const free = await freeSpace(jobDir);
    const needed = isMasterJob ? MIN_FREE_BYTES : MIN_FREE_BYTES_TRACKS;
    if (free < needed) {
      throw new Error(
        `Only ${MB(free)} MB free on the work volume; ${MB(needed)} MB required. ` +
          `Free space or lower MIN_FREE_DISK_BYTES.`,
      );
    }

    // Which file to read. Only ever one: the qualities of an episode are the
    // same content, so probing all of them would cost four downloads to learn
    // the same thing.
    let sourceFileId: string;
    let sourceDescription: string;
    if (isMasterJob) {
      sourceFileId = job.masterDriveFileId!;
      sourceDescription = 'master';
    } else {
      const picked = pickTrackSource(job.variants, job.trackSourceQuality);
      if (!picked?.driveFileId) {
        throw new Error(
          'No uploaded quality to read tracks from. Add at least one video file, or turn off automatic tracks.',
        );
      }
      sourceFileId = picked.driveFileId;
      sourceDescription = qualityLabel(picked.quality);
      step('track source', `${sourceDescription}${job.trackSourceQuality ? ' (chosen)' : ' (highest available)'}`);
    }

    await progress(job.id, 'DOWNLOADING_SOURCE', sourceDescription);
    const sourcePath = path.join(jobDir, 'source');
    await downloadTrackSource(job.id, sourceFileId, sourcePath);

    await progress(job.id, 'PROBING');
    const summary = await probeMedia(sourcePath);
    step(
      'probe',
      `${summary.video ? `${summary.video.codec} ${summary.video.width}x${summary.video.height} ${summary.video.pixFmt}, ` : ''}` +
        `${summary.audio.length} audio, ${summary.subtitles.length} subtitle`,
    );

    const drive = uploadClient();
    const renditions = await folderId(drive, CACHE_FOLDER_NAME);

    // --- video --------------------------------------------------------------
    // For a track job this is the whole of the video handling: nothing. The
    // files the admin uploaded are already the playable variants, and
    // re-encoding them would cost hours to produce something worse.
    const variants = isMasterJob
      ? await buildLadder(job, summary, sourcePath, jobDir, base, drive, renditions)
      : [];
    if (!isMasterJob) step('video', 'untouched — the uploaded qualities are the variants');

    const { audioTracks, subtitleTracks } = await buildTracks(job, summary, sourcePath, jobDir, base, drive, renditions);

    // --- register -----------------------------------------------------------
    await progress(job.id, 'REGISTERING');
    await api(`/media-worker/jobs/${job.id}/media`, {
      body: {
        variants,
        audioTracks,
        subtitleTracks,
        ...(isMasterJob ? {} : { trackSourceFileId: sourceFileId }),
      },
    });
    step(
      'register',
      isMasterJob
        ? `${variants.length} quality, ${audioTracks.length} audio, ${subtitleTracks.length} subtitle`
        : `${audioTracks.length} audio, ${subtitleTracks.length} subtitle from ${sourceDescription}`,
    );

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
      currentStep = null;
      done++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      step('state', `FAILED — ${message.split('\n')[0]}`);
      // Recorded with its cause, so the admin panel can show why rather than
      // leaving an episode that looks finished with nothing to play.
      await api(`/media-worker/jobs/${job.id}/complete`, { body: { ready: false, error: message } }).catch(() => undefined);
      currentJobLabel = null;
      currentStep = null;
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
  await check('Drive (read video)', async () => {
    await readClient().files.list({ pageSize: 1, fields: 'files(id)' });
    if (serviceAccountCredentials()) return 'can read (service account)';
    // files.list succeeds even on a credential that can only see files this
    // app created, which is how a worker that could not open a single pasted
    // link still reported a healthy Drive. Say which kind of reach it has.
    const scopes = await grantedScopes();
    if (scopes === null) return 'can read (scope unknown)';
    const anyFile = scopes.some((scope) => scope.endsWith('/auth/drive') || scope.endsWith('/auth/drive.readonly'));
    return anyFile
      ? 'can read any file this account can see'
      : 'own files only — a pasted Drive link is read through AniZora instead';
  });
  await check('Drive (write tracks)', async () => {
    const drive = uploadClient();
    await folderId(drive, CACHE_FOLDER_NAME);
    return `can write to “${CACHE_FOLDER_NAME}”`;
  });
  await check('Work directory', async () => {
    await fsp.mkdir(WORK_DIR, { recursive: true });
    const free = await freeSpace(WORK_DIR);
    if (free < MIN_FREE_BYTES_TRACKS) {
      throw new Error(`only ${MB(free)} MB free; ${MB(MIN_FREE_BYTES_TRACKS)} MB needed to process a track source`);
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

  const stopHeartbeat = startHeartbeat();
  log(
    `Worker ${WORKER_ID.slice(0, 8)}… polling every ${POLL_SECONDS}s, ` +
      `reporting presence every ${HEARTBEAT_SECONDS}s. SIGTERM or Ctrl+C to stop.`,
  );
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
  stopHeartbeat();
  currentJobLabel = null;
  currentStep = null;
  await heartbeat('IDLE');
  log('Stopped.');
}

main().catch((error: unknown) => {
  console.error(`Worker stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
