import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Meeting from '@/models/Meeting';
import Recording from '@/models/Recording';
import { isMeetingHost } from '@/lib/recording-policy';
import { getRecordingAvailability } from '@/lib/recording-config';
import { recordingErrorResponse, refreshRecording, recordingSummary } from '@/lib/server-recording';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const email = (await auth())?.user?.email?.toLowerCase() || '';
    const meetingId = request.nextUrl.searchParams.get('roomName');
    if (!meetingId) return NextResponse.json({ error: 'Room is required.' }, { status: 400 });
    await dbConnect();
    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) return NextResponse.json({ error: 'Meeting not found.' }, { status: 404 });
    const isHost = isMeetingHost(meeting, email);
    const availability = getRecordingAvailability();
    let recording = await Recording.findOne({ meetingId }).sort({ createdAt: -1 });
    // Public meeting participants see a recording notice, never private output metadata.
    if (isHost && recording && availability.available) recording = await refreshRecording(recording);
    const active = recording && ['starting', 'recording', 'processing'].includes(recording.status);
    return NextResponse.json({
      isHost, canRecord: isHost && meeting.recordingEnabled !== false && !meeting.endedAt && availability.available,
      canStop: isHost && Boolean(active),
      unavailableReason: isHost && !availability.available ? availability.message : null,
      recording: isHost ? recordingSummary(recording, email) : (active ? { status: recording.status, startedAt: recording.startedAt } : null),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return recordingErrorResponse(error); }
}
