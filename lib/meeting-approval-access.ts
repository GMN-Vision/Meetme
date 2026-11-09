import { createHmac, timingSafeEqual } from 'node:crypto';
import { assertActiveMeetingParticipant } from '@/lib/meeting-document-access';
import MeetingApproval, { type MeetingApprovalType } from '@/models/MeetingApproval';

const TOKEN_LIFETIME_SECONDS = 4 * 60 * 60;

function secret() {
  const value = process.env.NEXTAUTH_SECRET || process.env.ONLYOFFICE_JWT_SECRET || process.env.JITSI_JWT_SECRET;
  if (!value || value.length < 32) throw new Error('Meeting approval signing is not configured.');
  return value;
}

export function signMeetingApprovalToken(meetingId: string, participantKey: string) {
  const body = Buffer.from(JSON.stringify({ purpose: 'meeting-approval', meetingId, participantKey, exp: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS })).toString('base64url');
  const signature = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export async function verifyMeetingApprovalToken(token: string, meetingId: string) {
  if (!token || token.length > 4096) throw new Error('A meeting approval credential is required.');
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra) throw new Error('Invalid meeting approval credential.');
  const expected = createHmac('sha256', secret()).update(body).digest();
  let actual: Buffer;
  let payload: any;
  try {
    actual = Buffer.from(signature, 'base64url');
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch { throw new Error('Invalid meeting approval credential.'); }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)
    || payload?.purpose !== 'meeting-approval' || payload?.meetingId !== meetingId
    || typeof payload?.participantKey !== 'string' || !payload.participantKey
    || payload?.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('Invalid or expired meeting approval credential.');
  }
  return assertActiveMeetingParticipant(meetingId, payload.participantKey);
}

export async function consumeMeetingApproval({ meetingId, approvalId, type, requesterKey, requesterEmail, payload }: {
  meetingId: string;
  approvalId: string;
  type: MeetingApprovalType;
  requesterKey?: string;
  requesterEmail?: string;
  payload: { itemId?: string; path?: string; name?: string; size?: number };
}) {
  if (!approvalId || !/^[a-f\d]{24}$/i.test(approvalId)) return false;
  const approval = await MeetingApproval.findOneAndUpdate({
    _id: approvalId,
    meetingId,
    type,
    ...(requesterKey ? { requesterKey } : {}),
    ...(requesterEmail ? { requesterEmail } : {}),
    status: 'approved',
    expiresAt: { $gt: new Date() },
    ...Object.fromEntries(Object.entries(payload).map(([key, value]) => [`payload.${key}`, value])),
  }, { $set: { status: 'used' } }, { new: true });
  return Boolean(approval);
}
