const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act, create } = require('react-test-renderer');
const load = require('./load-typescript.cjs');

test('recording controls start once, stop once, and show the resulting status', async t => {
  const { useRecording } = load('hooks/useRecording.ts');
  let serverStatus = 'idle';
  const requests = [];
  t.mock.method(global, 'fetch', async (url, options = {}) => {
    const path = String(url);
    if (path.endsWith('/start')) {
      requests.push('start');
      serverStatus = 'recording';
    } else if (path.endsWith('/stop')) {
      requests.push('stop');
      serverStatus = 'processing';
    }
    return Response.json({
      canRecord: true,
      canStop: serverStatus === 'recording',
      recording: serverStatus === 'idle' ? null : { status: serverStatus, startedAt: new Date().toISOString() },
    });
  });
  let recording;
  function Harness() {
    recording = useRecording('room');
    return React.createElement('div', null, recording.status);
  }
  let view;
  t.after(() => { if (view) act(() => view.unmount()); });
  await act(async () => { view = create(React.createElement(Harness)); });
  assert.equal(recording.canRecord, true);
  await act(async () => { await Promise.all([recording.startRecording('room'), recording.startRecording('room')]); });
  assert.deepEqual(requests, ['start']);
  assert.equal(recording.status, 'recording');
  assert.equal(recording.canStop, true);
  await act(async () => { await Promise.all([recording.stopRecording('room'), recording.stopRecording('room')]); });
  assert.deepEqual(requests, ['start', 'stop']);
  assert.equal(recording.status, 'processing');
  assert.equal(recording.canStop, false);
});
