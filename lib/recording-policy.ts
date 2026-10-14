export const ACTIVE_RECORDING_STATES = ['starting', 'recording', 'processing'];
export const RECORDING_BUCKET = 'meeting-recordings';
// 1080p30 H.264 targets 4 Mbps, with a 5 Mbps peak plus 128 kbps AAC.
// Reserve 5.6 Mbps including muxing/rate-control headroom.
export const RECORDING_BYTES_PER_SECOND = 700_000;

export function isMeetingHost(meeting: { hostEmail?: string }, email: string) {
  return Boolean(email) && meeting.hostEmail?.toLowerCase() === email.toLowerCase();
}

export function canViewRecording(recording: any, email: string, now = Date.now()) {
  if (!email || recording.status !== 'ready' || !recording.expiresAt || new Date(recording.expiresAt).getTime() <= now) return false;
  return recording.hostEmail === email.toLowerCase() || Boolean(recording.sharedAt && recording.sharedWith?.includes(email.toLowerCase()));
}

export function recordingAllowance(limits: { monthlyMinutes: number; maxSessionMinutes: number; storageGb: number }, usedSeconds: number, storedBytes: number, meetingSeconds = Infinity) {
  const availableBytes = Math.max(0, Math.floor(limits.storageGb * 1024 ** 3 - storedBytes));
  const seconds = Math.max(0, Math.floor(Math.min(
    limits.monthlyMinutes * 60 - usedSeconds,
    limits.maxSessionMinutes * 60,
    availableBytes / RECORDING_BYTES_PER_SECOND,
    meetingSeconds,
  )));
  return { seconds, maxBytes: Math.min(availableBytes, seconds * RECORDING_BYTES_PER_SECOND) };
}
