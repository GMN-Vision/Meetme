import MeetingTranscript from '@/models/MeetingTranscript';

export function transcriptLines(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(entry => ({
    text: String(entry?.text || '').trim(),
    timestamp: Number(entry?.timestamp || 0),
    speakerId: String(entry?.speakerId || entry?.speaker || 'speaker'),
    speaker: String(entry?.speaker || entry?.speakerId || 'Speaker'),
  })).filter(entry => entry.text && Number.isFinite(entry.timestamp));
}

export async function checkpointTranscript(meeting: { meetingId: string; hostEmail: string; title: string }, entries: unknown, complete = false) {
  const lines = transcriptLines(entries);
  if (!lines.length) {
    if (complete) await MeetingTranscript.updateOne({ meetingId: meeting.meetingId, completedAt: null }, { $set: { completedAt: new Date() } });
    return;
  }
  await MeetingTranscript.updateOne({ meetingId: meeting.meetingId }, {
    $setOnInsert: { hostEmail: meeting.hostEmail.toLowerCase(), title: meeting.title, completedAt: null },
  }, { upsert: true });
  // Atomic append makes retries and concurrent checkpoints safe. A completed
  // transcript remains frozen when a late caption or summary arrives.
  await MeetingTranscript.updateOne({ meetingId: meeting.meetingId, completedAt: null }, {
    ...(lines.length ? { $addToSet: { lines: { $each: lines } } } : {}),
    ...(complete ? { $set: { completedAt: new Date() } } : {}),
  });
}
