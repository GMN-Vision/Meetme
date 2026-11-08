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

test('a participant can write private notes from Files before presenting', async t => {
  const previousWindow = global.window;
  const previousStorage = global.localStorage;
  const values = new Map();
  global.window = {
    setInterval: () => 1,
    clearInterval: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  };
  global.localStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  t.mock.method(global, 'fetch', async () => Response.json({ files: [] }));
  const notesModule = load('components/PresenterNotes.tsx');
  const FileShare = load('components/FileShare.tsx', {
    './PresenterNotes': { __esModule: true, ...notesModule },
    './FileAllowance': { __esModule: true, default: () => null, useFileAllowance: () => ({ limits: null, refresh: async () => {} }) },
    '@/components/ui/file-upload': { FileUpload: () => null },
    '@/components/ui/hover-border-gradient': { HoverBorderGradient: props => React.createElement('button', props) },
  }).default;
  let view;
  t.after(() => {
    if (view) act(() => view.unmount());
    global.window = previousWindow;
    global.localStorage = previousStorage;
  });
  await act(async () => { view = create(React.createElement(FileShare, { meetingId: 'room', presentationEnabled: true, participantKey: 'presenter', noteOwner: 'presenter@example.com' })); });
  assert.equal(view.root.findAllByType('textarea').length, 0);
  const speechNoteButton = () => view.root.findByProps({ 'aria-controls': 'room-speech-note' });
  assert.equal(speechNoteButton().props.children, 'Speech Note');
  act(() => speechNoteButton().props.onClick());
  const textarea = view.root.findByType('textarea');
  act(() => textarea.props.onChange({ target: { value: 'Introduce the topic' } }));
  assert.equal(view.root.findByType('textarea').props.value, 'Introduce the topic');
  assert.equal(values.size, 1);
  assert.ok([...values.keys()][0].includes(notesModule.SPEECH_NOTE_PATH));
  act(() => speechNoteButton().props.onClick());
  assert.equal(view.root.findAllByType('textarea').length, 0);
  act(() => speechNoteButton().props.onClick());
  assert.equal(view.root.findByType('textarea').props.value, 'Introduce the topic');
});
