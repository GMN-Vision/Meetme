const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act, create } = require('react-test-renderer');
const load = require('./load-typescript.cjs');
const { startMeetingAccessHeartbeat } = load('lib/meeting-access-client.ts');
const { createJitsiJwt } = load('lib/jitsi-jwt.ts');
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('25 simulated clients keep access for three hours without a hangup', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 });
  let requests = 0;
  let denied = 0;
  t.mock.method(global, 'fetch', async () => {
    requests++;
    return { ok: true, status: 200, json: async () => ({ success: true, sessionEndsAt: new Date(10_800_000).toISOString() }) };
  });
  const monitors = Array.from({ length: 25 }, (_, i) => startMeetingAccessHeartbeat({
    meetingId: 'three-hour-call', participantKey: `tab-${i}`,
    onDenied: () => denied++, onSession: () => {},
  }));
  for (let minute = 0; minute < 180; minute++) {
    t.mock.timers.tick(30_000);
    await flush();
    t.mock.timers.tick(30_000);
    await flush();
  }
  monitors.forEach((monitor) => monitor.stop());
  assert.equal(requests, 25 * 360);
  assert.equal(denied, 0);
});

test('API outages, rate limits, invalid responses and offline failures never hang up media', async (t) => {
  let response;
  let denied = 0;
  t.mock.method(global, 'fetch', async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  const monitor = startMeetingAccessHeartbeat({
    meetingId: 'call', participantKey: 'tab', onDenied: () => denied++, onSession: () => {},
  });
  t.after(() => monitor.stop());
  for (const status of [429, 500, 502, 503, 504, 403, 404]) {
    response = { ok: false, status, json: async () => ({ error: 'Temporary failure' }) };
    await monitor.check();
  }
  response = { ok: false, status: 502, json: async () => { throw Error('HTML gateway page'); } };
  await monitor.check();
  response = new TypeError('Failed to fetch');
  await monitor.check();
  assert.equal(denied, 0);
});

test('a confirmed policy denial ends access once, and successful heartbeats update the deadline', async (t) => {
  let denied = 0;
  let deadline;
  let response = { ok: true, status: 200, json: async () => ({ success: true, sessionEndsAt: '2026-10-01T10:00:00Z' }) };
  t.mock.method(global, 'fetch', async () => response);
  const monitor = startMeetingAccessHeartbeat({
    meetingId: 'call', participantKey: 'tab', onDenied: () => denied++, onSession: (value) => { deadline = value; },
  });
  t.after(() => monitor.stop());
  await monitor.check();
  assert.equal(deadline, '2026-10-01T10:00:00Z');
  response = { ok: false, status: 403, json: async () => ({ code: 'MEETING_DURATION_REACHED' }) };
  await monitor.check();
  await monitor.check();
  assert.equal(denied, 1);
});

test('slow heartbeats do not overlap and cannot hang up after cleanup', async (t) => {
  let complete;
  let requests = 0;
  let denied = 0;
  let signal;
  t.mock.method(global, 'fetch', (_url, options) => {
    requests++;
    signal = options.signal;
    return new Promise((resolve) => { complete = resolve; });
  });
  const monitor = startMeetingAccessHeartbeat({
    meetingId: 'call', participantKey: 'tab', onDenied: () => denied++, onSession: () => {},
  });
  const pending = monitor.check();
  await monitor.check();
  assert.equal(requests, 1);
  monitor.stop();
  assert.equal(signal.aborted, true);
  complete({ ok: false, status: 403, json: async () => ({ code: 'MEETING_DURATION_REACHED' }) });
  await pending;
  assert.equal(denied, 0);
});

test('private meeting tokens cover a three-hour call and explicit longer allowances', () => {
  const params = { roomName: 'call', domain: 'meet.example.com', user: { id: 'host', name: 'Host' }, secret: 'test-only' };
  const decode = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const now = Math.floor(Date.now() / 1000);
  assert.ok(decode(createJitsiJwt(params)).exp >= now + 4 * 3600);
  assert.ok(decode(createJitsiJwt({ ...params, ttlSeconds: 24 * 3600 + 300 })).exp >= now + 24 * 3600 + 300);
});

test('meeting iframe survives network errors, device errors and parent renders for three simulated hours', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 });
  for (const name of ['log', 'warn', 'info']) t.mock.method(console, name, () => {});
  let instances = 0;
  let disposals = 0;
  let closed = 0;
  let api;
  const browser = new EventTarget();
  browser.JitsiMeetExternalAPI = class {
    constructor(domain, options) {
      instances++;
      this.options = options;
      this.listeners = new Map();
      this.screenSharing = true;
      api = this;
    }
    addEventListener(name, fn) { this.listeners.set(name, fn); }
    emit(name, payload) { this.listeners.get(name)?.(payload); }
    executeCommand() {}
    dispose() { disposals++; this.screenSharing = false; this.emit('readyToClose'); }
  };
  const previousWindow = global.window;
  global.window = browser;
  t.after(() => { global.window = previousWindow; });
  const { JitsiMeeting } = load('components/JitsiMeeting.tsx', {
    '@/lib/meeting-ai-client': { resolveMeetingAiHttpUrl: () => '' },
  });
  let renderer;
  const props = { roomName: 'call', onReadyToClose: () => closed++ };
  await act(async () => {
    renderer = create(React.createElement(JitsiMeeting, props), { createNodeMock: () => ({}) });
  });
  t.after(() => act(() => renderer.unmount()));
  act(() => api.emit('videoConferenceJoined', { id: 'local' }));
  assert.equal(instances, 1);
  assert.equal(api.options.configOverwrite.desktopSharingFrameRate.max, 30);
  assert.equal(api.options.configOverwrite.screenShareSettings.desktopSystemAudio, 'include');
  assert.equal(api.options.configOverwrite.disableSimulcast, false);
  assert.equal(api.options.configOverwrite.resolution, 720);
  act(() => {
    browser.dispatchEvent(new Event('offline'));
    browser.dispatchEvent(new Event('online'));
    api.emit('errorOccurred', { type: 'CONNECTION', name: 'connection.interrupted', isFatal: false });
    api.emit('errorOccurred', { name: 'gum.permission_denied', isFatal: false });
    // A breakout-room transition is not a completed hangup.
    api.emit('videoConferenceLeft', { roomName: 'call' });
    t.mock.timers.tick(60 * 60_000);
  });
  await act(async () => {
    renderer.update(React.createElement(JitsiMeeting, { ...props, displayName: 'Updated name', onReady: () => {} }));
    t.mock.timers.tick(120 * 60_000);
  });
  assert.equal(instances, 1);
  assert.equal(disposals, 0);
  assert.equal(api.screenSharing, true);
  assert.equal(closed, 0);
  act(() => { api.emit('readyToClose'); api.emit('readyToClose'); });
  assert.equal(closed, 1);
});
