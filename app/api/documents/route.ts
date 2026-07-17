import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import {
  listDocuments,
  upsertDocument
} from '@/lib/documents-store';
import { canEditProject, normalizeRole } from '@/lib/roles';
import type { DocumentReviewStatus, ReviewDocument } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/documents
 * Cloud-synced document list for all signed-in users / devices.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json(
      {
        error:
          'Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN and redeploy.',
        documents: [],
        total: 0
      },
      { status: 503 }
    );
  }

  try {
    const { documents, total, updatedAt } = await listDocuments();
    return NextResponse.json(
      {
        ok: true,
        documents,
        total,
        updatedAt,
        source: 'vercel-blob',
        fetchedAt: new Date().toISOString()
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    console.error('[api/documents GET]', err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Failed to list documents',
        documents: [],
        total: 0
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/documents
 * Create a new review document (editors/admins).
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  const user = await currentUser();
  const role = normalizeRole(user?.publicMetadata?.role ?? user?.unsafeMetadata?.role);
  if (!canEditProject(role)) {
    return NextResponse.json(
      { error: 'Editors and admins only may create documents.' },
      { status: 403 }
    );
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json({ error: 'Blob not configured' }, { status: 503 });
  }

  let body: Partial<ReviewDocument> & { title?: string };
  try {
    body = (await request.json()) as Partial<ReviewDocument> & { title?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const title = (body.title || '').trim();
  if (!title) {
    return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const displayName =
    user?.fullName || user?.firstName || user?.username || userId;

  const doc: ReviewDocument = {
    id:
      body.id ||
      `rd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    description: (body.description || '').trim(),
    status: (body.status as DocumentReviewStatus) || 'Draft',
    version: typeof body.version === 'number' && body.version > 0 ? body.version : 1,
    fileName: body.fileName ?? null,
    fileUrl: body.fileUrl ?? null,
    pathname: body.pathname ?? null,
    mime: body.mime ?? null,
    size: body.size ?? null,
    redlineFileName: body.redlineFileName ?? null,
    redlineFileUrl: body.redlineFileUrl ?? null,
    redlinePathname: body.redlinePathname ?? null,
    redlineMime: body.redlineMime ?? null,
    redlineSize: body.redlineSize ?? null,
    comments: Array.isArray(body.comments) ? body.comments : [],
    createdAt: body.createdAt || now,
    updatedAt: now,
    uploadedById: body.uploadedById ?? userId,
    uploadedByName: body.uploadedByName ?? displayName
  };

  try {
    const saved = await upsertDocument(doc);
    return NextResponse.json(
      { ok: true, document: saved },
      { status: 201, headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    console.error('[api/documents POST]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create document' },
      { status: 500 }
    );
  }
}
