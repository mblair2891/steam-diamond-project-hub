import { auth, currentUser, clerkClient } from '@clerk/nextjs/server';
import { canEditProject, canManageUsers, normalizeRole, type AppRole } from '@/lib/roles';

export async function getSessionRole(): Promise<{
  userId: string | null;
  role: AppRole;
  canEdit: boolean;
  canManageUsers: boolean;
}> {
  const { userId } = await auth();
  if (!userId) {
    return { userId: null, role: 'view-only', canEdit: false, canManageUsers: false };
  }

  const user = await currentUser();
  const role = normalizeRole(user?.publicMetadata?.role ?? user?.unsafeMetadata?.role);

  return {
    userId,
    role,
    canEdit: canEditProject(role),
    canManageUsers: canManageUsers(role)
  };
}

export async function requireAdmin() {
  const session = await getSessionRole();
  if (!session.userId) {
    return { ok: false as const, status: 401, error: 'Unauthorized', session };
  }
  if (!session.canManageUsers) {
    return { ok: false as const, status: 403, error: 'Admin only', session };
  }
  return { ok: true as const, session, client: await clerkClient() };
}
