import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import dbConnect from '@/lib/db';
import { consumeMeetingApproval, verifyMeetingApprovalToken } from '@/lib/meeting-approval-access';
import { normalizeVideoUrl } from '@/lib/video-playlist';
import { resolveSharedPresentationFile } from '@/lib/onlyoffice-server';
import { getPresentationKind } from '@/lib/shared-file-types';
import Meeting from '@/models/Meeting';
import MeetingParticipant from '@/models/MeetingParticipant';
import MeetingApproval, { type MeetingApprovalType } from '@/models/MeetingApproval';
import VideoPlaylist from '@/models/VideoPlaylist';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = { 'Cache-Control': 'no-store' };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const emailOf = (session: any) => String(session?.user?.email || '').toLowerCase();
const bearer = (request: Request) => (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');

async function activeMeeting(meetingId: string) {
  if (!meetingId) return null;
  await dbConnect();
  return Meeting.findOne({ meetingId, endedAt: null, activeSessionStartedAt: { $ne: null } });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const meetingId = url.searchParams.get('meetingId') || '';
    const meeting = await activeMeeting(meetingId);
    if (!meeting) {
      const upcoming = meetingId ? await Meeting.findOne({ meetingId, endedAt: null }) : null;
      const session = await getServerSession(authOptions);
      if (upcoming && emailOf(session) === String(upcoming.hostEmail).toLowerCase() && !url.searchParams.get('requestId')) return reply({ requests: [] });
      return reply({ error: 'Meeting is unavailable.' }, 404);
    }
    const requestId = url.searchParams.get('requestId');
    if (requestId) {
      const access = await verifyMeetingApprovalToken(bearer(request), meetingId);
      const approval = await MeetingApproval.findOne({ _id: requestId, meetingId, requesterKey: access.participantKey }).lean();
      if (!approval) return reply({ error: 'Request not found.' }, 404);
      return reply({ status: approval.status, expiresAt: approval.expiresAt });
    }
    const session = await getServerSession(authOptions);
    if (emailOf(session) !== String(meeting.hostEmail).toLowerCase()) return reply({ error: 'Host access required.' }, 403);
    const requests = await MeetingApproval.find({ meetingId, status: 'pending', expiresAt: { $gt: new Date() } }).sort({ createdAt: 1 }).limit(30).lean();
    return reply({ requests: requests.map(item => ({ id: String(item._id), type: item.type, requesterName: item.requesterName, payload: item.payload, createdAt: item.createdAt })) });
  } catch (error: any) { return reply({ error: error.message || 'Could not load requests.' }, 400); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const meetingId = String(body.meetingId || '').trim();
    const type = String(body.type || '') as MeetingApprovalType;
    if (!['video', 'file', 'present', 'screen'].includes(type)) return reply({ error: 'Invalid request type.' }, 400);
    const meeting = await activeMeeting(meetingId);
    if (!meeting) return reply({ error: 'Meeting is unavailable.' }, 404);
    const access = await verifyMeetingApprovalToken(bearer(request), meetingId);
    if (body.action === 'consume') {
      if (type !== 'screen' && type !== 'present') return reply({ error: 'Invalid approval action.' }, 400);
      const approved = await consumeMeetingApproval({ meetingId, approvalId: String(body.requestId || ''), type, requesterKey: access.participantKey, payload: type === 'present' ? { path: String(body.path || '') } : {} });
      return approved ? reply({ approved: true }) : reply({ error: 'Host approval is required.' }, 403);
    }
    const participant = await MeetingParticipant.findOne({ meetingId, participantKey: access.participantKey }).lean();
    const session = await getServerSession(authOptions);
    const requesterEmail = emailOf(session);
    if (participant?.userEmail && participant.userEmail !== requesterEmail) return reply({ error: 'Participant identity does not match.' }, 403);
    if (requesterEmail && requesterEmail === String(meeting.hostEmail).toLowerCase()) return reply({ error: 'The host can use this control directly.' }, 400);
    const payload: { itemId?: string; url?: string; path?: string; name?: string; size?: number } = {};
    if (type === 'video') {
      const itemId = String(body.itemId || '');
      const playlist = await VideoPlaylist.findOne({ meetingId }).lean();
      const item = playlist?.items?.find((entry: any) => entry.id === itemId);
      if (!item || !normalizeVideoUrl(item.url)) return reply({ error: 'Video not found in the playlist.' }, 404);
      payload.itemId = itemId; payload.url = item.url; payload.name = item.title || 'Shared video';
    } else if (type === 'file') {
      const name = String(body.name || '').trim().slice(0, 255);
      const size = Number(body.size);
      if (!name || !Number.isSafeInteger(size) || size < 1) return reply({ error: 'A file name and size are required.' }, 400);
      payload.name = name; payload.size = size;
    } else if (type === 'present') {
      const path = String(body.path || '');
      if (!path) return reply({ error: 'A shared file is required.' }, 400);
      const file = await resolveSharedPresentationFile(path, meetingId);
      if (getPresentationKind(file.name) === 'slides') return reply({ error: 'Only the host can present PowerPoint slides.' }, 403);
      payload.path = file.path; payload.name = file.name;
    }
    const existing = await MeetingApproval.findOne({ meetingId, type, requesterKey: access.participantKey, status: 'pending', expiresAt: { $gt: new Date() }, payload });
    if (existing) return reply({ requestId: String(existing._id), status: 'pending' });
    const approval = await MeetingApproval.create({
      meetingId, type, requesterKey: access.participantKey,
      requesterName: String(body.requesterName || requesterEmail || 'Guest').trim().slice(0, 100) || 'Guest',
      requesterEmail,
      payload, status: 'pending', expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    return reply({ requestId: String(approval._id), status: 'pending' }, 201);
  } catch (error: any) { return reply({ error: error.message || 'Could not request approval.' }, 400); }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const meetingId = String(body.meetingId || '').trim();
    const requestId = String(body.requestId || '');
    const decision = body.decision === 'approve' ? 'approved' : body.decision === 'reject' ? 'rejected' : '';
    if (!decision || !/^[a-f\d]{24}$/i.test(requestId)) return reply({ error: 'Invalid decision.' }, 400);
    const meeting = await activeMeeting(meetingId);
    if (!meeting) return reply({ error: 'Meeting is unavailable.' }, 404);
    const session = await getServerSession(authOptions);
    if (emailOf(session) !== String(meeting.hostEmail).toLowerCase()) return reply({ error: 'Only the host can decide requests.' }, 403);
    const approval = await MeetingApproval.findOneAndUpdate(
      { _id: requestId, meetingId, status: 'pending', expiresAt: { $gt: new Date() } },
      { $set: { status: decision, decidedAt: new Date() } },
      { new: true },
    );
    if (!approval) return reply({ error: 'Request has expired or was already decided.' }, 409);
    return reply({ status: approval.status });
  } catch (error: any) { return reply({ error: error.message || 'Could not decide request.' }, 400); }
}
