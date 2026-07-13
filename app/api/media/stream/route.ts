import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { extractBlobPathname } from '@/lib/blob-sign';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Authenticated byte stream for private blobs.
 * Reliable fallback when signed CDN URLs fail; also used for forced downloads.
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
      { error: 'BLOB_READ_WRITE_TOKEN is not configured.' },
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
    const lookup = rawUrl && rawUrl.includes('://') ? rawUrl.split('?')[0] : pathname;

    const result = await get(lookup, {
      access: 'private',
      token,
      useCache: true
    });

    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json({ error: 'File not found in Blob storage.' }, { status: 404 });
    }

    const headers = new Headers();
    const contentType =
      result.blob.contentType ||
      result.headers.get('content-type') ||
      'application/octet-stream';
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'private, max-age=300');
    headers.set(
      'Content-Disposition',
      `${disposition}; filename="${filename.replace(/"/g, '')}"`
    );
    if (result.blob.size != null) {
      headers.set('Content-Length', String(result.blob.size));
    }

    return new NextResponse(result.stream, { status: 200, headers });
  } catch (err) {
    console.error('[api/media/stream]', err);
    const message = err instanceof Error ? err.message : 'Failed to stream file';
    // Surface Forbidden / auth issues clearly
    if (/forbidden|unauthorized|access/i.test(message)) {
      return NextResponse.json(
        {
          error:
            'Blob access denied. Confirm BLOB_READ_WRITE_TOKEN matches the private store and access is private.'
        },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
