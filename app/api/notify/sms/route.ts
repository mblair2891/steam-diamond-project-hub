import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { canEditProject, normalizeRole } from '@/lib/roles';
import { sendSmsNotifications, type SmsNotifyType } from '@/lib/sms';

interface Body {
  userIds?: string[];
  message?: string;
  type?: SmsNotifyType;
  title?: string;
}

/**
 * POST /api/notify/sms
 * Body: { userIds: string[], message: string, type?, title? }
 * Sends SMS via Twilio to each user's primary phone (from Clerk).
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await currentUser();
  const role = normalizeRole(user?.publicMetadata?.role ?? user?.unsafeMetadata?.role);
  if (!canEditProject(role)) {
    return NextResponse.json({ error: 'Editors and admins only' }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const userIds = Array.isArray(body.userIds) ? body.userIds.filter(Boolean) : [];
  const message = String(body.message || '').trim();
  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }
  if (userIds.length === 0) {
    return NextResponse.json({ error: 'userIds is required' }, { status: 400 });
  }
  if (userIds.length > 25) {
    return NextResponse.json({ error: 'Too many recipients (max 25)' }, { status: 400 });
  }

  try {
    const result = await sendSmsNotifications({
      userIds,
      message,
      type: body.type || 'general',
      title: body.title?.trim() || undefined
    });

    return NextResponse.json({
      ok: true,
      configured: result.configured,
      sent: result.sent,
      skipped: result.skipped,
      errors: result.errors,
      details: result.details
    });
  } catch (err) {
    console.error('[api/notify/sms]', err);
    return NextResponse.json({ error: 'Failed to send notifications' }, { status: 500 });
  }
}
