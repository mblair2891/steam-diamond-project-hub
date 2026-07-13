import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { extractBlobPathname } from '@/lib/blob-sign';
import {
  loadLibraryMeta,
  type LibraryMetaEntry,
  upsertLibraryMetaEntry
} from '@/lib/media-library';
import { canEditProject, normalizeRole } from '@/lib/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/media/meta
 * Shared library metadata (titles, status, assignees) for all devices.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json({ error: 'Blob not configured' }, { status: 503 });
  }

  try {
    const store = await loadLibraryMeta();
    return NextResponse.json(
      { ok: true, ...store },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    console.error('[api/media/meta GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load meta' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/media/meta
 * Body: { pathname, ...LibraryMetaEntry } or { url, ... }
 * Upserts metadata for one library asset (editors/admins).
 */
export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  const user = await currentUser();
  const role = normalizeRole(user?.publicMetadata?.role ?? user?.unsafeMetadata?.role);
  if (!canEditProject(role)) {
    return NextResponse.json(
      { error: 'Editors and admins only may edit media metadata.' },
      { status: 403 }
    );
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json({ error: 'Blob not configured' }, { status: 503 });
  }

  let body: LibraryMetaEntry & { pathname?: string; url?: string };
  try {
    body = (await request.json()) as LibraryMetaEntry & { pathname?: string; url?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const pathname = extractBlobPathname(body.pathname || body.url || '');
  if (!pathname || pathname.includes('..')) {
    return NextResponse.json({ error: 'Provide a valid pathname or url.' }, { status: 400 });
  }

  const entry: LibraryMetaEntry = {
    title: body.title,
    description: body.description,
    notes: body.notes ?? body.description,
    scheduledDate: body.scheduledDate,
    status: body.status,
    assigneeId: body.assigneeId ?? null,
    assigneeName: body.assigneeName ?? null,
    name: body.name,
    mime: body.mime
  };

  // Drop undefined keys so we don't wipe existing fields unintentionally in upsert merge
  const clean = Object.fromEntries(
    Object.entries(entry).filter(([, v]) => v !== undefined)
  ) as LibraryMetaEntry;

  try {
    const store = await upsertLibraryMetaEntry(pathname, clean);
    return NextResponse.json(
      { ok: true, pathname, entry: store.byPathname[pathname] },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    console.error('[api/media/meta PUT]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save meta' },
      { status: 500 }
    );
  }
}
