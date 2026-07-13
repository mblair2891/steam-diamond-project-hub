/**
 * Client-side helper to request SMS notifications for assigned users.
 * Failures are non-blocking — project writes still succeed.
 */

export type ClientNotifyType = 'task' | 'media' | 'approval' | 'general';

export interface NotifyRequest {
  userIds: (string | null | undefined)[];
  message: string;
  type?: ClientNotifyType;
  title?: string;
}

export async function notifyUsers(req: NotifyRequest): Promise<{
  ok: boolean;
  sent?: number;
  skipped?: number;
  configured?: boolean;
  error?: string;
}> {
  const userIds = [...new Set(req.userIds.filter((id): id is string => Boolean(id)))];
  if (userIds.length === 0) {
    return { ok: true, sent: 0, skipped: 0 };
  }

  try {
    const res = await fetch('/api/notify/sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userIds,
        message: req.message,
        type: req.type || 'general',
        title: req.title
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || 'Notification failed' };
    }
    return {
      ok: true,
      sent: data.sent ?? 0,
      skipped: data.skipped ?? 0,
      configured: data.configured
    };
  } catch (err) {
    console.warn('[notify]', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Notification failed' };
  }
}
