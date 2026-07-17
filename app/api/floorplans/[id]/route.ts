import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import {
  deleteFloorPlan,
  getFloorPlan,
  upsertFloorPlan
} from '@/lib/floorplans-store';
import { canEditProject, canManageUsers, normalizeRole } from '@/lib/roles';
import type { FloorPlanLayout } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function GET(_request: Request, ctx: Ctx) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json({ error: 'Blob not configured' }, { status: 503 });
  }
  const id = decodeURIComponent(ctx.params.id || '').trim();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  try {
    const layout = await getFloorPlan(id);
    if (!layout) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(
      { ok: true, layout },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/floorplans/[id]
 * Only the owner (or admin) may save geometry/metadata.
 * Personal versions: never overwrites another user’s plan.
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
      { error: 'Editors and admins only may edit floor plans.' },
      { status: 403 }
    );
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json({ error: 'Blob not configured' }, { status: 503 });
  }

  const id = decodeURIComponent(ctx.params.id || '').trim();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  let body: Partial<FloorPlanLayout>;
  try {
    body = (await request.json()) as Partial<FloorPlanLayout>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const existing = await getFloorPlan(id);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const isAdmin = canManageUsers(role);
    if (existing.ownerId !== userId && !isAdmin) {
      return NextResponse.json(
        {
          error:
            'This is another user’s personal version. Copy it to create your own editable copy.'
        },
        { status: 403 }
      );
    }

    const displayName =
      user?.fullName || user?.firstName || user?.username || existing.ownerName;

    const next: FloorPlanLayout = {
      ...existing,
      ...body,
      id: existing.id,
      ownerId: existing.ownerId,
      ownerName: existing.ownerName,
      createdAt: existing.createdAt,
      comments: existing.comments,
      updatedAt: new Date().toISOString(),
      updatedByName: displayName
    };

    // Allow full content replace for items/drawings when provided
    if (Array.isArray(body.items)) next.items = body.items;
    if (Array.isArray(body.drawings)) next.drawings = body.drawings;

    const saved = await upsertFloorPlan(next);
    return NextResponse.json(
      { ok: true, layout: saved },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    console.error('[api/floorplans PUT]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }
  const user = await currentUser();
  const role = normalizeRole(user?.publicMetadata?.role ?? user?.unsafeMetadata?.role);
  if (!canEditProject(role)) {
    return NextResponse.json({ error: 'Editors and admins only.' }, { status: 403 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json({ error: 'Blob not configured' }, { status: 503 });
  }

  const id = decodeURIComponent(ctx.params.id || '').trim();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  try {
    const existing = await getFloorPlan(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const isAdmin = canManageUsers(role);
    if (existing.ownerId !== userId && !isAdmin) {
      return NextResponse.json(
        { error: 'Only the owner or an admin can delete this version.' },
        { status: 403 }
      );
    }
    await deleteFloorPlan(id);
    return NextResponse.json(
      { ok: true, id },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete' },
      { status: 500 }
    );
  }
}
