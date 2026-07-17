import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getFloorPlan, newLayoutId, upsertFloorPlan } from '@/lib/floorplans-store';
import { canEditProject, normalizeRole } from '@/lib/roles';
import type { FloorPlanLayout } from '@/lib/types';
import { uid } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/**
 * POST /api/floorplans/[id]/copy
 * Copy another user’s version into a new personal version for the current user.
 */
export async function POST(request: Request, ctx: Ctx) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }
  const user = await currentUser();
  const role = normalizeRole(user?.publicMetadata?.role ?? user?.unsafeMetadata?.role);
  if (!canEditProject(role)) {
    return NextResponse.json(
      { error: 'Editors and admins only may copy floor plan versions.' },
      { status: 403 }
    );
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json({ error: 'Blob not configured' }, { status: 503 });
  }

  const id = decodeURIComponent(ctx.params.id || '').trim();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  let body: { name?: string } = {};
  try {
    body = (await request.json()) as { name?: string };
  } catch {
    /* empty body ok */
  }

  try {
    const source = await getFloorPlan(id);
    if (!source) {
      return NextResponse.json({ error: 'Source layout not found' }, { status: 404 });
    }

    const ownerName =
      user?.fullName || user?.firstName || user?.username || 'User';
    const now = new Date().toISOString();
    const name =
      (body.name || '').trim() ||
      `${source.name} (copy from ${source.ownerName})`;

    const copy: FloorPlanLayout = {
      ...source,
      id: newLayoutId(),
      name,
      description: source.description
        ? `${source.description}\n\nCopied from ${source.ownerName}’s version.`
        : `Copied from ${source.ownerName}’s version.`,
      ownerId: userId,
      ownerName,
      items: (source.items || []).map((i) => ({ ...i, id: uid('fpi') })),
      drawings: (source.drawings || []).map((d) => ({ ...d, id: uid('fpd') })),
      comments: [],
      createdAt: now,
      updatedAt: now,
      updatedByName: ownerName,
      copiedFromId: source.id,
      copiedFromOwnerName: source.ownerName
    };

    const saved = await upsertFloorPlan(copy);
    return NextResponse.json(
      { ok: true, layout: saved },
      { status: 201, headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    console.error('[api/floorplans copy]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to copy' },
      { status: 500 }
    );
  }
}
