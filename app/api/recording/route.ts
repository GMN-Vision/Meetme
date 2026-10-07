import { NextResponse } from 'next/server';
import Meeting from '@/models/Meeting';
import Recording from '@/models/Recording';
import { recordingUser, recordingErrorResponse, recordingSummary } from '@/lib/server-recording';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const email = await recordingUser();
    const recordings = await Recording.find({
      $or: [{ hostEmail: email }, { sharedWith: email, sharedAt: { $ne: null }, status: 'ready', expiresAt: { $gt: new Date() } }],
    }).sort({ createdAt: -1 }).limit(50).lean();
    const meetings = await Meeting.find({ meetingId: { $in: recordings.map(recording => recording.meetingId) }, endedAt: { $ne: null } }).select('meetingId').lean();
    const ended = new Set(meetings.map(meeting => meeting.meetingId));
    return NextResponse.json({ recordings: recordings.filter(recording => ended.has(recording.meetingId)).map((recording) => recordingSummary(recording, email)) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return recordingErrorResponse(error); }
}
