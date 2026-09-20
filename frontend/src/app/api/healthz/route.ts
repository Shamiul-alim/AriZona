import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Liveness probe for the Docker healthcheck. Does not touch the backend. */
export function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}
