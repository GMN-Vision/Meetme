import { NextRequest, NextResponse } from 'next/server';
import Meeting from '@/models/Meeting';
import { hostMeeting, recordingUser, stopServerRecording, recordingErrorResponse } from '@/lib/server-recording';
export async function POST(request: NextRequest) {
  try {
    const email = await recordingUser();
    const { meetingId } = await request.json();
    await hostMeeting(meetingId, email);
    // Close admission first; retries still attempt to stop a pending recording.
    await Meeting.updateOne({ meetingId, endedAt: null }, { $set: { endedAt: new Date(), activeSessionEndsAt: new Date() } });
    await stopServerRecording(meetingId);
    return NextResponse.json({ success: true });
  } catch (error) { return recordingErrorResponse(error); }
}
