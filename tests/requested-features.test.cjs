const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const schedule = load('lib/meeting-schedule.ts');
const guide = load('lib/guide-answers.ts');

test('schedule validates future timestamps and converts explicit offsets to UTC', () => {
 const now = Date.parse('2026-10-12T00:00:00Z');
 assert.equal(schedule.parseScheduledAt('2026-10-13T09:00:00+05:30', now).toISOString(), '2026-10-13T03:30:00.000Z');
 for (const value of ['invalid', '2026-10-13T09:00', '2026-10-11T09:00:00Z', {}, 42]) assert.throws(() => schedule.parseScheduledAt(value, now));
 assert.equal(schedule.parseScheduledAt(undefined, now), null);
});

test('guide answers start meeting without contacting Gemini; handles provider failures', async (t) => {
 const originalKey = process.env.GEMINI_GUIDE_API_KEY;
 t.after(() => { if (originalKey === undefined) delete process.env.GEMINI_GUIDE_API_KEY; else process.env.GEMINI_GUIDE_API_KEY = originalKey; });
 process.env.GEMINI_GUIDE_API_KEY = 'test-only';
 const fetchMock = t.mock.method(global, 'fetch', async () => new Response('{}', { status: 429 }));
 const route = load('app/api/guide-chat/route.ts', { '@/lib/guide-answers': guide });
 const ask = content => route.POST({ json: async () => ({ messages: [{ role: 'user', content }] }) });
 assert.match((await (await ask('How do I start a meeting?')).json()).answer, /Start meeting/);
 assert.equal(fetchMock.mock.callCount(), 0);
 assert.match((await (await ask('How can I schedule a meeting?')).json()).answer, /Upcoming meetings/);
 for (const status of [429, 401, 403, 404, 500]) {
  fetchMock.mock.mockImplementation(async () => new Response('{}', { status }));
  const response = await ask('Explain my workspace access');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).answer, guide.GUIDE_FALLBACK);
 }
 fetchMock.mock.mockImplementation(async () => { throw new Error('timeout'); });
 assert.equal((await (await ask('Explain workspace access')).json()).answer, guide.GUIDE_FALLBACK);
 delete process.env.GEMINI_GUIDE_API_KEY;
 assert.equal((await (await ask('Explain workspace access')).json()).answer, guide.GUIDE_FALLBACK);
 assert.equal((await route.POST({ json: async () => ({ messages: [] }) })).status, 400);
});

test('bulk deletion requires admin auth and validates a bounded explicit ID list', async () => {
 let authorized = false; const deletions = [];
 const route = load('app/api/admin/meetings/route.ts', {
  '../../../../lib/admin-auth': { getAdminAuthorization: async () => ({ authorized }) },
  '../../../../lib/db': async () => {},
  '../../../../models/Meeting': { deleteMany: async query => { deletions.push(query); return { deletedCount: 2 }; } },
 });
 const request = meetingIds => ({ nextUrl: new URL('https://example.test/api/admin/meetings'), json: async () => ({ meetingIds }) });
 assert.equal((await route.DELETE(request(['one']))).status, 403);
 authorized = true;
 for (const ids of [[], [''], [null], [{ $ne: null }], Array(101).fill('room')]) assert.equal((await route.DELETE(request(ids))).status, 400);
 assert.equal(deletions.length, 0);
 const response = await route.DELETE(request(['one', 'two', 'one']));
 assert.equal(response.status, 200);
 assert.equal((await response.json()).deletedCount, 2);
 assert.deepEqual(deletions, [{ meetingId: { $in: ['one', 'two'] } }]);
});

test('create meeting persists schedule without starting a session and rejects past times', async () => {
 let email = 'Host@Example.com'; let saved;
 const route = load('app/api/create-meeting/route.ts', {
  '@/lib/meeting-schedule': schedule,
  'nanoid': { nanoid: () => 'future-room' },
  '../../../lib/db': async () => {},
  '../../../models/Meeting': class { constructor(data) { Object.assign(this, data); } async save() { saved = this; } },
  '../../../models/User': { findOne: async () => ({ role: 'user' }) },
  '../../../models/Organization': {},
  'next-auth': { getServerSession: async () => email ? { user: { email } } : null },
  '../../../lib/auth-options': { authOptions: {} },
  '../../../lib/membership': { checkRoomCreationLimit: async () => ({ ok: true }) },
  '../../../lib/workspace-usage': { getWorkspaceQuota: async () => ({ scope: 'user', plan: 'free', planDefinition: { maxParticipants: 120, maxMeetingMinutes: 180 } }) },
 });
 const request = body => ({ json: async () => body });
 const future = new Date(Date.now() + 86400000).toISOString();
 assert.equal((await route.POST(request({ title: 'Planning', scheduledAt: future }))).status, 201);
 assert.equal(saved.scheduledAt.toISOString(), future);
 assert.equal(saved.hostEmail, 'host@example.com');
 assert.equal(saved.activeSessionStartedAt, undefined);
 assert.equal((await route.POST(request({ title: 'Past', scheduledAt: '2020-01-01T00:00:00Z' }))).status, 400);
 email = '';
 assert.equal((await route.POST(request({ title: 'Planning', scheduledAt: future }))).status, 401);
});

