import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '../../../lib/db';
import Meeting from '../../../models/Meeting';
import MeetingActivity from '../../../models/MeetingActivity';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth-options';

export async function GET(req: NextRequest) {
  try {
    const meetingId = req.nextUrl.searchParams.get('meetingId');

    await dbConnect();

    if (!meetingId) {
      return NextResponse.json({ error: 'Meeting ID is required' }, { status: 400 });
    }

    const query = { meetingId };
    const activity = await MeetingActivity.find(query).sort({ createdAt: -1 }).limit(50);

    return NextResponse.json({ success: true, activity }, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching meeting activity:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch meeting activity' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    await dbConnect();

    const body = await req.json();
    const { meetingId, type, details, userName, userEmail } = body;
    if (type === 'recording-started' || type === 'recording-stopped') return NextResponse.json({ error: 'Recording state is managed by the server.' }, { status: 403 });

    if (!meetingId || !type) {
      return NextResponse.json({ error: 'Meeting ID and type are required' }, { status: 400 });
    }

    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const fallbackEmail = session?.user?.email || '';
    const resolvedUserEmail = userEmail || fallbackEmail;
    const resolvedUserName = userName || resolvedUserEmail || 'Guest';
    const resolvedUserId = resolvedUserEmail || `guest:${resolvedUserName}`;

    const activity = new MeetingActivity({
      meetingId,
      userId: resolvedUserId,
      userName: resolvedUserName,
      userEmail: resolvedUserEmail,
      type,
      details: details || '',
    });

    await activity.save();

    if (type === 'joined') {
      meeting.joinCount = (meeting.joinCount || 0) + 1;
      meeting.lastSessionAt = new Date();
      await meeting.save();
    }

    if (type === 'recording-started' || type === 'recording-stopped') {
      meeting.lastRecordingAt = new Date();
      await meeting.save();
    }

    return NextResponse.json({ success: true, activity }, { status: 201 });
  } catch (error: any) {
    console.error('Error saving meeting activity:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save meeting activity' },
      { status: 500 }
    );
  }
}