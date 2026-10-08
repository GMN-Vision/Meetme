const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const policy = load('lib/recording-policy.ts');

function route({ records = [], refresh = async r => r, authenticated = true } = {}) {
  let pipeline;
  const { GET } = load('app/api/recording/route.ts', {
    '@/models/Meeting': { collection: { name: 'meetings' } },
    '@/models/Recording': { aggregate: async stages => { pipeline = stages; return records; } },
    '@/lib/recording-policy': policy,
    '@/lib/recording-config': { getRecordingAvailability: () => ({ available: true }) },
    '@/lib/server-recording': {
      recordingUser: async () => { if (!authenticated) throw Error('Unauthorized'); return 'host@example.com'; },
      recordingSummary: r => ({ recordingId: r.recordingId, status: r.status }),
      refreshRecording: refresh,
      recordingErrorResponse: () => new Response('{}', { status: 401 }),
    },
  });
  return { GET, pipeline: () => pipeline };
}

test('feed applies exact ownership/shared-ready-expiry and ended-meeting filters before the 50-row limit', async () => {
  const handler = route();
  const response = await handler.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const stages = handler.pipeline();
  const alternatives = stages[0].$match.$or;
  assert.deepEqual(alternatives[0], { hostEmail: 'host@example.com' });
  assert.deepEqual(Object.keys(alternatives[1]).sort(), ['expiresAt', 'sharedAt', 'sharedWith', 'status']);
  assert.equal(alternatives[1].sharedWith, 'host@example.com');
  assert.equal(alternatives[1].status, 'ready');
  assert.deepEqual(alternatives[1].sharedAt, { $ne: null });
  assert.ok(alternatives[1].expiresAt.$gt instanceof Date);
  const join = stages.findIndex(s => s.$lookup);
  assert.equal(stages[join].$lookup.from, 'meetings');
  assert.equal(stages[join].$lookup.localField, 'meetingId');
  assert.equal(stages[join].$lookup.foreignField, 'meetingId');
  assert.deepEqual(stages[join].$lookup.pipeline[0], { $match: { endedAt: { $ne: null } } });
  assert.deepEqual(stages[join + 1], { $match: { 'endedMeeting.0': { $exists: true } } });
  assert.ok(stages.findIndex(s => s.$limit) > join + 1, 'unended rooms must not consume the page limit');
});

test('feed reconciles a missed completion callback for the host and returns ready immediately', async () => {
  const record = { recordingId: 'capture', hostEmail: 'host@example.com', status: 'processing' };
  const handler = route({ records: [record], refresh: async r => { assert.equal(r, record); return { ...r, status: 'ready' }; } });
  assert.deepEqual(await (await handler.GET()).json(), { recordings: [{ recordingId: 'capture', status: 'ready' }], syncPending: false });
});

test('ready/shared records do not contact worker; sync outages preserve the persisted feed', async t => {
  t.mock.method(console, 'warn', () => {});
  let refreshes = 0;
  const handler = route({ records: [
    { recordingId: 'private', hostEmail: 'host@example.com', status: 'ready' },
    { recordingId: 'shared', hostEmail: 'other@example.com', status: 'ready' },
    { recordingId: 'pending', hostEmail: 'host@example.com', status: 'processing' },
  ], refresh: async () => { refreshes++; throw Error('unavailable'); } });
  const response = await handler.GET();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.recordings.length, 3);
  assert.equal(body.syncPending, true);
  assert.equal(refreshes, 1);
});

test('unauthenticated list requests never reach MongoDB', async () => {
  const handler = route({ authenticated: false });
  assert.equal((await handler.GET()).status, 401);
  assert.equal(handler.pipeline(), undefined);
});

test('LMS polling replaces processing with playable ready output, preserving participant permissions', async t => {
  const React = require('react');
  const { create, act } = require('react-test-renderer');
  let poll, focus, status = 'processing';
  t.mock.method(global, 'setInterval', callback => { poll = callback; return 1; });
  t.mock.method(global, 'clearInterval', () => {});
  const originalWindow = global.window;
  global.window = { addEventListener: (_event, cb) => { focus = cb; }, removeEventListener: () => {} };
  let view;
  t.after(() => { if (view) act(() => view.unmount()); global.window = originalWindow; });
  t.mock.method(global, 'fetch', async url => new Response(JSON.stringify(url.endsWith('/quota') ? {} : {
    recordings: [{ recordingId: 'capture', meetingId: 'room', title: 'Recorded class', status, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), durationSeconds: 60, isHost: false }],
  }), { status: url.endsWith('/quota') ? 503 : 200 }));
  const { MeetingRecordings } = load('components/lms/MeetingRecordings.tsx');
  await act(async () => { view = create(React.createElement(MeetingRecordings)); });
  assert.equal(view.root.findAllByType('video').length, 0);
  status = 'ready';
  await act(async () => { poll(); });
  assert.ok(focus);
  const buttons = view.root.findAllByType('button');
  assert.equal(buttons.length, 1, 'participants receive Watch but no share/delete controls');
  await act(async () => { buttons[0].props.onClick(); });
  assert.equal(view.root.findByType('video').props.src, '/api/recording/capture');
  assert.equal(view.root.findByType('a').props.href, '/api/recording/capture?download=1');
});
