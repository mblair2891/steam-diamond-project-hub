import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { appendDocumentComment } from '@/lib/documents-store';
import type { DocumentComment } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/**
 * POST /api/documents/[id]/comments
 * Any signed-in role (Admin / Editor / View Only) may comment.
 */
export async function POST(request: Request, ctx: Ctx) {
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

  let body: { body?: string; parentId?: string | null; authorName?: string };
  try {
    body = (await request.json()) as {
      body?: string;
      parentId?: string | null;
      authorName?: string;
    };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const text = (body.body || '').trim();
  if (!text) {
    return NextResponse.json({ error: 'Comment body is required.' }, { status: 400 });
  }

  const user = await currentUser();
  const authorName =
    (body.authorName || '').trim() ||
    user?.fullName ||
    user?.firstName ||
    user?.username ||
    'User';

  const comment: DocumentComment = {
    id: `rdc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    parentId: body.parentId ?? null,
    authorId: userId,
    authorName,
    body: text,
    createdAt: new Date().toISOString()
  };

  try {
    const document = await appendDocumentComment(id, comment);
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    return NextResponse.json(
      { ok: true, document, comment },
      { status: 201, headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    console.error('[api/documents comments]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to post comment' },
      { status: 500 }
    );
  }
}
