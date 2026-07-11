import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

/**
 * List users for task assignment — any signed-in user may read this list.
 * Does not expose admin-only management actions.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const client = await clerkClient();
    const { data } = await client.users.getUserList({ limit: 100 });

    const users = data.map((u) => {
      const phone =
        u.primaryPhoneNumberId
          ? u.phoneNumbers.find((p) => p.id === u.primaryPhoneNumberId)?.phoneNumber
          : u.phoneNumbers[0]?.phoneNumber;
      const email =
        u.primaryEmailAddressId
          ? u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress
          : u.emailAddresses[0]?.emailAddress;

      return {
        id: u.id,
        displayName:
          [u.firstName, u.lastName].filter(Boolean).join(' ') ||
          u.username ||
          phone ||
          email ||
          u.id.slice(0, 12),
        phone: phone || null,
        email: email || null
      };
    });

    users.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return NextResponse.json({ users });
  } catch (err) {
    console.error('[api/users/assignable]', err);
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 });
  }
}
