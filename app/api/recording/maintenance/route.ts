import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Recording from '@/models/Recording';
import Meeting from '@/models/Meeting';
import MeetingParticipant from '@/models/MeetingParticipant';
import { RECORDING_BUCKET, ACTIVE_RECORDING_STATES } from '@/lib/recording-policy';
import { validWorkerSecret, refreshRecording, stopServerRecording, recordingErrorResponse } from '@/lib/server-recording';
import { deleteLocalRecording, localRecordingFile } from '@/lib/local-recording';
export async function POST(request: NextRequest) {
  if (!validWorkerSecret(request.headers.get('authorization'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await dbConnect();
    await Meeting.updateMany({ endedAt: null, activeSessionEndsAt: { $ne: null, $lte: new Date() } }, { $set: { endedAt: new Date() } });
    const active = await Recording.find({ status: { $in: ACTIVE_RECORDING_STATES } }).limit(100);
    const meetings = await Meeting.find({ meetingId: { $in: active.map(recording => recording.meetingId) } }).select('meetingId hostEmail endedAt').lean();
    const meetingsById = new Map(meetings.map(meeting => [meeting.meetingId, meeting]));
    const ended = meetings.filter(meeting => meeting.endedAt);
    const endedIds = new Set(ended.map(meeting => meeting.meetingId));
    const staleBefore = new Date(Date.now() - 5 * 60_000);
    const abandonedHostIds = new Set((await Promise.all(active.map(async recording => {
      const meeting = meetingsById.get(recording.meetingId);
      if (!meeting || meeting.endedAt || Date.now() - new Date(recording.createdAt).getTime() < 5 * 60_000) return null;
      const hostPresent = await MeetingParticipant.exists({ meetingId: recording.meetingId, userEmail: meeting.hostEmail, lastSeenAt: { $gte: staleBefore } });
      return hostPresent ? null : recording.meetingId;
    }))).filter((meetingId): meetingId is string => Boolean(meetingId)));
    if (abandonedHostIds.size) {
      await Meeting.updateMany({ meetingId: { $in: [...abandonedHostIds] }, endedAt: null }, { $set: { endedAt: new Date(), activeSessionEndsAt: new Date() } });
    }
    const results = await Promise.allSettled(active.map(recording => (
      endedIds.has(recording.meetingId) || abandonedHostIds.has(recording.meetingId)
        ? stopServerRecording(recording.meetingId) : refreshRecording(recording)
    )));
    const failures = results.filter(result => result.status === 'rejected').length;
    const expired = await Recording.find({ status: 'ready', expiresAt: { $lte: new Date() } }).limit(100);
    for (const recording of expired) {
      const local = await localRecordingFile(recording.recordingId);
      if (local) {
        await deleteLocalRecording(local.file);
      } else if (recording.storagePath) {
        const { supabaseServer } = await import('@/lib/supabaseServer');
        const { error } = await supabaseServer.storage.from(RECORDING_BUCKET).remove([recording.storagePath]);
        if (error) continue;
      }
      await Recording.updateOne({ recordingId: recording.recordingId, status: 'ready' }, { $set: { status: 'expired', sizeBytes: 0, sharedWith: [] }, $unset: { storagePath: '' } });
    }
    return NextResponse.json({ success: true, retrying: failures });
  } catch (error) { return recordingErrorResponse(error); }
}
