import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Generates original placeholder artwork for the demo catalogue.
 *
 * Everything is abstract: layered gradients, arcs and bands derived
 * deterministically from the title string. No characters, photographs or
 * third-party assets are involved, so the seeded catalogue ships with art that
 * is genuinely ours and safe to redistribute.
 *
 * The output is stable for a given title, so re-seeding does not churn files.
 */

interface Palette {
  from: string;
  to: string;
  accent: string;
  ink: string;
}

const PALETTES: Palette[] = [
  { from: '#2b1055', to: '#7c5cff', accent: '#22e1c8', ink: '#f4f1ff' },
  { from: '#0f2027', to: '#2c5364', accent: '#ff4d8d', ink: '#eafaff' },
  { from: '#3a1c71', to: '#d76d77', accent: '#ffd66b', ink: '#fff5f7' },
  { from: '#0b486b', to: '#3ab0a2', accent: '#ffe66d', ink: '#effdfb' },
  { from: '#42275a', to: '#734b6d', accent: '#8ee3ef', ink: '#fdf3ff' },
  { from: '#141e30', to: '#243b55', accent: '#7c5cff', ink: '#e9efff' },
  { from: '#43126b', to: '#ff2d95', accent: '#00e5ff', ink: '#fff0fb' },
  { from: '#093028', to: '#237a57', accent: '#f6d365', ink: '#eaffef' },
  { from: '#59104d', to: '#c04848', accent: '#ffcc70', ink: '#fff2ee' },
  { from: '#16222a', to: '#3a6073', accent: '#ff7eb3', ink: '#eef6fb' },
];

/** Stable pseudo-random stream seeded from the title. */
function rng(seed: string): () => number {
  let h = parseInt(createHash('sha256').update(seed).digest('hex').slice(0, 8), 16);
  return () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 0xffffffff;
  };
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&apos;';
    }
  });
}

/** Breaks a title into at most three lines that fit the poster width. */
function wrap(title: string, perLine: number, maxLines: number): string[] {
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > perLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.length ? lines : [title.slice(0, perLine)];
}

