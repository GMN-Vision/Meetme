import { createHmac, timingSafeEqual } from 'node:crypto';

import dbConnect from '@/lib/db';
import Meeting from '@/models/Meeting';
import MeetingParticipant from '@/models/MeetingParticipant';

const TOKEN_LIFETIME_SECONDS = 24 * 60 * 60;
const PARTICIPANT_TTL_MS = 5 * 60_000;

function secret() {
  const value = process.env.ONLYOFFICE_JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error('Document access signing is not configured.');
  }
  return value;
}

function encode(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

export function signMeetingDocumentAccessToken(
  meetingId: string,
  participantKey: string,
) {
  const payload = encode(JSON.stringify({
    purpose: 'meeting-document-access',
    meetingId,
    participantKey,
    exp: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS,
  }));

  const signature = createHmac('sha256', secret())
    .update(payload)
    .digest('base64url');

  return `${payload}.${signature}`;
}

export async function assertActiveMeetingParticipant(
  meetingId: string,
  participantKey: string,
) {
  if (
    !meetingId ||
    !participantKey ||
    participantKey.length > 200
  ) {
    throw new Error('Invalid meeting participant.');
  }

  await dbConnect();

  const now = Date.now();
  const participant = await MeetingParticipant.findOne({
    meetingId,
    participantKey,
    lastSeenAt: { $gte: new Date(now - PARTICIPANT_TTL_MS) },
  }).lean();

  if (!participant) {
    throw new Error('Your meeting participation is no longer active.');
  }

  const meeting = await Meeting.findOne({ meetingId }).lean();

  if (
    !meeting ||
    meeting.endedAt ||
    (
      meeting.activeSessionEndsAt &&
      new Date(meeting.activeSessionEndsAt).getTime() <= now
    )
  ) {
    throw new Error('This meeting is no longer active.');
  }

  return { meetingId, participantKey };
}

export async function verifyActiveMeetingDocumentToken(
  token: string,
  expectedMeetingId: string,
) {
  if (!token || token.length > 4096) {
    throw new Error('A valid meeting document credential is required.');
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid meeting document credential.');
  }

  const [body, signature] = parts;
  const expectedSignature = createHmac('sha256', secret())
    .update(body)
    .digest();

  let actualSignature: Buffer;
  let payload: any;

  try {
    actualSignature = Buffer.from(signature, 'base64url');
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid meeting document credential.');
  }

  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw new Error('Invalid meeting document credential.');
  }

  if (
    payload?.purpose !== 'meeting-document-access' ||
    payload.meetingId !== expectedMeetingId ||
    typeof payload.participantKey !== 'string' ||
    !payload.participantKey ||
    payload.participantKey.length > 200 ||
    typeof payload.exp !== 'number' ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error('Invalid or expired meeting document credential.');
  }

  return assertActiveMeetingParticipant(
    expectedMeetingId,
    payload.participantKey,
  );
}
