const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const policy = load('lib/recording-policy.ts');
const { BILLING_PLAN_MAP, getPlanPrice } = load('lib/billing-plans.ts');

function service({ email = 'host@example.com', meeting, recording, quota } = {}) {
  const room = meeting || { meetingId: 'room', hostEmail: 'host@example.com', title: 'Class', activeSessionStartedAt: new Date(), recordingEnabled: true };
  let changes = [];
  const model = {
    init: async () => {},
    findOne: async () => recording || null,
    findOneAndUpdate: async (_filter, update) => { changes.push(update); return { ...recording, ...update.$set }; },
  };
  const lib = load('lib/server-recording.ts', {
    '@/lib/auth': { auth: async () => email ? { user: { email } } : null },
    '@/lib/db': async () => {}, '@/lib/workspace-usage': { getWorkspaceQuota: async () => quota },
    '@/lib/jitsi-room': load('lib/jitsi-room.ts'), '@/lib/recording-policy': policy,
    '@/models/Meeting': { findOne: async () => room }, '@/models/Recording': model,
  });
  return { lib, room, model, changes };
}

test('Free includes recording without AI credits; checkout prices match catalog', () => {
  assert.equal(BILLING_PLAN_MAP.free.features.recording, true);
  assert.equal(BILLING_PLAN_MAP.free.includedCredits, 0);
  assert.equal(BILLING_PLAN_MAP.free.recording.monthlyMinutes, 300);
  assert.equal(getPlanPrice('pro', 'monthly'), 799);
  assert.equal(getPlanPrice('business', 'annual'), 26990);
});

test('allowance honors monthly minutes, per-recording length, storage and meeting deadline', () => {
  const limits = BILLING_PLAN_MAP.free.recording;
  assert.equal(policy.recordingAllowance(limits, 0, 0).seconds, 10800);
  assert.equal(policy.recordingAllowance(limits, 299 * 60, 0).seconds, 60);
  assert.equal(policy.recordingAllowance(limits, 300 * 60, 0).seconds, 0);
  assert.equal(policy.recordingAllowance(limits, 0, 5 * 1024 ** 3).seconds, 0);
  assert.equal(policy.recordingAllowance(limits, 0, 0, 45).seconds, 45);
  assert.equal(policy.recordingAllowance(limits, 0, 0, -10).seconds, 0);
});

test('private recordings are visible only to their host, shared recordings only to the member snapshot', () => {
  const recording = { status: 'ready', hostEmail: 'host@example.com', expiresAt: new Date(Date.now() + 60000), sharedWith: [] };
  assert.equal(policy.canViewRecording(recording, 'host@example.com'), true);
  for (const user of ['student@example.com', 'instructor@example.com', 'admin@example.com', '']) assert.equal(policy.canViewRecording(recording, user), false);
  recording.sharedAt = new Date(); recording.sharedWith = ['student@example.com'];
  assert.equal(policy.canViewRecording(recording, 'student@example.com'), true);
  assert.equal(policy.canViewRecording(recording, 'late-member@example.com'), false);
  recording.expiresAt = new Date(0);
  assert.equal(policy.canViewRecording(recording, 'host@example.com'), false);
});

test('non-hosts cannot start, stop or end a meeting through direct API requests', async () => {
  for (const route of ['recording/start', 'recording/stop', 'meeting-end']) {
    for (const email of ['instructor@example.com', 'admin@example.com', 'student@example.com', '']) {
      const { lib } = service({ email });
      const handler = load(`app/api/${route}/route.ts`, {
        '@/lib/server-recording': lib, '@/models/Meeting': { updateOne: () => { throw Error('must not mutate'); } },
      });
      const response = await handler.POST({ json: async () => ({ meetingId: 'room', hostEmail: email }) });
      assert.equal(response.status, email ? 403 : 401);
    }
  }
});

test('disabled, ended and not-yet-started rooms reject capture before reaching worker', async () => {
  const { lib, room } = service();
  for (const changes of [{ endedAt: new Date() }, { recordingEnabled: false }, { activeSessionStartedAt: null }]) {
    await assert.rejects(lib.startServerRecording({ ...room, ...changes }, room.hostEmail));
  }
});

