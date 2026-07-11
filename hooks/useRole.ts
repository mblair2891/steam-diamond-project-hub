'use client';

import { useUser } from '@clerk/nextjs';

/** Role from Clerk publicMetadata: editor | viewer | admin */
export function useRole() {
  const { user, isLoaded } = useUser();

  const role = String(user?.publicMetadata?.role || user?.unsafeMetadata?.role || 'viewer')
    .toLowerCase()
    .trim();

  const canEdit = role === 'editor' || role === 'admin';
  const phone =
    user?.primaryPhoneNumber?.phoneNumber || user?.phoneNumbers?.[0]?.phoneNumber || '';
  const email =
    user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || '';
  const displayName =
    user?.fullName || user?.firstName || user?.username || phone || email || 'User';

  return {
    isLoaded,
    user,
    role: role || 'viewer',
    canEdit,
    isAdmin: role === 'admin',
    isViewer: !canEdit,
    displayName,
    phone,
    email,
    imageUrl: user?.imageUrl
  };
}
