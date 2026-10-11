import { nanoid } from 'nanoid';

// Keep the existing bucket and meeting folders so shared files remain available.
export const MEETING_FILES_BUCKET = 'meeting-files';

export function sanitizeStorageSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function getMeetingStorageRoot(_scopeType: 'meeting', meetingId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(meetingId)) throw new Error('Invalid meeting ID');
  return meetingId;
}

export function buildMeetingStoragePath(scopeType: 'meeting', meetingId: string, fileName: string) {
  return `${getMeetingStorageRoot(scopeType, meetingId)}/${Date.now()}_${nanoid(6)}_${sanitizeStorageSegment(fileName)}`;
}
