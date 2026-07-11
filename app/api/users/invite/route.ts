import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-server';
import type { AppRole } from '@/lib/roles';

/**
 * Admin-only: create a user invitation (email) and/or user with phone + role metadata.
 *
 * Body:
 * {
 *   role: "admin" | "editor" | "view-only",
 *   phoneNumber?: string,   // E.164 preferred e.g. +15551234567
 *   email?: string,
 *   firstName?: string,
 *   lastName?: string
 * }
 *
 * At least one of phoneNumber or email is required.
 */
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: {
    role?: string;
    phoneNumber?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Only allow the three canonical roles from request (default editor)
  const requested = String(body.role || 'editor')
    .toLowerCase()
    .trim()
    .replace(/_/g, '-');
  const assignedRole: AppRole =
    requested === 'admin' || requested === 'editor' || requested === 'view-only'
      ? requested
      : 'editor';

  const phoneNumber = (body.phoneNumber || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const firstName = (body.firstName || '').trim() || undefined;
  const lastName = (body.lastName || '').trim() || undefined;

  if (!phoneNumber && !email) {
    return NextResponse.json(
      { error: 'Provide a phone number and/or email address' },
      { status: 400 }
    );
  }

  const client = gate.client;
  const results: Record<string, unknown> = { role: assignedRole };

  try {
    // Phone: create user with phone so they can sign in with SMS OTP
    if (phoneNumber) {
      const user = await client.users.createUser({
        phoneNumber: [phoneNumber],
        firstName,
        lastName,
        publicMetadata: { role: assignedRole },
        skipPasswordRequirement: true
      });
      results.user = {
        id: user.id,
        phone: phoneNumber
      };
    }

    // Email: send Clerk invitation (works well for email-enabled flows)
    if (email) {
      try {
        const invitation = await client.invitations.createInvitation({
          emailAddress: email,
          publicMetadata: { role: assignedRole },
          redirectUrl:
            process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL ||
            process.env.NEXT_PUBLIC_APP_URL ||
            undefined
        });
        results.invitation = {
          id: invitation.id,
          email,
          status: invitation.status
        };
      } catch (inviteErr) {
        // If we already created a phone user, still report invite failure
        console.error('[api/users/invite] invitation', inviteErr);
        results.invitationError =
          inviteErr instanceof Error ? inviteErr.message : 'Invitation failed';
      }
    }

    // If only email and invitation failed without user, surface error
    if (!results.user && !results.invitation) {
      return NextResponse.json(
        {
          error:
            (results.invitationError as string) ||
            'Could not create user or invitation. Check Clerk dashboard & phone format (E.164).'
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: results.user
        ? 'User created. They can sign in with their phone number.'
        : 'Invitation sent.',
      ...results
    });
  } catch (err) {
    console.error('[api/users/invite]', err);
    const message =
      err instanceof Error ? err.message : 'Failed to create user. Check phone format (+1…).';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
