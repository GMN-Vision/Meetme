import { NextRequest, NextResponse } from 'next/server';
import Recording from '@/models/Recording';
import { canViewRecording, RECORDING_BUCKET } from '@/lib/recording-policy';
import { recordingUser, RecordingError, recordingErrorResponse } from '@/lib/server-recording';
import { deleteLocalRecording, localRecordingFile, localRecordingResponse } from '@/lib/local-recording';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const email = await recordingUser();
    const recording = await Recording.findOne({ recordingId: params.id });
    if (!recording || !canViewRecording(recording, email)) throw new RecordingError('Recording unavailable or not shared with you.', 404);
    const local = await localRecordingFile(recording.recordingId);
    if (local) return localRecordingResponse(request, local.file, local.size, `Meeting-${recording.meetingId}.mp4`);
    if (!recording.storagePath) throw new RecordingError('Recording file is unavailable. Please contact support.', 503);
    const { supabaseServer } = await import('@/lib/supabaseServer');
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
    const local = await localRecordingFile(recording.recordingId);
    if (local) {
      await deleteLocalRecording(local.file);
    } else if (recording.storagePath) {
      const { supabaseServer } = await import('@/lib/supabaseServer');
      const { error } = await supabaseServer.storage.from(RECORDING_BUCKET).remove([recording.storagePath]);
      if (error) throw new RecordingError('Could not remove recording. Please retry.', 503);
    }
    // Preserve usage ledger so deleting a file cannot refund recording minutes.
    await Recording.updateOne({ recordingId: params.id }, { $set: { status: 'expired', sizeBytes: 0, sharedWith: [] }, $unset: { storagePath: '' } });
    return NextResponse.json({ success: true });
  } catch (error) { return recordingErrorResponse(error); }
}
