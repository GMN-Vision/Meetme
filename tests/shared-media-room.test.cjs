const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const load = require('./load-typescript.cjs');

test('shared display follows uploads in both participant views, preserves selection and survives polling failures', async t => {
  const previousWindow = global.window;
  const polls = [];
  const views = [];
  global.window = { setInterval: cb => { polls.push(cb); return polls.length; }, clearInterval() {} };
  let files = [], fail = false;
  t.mock.method(global, 'fetch', async () => fail ? Response.json({}, { status: 503 }) : Response.json({ files }));
  t.after(() => { act(() => views.forEach(view => view.unmount())); global.window = previousWindow; });
  const Component = load('components/SharedMediaRoom.tsx').default;
  await act(async () => {
    for (let i = 0; i < 2; i++) views.push(create(React.createElement(Component, { meetingId: 'shared-room' }, React.createElement('div', { id: 'call' }))));
  });
  const poll = () => act(async () => { polls.forEach(cb => cb()); });
  const first = { name: 'photo.png', path: 'local/room/photo', uploadedAt: 10 };
  const second = { name: 'clip.mp4', path: 'local/room/clip', uploadedAt: 20 };
  const layout = view => view.root.findByProps({ className: 'shared-media-room' });
  for (const view of views) assert.equal(layout(view).props['data-display'], 'compact');
  files = [first]; await poll();
  for (const view of views) {
    assert.equal(layout(view).props['data-display'], 'expanded');
    assert.equal(layout(view).props.style['--media-height'], '480px');
  }
  for (const view of views) assert.equal(view.root.findByType('img').props.src, `/api/files/download?path=${encodeURIComponent(first.path)}&preview=1`);
  files = [first, second]; await poll();
  for (const view of views) {
    assert.equal(view.root.findByType('video').props.controls, true);
    assert.equal(view.root.findByProps({ 'aria-label': 'Displayed shared file' }).props.value, second.path);
  }
  await act(async () => views[0].root.findByType('select').props.onChange({ target: { value: first.path } }));
  await poll();
  assert.equal(views[0].root.findByType('select').props.value, first.path, 'polling does not replace a locally selected older file');
  act(() => views[1].root.findByProps({ 'aria-label': 'Make shared display smaller' }).props.onClick());
  await poll();
  assert.equal(layout(views[1]).props['data-display'], 'compact', 'unchanged polling preserves a compact display');
  fail = true; await poll();
  assert.equal(views[0].root.findAllByType('img').length, 1);
  assert.match(JSON.stringify(views[0].toJSON()), /Retrying automatically/);
  fail = false; files = [second]; await poll();
  assert.equal(views[0].root.findByType('select').props.value, second.path);
  await act(async () => views[0].root.findByType('video').props.onError());
  assert.match(JSON.stringify(views[0].toJSON()), /could not be played/);
  files = []; await poll();
  for (const view of views) {
    assert.equal(view.root.findAllByType('select').length, 0);
    assert.equal(layout(view).props['data-display'], 'compact');
  }
  files = [{ name: 'document.pdf', path: 'local/room/pdf', uploadedAt: 30 }]; await poll();
  for (const view of views) {
    assert.equal(layout(view).props['data-display'], 'expanded');
    assert.equal(layout(view).props.style['--media-height'], '560px');
  }
});

test('shared display offers size presets and keyboard resizing without unmounting the call', async t => {
  const previousWindow = global.window;
  global.window = { setInterval: () => 1, clearInterval() {} };
  t.mock.method(global, 'fetch', async () => Response.json({ files: [] }));
  let mounts = 0, view;
  function Call() { React.useEffect(() => { mounts++; }, []); return React.createElement('div'); }
  t.after(() => { act(() => view.unmount()); global.window = previousWindow; });
  const Component = load('components/SharedMediaRoom.tsx').default;
  await act(async () => { view = create(React.createElement(Component, { meetingId: 'room' }, React.createElement(Call))); });
  const style = () => view.root.findByProps({ className: 'shared-media-room' }).props.style;
  act(() => view.root.findByProps({ 'aria-label': 'Make shared display larger' }).props.onClick());
  assert.equal(style()['--media-width'], '60%');
  assert.equal(style()['--media-height'], '560px');
  act(() => view.root.findByProps({ 'aria-label': 'Resize shared display' }).props.onKeyDown({ key: 'ArrowLeft', preventDefault() {} }));
  assert.equal(style()['--media-width'], '65%');
  const heightHandle = view.root.findByProps({ 'aria-label': 'Resize shared display height' });
  act(() => heightHandle.props.onKeyDown({ key: 'ArrowDown', preventDefault() {} }));
  assert.equal(style()['--media-height'], '600px');
  assert.equal(style()['--media-width'], '65%', 'bottom resizing preserves panel width');
  act(() => heightHandle.props.onKeyDown({ key: 'ArrowUp', preventDefault() {} }));
  assert.equal(style()['--media-height'], '560px');
  act(() => view.root.findByProps({ 'aria-label': 'Make shared display smaller' }).props.onClick());
  assert.equal(style()['--media-width'], '30%');
  assert.equal(mounts, 1);
});
