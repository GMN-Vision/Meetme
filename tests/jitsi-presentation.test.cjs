const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const load = require('./load-typescript.cjs');

test('uploaded videos use the joined room, native playback and safe URLs; listeners detach on leave', async t => {
  const previousWindow = global.window, previousDocument = global.document;
  const browser = new EventTarget();
  browser.location = { origin: 'https://app.example.com', hostname: 'app.example.com' };
  browser.documentPictureInPicture = {};
  global.window = browser;
  global.document = {};
  t.after(() => { global.window = previousWindow; global.document = previousDocument; });
  const calls = [], listeners = new Map();
  const viewers = [];
  browser.open = url => { viewers.push(new URL(url)); return {}; };
  const api = {
    getSupportedCommands: () => ['showPiP', 'hidePiP'],
    executeCommand: (...args) => calls.push(args),
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeListener: (name, listener) => { if (listeners.get(name) === listener) listeners.delete(name); },
  };
  const Component = load('components/JitsiPresentationControls.tsx').default;
  const { JITSI_PRESENT_EVENT } = load('lib/jitsi-features.ts');
  let view;
  await act(async () => { view = create(React.createElement(Component, { api, meetingId: 'room' })); });
  const present = (meetingId, name = 'clip.mp4') => {
    const event = new Event(JITSI_PRESENT_EVENT, { cancelable: true });
    event.detail = { meetingId, path: 'local/room/a b&video', name };
    browser.dispatchEvent(event);
    return event.defaultPrevented;
  };
  assert.equal(present('room'), false, 'prejoin cannot present');
  act(() => listeners.get('videoConferenceJoined')());
  assert.equal(present('other'), false, 'other rooms cannot present');
  act(() => assert.equal(present('room'), true));
  const media = new URL(calls[0][1]);
  assert.equal(media.origin, browser.location.origin);
  assert.equal(media.searchParams.get('path'), 'local/room/a b&video');
  assert.equal(media.searchParams.get('preview'), '1');
  assert.deepEqual(calls[1], ['setTileView', false]);
  for (const name of ['sound.MP3', 'music.m4a', 'voice.wav']) {
    act(() => assert.equal(present('room', name), true));
    assert.equal(calls.at(-2)[0], 'startShareVideo');
  }
  for (const name of ['image.PNG', 'slides.ppt', 'slides.PPTX', 'notes.pdf']) {
    act(() => assert.equal(present('room', name), true));
    assert.equal(viewers.at(-1).pathname, '/present');
    assert.equal(viewers.at(-1).searchParams.get('name'), name);
    assert.equal(viewers.at(-1).searchParams.get('meetingId'), 'room');
  }
  const { JITSI_SCREEN_PRESENT_EVENT } = load('lib/jitsi-features.ts');
  const share = new Event(JITSI_SCREEN_PRESENT_EVENT, { cancelable: true });
  share.detail = { meetingId: 'room' };
  browser.dispatchEvent(share);
  assert.equal(share.defaultPrevented, true);
  assert.deepEqual(calls.at(-1), ['toggleShareScreen', { enable: true }]);
  assert.equal(view.toJSON(), null, 'presentation integration adds no toolbar or help panel');
  act(() => listeners.get('readyToClose')());
  assert.equal(present('room'), false, 'closed conferences cannot present');
  act(() => view.unmount());
  assert.equal(listeners.size, 0);
  assert.equal(present('room'), false);
});

test('an older Jitsi API adds no extra controls or server compatibility message', async t => {
  const previousWindow = global.window, previousDocument = global.document;
  let view;
  global.window = new EventTarget();
  global.document = { pictureInPictureEnabled: true };
  t.after(() => { if (view) act(() => view.unmount()); global.window = previousWindow; global.document = previousDocument; });
  const Component = load('components/JitsiPresentationControls.tsx').default;
  await act(async () => { view = create(React.createElement(Component, { meetingId: 'room', api: {
    getSupportedCommands: () => [], addEventListener: () => {}, removeListener: () => {},
  } })); });
  assert.equal(view.toJSON(), null);
});
