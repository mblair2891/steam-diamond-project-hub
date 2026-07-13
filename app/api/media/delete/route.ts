import { del } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { extractBlobPathname } from '@/lib/blob-sign';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/media/delete
 * Body: { url?: string, pathname?: string }
 * Removes the object from the private Vercel Blob store.
 * Any signed-in user may delete media (library is team-shared).
 */
export async function DELETE(request: Request) {
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

  let body: { url?: string; pathname?: string };
  try {
    body = (await request.json()) as { url?: string; pathname?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const target = (body.url || body.pathname || '').trim();
  if (!target) {
    return NextResponse.json({ error: 'Provide url or pathname.' }, { status: 400 });
  }

  // Local data URLs — nothing to delete in Blob
  if (target.startsWith('data:') || target.startsWith('blob:')) {
    return NextResponse.json({ ok: true, localOnly: true });
  }

  const pathname = extractBlobPathname(target);
  if (!pathname || pathname.includes('..')) {
    return NextResponse.json({ error: 'Invalid blob path.' }, { status: 400 });
  }

  try {
    // del accepts URL or pathname — prefer full URL when present
    const delTarget =
      body.url && body.url.includes('://') && !body.url.includes('/api/media/')
        ? body.url.split('?')[0]
        : pathname;
    await del(delTarget, { token });
    return NextResponse.json({ ok: true, pathname });
  } catch (err) {
    console.error('[api/media/delete]', err);
    const message = err instanceof Error ? err.message : 'Delete failed';
    // Still allow client to drop metadata if blob already gone
    if (/not found|404|BlobNotFound/i.test(message)) {
      return NextResponse.json({ ok: true, pathname, missing: true });
    }
    if (/forbidden|unauthorized|access|BlobAccessError/i.test(message)) {
      return NextResponse.json(
        {
          error:
            'Blob delete denied. Confirm BLOB_READ_WRITE_TOKEN matches the private store.'
        },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
