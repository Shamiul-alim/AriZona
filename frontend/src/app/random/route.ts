import { NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * "Random" is a redirect rather than a page: it asks the API for a random
 * published slug and sends the visitor straight to it, so there is never an
 * intermediate screen and the result is never cached.
 */
export async function GET() {
  // The Location header is deliberately relative. Building it from
  // `request.url` breaks in Docker: the standalone server reports its bind
  // address, so the browser was sent to http://0.0.0.0:3000/... and failed
  // with ERR_ADDRESS_INVALID. A relative target is resolved by the browser
  // against whatever host it actually used, so it works everywhere.
  const redirectTo = (path: string) => new NextResponse(null, { status: 307, headers: { Location: path } });

  try {
    const result = await apiFetch<{ slug: string }>('/anime/random');
    return redirectTo(`/anime/${result.slug}`);
  } catch {
    return redirectTo('/browse');
  }
}
