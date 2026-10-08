const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const { getRecordingAvailability } = load('lib/recording-config.ts');

test('recording is unavailable until all server settings are present and URL is valid', () => {
  const ready = { JITSI_JWT_SECRET: 'jitsi-secret', RECORDING_WORKER_URL: 'http://localhost:4020', RECORDING_WORKER_SECRET: 'worker-secret' };
  assert.equal(getRecordingAvailability(ready).available, true);
  for (const key of Object.keys(ready)) {
    assert.equal(getRecordingAvailability({ ...ready, [key]: '  ' }).code, 'RECORDING_NOT_CONFIGURED');
  }
  for (const url of ['bad-url', 'file:///tmp/worker', 'https://user:password@example.com']) {
    assert.equal(getRecordingAvailability({ ...ready, RECORDING_WORKER_URL: url }).available, false);
  }
});

test('status disables recording before start when setup is incomplete but preserves host stop permission', async () => {
  const policy = load('lib/recording-policy.ts');
  let refreshes = 0;
  const { GET } = load('app/api/recording/status/route.ts', {
    '@/lib/auth': { auth: async () => ({ user: { email: 'host@example.com' } }) },
    '@/lib/db': async () => {},
    '@/models/Meeting': { findOne: async () => ({ hostEmail: 'host@example.com', recordingEnabled: true }) },
    '@/models/Recording': { findOne: () => ({ sort: async () => ({ status: 'recording' }) }) },
    '@/lib/recording-policy': policy,
    '@/lib/recording-config': { getRecordingAvailability: () => getRecordingAvailability({}) },
    '@/lib/server-recording': {
      refreshRecording: async record => { refreshes++; return record; },
      recordingSummary: record => record, recordingErrorResponse: error => { throw error; },
    },
  });
  const response = await GET({ nextUrl: new URL('http://localhost/api/recording/status?roomName=room') });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.canRecord, false);
  assert.equal(body.canStop, true);
  assert.ok(body.unavailableReason);
  assert.equal(refreshes, 0);
});
