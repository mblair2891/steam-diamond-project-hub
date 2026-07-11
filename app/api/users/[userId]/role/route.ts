import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-server';
import { APP_ROLES, type AppRole } from '@/lib/roles';

/** Admin-only: update a user's publicMetadata.role */
export async function PATCH(
  req: Request,
  { params }: { params: { userId: string } }
) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const targetId = params.userId;
  if (!targetId) {
    return NextResponse.json({ error: 'Missing user id' }, { status: 400 });
  }

  // Prevent admin from demoting themselves accidentally without another path
  if (targetId === gate.session.userId) {
    return NextResponse.json(
      { error: 'Cannot change your own role from this panel' },
      { status: 400 }
    );
  }

  let body: { role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const requested = String(body.role || '')
    .toLowerCase()
    .trim()
    .replace(/_/g, '-');
  if (!APP_ROLES.includes(requested as AppRole)) {
    return NextResponse.json(
      { error: 'role must be admin, editor, or view-only' },
      { status: 400 }
    );
  }

  const role = requested as AppRole;

  try {
    const existing = await gate.client.users.getUser(targetId);
    await gate.client.users.updateUser(targetId, {
      publicMetadata: {
        ...(existing.publicMetadata || {}),
        role
      }
    });

    return NextResponse.json({ ok: true, userId: targetId, role });
  } catch (err) {
    console.error('[api/users/role]', err);
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
  }
}
