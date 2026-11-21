type TranscriptLine = {
  text?: string;
  timestamp?: number;
  speaker?: string;
  speakerId?: string;
};

export function formatTranscriptTimestamp(timestamp = 0) {
  if (!Number.isFinite(timestamp) || timestamp < 0) timestamp = 0;
  // Live captions use Unix milliseconds, while recording transcripts use offsets.
  if (timestamp >= 1e12 && timestamp <= 8.64e15) return new Date(timestamp).toISOString();

  const seconds = Math.floor(timestamp / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function downloadTranscript(meetingId: string, entries: readonly TranscriptLine[]) {
  const lines = entries.filter(({ text }) => text?.trim()).map((entry) => (
    `[${formatTranscriptTimestamp(entry.timestamp)}] ${entry.speaker || entry.speakerId || 'Speaker'}: ${entry.text}`
  ));
  if (lines.length === 0) return;

  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `transcript-${meetingId}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
