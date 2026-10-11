import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/db';
import Meeting from '../../../models/Meeting';
import MeetingActivity from '../../../models/MeetingActivity';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth-options';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email;

    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const userEmailMatcher = new RegExp(`^${escapeRegex(userEmail)}$`, 'i');
    const meetingFilter = {
      $or: [{ hostEmail: userEmailMatcher }, { recordedByEmail: userEmailMatcher }],
    };

    const [meetings, activity] = await Promise.all([
      Meeting.find(meetingFilter)
        .select(
          'meetingId title hostEmail recorded recordedBy recordingDuration recordingDurationSeconds recordingDate recordingStatus lastRecordingAt createdAt updatedAt'
        )
        .sort({ lastRecordingAt: -1, updatedAt: -1 })
        .limit(20)
        .lean(),
      MeetingActivity.find({ userEmail: userEmailMatcher })
        .sort({ createdAt: -1 })
        .limit(12)
        .lean(),
    ]);

    return NextResponse.json(
      {
        success: true,
        meetings: meetings.map(serializeMeetingHistory),
        activity,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error fetching meeting history:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch meeting history' },
      { status: 500 }
    );
  }
}

function serializeMeetingHistory(meeting: any) {
  return {
    _id: String(meeting._id || ''),
    meetingId: meeting.meetingId || '',
    title: meeting.title || meeting.meetingId || 'Meeting',
    recorded: Boolean(meeting.recorded),
    recordedBy: meeting.recordedBy || '',
    recordingDuration: meeting.recordingDuration || '',
    recordingDurationSeconds: Number(meeting.recordingDurationSeconds || 0),
    recordingDate: meeting.recordingDate || '',
    recordingStatus: meeting.recordingStatus || '',
    lastRecordingAt: meeting.lastRecordingAt || null,
    createdAt: meeting.createdAt || null,
    updatedAt: meeting.updatedAt || null,
  };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
