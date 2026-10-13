'use strict';

function getRealtimeSpeakerLabel(message) {
  const diarizedLabel = String(message?.speaker_label ?? message?.speakerLabel ?? '').trim();
  if (diarizedLabel && diarizedLabel.toUpperCase() !== 'UNKNOWN') {
    return {
      speakerId: `diarized:${diarizedLabel}`,
      speakerName: `Speaker ${diarizedLabel}`,
    };
  }

  if (diarizedLabel.toUpperCase() === 'UNKNOWN') {
    return { speakerId: 'diarized:unknown', speakerName: 'Speaker' };
  }

  const participantId = String(message?.user_id ?? message?.speaker_id ?? message?.speakerId ?? '').trim();
  if (participantId) {
    return {
      speakerId: participantId,
      speakerName: String(message?.speaker_name ?? message?.speakerName ?? `Speaker ${participantId}`).trim(),
    };
  }

  return { speakerId: 'speaker', speakerName: 'Speaker' };
}

module.exports = { getRealtimeSpeakerLabel };
