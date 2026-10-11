const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const load = require('./load-typescript.cjs');

test('recent meeting search, sorting, and clearing preserve room links', async t => {
  t.mock.method(global, 'fetch', async () => Response.json({ meetings: [
    { meetingId: 'older', title: 'Design review', hostEmail: 'a@example.com', createdAt: '2026-10-01' },
    { meetingId: 'newer', title: 'Team sync', hostEmail: 'b@example.com', createdAt: '2026-10-10' },
  ] }));
  const { MeetingDashboard } = load('components/meetings/MeetingDashboard.tsx', {
    '@/components/MeetingCard': { MeetingCard: props => React.createElement('article', { 'data-room': props.meetingId }) },
    './MeetingActions': { MeetingActions: () => null },
    './AIMeetingNotesPanel': { AIMeetingNotesPanel: () => null },
  });
  let tree;
  await act(async () => { tree = create(React.createElement(MeetingDashboard)); });
  t.after(() => act(() => tree.unmount()));
  const rooms = () => tree.root.findAllByType('article').map(node => node.props['data-room']);
  assert.deepEqual(rooms(), ['newer', 'older']);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Sort recent meetings' }).props.onChange({ target: { value: 'oldest' } }));
  assert.deepEqual(rooms(), ['older', 'newer']);
  await act(async () => tree.root.findByType('input').props.onChange({ target: { value: 'DESIGN' } }));
  assert.deepEqual(rooms(), ['older']);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Clear search' }).props.onClick());
  assert.equal(rooms().length, 2);
});

test('copy invite keeps room IDs encoded and reports clipboard failure', async t => {
  let copied = '';
  let fail = false;
  const originalNavigator = Object.getOwnPropertyDescriptor(global, 'navigator');
  const originalWindow = global.window;
  Object.defineProperty(global, 'navigator', { configurable: true, value: { clipboard: { writeText: async value => { if (fail) throw Error('blocked'); copied = value; } } } });
  global.window = { location: { origin: 'https://example.com' } };
  t.after(() => { if (originalNavigator) Object.defineProperty(global, 'navigator', originalNavigator); else delete global.navigator; global.window = originalWindow; });
  const { MeetingCard } = load('components/MeetingCard.tsx', { 'next/link': props => React.createElement('a', props) });
  let tree;
  await act(async () => { tree = create(React.createElement(MeetingCard, { meetingId: 'room name', title: 'Team sync', hostEmail: 'a@example.com', createdAt: '2026-10-10' })); });
  t.after(() => act(() => tree.unmount()));
  await act(async () => tree.root.findByType('button').props.onClick());
  assert.equal(copied, 'https://example.com/room/room%20name');
  fail = true;
  await act(async () => tree.root.findByType('button').props.onClick());
  assert.ok(tree.root.findByProps({ role: 'alert' }));
});
