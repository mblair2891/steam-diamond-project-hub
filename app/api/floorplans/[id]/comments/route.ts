import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { appendFloorPlanComment } from '@/lib/floorplans-store';
import type { FloorPlanComment } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** POST — any signed-in role may comment on a version. */
export async function POST(request: Request, ctx: Ctx) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json({ error: 'Blob not configured' }, { status: 503 });
  }

  const id = decodeURIComponent(ctx.params.id || '').trim();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

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

  const comment: FloorPlanComment = {
    id: `fpc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    parentId: body.parentId ?? null,
    authorId: userId,
    authorName,
    body: text,
    createdAt: new Date().toISOString(),
    pinX: null,
    pinY: null
  };

  try {
    const layout = await appendFloorPlanComment(id, comment);
    if (!layout) {
      return NextResponse.json({ error: 'Layout not found' }, { status: 404 });
    }
    return NextResponse.json(
      { ok: true, layout, comment },
      { status: 201, headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    console.error('[api/floorplans comments]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to post comment' },
      { status: 500 }
    );
  }
}
