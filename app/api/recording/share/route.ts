import { NextRequest, NextResponse } from 'next/server';
import MeetingMember from '@/models/MeetingMember';
import Recording from '@/models/Recording';
import { hostMeeting, recordingUser, RecordingError, recordingErrorResponse } from '@/lib/server-recording';
export async function POST(request: NextRequest) {
  try {
    const email = await recordingUser();
    const { meetingId } = await request.json();
    const meeting = await hostMeeting(meetingId, email);
    if (!meeting.endedAt) throw new RecordingError('End the meeting before sharing its recordings.', 409);
    if (await Recording.exists({ activeMeeting: meetingId })) throw new RecordingError('Wait until every recording in this meeting finishes processing before sharing.', 409);
    const members = await MeetingMember.find({ meetingId }).select('userEmail').lean();
    const sharedWith = members.map((member) => member.userEmail).filter((member) => member !== email);
    const result = await Recording.updateMany(
      { meetingId, hostEmail: email, status: 'ready', expiresAt: { $gt: new Date() } },
      { $set: { sharedAt: new Date(), sharedWith } },
    );
    if (!result.matchedCount) throw new RecordingError('The recording is still processing or has expired.', 409);
    return NextResponse.json({ success: true, members: sharedWith.length });
  } catch (error) { return recordingErrorResponse(error); }
}
