/** Canonical roles stored in Clerk publicMetadata.role */
export type AppRole = 'admin' | 'editor' | 'view-only';

export const APP_ROLES: AppRole[] = ['admin', 'editor', 'view-only'];

/**
 * Normalize raw metadata into a canonical role.
 * Accepts legacy aliases (viewer, view_only, etc.).
 */
export function normalizeRole(raw: unknown): AppRole {
  const r = String(raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-');

  if (r === 'admin') return 'admin';
  if (r === 'editor') return 'editor';
  if (
    r === 'view-only' ||
    r === 'viewonly' ||
    r === 'viewer' ||
    r === 'read-only' ||
    r === 'readonly' ||
    r === 'view'
  ) {
    return 'view-only';
  }

  // Default safest
  return 'view-only';
}

export function roleLabel(role: AppRole): string {
  if (role === 'admin') return 'Admin';
  if (role === 'editor') return 'Editor';
  return 'View only';
}

export function canEditProject(role: AppRole): boolean {
  return role === 'admin' || role === 'editor';
}

export function canManageUsers(role: AppRole): boolean {
  return role === 'admin';
}

export function roleFromMetadata(
  publicMetadata?: Record<string, unknown> | null,
  unsafeMetadata?: Record<string, unknown> | null
): AppRole {
  return normalizeRole(publicMetadata?.role ?? unsafeMetadata?.role);
}