test('callbacks cannot rewind status, resurrect expired output or change the output path', async () => {
  const record = { recordingId: 'id', status: 'processing', maxDurationSeconds: 300, maxBytes: 1000, retentionDays: 7 };
  let { lib, changes } = service({ recording: record });
  await lib.syncRecording('id', { status: 'recording' });
  assert.equal(changes.length, 0);
  await assert.rejects(lib.syncRecording('id', { status: 'ready', storagePath: '../other/meeting.mp4', durationSeconds: 10, sizeBytes: 20 }));
  await assert.rejects(lib.syncRecording('id', { status: 'ready', storagePath: 'id/meeting.mp4', durationSeconds: 10, sizeBytes: 1001 }));
  await lib.syncRecording('id', { status: 'ready', storagePath: 'id/meeting.mp4', durationSeconds: 10, sizeBytes: 20, stoppedAt: '2026-10-07T12:00:00Z' });
  assert.equal(changes[0].$set.expiresAt.toISOString(), '2026-10-14T12:00:00.000Z');
  assert.deepEqual(changes[0].$unset, { activeScope: '', activeMeeting: '' });
  const expired = service({ recording: { ...record, status: 'expired' } });
  await expired.lib.syncRecording('id', { status: 'ready' });
  assert.equal(expired.changes.length, 0);
});

test('sharing requires the host and an ended meeting; recipients come from server membership', async () => {
  let query, update;
  const { lib, room } = service();
  const { POST } = load('app/api/recording/share/route.ts', {
    '@/lib/server-recording': lib,
    '@/models/MeetingMember': { find: () => ({ select: () => ({ lean: async () => [{ userEmail: 'member@example.com' }] }) }) },
    '@/models/Recording': { exists: async () => false, updateMany: async (q, u) => { query = q; update = u; return { matchedCount: 2 }; } },
  });
  const request = { json: async () => ({ meetingId: 'room', sharedWith: ['attacker@example.com'] }) };
  assert.equal((await POST(request)).status, 409);
  room.endedAt = new Date();
  assert.equal((await POST(request)).status, 200);
  assert.equal(query.hostEmail, 'host@example.com');
  assert.deepEqual(update.$set.sharedWith, ['member@example.com']);
});

test('unauthenticated worker callbacks and retired local recording cannot mutate data', async () => {
  const { lib } = service();
  const { POST } = load('app/api/recording/callback/route.ts', { '@/lib/server-recording': lib, '@/lib/db': () => { throw Error('must not access database'); } });
  assert.equal((await POST({ headers: new Headers() })).status, 401);
  assert.equal((await load('app/api/recording/local/route.ts').POST()).status, 410);
});

test('the database reservation prevents simultaneous captures before either worker start', async t => {
  process.env.RECORDING_WORKER_URL = 'http://worker.invalid';
  process.env.RECORDING_WORKER_SECRET = 'test';
  process.env.JITSI_JWT_SECRET = 'test';
  t.after(() => { delete process.env.RECORDING_WORKER_URL; delete process.env.RECORDING_WORKER_SECRET; delete process.env.JITSI_JWT_SECRET; });
  const { lib, room, model } = service({ quota: { scope: 'user', scopeId: 'host@example.com', planDefinition: BILLING_PLAN_MAP.free } });
  let lock = false, starts = 0;
  const records = new Map();
  model.create = async body => {
    if (lock) throw Object.assign(Error('duplicate activeScope'), { code: 11000 });
    lock = true;
    const record = { ...body, status: 'starting', save: async () => {} }; records.set(body.recordingId, record); return record;
  };
  model.findOne = async query => query.recordingId ? records.get(query.recordingId) : null;
  model.aggregate = async () => [{ usedSeconds: 0, storedBytes: 0 }];
  t.mock.method(global, 'fetch', async (_url, options) => {
    if (options.method === 'POST') {
      starts++; const body = JSON.parse(options.body);
      assert.equal(body.maxDurationSeconds, 10800);
    }
    return new Response(JSON.stringify({ status: 'starting' }));
  });
  const results = await Promise.allSettled([lib.startServerRecording(room, room.hostEmail), lib.startServerRecording(room, room.hostEmail)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  assert.equal(starts, 1);
});

test('playback refuses an unrelated user before signing a storage URL', async () => {
  const { lib } = service({ email: 'outsider@example.com' });
  const { GET } = load('app/api/recording/[id]/route.ts', {
    '@/lib/server-recording': lib, '@/lib/recording-policy': policy,
    '@/models/Recording': { findOne: async () => ({ hostEmail: 'host@example.com', status: 'ready', expiresAt: new Date(Date.now() + 10000), sharedWith: [] }) },
    '@/models/Meeting': {}, '@/lib/supabaseServer': { supabaseServer: { storage: { from: () => { throw Error('must not sign'); } } } },
  });
  assert.equal((await GET({ nextUrl: new URL('http://app/recording/id') }, { params: { id: 'id' } })).status, 404);
});
