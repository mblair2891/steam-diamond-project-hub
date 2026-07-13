import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSignedGetUrl, isVercelBlobRef } from '@/lib/blob-sign';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/media/signed-url?pathname=… | ?url=…
 * Auth: Clerk session required.
 * Returns a short-lived signed GET URL for a private Vercel Blob.
 */
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json(
      {
        error:
          'Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN and redeploy.'
      },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const pathname = searchParams.get('pathname')?.trim();
  const url = searchParams.get('url')?.trim();
  const target = pathname || url;

  if (!target) {
    return NextResponse.json(
      { error: 'Provide pathname or url query parameter.' },
      { status: 400 }
    );
  }

  if (!isVercelBlobRef(target) && !pathname) {
    // Allow bare pathnames via pathname param; reject random external URLs
    return NextResponse.json({ error: 'Not a Vercel Blob reference.' }, { status: 400 });
  }

  try {
    const result = await createSignedGetUrl(target);
    return NextResponse.json(
      {
        ok: true,
        signedUrl: result.signedUrl,
        pathname: result.pathname,
        expiresAt: result.expiresAt
      },
      {
        headers: {
          'Cache-Control': 'private, no-store'
        }
      }
    );
  } catch (err) {
    console.error('[api/media/signed-url]', err);
    const message = err instanceof Error ? err.message : 'Failed to sign URL';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/media/signed-url
 * Body: { urls: string[] } — batch sign for gallery lists (max 40).
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json(
      { error: 'Vercel Blob is not configured.' },
      { status: 503 }
    );
  }

  let body: { urls?: string[] };
  try {
    body = (await request.json()) as { urls?: string[] };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const urls = Array.isArray(body.urls) ? body.urls.filter(Boolean).slice(0, 40) : [];
  if (urls.length === 0) {
    return NextResponse.json({ error: 'urls array required' }, { status: 400 });
  }

  const results: Record<
    string,
    { signedUrl: string; expiresAt: number; pathname: string } | { error: string }
  > = {};

  await Promise.all(
    urls.map(async (raw) => {
      try {
        if (!isVercelBlobRef(raw) && !/^(media|blitz|uploads)\//i.test(raw)) {
          results[raw] = { error: 'Not a blob reference' };
          return;
        }
        const signed = await createSignedGetUrl(raw);
        results[raw] = {
          signedUrl: signed.signedUrl,
          expiresAt: signed.expiresAt,
          pathname: signed.pathname
        };
      } catch (err) {
        results[raw] = {
          error: err instanceof Error ? err.message : 'Sign failed'
        };
      }
    })
  );

  return NextResponse.json(
    { ok: true, results },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
