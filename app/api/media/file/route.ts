import { NextResponse } from 'next/server';

/**
 * Legacy path — redirect query to the authenticated stream endpoint
 * (avoids Forbidden on private stores when old links are used).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = new URL('/api/media/stream', url.origin);
  url.searchParams.forEach((v, k) => target.searchParams.set(k, v));
  if (!target.searchParams.has('disposition')) {
    target.searchParams.set('disposition', 'inline');
  }
  return NextResponse.redirect(target, 307);
}
