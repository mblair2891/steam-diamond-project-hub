import 'server-only';
import twilio from 'twilio';
import { clerkClient } from '@clerk/nextjs/server';

export type SmsNotifyType = 'task' | 'media' | 'approval' | 'general';

export interface SmsNotifyPayload {
  userIds: string[];
  message: string;
  type?: SmsNotifyType;
  title?: string;
}

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_PHONE_NUMBER?.trim();

  if (!accountSid || !authToken || !from) {
    return null;
  }

  return {
    client: twilio(accountSid, authToken),
    from
  };
}

export function isSmsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_PHONE_NUMBER?.trim()
  );
}

async function resolvePhoneNumbers(userIds: string[]): Promise<
  { userId: string; phone: string; displayName: string }[]
> {
  if (userIds.length === 0) return [];

  const client = await clerkClient();
  const results: { userId: string; phone: string; displayName: string }[] = [];

  await Promise.all(
    userIds.map(async (userId) => {
      try {
        const u = await client.users.getUser(userId);
        const phone =
          (u.primaryPhoneNumberId
            ? u.phoneNumbers.find((p) => p.id === u.primaryPhoneNumberId)?.phoneNumber
            : u.phoneNumbers[0]?.phoneNumber) || null;

        if (!phone) return;

        const displayName =
          [u.firstName, u.lastName].filter(Boolean).join(' ') ||
          u.username ||
          phone ||
          userId.slice(0, 12);

        results.push({ userId, phone, displayName });
      } catch (err) {
        console.warn('[sms] Failed to load user', userId, err);
      }
    })
  );

  return results;
}

function buildBody(payload: SmsNotifyPayload): string {
  const prefix =
    payload.type === 'task'
      ? 'SDH Task'
      : payload.type === 'media'
        ? 'SDH Media'
        : payload.type === 'approval'
          ? 'SDH Approval'
          : 'SDH';

  const titlePart = payload.title ? `: ${payload.title}` : '';
  const body = `${prefix}${titlePart} — ${payload.message}`.trim();
  // SMS practical length limit
  return body.length > 320 ? `${body.slice(0, 317)}...` : body;
}

/**
 * Send SMS notifications via Twilio to Clerk users with phone numbers.
 * No-ops (returns skipped) when Twilio is not configured.
 */
export async function sendSmsNotifications(payload: SmsNotifyPayload): Promise<{
  configured: boolean;
  sent: number;
  skipped: number;
  errors: string[];
  details: { userId: string; status: 'sent' | 'skipped' | 'error'; error?: string }[];
}> {
  const uniqueIds = [...new Set(payload.userIds.filter(Boolean))];
  const twilioCfg = getTwilioClient();

  if (!twilioCfg) {
    return {
      configured: false,
      sent: 0,
      skipped: uniqueIds.length,
      errors: ['Twilio is not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)'],
      details: uniqueIds.map((userId) => ({ userId, status: 'skipped' as const }))
    };
  }

  if (uniqueIds.length === 0) {
    return { configured: true, sent: 0, skipped: 0, errors: [], details: [] };
  }

  const recipients = await resolvePhoneNumbers(uniqueIds);
  const withPhone = new Set(recipients.map((r) => r.userId));
  const body = buildBody(payload);
  const details: {
    userId: string;
    status: 'sent' | 'skipped' | 'error';
    error?: string;
  }[] = [];
  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;

  for (const userId of uniqueIds) {
    if (!withPhone.has(userId)) {
      skipped++;
      details.push({ userId, status: 'skipped', error: 'No phone number on Clerk user' });
    }
  }

  await Promise.all(
    recipients.map(async ({ userId, phone }) => {
      try {
        await twilioCfg.client.messages.create({
          body,
          from: twilioCfg.from,
          to: phone
        });
        sent++;
        details.push({ userId, status: 'sent' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'SMS send failed';
        errors.push(`${userId}: ${msg}`);
        details.push({ userId, status: 'error', error: msg });
        console.error('[sms] send failed', userId, err);
      }
    })
  );

  return { configured: true, sent, skipped, errors, details };
}
