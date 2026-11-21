const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');

test('the host transcript is saved even when AI summary generation is unavailable', async () => {
  const persisted = [];
  const meeting = {
    hostEmail: 'host@example.com',
    transcript: [],
    speakerLabels: [],
    isModified: (field) => field === 'transcript',
    async save() {
      persisted.push(...this.transcript);
    },
  };
  const { POST } = load('app/api/ai/save-results/route.ts', {
    '@/lib/db': { default: async () => {}, __esModule: true },
    '@/models/Meeting': { findOne: async () => meeting },
    '@/models/Task': {},
    'next-auth': { getServerSession: async () => ({ user: { email: 'Host@example.com' } }) },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/membership': {
      requireFeatureAccess: async () => ({ ok: false, status: 403, error: 'Upgrade required' }),
    },
    '@/lib/openai-meeting-notes': {
      generateOpenAIMeetingNotes: () => assert.fail('The summary is unavailable for this plan'),
    },
  });
  const entry = { timestamp: 1234, speaker: 'Host', speakerId: 'host', text: 'The meeting is open.' };
  const response = await POST(new Request('https://melanam.com/api/ai/save-results', {
    method: 'POST',
    body: JSON.stringify({ meetingId: 'room', transcript: [entry], generateSummary: true }),
  }));

  assert.equal(response.status, 403);
  assert.deepEqual(persisted, [entry]);
});

test('transcript timestamps support both recording offsets and live caption dates', () => {
  const { formatTranscriptTimestamp } = load('lib/transcript-download.ts');
  assert.equal(formatTranscriptTimestamp(65_000), '1:05');
  assert.equal(formatTranscriptTimestamp(Date.UTC(2026, 10, 22, 9)), '2026-11-22T09:00:00.000Z');
});
