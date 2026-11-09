const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act, create } = require('react-test-renderer');
const load = require('./load-typescript.cjs');

test('speech notes stay in local browser storage and separate presenters and files', async t => {
  const previousStorage = global.localStorage;
  const values = new Map();
  global.localStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  t.after(() => { global.localStorage = previousStorage; });
  const PresenterNotes = load('components/PresenterNotes.tsx').default;
  const props = { meetingId: 'room', filePath: 'local/room/slides', owner: 'presenter@example.com' };
  let view;
  await act(async () => { view = create(React.createElement(PresenterNotes, props)); });
  t.after(() => { if (view) act(() => view.unmount()); });
  const textarea = () => view.root.findByType('textarea');
  assert.equal(textarea().props.value, '');
  act(() => textarea().props.onChange({ target: { value: 'Opening speech\nRemember slide 2' } }));
  assert.equal(values.size, 1);
  assert.equal(textarea().props.value, 'Opening speech\nRemember slide 2');
  await act(async () => { view.update(React.createElement(PresenterNotes, { ...props, owner: 'viewer@example.com' })); });
  assert.equal(textarea().props.value, '', 'another participant cannot see the presenter draft');
  await act(async () => { view.update(React.createElement(PresenterNotes, { ...props, filePath: 'local/room/other' })); });
  assert.equal(textarea().props.value, '', 'another file starts with its own draft');
  await act(async () => { view.update(React.createElement(PresenterNotes, props)); });
  assert.equal(textarea().props.value, 'Opening speech\nRemember slide 2');
});
