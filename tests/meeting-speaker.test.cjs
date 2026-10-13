const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getRealtimeSpeakerLabel } = require('../backend/meeting-ai-service/src/bot/assemblyAiSpeaker');

test('streaming diarization keeps distinct speakers and leaves uncertain turns unattributed', () => {
  assert.deepEqual(getRealtimeSpeakerLabel({ type: 'Turn', speaker_label: 'A', transcript: 'Hello' }), {
    speakerId: 'diarized:A', speakerName: 'Speaker A',
  });
  assert.deepEqual(getRealtimeSpeakerLabel({ type: 'Turn', speaker_label: 'B', transcript: 'Hi' }), {
    speakerId: 'diarized:B', speakerName: 'Speaker B',
  });
  assert.deepEqual(getRealtimeSpeakerLabel({ type: 'Turn', speaker_label: 'UNKNOWN', transcript: 'Yes' }), {
    speakerId: 'diarized:unknown', speakerName: 'Speaker',
  });
  assert.deepEqual(getRealtimeSpeakerLabel({ user_id: 'jitsi-123', speaker_name: 'Asha' }), {
    speakerId: 'jitsi-123', speakerName: 'Asha',
  });
});
