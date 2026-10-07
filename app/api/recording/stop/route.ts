import { NextRequest, NextResponse } from 'next/server';
import { hostMeeting, recordingUser, recordingErrorResponse, stopServerRecording, recordingSummary } from '@/lib/server-recording';
export async function POST(request: NextRequest) {
  try {
    const email = await recordingUser();
    const body = await request.json();
    const meeting = await hostMeeting(body.meetingId || body.roomName, email);
    const recording = await stopServerRecording(meeting.meetingId);
    return NextResponse.json({ success: true, recording: recordingSummary(recording, email) });
  } catch (error) { return recordingErrorResponse(error); }
}
