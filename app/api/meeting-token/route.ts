import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '../../../lib/db';
import Meeting from '../../../models/Meeting';
import { createJitsiJwt } from '../../../lib/jitsi-jwt';
import { normalizeJitsiRoomName } from '../../../lib/jitsi-room';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth-options';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email || '';

    const searchParams = req.nextUrl.searchParams;
    const meetingId = searchParams.get('meetingId');
    const guestName = searchParams.get('name') || 'Guest';

    if (!meetingId) {
      return NextResponse.json({ error: 'Meeting ID is required' }, { status: 400 });
    }

    await dbConnect();

    const meeting = await Meeting.findOne({ meetingId });

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    if (!meeting.isPrivate) {
      return NextResponse.json({ token: null, isPrivate: false }, { status: 200 });
    }

    const secret = process.env.JITSI_JWT_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: 'Jitsi JWT secret is not configured' },
        { status: 500 }
      );
    }

    const domain = process.env.NEXT_PUBLIC_JITSI_DOMAIN || 'meet.jit.si';
    const issuer = process.env.JITSI_JWT_ISSUER || 'melanam';
    const resolvedName = userEmail || guestName;
    const resolvedId = userEmail || `guest:${resolvedName}`;
    const roomName = normalizeJitsiRoomName(meetingId);
    const remainingSeconds = meeting.activeSessionEndsAt
      ? Math.ceil((meeting.activeSessionEndsAt.getTime() - Date.now()) / 1000)
      : (meeting.maxMeetingMinutes ?? 240) * 60;

    if (remainingSeconds <= 0) {
      return NextResponse.json(
        { error: 'This meeting has reached its time limit.', code: 'MEETING_DURATION_REACHED' },
        { status: 403 }
      );
    }

    const token = createJitsiJwt({
      roomName,
      domain: domain.replace(/^https?:\/\//, ''),
      user: {
        id: resolvedId,
        name: resolvedName,
        email: userEmail || undefined,
      },
      secret,
      issuer,
      // Cover the room's allowance plus a short grace period for native
      // transport recovery. Access heartbeats still enforce the plan limit.
      ttlSeconds: remainingSeconds + 5 * 60,
      moderator: Boolean(userEmail) && (userEmail === meeting.hostEmail || userEmail === meeting.hostId),
    });

    return NextResponse.json(
      {
        success: true,
        isPrivate: true,
        token,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: any) {
    console.error('Error creating Jitsi token:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create meeting token' },
      { status: 500 }
    );
  }
}
