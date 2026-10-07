import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Recording from '@/models/Recording';
import Meeting from '@/models/Meeting';
import { supabaseServer } from '@/lib/supabaseServer';
import { RECORDING_BUCKET, ACTIVE_RECORDING_STATES } from '@/lib/recording-policy';
import { validWorkerSecret, refreshRecording, stopServerRecording, recordingErrorResponse } from '@/lib/server-recording';
export async function POST(request: NextRequest) {
  if (!validWorkerSecret(request.headers.get('authorization'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await dbConnect();
    await Meeting.updateMany({ endedAt: null, activeSessionEndsAt: { $ne: null, $lte: new Date() } }, { $set: { endedAt: new Date() } });
    const active = await Recording.find({ status: { $in: ACTIVE_RECORDING_STATES } }).limit(100);
    const ended = await Meeting.find({ meetingId: { $in: active.map(recording => recording.meetingId) }, endedAt: { $ne: null } }).select('meetingId').lean();
    const endedIds = new Set(ended.map(meeting => meeting.meetingId));
    const results = await Promise.allSettled(active.map(recording => endedIds.has(recording.meetingId) ? stopServerRecording(recording.meetingId) : refreshRecording(recording)));
    const failures = results.filter(result => result.status === 'rejected').length;
    const expired = await Recording.find({ status: 'ready', expiresAt: { $lte: new Date() } }).limit(100);
    for (const recording of expired) {
      const { error } = await supabaseServer.storage.from(RECORDING_BUCKET).remove([recording.storagePath]);
      if (error) continue;
      await Recording.updateOne({ recordingId: recording.recordingId, status: 'ready' }, { $set: { status: 'expired', sizeBytes: 0, sharedWith: [] }, $unset: { storagePath: '' } });
    }
    return NextResponse.json({ success: true, retrying: failures });
  } catch (error) { return recordingErrorResponse(error); }
}
