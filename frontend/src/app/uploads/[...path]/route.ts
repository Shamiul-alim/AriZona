import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Serves uploaded media (posters, banners, thumbnails, avatars) from the site's
 * own origin by proxying to the API.
 *
 * Why this exists: image URLs are stored as site-relative "/uploads/..." paths.
 * The Next.js image optimizer runs inside the frontend container and fetches
 * relative images from this server — so they must be reachable here. The API
 * is reached over the internal network (INTERNAL_API_URL), which is the only
 * address that works from inside a container.
 */
function apiOrigin(): string {
  const base = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
  return base.replace(/\/api\/?$/, '');
}

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;

  // Only plain file-name segments: no "..", no encoded slashes, no surprises.
  if (!path.length || !path.every((segment) => SAFE_SEGMENT.test(segment) && segment !== '..')) {
    return new NextResponse('Not found', { status: 404 });
  }

  const upstream = await fetch(`${apiOrigin()}/uploads/${path.join('/')}`, { cache: 'no-store' }).catch(() => null);
  if (!upstream || !upstream.ok || !upstream.body) {
    return new NextResponse('Not found', { status: upstream?.status === 404 ? 404 : 502 });
  }

  const headers = new Headers();
  headers.set('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream');
  const length = upstream.headers.get('content-length');
  if (length) headers.set('Content-Length', length);
  // Upload names are unique per file, so a given URL never changes content.
  headers.set('Cache-Control', 'public, max-age=604800, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');

  return new NextResponse(upstream.body, { status: 200, headers });
}
