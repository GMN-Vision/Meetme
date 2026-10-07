import { NextResponse } from 'next/server';
import { getWorkspaceQuota } from '@/lib/workspace-usage';
import Recording from '@/models/Recording';
import { recordingUser, recordingErrorResponse, RecordingError } from '@/lib/server-recording';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const email = await recordingUser();
    const quota = await getWorkspaceQuota(email);
    if (!quota) throw new RecordingError('Workspace not found.', 404);
    const month = new Date().toISOString().slice(0, 7);
    const [usage] = await Recording.aggregate([
      { $match: { scopeKey: `${quota.scope}:${quota.scopeId}` } },
      { $group: { _id: null,
        usedSeconds: { $sum: { $cond: [{ $eq: ['$month', month] }, '$durationSeconds', 0] } },
        storedBytes: { $sum: { $cond: [{ $eq: ['$status', 'ready'] }, '$sizeBytes', 0] } },
      } },
    ]);
    return NextResponse.json({ plan: quota.planDefinition.title, limits: quota.planDefinition.recording, month, usedSeconds: usage?.usedSeconds || 0, storedBytes: usage?.storedBytes || 0 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return recordingErrorResponse(error); }
}
