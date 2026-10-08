import { randomUUID, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import dbConnect from '@/lib/db';
import { getWorkspaceQuota } from '@/lib/workspace-usage';
import { normalizeJitsiRoomName } from '@/lib/jitsi-room';
import { ACTIVE_RECORDING_STATES, isMeetingHost, recordingAllowance } from '@/lib/recording-policy';
import Meeting from '@/models/Meeting';
import Recording from '@/models/Recording';
import { getRecordingAvailability } from '@/lib/recording-config';

export class RecordingError extends Error {
  constructor(message: string, public status = 400, public code?: string) { super(message); }
}
export function recordingErrorResponse(error: unknown) {
  if (error instanceof RecordingError) return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status });
  console.error('[server-recording]', error);
  return NextResponse.json({ error: 'Unable to update recording. Please retry.' }, { status: 500 });
}
export async function recordingUser() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) throw new RecordingError('Sign in to access recordings.', 401);
  await dbConnect();
  return email;
}
export async function hostMeeting(meetingId: string, email: string) {
  if (!meetingId || typeof meetingId !== 'string') throw new RecordingError('Meeting ID is required.');
  const meeting = await Meeting.findOne({ meetingId });
  if (!meeting) throw new RecordingError('Meeting not found.', 404);
  if (!isMeetingHost(meeting, email)) throw new RecordingError('Only the meeting host can control recordings or end this meeting.', 403);
  return meeting;
}
export function validWorkerSecret(header: string | null) {
  const expected = process.env.RECORDING_WORKER_SECRET;
  if (!expected || !header) return false;
  const a = Buffer.from(header), b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function recordingWorker(path: string, method = 'GET', body?: unknown) {
  const url = process.env.RECORDING_WORKER_URL;
  const secret = process.env.RECORDING_WORKER_SECRET;
  if (!url || !secret) throw new RecordingError('Server recording is not configured yet.', 503);
  let response: Response;
  try {
    response = await fetch(`${url.replace(/\/$/, '')}${path}`, {
      method, headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: AbortSignal.timeout(20000),
    });
  } catch { throw new RecordingError('Recording server is unavailable. Please retry.', 503); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new RecordingError(data.error || 'Recording server could not complete the request.', response.status === 409 ? 409 : 503);
  return data;
}

// Worker snapshots are cumulative, so callbacks and polling can safely arrive out of order.
export async function syncRecording(recordingId: string, snapshot: any) {
  const recording = await Recording.findOne({ recordingId });
  if (!recording || !ACTIVE_RECORDING_STATES.includes(recording.status)) return recording;
  const rank: Record<string, number> = { starting: 0, recording: 1, processing: 2, ready: 3, failed: 3 };
  if (!Object.prototype.hasOwnProperty.call(rank, snapshot.status) || rank[snapshot.status] < rank[recording.status]) return recording;
  const update: Record<string, any> = { status: snapshot.status };
  if (snapshot.startedAt && Number.isFinite(Date.parse(snapshot.startedAt))) update.startedAt = new Date(snapshot.startedAt);
  if (snapshot.stoppedAt && Number.isFinite(Date.parse(snapshot.stoppedAt))) update.stoppedAt = new Date(snapshot.stoppedAt);
  if (['ready', 'failed'].includes(snapshot.status)) {
    const duration = Number(snapshot.durationSeconds || 0);
    if (!Number.isFinite(duration) || duration < 0) throw new RecordingError('Invalid recording duration.');
    update.durationSeconds = Math.min(Math.ceil(duration), recording.maxDurationSeconds);
    update.error = snapshot.status === 'failed' ? String(snapshot.error || 'Recording could not be processed.').slice(0, 300) : '';
    if (snapshot.status === 'ready') {
      const size = Number(snapshot.sizeBytes);
      if (snapshot.storagePath !== `${recordingId}/meeting.mp4` || !Number.isSafeInteger(size) || size <= 0 || size > recording.maxBytes || duration <= 0) throw new RecordingError('Invalid recording output.');
      update.storagePath = snapshot.storagePath;
      update.sizeBytes = size;
      // Stable retention across callback retries; anchored to capture completion.
      const stopped = update.stoppedAt || recording.stoppedAt || new Date();
      update.expiresAt = new Date(stopped.getTime() + recording.retentionDays * 86400000);
    }
  }
  return Recording.findOneAndUpdate(
    { recordingId, status: recording.status },
    { $set: update, ...(['ready', 'failed'].includes(snapshot.status) ? { $unset: { activeScope: '', activeMeeting: '' } } : {}) },
    { new: true },
  );
}
export async function refreshRecording(recording: any) {
  if (!recording || !ACTIVE_RECORDING_STATES.includes(recording.status)) return recording;
  const snapshot = await recordingWorker(`/recordings/${recording.recordingId}`);
  if (snapshot.status === 'missing' && Date.now() - new Date(recording.createdAt).getTime() > 120000) {
    // Cancel a request that never reached the worker; a delayed start cannot resurrect it.
    return syncRecording(recording.recordingId, await recordingWorker(`/recordings/${recording.recordingId}/stop`, 'POST'));
  }
  return await syncRecording(recording.recordingId, snapshot) || recording;
}
export async function startServerRecording(meeting: any, email: string) {
  if (!isMeetingHost(meeting, email)) throw new RecordingError('Only the meeting host can record.', 403);
  if (meeting.endedAt) throw new RecordingError('This meeting has ended.', 409);
  if (!meeting.activeSessionStartedAt) throw new RecordingError('Join the meeting before recording.', 409);
  if (meeting.recordingEnabled === false) throw new RecordingError('Recording is disabled for this meeting.', 403);
  const availability = getRecordingAvailability();
  if (!availability.available) throw new RecordingError(availability.message!, 503, availability.code!);
  await Recording.init();
  const existing = await Recording.findOne({ activeMeeting: meeting.meetingId });
  if (existing) return refreshRecording(existing);
  const quota = await getWorkspaceQuota(email);
  if (!quota) throw new RecordingError('Workspace not found.', 403);
  await recordingWorker('/health');
  const scopeKey = `${quota.scope}:${quota.scopeId}`;
  const month = new Date().toISOString().slice(0, 7);
  // Reserve the workspace before reading usage. Indexes are required in production.
  let recording: any;
  try {
    recording = await Recording.create({
      recordingId: randomUUID(), meetingId: meeting.meetingId, hostEmail: email, title: meeting.title,
      scopeKey, activeScope: scopeKey, activeMeeting: meeting.meetingId, month,
      maxDurationSeconds: 0, maxBytes: 0, retentionDays: quota.planDefinition.recording.retentionDays,
    });
  } catch (error: any) {
    if (error.code === 11000) throw new RecordingError('A recording is already active or processing in this workspace.', 409);
    throw error;
  }
  let dispatched = false;
  try {
    const [usage] = await Recording.aggregate([
      { $match: { scopeKey } },
      { $group: { _id: null,
        usedSeconds: { $sum: { $cond: [{ $eq: ['$month', month] }, '$durationSeconds', 0] } },
        storedBytes: { $sum: { $cond: [{ $eq: ['$status', 'ready'] }, '$sizeBytes', 0] } },
      } },
    ]);
    const meetingSeconds = meeting.activeSessionEndsAt ? (meeting.activeSessionEndsAt.getTime() - Date.now()) / 1000 : Infinity;
    const allowance = recordingAllowance(quota.planDefinition.recording, usage?.usedSeconds || 0, usage?.storedBytes || 0, meetingSeconds);
    if (allowance.seconds < 60) throw new RecordingError('Recording time or storage limit reached. Delete old recordings, wait for the monthly reset, or upgrade.', 403);
    recording.maxDurationSeconds = allowance.seconds;
    recording.maxBytes = allowance.maxBytes;
    await recording.save();
    // Recheck after the reservation to close the end-meeting/start race.
    const current = await Meeting.findOne({ meetingId: meeting.meetingId });
    if (current?.endedAt) throw new RecordingError('This meeting has ended.', 409);
    dispatched = true;
    const snapshot = await recordingWorker('/recordings', 'POST', {
      recordingId: recording.recordingId, roomName: normalizeJitsiRoomName(meeting.meetingId),
      maxDurationSeconds: allowance.seconds, maxBytes: allowance.maxBytes,
    });
    await syncRecording(recording.recordingId, snapshot);
    if (snapshot.status === 'failed') throw new RecordingError(snapshot.error || 'Recording could not start.', 503);
    const afterStart = await Meeting.findOne({ meetingId: meeting.meetingId });
    if (afterStart?.endedAt) await stopServerRecording(meeting.meetingId);
    return await Recording.findOne({ recordingId: recording.recordingId });
  } catch (error) {
    // A timeout is ambiguous: retain the reservation until the worker reconciles it.
    if (!dispatched) await syncRecording(recording.recordingId, { status: 'failed', error: 'Recording did not start.', durationSeconds: 0 });
    throw error;
  }
}
export async function stopServerRecording(meetingId: string) {
  const recording = await Recording.findOne({ activeMeeting: meetingId });
  if (!recording) return null;
  const snapshot = await recordingWorker(`/recordings/${recording.recordingId}/stop`, 'POST');
  return syncRecording(recording.recordingId, snapshot);
}
export function recordingSummary(recording: any, email: string) {
  if (!recording) return null;
  return {
    recordingId: recording.recordingId, meetingId: recording.meetingId, title: recording.title,
    status: recording.status, startedAt: recording.startedAt, createdAt: recording.createdAt,
    durationSeconds: recording.durationSeconds, maxDurationSeconds: recording.maxDurationSeconds,
    expiresAt: recording.expiresAt, sharedAt: recording.sharedAt, isHost: recording.hostEmail === email,
    error: recording.error,
  };
}
