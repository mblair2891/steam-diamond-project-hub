import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Stream a private Vercel Blob for authenticated hub users.
 * Query: ?pathname=media/…  OR  ?url=https://….blob.vercel-storage.com/…
 */
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json(
      { error: 'Vercel Blob is not configured (BLOB_READ_WRITE_TOKEN).' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const pathname = searchParams.get('pathname')?.trim();
  const url = searchParams.get('url')?.trim();
  const target = pathname || url;

  if (!target) {
    return NextResponse.json(
      { error: 'Missing pathname or url query parameter.' },
      { status: 400 }
    );
  }

  // Basic path traversal guard for pathname form
  if (pathname && (pathname.includes('..') || pathname.startsWith('/'))) {
    return NextResponse.json({ error: 'Invalid pathname.' }, { status: 400 });
  }

  try {
    const result = await get(target, {
      access: 'private',
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    if (!result || result.statusCode === 304 || !result.stream) {
      return NextResponse.json({ error: 'File not found.' }, { status: 404 });
    }

    const headers = new Headers();
    const contentType =
      result.blob.contentType ||
      result.headers.get('content-type') ||
      'application/octet-stream';
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'private, max-age=3600');
    if (result.blob.size != null) {
      headers.set('Content-Length', String(result.blob.size));
    }
    const disposition =
      result.blob.contentDisposition || result.headers.get('content-disposition');
    if (disposition) {
      headers.set('Content-Disposition', disposition);
    }

    return new NextResponse(result.stream, {
      status: 200,
      headers
    });
  } catch (err) {
    console.error('[api/media/file]', err);
    const raw = err instanceof Error ? err.message : 'Failed to load file';
    return NextResponse.json({ error: raw }, { status: 500 });
  }
}
