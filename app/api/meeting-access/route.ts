import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Meeting from '@/models/Meeting';
import MeetingParticipant from '@/models/MeetingParticipant';
import { getWorkspaceQuota } from '@/lib/workspace-usage';

export const dynamic = 'force-dynamic';

const PARTICIPANT_TTL_MS = 90_000;

function participantLimitMessage(limit: number) {
  return `This room has reached its plan limit of ${limit} active participants.`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const meetingId = String(body?.meetingId || '').trim();
    const participantKey = String(body?.participantKey || '').trim().slice(0, 200);
    const action = String(body?.action || 'heartbeat');

    if (!meetingId || !participantKey) {
      return NextResponse.json({ error: 'meetingId and participantKey are required' }, { status: 400 });
    }

    await dbConnect();
    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    if (action === 'leave') {
      await MeetingParticipant.deleteOne({ meetingId, participantKey });
      return NextResponse.json({ success: true });
    }

    const now = new Date();
    const staleBefore = new Date(now.getTime() - PARTICIPANT_TTL_MS);
    await MeetingParticipant.deleteMany({ meetingId, lastSeenAt: { $lt: staleBefore } });

    const activeParticipants = await MeetingParticipant.countDocuments({ meetingId });
    const existingParticipant = await MeetingParticipant.findOne({ meetingId, participantKey }).lean();

    // A finished room can start a new session once everyone has left. An
    // active room never receives a new duration allowance by refreshing.
    if (!meeting.activeSessionEndsAt || (meeting.activeSessionEndsAt < now && activeParticipants === 0)) {
      const quota = await getWorkspaceQuota(meeting.hostEmail);
      // Apply the host's current workspace plan when a room starts. This makes
      // upgraded plan allowances available to existing rooms and prevents an
      // old room snapshot from retaining limits after a downgrade.
      const maxMeetingMinutes = quota?.planDefinition.maxMeetingMinutes ?? meeting.maxMeetingMinutes ?? null;
      const maxParticipants = quota?.planDefinition.maxParticipants ?? meeting.maxParticipants ?? null;
      meeting.activeSessionStartedAt = now;
      meeting.activeSessionEndsAt = maxMeetingMinutes == null
        ? null
        : new Date(now.getTime() + maxMeetingMinutes * 60 * 1000);
      meeting.maxMeetingMinutes = maxMeetingMinutes;
      meeting.maxParticipants = maxParticipants;
      if (quota) meeting.planSnapshot = quota.plan;
      await meeting.save();
    }

    if (meeting.activeSessionEndsAt && meeting.activeSessionEndsAt <= now) {
      return NextResponse.json(
        { error: 'This meeting has reached the maximum duration for its plan. Start a new room to continue.', code: 'MEETING_DURATION_REACHED' },
        { status: 403 }
      );
    }

    const maxParticipants = meeting.maxParticipants;
    if (!existingParticipant && maxParticipants != null && activeParticipants >= maxParticipants) {
      return NextResponse.json(
        { error: participantLimitMessage(maxParticipants), code: 'PARTICIPANT_LIMIT_REACHED' },
        { status: 403 }
      );
    }

    await MeetingParticipant.updateOne(
      { meetingId, participantKey },
      { $set: { lastSeenAt: now } },
      { upsert: true }
    );

    return NextResponse.json({
      success: true,
      sessionEndsAt: meeting.activeSessionEndsAt?.toISOString() || null,
      maxParticipants: meeting.maxParticipants ?? null,
      activeParticipants: existingParticipant ? activeParticipants : activeParticipants + 1,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Unable to validate meeting access' }, { status: 500 });
  }
}
