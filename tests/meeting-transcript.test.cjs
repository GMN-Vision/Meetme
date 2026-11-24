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
    '@/lib/meeting-transcript': { checkpointTranscript: async () => {} },
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

test('transcript checkpoints deduplicate retries and freeze after host completion', async () => {
  const saved = { completedAt: null, lines: [] };
  const { checkpointTranscript } = load('lib/meeting-transcript.ts', {
    '@/models/MeetingTranscript': { updateOne: async (filter, update) => {
      if (Object.hasOwn(filter, 'completedAt') && saved.completedAt !== null) return;
      for (const line of update.$addToSet?.lines.$each || []) {
        if (!saved.lines.some(item => JSON.stringify(item) === JSON.stringify(line))) saved.lines.push(line);
      }
      if (update.$set?.completedAt) saved.completedAt = update.$set.completedAt;
    } },
  });
  const meeting = { meetingId: 'room', hostEmail: 'host@example.com', title: 'Review' };
  const lines = [{ text: 'First sentence', timestamp: 1, speaker: 'Host' }];
  await checkpointTranscript(meeting, lines);
  await checkpointTranscript(meeting, lines);
  assert.equal(saved.lines.length, 1);
  await checkpointTranscript(meeting, [...lines, { text: 'Last sentence', timestamp: 2 }], true);
  await checkpointTranscript(meeting, [{ text: 'After the host left', timestamp: 3 }]);
  assert.deepEqual(saved.lines.map(line => line.text), ['First sentence', 'Last sentence']);
});

test('only the host shares completed transcripts with server-recorded meeting participants', async () => {
  let email = 'participant@example.com';
  let completed = false;
  const updates = [];
  const route = load('app/api/transcripts/route.ts', {
    'next-auth': { getServerSession: async () => ({ user: { email } }) },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/db': async () => {},
    '@/lib/meeting-transcript': { checkpointTranscript: async () => {} },
    '@/models/Meeting': { findOne: async () => ({ hostEmail: 'host@example.com' }) },
    '@/models/MeetingMember': { find: () => ({ select: () => ({ lean: async () => [{ userEmail: 'host@example.com' }, { userEmail: 'participant@example.com' }] }) }) },
    '@/models/MeetingTranscript': {
      findOne: async () => ({ completedAt: completed ? new Date() : null, lines: [{ text: 'Hello' }] }),
      updateOne: async (filter, update) => updates.push({ filter, update }),
    },
  });
  const request = () => new Request('https://melanam.com/api/transcripts', { method: 'POST', body: JSON.stringify({ action: 'share', meetingId: 'room', sharedWith: ['outsider@example.com'] }) });
  assert.equal((await route.POST(request())).status, 403);
  email = 'host@example.com';
  assert.equal((await route.POST(request())).status, 409);
  assert.equal(updates.length, 0);
  completed = true;
  assert.equal((await route.POST(request())).status, 200);
  assert.deepEqual(updates[0].update.$set.sharedWith, ['participant@example.com']);
});

test('transcript library scopes shared access and does not return recipient email addresses', async () => {
  let filter;
  const route = load('app/api/transcripts/route.ts', {
    'next-auth': { getServerSession: async () => ({ user: { email: 'participant@example.com' } }) },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/db': async () => {},
    '@/lib/meeting-transcript': {},
    '@/models/Meeting': { find: () => ({ select: () => ({ lean: async () => [] }) }) },
    '@/models/MeetingMember': {},
    '@/models/MeetingTranscript': { find: value => {
      filter = value;
      return { sort: () => ({ lean: async () => [{ meetingId: 'room', hostEmail: 'host@example.com', sharedWith: ['participant@example.com'], lines: [{ text: 'Hello' }] }] }) };
    } },
  });
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.deepEqual(filter.$or, [{ hostEmail: 'participant@example.com' }, { sharedWith: 'participant@example.com', completedAt: { $ne: null } }]);
  const { transcripts } = await response.json();
  assert.equal(transcripts[0].isHost, false);
  assert.equal(transcripts[0].sharedWith, undefined);
  assert.equal(transcripts[0].hostEmail, undefined);
});

test('transcript reader supports search and keeps participant sharing exclusive to completed host transcripts', async t => {
  const React = require('react');
  const { create, act } = require('react-test-renderer');
  const previousWindow = global.window;
  global.window = { setInterval: () => 1, clearInterval: () => {} };
  let isHost = true;
  let completedAt = null;
  t.mock.method(global, 'fetch', async () => Response.json({ transcripts: [{
    meetingId: 'room', title: 'Design review', isHost, completedAt,
    updatedAt: new Date().toISOString(),
    lines: [{ speaker: 'Alex', text: 'Ship the prototype', timestamp: 1000 }, { speaker: 'Sam', text: 'Review on Friday', timestamp: 2000 }],
  }] }));
  const { TranscriptLibrary } = load('components/meetings/TranscriptLibrary.tsx');
  let view;
  t.after(() => { if (view) act(() => view.unmount()); global.window = previousWindow; });
  await act(async () => { view = create(React.createElement(TranscriptLibrary)); });
  const shareButton = () => view.root.findAllByType('button').find(button => button.children.includes('Share with participants'));
  assert.equal(shareButton().props.disabled, true);
  const search = view.root.findByProps({ type: 'search' });
  act(() => search.props.onChange({ target: { value: 'Friday' } }));
  assert.equal(view.root.findAllByType('strong').filter(node => node.children.includes('Alex')).length, 0);
  assert.equal(view.root.findAllByType('strong').filter(node => node.children.includes('Sam')).length, 1);
  act(() => view.unmount());
  isHost = false;
  completedAt = new Date().toISOString();
  await act(async () => { view = create(React.createElement(TranscriptLibrary)); });
  assert.equal(shareButton(), undefined);
});