test('scheduling form submits UTC, refreshes the list, and stays out of the room', async t => {
 const React = require('react'); const { create, act } = require('react-test-renderer');
 const previousDocument = global.document;
 global.document = { body: { style: { overflow: '' } }, activeElement: null };
 t.after(() => { global.document = previousDocument; });
 const { CreateMeetingModal } = load('components/CreateMeetingModal.tsx', {
  'react-dom': { createPortal: children => children },
 });
 const navigations = []; const requests = []; let refreshed = 0; let fail = true;
 t.mock.method(global, 'fetch', async (_url, options) => {
   requests.push(JSON.parse(options.body));
   return fail ? Response.json({ error: 'Try again' }, { status: 503 }) : Response.json({ meetingId: 'scheduled-room' });
 });
 const { MeetingActions } = load('components/meetings/MeetingActions.tsx', {
  'next/navigation': { useRouter: () => ({ push: path => navigations.push(path) }) },
  '@/components/CreateMeetingModal': { CreateMeetingModal },
  '@/components/JoinModal': { JoinModal: () => null },
 });
 let tree;
 await act(async () => { tree = create(React.createElement(MeetingActions, { onScheduled: () => refreshed++ })); });
 t.after(() => act(() => tree.unmount()));
 await act(async () => tree.root.findByProps({ children: 'Schedule meeting' }).parent.parent.props.onClick());
 await act(async () => tree.root.findByProps({ id: 'meeting-title' }).props.onChange({ target: { value: 'Team planning' } }));
 const future = new Date(Date.now() + 86400000); const pad = n => String(n).padStart(2, '0');
 const local = `${future.getFullYear()}-${pad(future.getMonth()+1)}-${pad(future.getDate())}T${pad(future.getHours())}:${pad(future.getMinutes())}`;
 await act(async () => tree.root.findByProps({ type: 'datetime-local' }).props.onChange({ target: { value: local } }));
 await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
 assert.equal(tree.root.findByProps({ role: 'alert' }).children[0], 'Try again');
 assert.equal(refreshed, 0);
 fail = false;
 await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
 assert.equal(requests[1].scheduledAt, new Date(local).toISOString());
 assert.equal(refreshed, 1);
 assert.deepEqual(navigations, []);
 assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 0);
});

test('meeting list separates upcoming rooms from the recent limit and scopes both to the host', async () => {
 const queries = [];
 const route = load('app/api/get-meetings/route.ts', {
  '../../../lib/db': async () => {},
  '../../../models/Meeting': { find: query => { queries.push(query); return { sort: () => query.scheduledAt ? Promise.resolve([{ meetingId: 'future' }]) : { limit: async n => { assert.equal(n, 12); return [{ meetingId: 'recent' }]; } } }; } },
  'next-auth': { getServerSession: async () => ({ user: { email: 'Host@Example.com' } }) },
  '../../../lib/auth-options': { authOptions: {} },
 });
 const result = await (await route.GET({})).json();
 assert.equal(result.upcomingMeetings[0].meetingId, 'future');
 assert.equal(result.meetings[0].meetingId, 'recent');
 assert.ok(queries.every(query => query.hostEmail === 'host@example.com'));
 assert.ok(queries[0].scheduledAt.$gt instanceof Date);
});

test('admin selection deletes only checked rooms and clears selection when filtering', async t => {
 const React = require('react'); const { create, act } = require('react-test-renderer');
 const session = { user: { role: 'admin' } }; const router = { push() {} };
 const rooms = ['one', 'two'].map(id => ({ _id: id, meetingId: id, title: id, hostEmail: 'host@example.com', joinCount: 0, createdAt: '2026-10-12T00:00:00Z' }));
 const deletes = []; let allow = false;
 const originalConfirm = global.confirm; global.confirm = () => allow;
 t.after(() => { if (originalConfirm === undefined) delete global.confirm; else global.confirm = originalConfirm; });
 t.mock.method(global, 'fetch', async (url, options = {}) => {
  if (options.method === 'DELETE') { deletes.push(JSON.parse(options.body)); return Response.json({ deletedCount: 1 }); }
  if (url.includes('/stats')) return Response.json({ stats: { totalUsers: 0, totalMeetings: 2, totalOrganizations: 0, activeMeetings: 0, roles: { admin: 0, user: 0 } } });
  if (url.includes('/users')) return Response.json({ users: [] });
  return Response.json({ meetings: rooms });
 });
 const { default: Dashboard } = load('app/admin/page.tsx', {
  'next/navigation': { useRouter: () => router },
  'next-auth/react': { useSession: () => ({ data: session, status: 'authenticated' }) },
  '../../components/ui/glow-card': { GlowCard: ({ children }) => React.createElement('div', null, children) },
  '../../components/ui/skeleton': { Skeleton: () => null },
  '../../components/AdminSubscriptionTable': { default: () => null, __esModule: true },
 });
 let tree; await act(async () => { tree = create(React.createElement(Dashboard)); });
 t.after(() => act(() => tree.unmount()));
 const text = node => typeof node === 'string' ? node : node.children?.map(text).join('') || '';
 await act(async () => tree.root.findAllByType('button').find(b => text(b).includes('Meeting rooms')).props.onClick());
 await act(async () => tree.root.findByProps({ 'aria-label': 'Select one' }).props.onChange({ target: { checked: true } }));
 const deleteButton = () => tree.root.findAllByType('button').find(b => text(b) === 'Delete selected');
 await act(async () => deleteButton().props.onClick());
 assert.equal(deletes.length, 0);
 await act(async () => tree.root.findByProps({ 'aria-label': 'Search rooms' }).props.onChange({ target: { value: '' } }));
 assert.equal(deleteButton().props.disabled, true);
 await act(async () => tree.root.findByProps({ 'aria-label': 'Select two' }).props.onChange({ target: { checked: true } }));
 allow = true;
 await act(async () => deleteButton().props.onClick());
 assert.deepEqual(deletes, [{ meetingIds: ['two'] }]);
 assert.equal(tree.root.findAllByProps({ 'aria-label': 'Select two' }).length, 0);
 assert.equal(tree.root.findAllByProps({ 'aria-label': 'Select one' }).length, 1);
});
