import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { validWorkerSecret, syncRecording, recordingErrorResponse } from '@/lib/server-recording';
export async function POST(request: NextRequest) {
  if (!validWorkerSecret(request.headers.get('authorization'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const snapshot = await request.json();
    await dbConnect();
    const recording = await syncRecording(String(snapshot.recordingId), snapshot);
    return NextResponse.json({ success: Boolean(recording) }, { status: recording ? 200 : 404 });
  } catch (error) { return recordingErrorResponse(error); }
}
