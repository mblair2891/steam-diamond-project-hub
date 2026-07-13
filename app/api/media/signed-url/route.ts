import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  buildStreamUrls,
  createSignedGetUrl,
  extractBlobPathname,
  isVercelBlobRef
} from '@/lib/blob-sign';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/media/signed-url?pathname=… | ?url=…&filename=…
 * Auth: Clerk session required.
 * Returns temporary signed CDN URLs (24h) + same-origin stream fallbacks.
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
  const filename = searchParams.get('filename')?.trim();
  const target = pathname || url;

  if (!target) {
    return NextResponse.json(
      { error: 'Provide pathname or url query parameter.' },
      { status: 400 }
    );
  }

  if (!isVercelBlobRef(target) && !pathname) {
    return NextResponse.json({ error: 'Not a Vercel Blob reference.' }, { status: 400 });
  }

  const fallback = buildStreamUrls(target, filename);

  try {
    const result = await createSignedGetUrl(target);
    return NextResponse.json(
      {
        ok: true,
        signedUrl: result.signedUrl,
        downloadUrl: result.downloadUrl,
        pathname: result.pathname,
        expiresAt: result.expiresAt,
        // Always include stream fallbacks (same-origin, cookie auth)
        previewStreamUrl: fallback.previewStreamUrl,
        downloadStreamUrl: fallback.downloadStreamUrl
      },
      {
        headers: {
          'Cache-Control': 'private, no-store'
        }
      }
    );
  } catch (err) {
    console.error('[api/media/signed-url] signed failed, returning stream fallback', err);
    const message = err instanceof Error ? err.message : 'Failed to sign URL';
    // Don't hard-fail: stream endpoints still work for logged-in users
    return NextResponse.json(
      {
        ok: true,
        signedUrl: fallback.previewStreamUrl,
        downloadUrl: fallback.downloadStreamUrl,
        pathname: extractBlobPathname(target),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        fallback: true,
        warning: message,
        previewStreamUrl: fallback.previewStreamUrl,
        downloadStreamUrl: fallback.downloadStreamUrl
      },
      {
        headers: { 'Cache-Control': 'private, no-store' }
      }
    );
  }
}

/**
 * POST /api/media/signed-url
 * Body: { urls: string[] } — batch (max 40).
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json({ error: 'Vercel Blob is not configured.' }, { status: 503 });
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
    {
      signedUrl: string;
      downloadUrl: string;
      expiresAt: number;
      pathname: string;
      previewStreamUrl?: string;
      downloadStreamUrl?: string;
      fallback?: boolean;
    }
  > = {};

  await Promise.all(
    urls.map(async (raw) => {
      const fallback = buildStreamUrls(raw);
      try {
        const signed = await createSignedGetUrl(raw);
        results[raw] = {
          signedUrl: signed.signedUrl,
          downloadUrl: signed.downloadUrl,
          expiresAt: signed.expiresAt,
          pathname: signed.pathname,
          previewStreamUrl: fallback.previewStreamUrl,
          downloadStreamUrl: fallback.downloadStreamUrl
        };
      } catch {
        results[raw] = {
          signedUrl: fallback.previewStreamUrl,
          downloadUrl: fallback.downloadStreamUrl,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
          pathname: extractBlobPathname(raw),
          previewStreamUrl: fallback.previewStreamUrl,
          downloadStreamUrl: fallback.downloadStreamUrl,
          fallback: true
        };
      }
    })
  );

  return NextResponse.json(
    { ok: true, results },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
