import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-server';
import { normalizeRole, roleLabel } from '@/lib/roles';

/** List users — admin only */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const { data } = await gate.client.users.getUserList({ limit: 100 });
    const users = data.map((u) => {
      const role = normalizeRole(u.publicMetadata?.role ?? u.unsafeMetadata?.role);
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
          u.id,
        phone: phone || null,
        email: email || null,
        role,
        roleLabel: roleLabel(role),
        createdAt: u.createdAt
      };
    });

    return NextResponse.json({ users });
  } catch (err) {
    console.error('[api/users GET]', err);
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });
  }
}
