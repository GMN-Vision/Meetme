const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const load = require('./load-typescript.cjs');

test('video playlist accepts many YouTube and direct video links at once', () => {
  const { normalizeVideoUrl, parseVideoUrls } = load('lib/video-playlist.ts');

  assert.equal(normalizeVideoUrl('https://youtu.be/dQw4w9WgXcQ?t=12'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(normalizeVideoUrl('youtu.be/dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(normalizeVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=abc'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(normalizeVideoUrl('https://m.youtube.com/shorts/dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(normalizeVideoUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(normalizeVideoUrl('https://media.example.com/lessons/intro.mp4?token=abc'), 'https://media.example.com/lessons/intro.mp4?token=abc');
  assert.equal(normalizeVideoUrl('https://media.example.com/lessons/intro.webm'), 'https://media.example.com/lessons/intro.webm');
  assert.equal(normalizeVideoUrl('https://media.example.com/lessons/intro.m3u8'), 'https://media.example.com/lessons/intro.m3u8');
  assert.equal(normalizeVideoUrl('https://example.com/lesson'), null);
  assert.equal(normalizeVideoUrl('https://vimeo.com/12345'), null);
  assert.equal(normalizeVideoUrl('javascript:alert(1)'), null);

  const parsed = parseVideoUrls(`
    https://youtu.be/dQw4w9WgXcQ
    https://www.youtube.com/watch?v=dQw4w9WgXcQ
    https://media.example.com/lessons/intro.mp4
    not-a-link
  `);
  assert.deepEqual(parsed.urls, [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://media.example.com/lessons/intro.mp4',
  ]);
  assert.deepEqual(parsed.invalid, ['not-a-link']);
});

test('playlist playback uses Jitsi shared video only after joining and cleans up', async t => {
  const previousWindow = global.window;
  const browser = new EventTarget();
  global.window = browser;
  t.after(() => { global.window = previousWindow; });

  const calls = [];
  const listeners = new Map();
  const api = {
    executeCommand: (...args) => calls.push(args),
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeListener: (name, listener) => { if (listeners.get(name) === listener) listeners.delete(name); },
  };

  const Component = load('components/JitsiPresentationControls.tsx').default;
  const { JITSI_PLAYLIST_PLAY_EVENT, JITSI_PLAYLIST_STOP_EVENT } = load('lib/jitsi-features.ts');
  let view;
  await act(async () => {
    view = create(React.createElement(Component, { api, meetingId: 'room', participantKey: 'participant-1' }));
  });

  const play = url => {
    const event = new Event(JITSI_PLAYLIST_PLAY_EVENT, { cancelable: true });
    event.detail = { meetingId: 'room', url };
    browser.dispatchEvent(event);
    return event.defaultPrevented;
  };

  assert.equal(play('https://youtu.be/dQw4w9WgXcQ'), false, 'prejoin cannot start a playlist video');
  assert.equal(calls.length, 0);

  act(() => listeners.get('videoConferenceJoined')());
  assert.equal(play('https://youtu.be/dQw4w9WgXcQ'), true);
  assert.deepEqual(calls[0], ['startShareVideo', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ']);
  assert.deepEqual(calls[1], ['setTileView', false]);

  const stop = new Event(JITSI_PLAYLIST_STOP_EVENT, { cancelable: true });
  stop.detail = { meetingId: 'room' };
  browser.dispatchEvent(stop);
  assert.equal(stop.defaultPrevented, true);
  assert.deepEqual(calls.at(-1), ['stopShareVideo']);

  assert.equal(play('https://example.com/not-a-video'), false, 'unsupported links are ignored');
  assert.equal(calls.at(-1)[0], 'stopShareVideo');

  act(() => listeners.get('readyToClose')());
  assert.equal(play('https://youtu.be/dQw4w9WgXcQ'), false, 'closed conferences cannot play playlist videos');

  act(() => view.unmount());
  assert.equal(listeners.size, 0);
});

test('the meeting playlist panel adds several links and starts the selected video', async t => {
  const previousWindow = global.window;
  const browser = new EventTarget();
  browser.setInterval = () => 1;
  browser.clearInterval = () => {};
  global.window = browser;
  t.after(() => { global.window = previousWindow; });
  t.mock.method(console, 'error', () => {});

  let playlist = { meetingId: 'room', items: [], currentIndex: null, playing: false, updatedAt: null };
  const calls = [];
  t.mock.method(global, 'fetch', async (url, options = {}) => {
    const method = options.method || 'GET';
    if (method === 'GET') return Response.json({ playlist });

    const body = JSON.parse(options.body || '{}');
    calls.push({ url, method, body });

    if (method === 'POST') {
      playlist = {
        ...playlist,
        items: body.urls.map((videoUrl, index) => ({
          id: `video-${index + 1}`,
          url: videoUrl,
          title: `Video ${index + 1}`,
          addedBy: body.addedBy,
        })),
      };
      return Response.json({ playlist, added: body.urls.length, skipped: [], invalid: [] });
    }

    if (body.action === 'play') {
      playlist = {
        ...playlist,
        currentIndex: playlist.items.findIndex(item => item.id === body.itemId),
        playing: true,
      };
    } else if (body.action === 'stop') {
      playlist = { ...playlist, playing: false };
    }

    return Response.json({ playlist });
  });

  const { JITSI_PLAYLIST_PLAY_EVENT } = load('lib/jitsi-features.ts');
  let playEvents = 0;
  browser.addEventListener(JITSI_PLAYLIST_PLAY_EVENT, event => {
    playEvents += 1;
    event.preventDefault();
  });

  const Component = load('components/VideoPlaylistPanel.tsx').default;
  let view;
  await act(async () => {
    view = create(React.createElement(Component, { meetingId: 'room', addedBy: 'host@example.com' }));
  });

  const input = view.root.findByProps({ id: 'video-playlist-input-room' });
  act(() => input.props.onChange({ target: { value: 'https://youtu.be/dQw4w9WgXcQ\nhttps://media.example.com/class/intro.mp4' } }));
  await act(async () => {
    view.root.findByProps({ 'aria-label': 'Add videos to the playlist' }).props.onClick();
  });

  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body.urls, [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://media.example.com/class/intro.mp4',
  ]);
  assert.equal(calls[0].body.addedBy, 'host@example.com');

  const playButton = view.root.findByProps({ 'aria-label': 'Play Video 1' });
  await act(async () => { playButton.props.onClick(); });

  assert.equal(playEvents, 1);
  assert.deepEqual(calls.at(-1), {
    url: '/api/video-playlist',
    method: 'PATCH',
    body: { meetingId: 'room', action: 'play', updatedBy: 'host@example.com', itemId: 'video-1' },
  });

  act(() => view.unmount());
});

test('Jitsi toolbar exposes the playlist and server recording without app chrome', async t => {
  const {
    JITSI_RECORDING_BUTTON,
    JITSI_SHARED_VIDEO_BUTTON,
    getJitsiFeatureConfig,
    getJitsiToolbarButtons,
  } = load('lib/jitsi-features.ts');

  const config = getJitsiFeatureConfig({ sharedVideoPlaylist: true, recordingEnabled: true });
  assert.deepEqual(config.buttonsWithNotifyClick, [JITSI_SHARED_VIDEO_BUTTON, JITSI_RECORDING_BUTTON]);
  assert.equal(config.recordingService.enabled, true);
  assert.equal(config.recordingService.sharingEnabled, false);
  assert.ok(getJitsiToolbarButtons(true, true).includes(JITSI_RECORDING_BUTTON));
  assert.ok(!getJitsiToolbarButtons(true, false).includes(JITSI_RECORDING_BUTTON));
  assert.equal(getJitsiFeatureConfig().buttonsWithNotifyClick, undefined);
  assert.equal(getJitsiFeatureConfig().recordingService, undefined);

  const previousWindow = global.window;
  const browser = new EventTarget();
  global.window = browser;
  t.after(() => { global.window = previousWindow; });

  const listeners = new Map();
  const api = {
    executeCommand: () => {},
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeListener: (name, listener) => { if (listeners.get(name) === listener) listeners.delete(name); },
  };
  let playlistRequests = 0;
  let recordingRequests = 0;
  const Component = load('components/JitsiPresentationControls.tsx').default;
  let view;
  await act(async () => {
    view = create(React.createElement(Component, {
      api,
      meetingId: 'room',
      participantKey: 'participant-1',
      onPlaylistRequested: () => { playlistRequests += 1; },
      onRecordingRequested: () => { recordingRequests += 1; },
    }));
  });

  act(() => listeners.get('toolbarButtonClicked')({ key: JITSI_SHARED_VIDEO_BUTTON }));
  assert.equal(playlistRequests, 1, 'toolbar presses are handled as soon as the iframe API is ready');

  act(() => listeners.get('videoConferenceJoined')());
  act(() => listeners.get('toolbarButtonClicked')({ key: JITSI_SHARED_VIDEO_BUTTON }));
  act(() => listeners.get('toolbarButtonClicked')({ key: JITSI_RECORDING_BUTTON }));
  act(() => listeners.get('toolbarButtonClicked')({ key: 'camera' }));
  assert.equal(playlistRequests, 2);
  assert.equal(recordingRequests, 1);

  act(() => view.unmount());
  assert.equal(listeners.size, 0);
});
