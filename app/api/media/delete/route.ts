import { del } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { canEditProject, normalizeRole } from '@/lib/roles';
import { extractBlobPathname } from '@/lib/blob-sign';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/media/delete
 * Body: { url?: string, pathname?: string }
 * Removes the object from the private Vercel Blob store (editors/admins only).
 */
export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  const user = await currentUser();
  const role = normalizeRole(user?.publicMetadata?.role ?? user?.unsafeMetadata?.role);
  if (!canEditProject(role)) {
    return NextResponse.json(
      { error: 'Editors and admins only may delete media files.' },
      { status: 403 }
    );
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

  const pathname = extractBlobPathname(target);
  if (!pathname || pathname.includes('..')) {
    return NextResponse.json({ error: 'Invalid blob path.' }, { status: 400 });
  }

  try {
    // del accepts URL or pathname
    const delTarget =
      body.url && body.url.includes('://') ? body.url.split('?')[0] : pathname;
    await del(delTarget, { token });
    return NextResponse.json({ ok: true, pathname });
  } catch (err) {
    console.error('[api/media/delete]', err);
    const message = err instanceof Error ? err.message : 'Delete failed';
    // Still allow client to drop metadata if blob already gone
    if (/not found|404/i.test(message)) {
      return NextResponse.json({ ok: true, pathname, missing: true });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
