import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { del } from '@vercel/blob';
import {
  deleteDocument,
  getDocument,
  patchDocument,
  upsertDocument
} from '@/lib/documents-store';
import { canEditProject, normalizeRole } from '@/lib/roles';
import type { ReviewDocument } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/**
 * GET /api/documents/[id]
 */
export async function GET(_request: Request, ctx: Ctx) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json({ error: 'Blob not configured' }, { status: 503 });
  }

  const id = decodeURIComponent(ctx.params.id || '').trim();
  if (!id) {
    return NextResponse.json({ error: 'Missing document id' }, { status: 400 });
  }

  try {
    const document = await getDocument(id);
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    return NextResponse.json(
      { ok: true, document },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    console.error('[api/documents GET id]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load document' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/documents/[id]
 * Update metadata / file refs (editors/admins). Does not replace comments array
 * unless explicitly provided as full replace via `replaceComments: true`.
 */
export async function PUT(request: Request, ctx: Ctx) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  const user = await currentUser();
  const role = normalizeRole(user?.publicMetadata?.role ?? user?.unsafeMetadata?.role);
  if (!canEditProject(role)) {
    return NextResponse.json(
      { error: 'Editors and admins only may edit documents.' },
      { status: 403 }
    );
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json({ error: 'Blob not configured' }, { status: 503 });
  }

  const id = decodeURIComponent(ctx.params.id || '').trim();
  if (!id) {
    return NextResponse.json({ error: 'Missing document id' }, { status: 400 });
  }

  let body: Partial<ReviewDocument> & { replaceComments?: boolean };
  try {
    body = (await request.json()) as Partial<ReviewDocument> & {
      replaceComments?: boolean;
    };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const existing = await getDocument(id);
    if (!existing) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (body.replaceComments && Array.isArray(body.comments)) {
      const next: ReviewDocument = {
        ...existing,
        ...body,
        id: existing.id,
        createdAt: existing.createdAt,
        comments: body.comments,
        updatedAt: new Date().toISOString()
      };
      const saved = await upsertDocument(next);
      return NextResponse.json(
        { ok: true, document: saved },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    const saved = await patchDocument(id, body);
    if (!saved) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    return NextResponse.json(
      { ok: true, document: saved },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    console.error('[api/documents PUT]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update document' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/documents/[id]
 * Removes metadata from shared store; optionally deletes blob files when present.
 */
export async function DELETE(_request: Request, ctx: Ctx) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  const user = await currentUser();
  const role = normalizeRole(user?.publicMetadata?.role ?? user?.unsafeMetadata?.role);
  if (!canEditProject(role)) {
    return NextResponse.json(
      { error: 'Editors and admins only may delete documents.' },
      { status: 403 }
    );
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json({ error: 'Blob not configured' }, { status: 503 });
  }

  const id = decodeURIComponent(ctx.params.id || '').trim();
  if (!id) {
    return NextResponse.json({ error: 'Missing document id' }, { status: 400 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN.trim();

  try {
    const result = await deleteDocument(id, token);
    if (!result.ok) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const doc = result.document;
    // Best-effort blob cleanup (do not fail delete if blobs already gone)
    const paths = [doc?.pathname, doc?.fileUrl, doc?.redlinePathname, doc?.redlineFileUrl]
      .filter(Boolean)
      .map((p) => String(p));

    for (const target of paths) {
      try {
        if (target.startsWith('data:') || target.startsWith('blob:')) continue;
        await del(
          target.includes('://') && !target.includes('/api/media/')
            ? target.split('?')[0]
            : target,
          { token }
        );
      } catch (err) {
        console.warn('[api/documents DELETE] blob cleanup', target, err);
      }
    }

    return NextResponse.json(
      { ok: true, id },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    console.error('[api/documents DELETE]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete document' },
      { status: 500 }
    );
  }
}
