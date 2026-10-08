import { NextResponse } from 'next/server';
import Meeting from '@/models/Meeting';
import Recording from '@/models/Recording';
import { recordingUser, recordingErrorResponse, recordingSummary, refreshRecording } from '@/lib/server-recording';
import { ACTIVE_RECORDING_STATES } from '@/lib/recording-policy';
import { getRecordingAvailability } from '@/lib/recording-config';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const email = await recordingUser();
    // Apply visibility and meeting lifecycle checks BEFORE limiting the feed.
    // Otherwise recent unended rooms can hide every completed recording.
    const recordings = await Recording.aggregate([
      { $match: { $or: [{ hostEmail: email }, { sharedWith: email, sharedAt: { $ne: null }, status: 'ready', expiresAt: { $gt: new Date() } }] } },
      { $lookup: {
        from: Meeting.collection.name,
        localField: 'meetingId', foreignField: 'meetingId',
        pipeline: [{ $match: { endedAt: { $ne: null } } }, { $project: { _id: 1 } }],
        as: 'endedMeeting',
      } },
      { $match: { 'endedMeeting.0': { $exists: true } } },
      { $sort: { createdAt: -1, recordingId: -1 } },
      { $limit: 50 },
      { $project: { endedMeeting: 0 } },
    ]);
    let syncPending = false;
    if (getRecordingAvailability().available) {
      // Reconcile missed callbacks when the host returns to the LMS. A worker
      // outage must not hide already persisted recordings or broaden access.
      await Promise.all(recordings.map(async (recording, index) => {
        if (recording.hostEmail !== email || !ACTIVE_RECORDING_STATES.includes(recording.status)) return;
        try { recordings[index] = await refreshRecording(recording); }
        catch {
          syncPending = true;
          console.warn('[recording-list] Worker sync pending', { recordingId: recording.recordingId });
        }
      }));
    }
    return NextResponse.json({ recordings: recordings.map(recording => recordingSummary(recording, email)), syncPending }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return recordingErrorResponse(error); }
}