export function posterSvg(title: string, subtitle?: string): string {
  const random = rng(title);
  const palette = PALETTES[Math.floor(random() * PALETTES.length)];
  const W = 400;
  const H = 600;

  const arcs = Array.from({ length: 5 }, (_, i) => {
    const cx = random() * W;
    const cy = random() * H * 0.7;
    const r = 60 + random() * 190;
    const opacity = (0.06 + random() * 0.14).toFixed(3);
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${
      i % 2 === 0 ? palette.accent : palette.ink
    }" stroke-width="${(1 + random() * 3).toFixed(1)}" opacity="${opacity}"/>`;
  }).join('');

  const bands = Array.from({ length: 3 }, () => {
    const y = random() * H;
    const h = 2 + random() * 6;
    return `<rect x="0" y="${y.toFixed(1)}" width="${W}" height="${h.toFixed(1)}" fill="${palette.accent}" opacity="${(
      0.08 + random() * 0.12
    ).toFixed(3)}"/>`;
  }).join('');

  const angle = Math.floor(random() * 60) - 30;
  const lines = wrap(title.toUpperCase(), 14, 3);
  const startY = H - 108 - (lines.length - 1) * 30;

  const titleSvg = lines
    .map(
      (line, i) =>
        `<text x="28" y="${startY + i * 30}" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="27" font-weight="700" letter-spacing="0.5" fill="${palette.ink}">${escapeXml(
          line,
        )}</text>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(${angle} 0.5 0.5)">
      <stop offset="0%" stop-color="${palette.from}"/>
      <stop offset="100%" stop-color="${palette.to}"/>
    </linearGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="45%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.78"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${arcs}
  ${bands}
  <path d="M0 ${H * 0.62} Q ${W * 0.5} ${H * 0.46} ${W} ${H * 0.66} L ${W} ${H} L 0 ${H} Z" fill="${palette.from}" opacity="0.45"/>
  <rect width="${W}" height="${H}" fill="url(#shade)"/>
  <rect x="28" y="${startY - 44}" width="52" height="4" fill="${palette.accent}"/>
  ${titleSvg}
  ${
    subtitle
      ? `<text x="28" y="${H - 52}" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="13" fill="${palette.accent}" opacity="0.95">${escapeXml(
          subtitle,
        )}</text>`
      : ''
  }
</svg>`;
}

export function bannerSvg(title: string, subtitle?: string): string {
  const random = rng(`${title}-banner`);
  const palette = PALETTES[Math.floor(random() * PALETTES.length)];
  const W = 1600;
  const H = 600;

  const rays = Array.from({ length: 9 }, () => {
    const x = random() * W;
    const w = 40 + random() * 160;
    return `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${H}" fill="${palette.ink}" opacity="${(
      0.02 +
      random() * 0.05
    ).toFixed(3)}"/>`;
  }).join('');

  const orbs = Array.from({ length: 4 }, () => {
    const cx = random() * W;
    const cy = random() * H;
    const r = 100 + random() * 260;
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${palette.accent}" opacity="${(
      0.04 +
      random() * 0.07
    ).toFixed(3)}"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.from}"/>
      <stop offset="100%" stop-color="${palette.to}"/>
    </linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#05050a" stop-opacity="0.92"/>
      <stop offset="62%" stop-color="#05050a" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#05050a" stop-opacity="0.55"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${orbs}
  ${rays}
  <rect width="${W}" height="${H}" fill="url(#fade)"/>
  <rect x="72" y="${H / 2 - 66}" width="60" height="4" fill="${palette.accent}"/>
  <text x="72" y="${H / 2 - 18}" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="58" font-weight="800" fill="${palette.ink}">${escapeXml(
    title,
  )}</text>
  ${
    subtitle
      ? `<text x="72" y="${H / 2 + 22}" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="20" fill="${palette.accent}">${escapeXml(
          subtitle,
        )}</text>`
      : ''
  }
</svg>`;
}

export function thumbnailSvg(title: string, episodeNumber: number): string {
  const random = rng(`${title}-ep${episodeNumber}`);
  const palette = PALETTES[Math.floor(random() * PALETTES.length)];
  const W = 640;
  const H = 360;

  const shards = Array.from({ length: 6 }, () => {
    const x = random() * W;
    const y = random() * H;
    const s = 20 + random() * 90;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${s.toFixed(1)}" height="${(s * 0.18).toFixed(
      1,
    )}" fill="${palette.accent}" opacity="${(0.08 + random() * 0.14).toFixed(3)}" transform="rotate(${(
      random() * 60 -
      30
    ).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.from}"/>
      <stop offset="100%" stop-color="${palette.to}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${shards}
  <rect x="0" y="${H - 96}" width="${W}" height="96" fill="#05050a" opacity="0.62"/>
  <text x="24" y="${H - 52}" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff">Episode ${episodeNumber}</text>
  <text x="24" y="${H - 26}" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="14" fill="${palette.accent}">${escapeXml(
    title,
  )}</text>
</svg>`;
}

export function avatarSvg(seed: string): string {
  const random = rng(`avatar-${seed}`);
  const palette = PALETTES[Math.floor(random() * PALETTES.length)];
  const S = 160;
  const initial = (seed.trim()[0] ?? '?').toUpperCase();

  const dots = Array.from({ length: 6 }, () => {
    const cx = random() * S;
    const cy = random() * S;
    const r = 8 + random() * 34;
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${palette.ink}" opacity="${(
      0.05 +
      random() * 0.1
    ).toFixed(3)}"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.from}"/>
      <stop offset="100%" stop-color="${palette.to}"/>
    </linearGradient>
  </defs>
  <rect width="${S}" height="${S}" rx="${S / 2}" fill="url(#bg)"/>
  ${dots}
  <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="70" font-weight="700" fill="${palette.ink}">${escapeXml(
    initial,
  )}</text>
</svg>`;
}

/** Writes an SVG into the uploads tree and returns its public URL. */
export async function writeArt(
  uploadsRoot: string,
  publicBaseUrl: string,
  folder: string,
  filename: string,
  svg: string,
): Promise<string> {
  const dir = join(uploadsRoot, folder);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), svg, 'utf8');
  return `${publicBaseUrl.replace(/\/$/, '')}/${folder}/${filename}`;
}
