'use client';

import { useUser } from '@clerk/nextjs';
import {
  canEditProject,
  canManageUsers,
  normalizeRole,
  roleLabel,
  type AppRole
} from '@/lib/roles';

/**
 * Roles from Clerk publicMetadata.role:
 * - admin: full project access + create/invite users
 * - editor: full project edit (no user management)
 * - view-only: read only
 */
export function useRole() {
  const { user, isLoaded } = useUser();

  const role: AppRole = normalizeRole(
    user?.publicMetadata?.role ?? user?.unsafeMetadata?.role
  );

  const canEdit = canEditProject(role);
  const isAdmin = canManageUsers(role);
  const isViewer = !canEdit;

  const phone =
    user?.primaryPhoneNumber?.phoneNumber || user?.phoneNumbers?.[0]?.phoneNumber || '';
  const email =
    user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || '';
  const displayName =
    user?.fullName || user?.firstName || user?.username || phone || email || 'User';

  return {
    isLoaded,
    user,
    role,
    roleLabel: roleLabel(role),
    canEdit,
    /** Alias — true for admin + editor */
    canEditProject: canEdit,
    /** Admin-only: invite / create users */
    canManageUsers: isAdmin,
    isAdmin,
    isEditor: role === 'editor',
    isViewer,
    displayName,
    phone,
    email,
    imageUrl: user?.imageUrl
  };
}
