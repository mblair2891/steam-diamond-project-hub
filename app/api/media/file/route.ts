import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSignedGetUrl } from '@/lib/blob-sign';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Redirect to a short-lived signed GET URL for a private blob.
 * Prefer /api/media/signed-url for JSON; this keeps old /api/media/file links working.
 *
 * Query: ?pathname=media/…  OR  ?url=https://….private.blob.vercel-storage.com/…
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

  if (pathname && (pathname.includes('..') || pathname.startsWith('/'))) {
    return NextResponse.json({ error: 'Invalid pathname.' }, { status: 400 });
  }

  try {
    const { signedUrl } = await createSignedGetUrl(target);
    return NextResponse.redirect(signedUrl, {
      status: 302,
      headers: {
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (err) {
    console.error('[api/media/file]', err);
    const raw = err instanceof Error ? err.message : 'Failed to sign file URL';
    return NextResponse.json({ error: raw }, { status: 500 });
  }
}
