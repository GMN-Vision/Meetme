import { NextRequest, NextResponse } from 'next/server';
import Recording from '@/models/Recording';
import Meeting from '@/models/Meeting';
import { supabaseServer } from '@/lib/supabaseServer';
import { canViewRecording, RECORDING_BUCKET } from '@/lib/recording-policy';
import { recordingUser, RecordingError, recordingErrorResponse } from '@/lib/server-recording';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const email = await recordingUser();
    const recording = await Recording.findOne({ recordingId: params.id });
    if (!recording || !canViewRecording(recording, email)) throw new RecordingError('Recording unavailable or not shared with you.', 404);
    const ended = await Meeting.exists({ meetingId: recording.meetingId, endedAt: { $ne: null } });
    if (!ended) throw new RecordingError('Recording is available after the host ends the meeting.', 409);
    const download = request.nextUrl.searchParams.get('download') === '1';
    const { data, error } = await supabaseServer.storage.from(RECORDING_BUCKET).createSignedUrl(recording.storagePath, 300,
      download ? { download: `Meeting-${recording.meetingId}.mp4` } : undefined);
    if (error || !data?.signedUrl) throw new RecordingError('Unable to open recording. Please retry.', 503);
    return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (error) { return recordingErrorResponse(error); }
}
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const email = await recordingUser();
    const recording = await Recording.findOne({ recordingId: params.id, hostEmail: email });
    if (!recording) throw new RecordingError('Recording not found.', 404);
    if (!['ready', 'failed', 'expired'].includes(recording.status)) throw new RecordingError('Wait for processing to finish before deleting.', 409);
    if (recording.storagePath) {
      const { error } = await supabaseServer.storage.from(RECORDING_BUCKET).remove([recording.storagePath]);
      if (error) throw new RecordingError('Could not remove recording. Please retry.', 503);
    }
    // Preserve usage ledger so deleting a file cannot refund recording minutes.
    await Recording.updateOne({ recordingId: params.id }, { $set: { status: 'expired', sizeBytes: 0, sharedWith: [] }, $unset: { storagePath: '' } });
    return NextResponse.json({ success: true });
  } catch (error) { return recordingErrorResponse(error); }
}
