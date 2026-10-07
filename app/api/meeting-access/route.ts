import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Meeting from '@/models/Meeting';
import MeetingParticipant from '@/models/MeetingParticipant';
import MeetingMember from '@/models/MeetingMember';
import { auth } from '@/lib/auth';
import { isMeetingHost } from '@/lib/recording-policy';
import { getWorkspaceQuota } from '@/lib/workspace-usage';

export const dynamic = 'force-dynamic';

// Background tabs can throttle their timers for minutes during screen sharing.
const PARTICIPANT_TTL_MS = 5 * 60_000;

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
    if (!['join', 'heartbeat', 'leave'].includes(action)) {
      return NextResponse.json({ error: 'Invalid access action' }, { status: 400 });
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

    if (meeting.endedAt) return NextResponse.json({ error: 'The host has ended this meeting.', code: 'MEETING_ENDED' }, { status: 403 });
    const email = (await auth())?.user?.email?.toLowerCase() || '';
    const now = new Date();
    const staleBefore = new Date(now.getTime() - PARTICIPANT_TTL_MS);
    // Refresh known participants before pruning so a delayed heartbeat cannot
    // turn an established participant into a new admission at room capacity.
    await MeetingParticipant.updateOne({ meetingId, participantKey }, { $set: { lastSeenAt: now } });
    await MeetingParticipant.deleteMany({ meetingId, lastSeenAt: { $lt: staleBefore } });

    const activeParticipants = await MeetingParticipant.countDocuments({ meetingId });
    const existingParticipant = await MeetingParticipant.findOne({ meetingId, participantKey }).lean();

    // Only the creator starts a room; ended sessions use a new room so their
    // recording recipients cannot change when someone reuses an old invite.
    if (!meeting.activeSessionStartedAt) {
      if (!isMeetingHost(meeting, email)) return NextResponse.json({ error: 'Wait for the host to start this meeting.', code: 'HOST_REQUIRED' }, { status: 403 });
      const quota = await getWorkspaceQuota(meeting.hostEmail);
      // Apply the host's current workspace plan when a room starts. This makes
      // upgraded plan allowances available to existing rooms and prevents an
      // old room snapshot from retaining limits after a downgrade.
      const maxMeetingMinutes = quota ? quota.planDefinition.maxMeetingMinutes : meeting.maxMeetingMinutes ?? null;
      const maxParticipants = quota ? quota.planDefinition.maxParticipants : meeting.maxParticipants ?? null;
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

    if (email) await MeetingMember.updateOne({ meetingId, userEmail: email }, { $setOnInsert: { meetingId, userEmail: email } }, { upsert: true });

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
