import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { extractBlobPathname } from '@/lib/blob-sign';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Authenticated byte stream for private blobs.
 * Reliable delivery path for logged-in users (Clerk session required).
 * Prefer this over raw private CDN URLs — those return Forbidden without a signature.
 *
 * GET /api/media/stream?url=…|pathname=…&disposition=inline|attachment&filename=…
 */
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      {
        error:
          'BLOB_READ_WRITE_TOKEN is not configured. Add it in Vercel → Environment Variables and redeploy.'
      },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get('url')?.trim();
  const pathnameParam = searchParams.get('pathname')?.trim();
  const target = pathnameParam || rawUrl;

  if (!target) {
    return NextResponse.json({ error: 'Provide url or pathname.' }, { status: 400 });
  }

  const pathname = extractBlobPathname(target);
  if (!pathname || pathname.includes('..')) {
    return NextResponse.json({ error: 'Invalid blob path.' }, { status: 400 });
  }

  const disposition =
    searchParams.get('disposition') === 'attachment' ? 'attachment' : 'inline';
  const filename =
    searchParams.get('filename')?.replace(/[^\w.\- ()[\]]+/g, '_') ||
    pathname.split('/').pop() ||
    'file';

  try {
    // Prefer full URL when available (more reliable across store host formats)
    const lookup =
      rawUrl && rawUrl.includes('://') && !rawUrl.includes('/api/media/')
        ? rawUrl.split('?')[0]
        : pathname;

    const extraHeaders: Record<string, string> = {};
    const range = request.headers.get('range');
    if (range) extraHeaders.Range = range;
    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch) extraHeaders['If-None-Match'] = ifNoneMatch;

    const result = await get(lookup, {
      access: 'private',
      token,
      useCache: true,
      ifNoneMatch: ifNoneMatch ?? undefined,
      headers: Object.keys(extraHeaders).length ? extraHeaders : undefined
    });

    if (!result) {
      return NextResponse.json({ error: 'File not found in Blob storage.' }, { status: 404 });
    }

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag || '',
          'Cache-Control': 'private, no-cache'
        }
      });
    }

    if (result.statusCode !== 200 || !result.stream) {
      return NextResponse.json({ error: 'File not found in Blob storage.' }, { status: 404 });
    }

    const headers = new Headers();
    const contentType =
      result.blob.contentType ||
      result.headers.get('content-type') ||
      'application/octet-stream';
    headers.set('Content-Type', contentType);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'private, no-cache');
    headers.set(
      'Content-Disposition',
      `${disposition}; filename="${filename.replace(/"/g, '')}"`
    );
    if (result.blob.etag) {
      headers.set('ETag', result.blob.etag);
    }
    if (result.blob.size != null) {
      headers.set('Content-Length', String(result.blob.size));
    }

    // Forward partial-content headers for video seeking when Blob supports Range
    const contentRange = result.headers.get('content-range');
    const acceptRanges = result.headers.get('accept-ranges');
    if (contentRange) headers.set('Content-Range', contentRange);
    if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);

    const status = contentRange ? 206 : 200;
    return new NextResponse(result.stream, { status, headers });
  } catch (err) {
    console.error('[api/media/stream]', err);
    const message = err instanceof Error ? err.message : 'Failed to stream file';
    if (/forbidden|unauthorized|access|BlobAccessError/i.test(message)) {
      return NextResponse.json(
        {
          error:
            'Blob access denied. Confirm BLOB_READ_WRITE_TOKEN matches the private store used for uploads.'
        },
        { status: 403 }
      );
    }
    if (/not found|BlobNotFound/i.test(message)) {
      return NextResponse.json({ error: 'File not found in Blob storage.' }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
