import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import {
  listFloorPlans,
  newLayoutId,
  upsertFloorPlan
} from '@/lib/floorplans-store';
import {
  DEFAULT_CANVAS_H,
  DEFAULT_CANVAS_W,
  DEFAULT_FLOOR_PLAN_BG,
  DEFAULT_GRID_SIZE
} from '@/lib/floorplan-catalog';
import { canEditProject, normalizeRole } from '@/lib/roles';
import type { FloorPlanLayout } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/floorplans — all versions (any signed-in user). */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json(
      {
        error: 'Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN and redeploy.',
        layouts: [],
        total: 0
      },
      { status: 503 }
    );
  }
  try {
    const { layouts, total, updatedAt } = await listFloorPlans();
    return NextResponse.json(
      {
        ok: true,
        layouts,
        total,
        updatedAt,
        source: 'vercel-blob',
        fetchedAt: new Date().toISOString()
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    console.error('[api/floorplans GET]', err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Failed to list floor plans',
        layouts: [],
        total: 0
      },
      { status: 500 }
    );
  }
}

/** POST /api/floorplans — create personal version (editors/admins). */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }
  const user = await currentUser();
  const role = normalizeRole(user?.publicMetadata?.role ?? user?.unsafeMetadata?.role);
  if (!canEditProject(role)) {
    return NextResponse.json(
      { error: 'Editors and admins only may create floor plan versions.' },
      { status: 403 }
    );
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json({ error: 'Blob not configured' }, { status: 503 });
  }

  let body: Partial<FloorPlanLayout> & { name?: string };
  try {
    body = (await request.json()) as Partial<FloorPlanLayout> & { name?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = (body.name || '').trim() || 'Untitled layout';
  const now = new Date().toISOString();
  const ownerName =
    user?.fullName || user?.firstName || user?.username || 'User';

  const layout: FloorPlanLayout = {
    id: body.id || newLayoutId(),
    name,
    description: (body.description || '').trim(),
    ownerId: userId,
    ownerName,
    backgroundUrl: body.backgroundUrl ?? DEFAULT_FLOOR_PLAN_BG,
    backgroundPathname: body.backgroundPathname ?? null,
    backgroundName: body.backgroundName ?? 'default-floor-plan.svg',
    backgroundMime: body.backgroundMime ?? 'image/svg+xml',
    canvasWidth: body.canvasWidth || DEFAULT_CANVAS_W,
    canvasHeight: body.canvasHeight || DEFAULT_CANVAS_H,
    gridSize: body.gridSize || DEFAULT_GRID_SIZE,
    snapToGrid: body.snapToGrid !== false,
    wallThickness: body.wallThickness || 10,
    wallColor: body.wallColor || '#e8b84a',
    items: Array.isArray(body.items) ? body.items : [],
    drawings: Array.isArray(body.drawings) ? body.drawings : [],
    comments: [],
    createdAt: now,
    updatedAt: now,
    updatedByName: ownerName,
    copiedFromId: body.copiedFromId ?? null,
    copiedFromOwnerName: body.copiedFromOwnerName ?? null
  };

  try {
    const saved = await upsertFloorPlan(layout);
    return NextResponse.json(
      { ok: true, layout: saved },
      { status: 201, headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    console.error('[api/floorplans POST]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create layout' },
      { status: 500 }
    );
  }
}
