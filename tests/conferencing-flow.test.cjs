const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const load = require('./load-typescript.cjs');

test('registration always creates the same account type, ignoring supplied roles', async () => {
  const saved = [];
  class User {
    static async findOne() { return null; }
    constructor(data) { Object.assign(this, data); this._id = 'user-id'; }
    async save() { saved.push(this); }
  }
  const { POST } = load('app/api/auth/register/route.ts', {
    '../../../../lib/db': async () => {}, '../../../../models/User': User,
    '../../../../models/Organization': { findOne: async () => null },
    '../../../../lib/workspace-usage': { canAddOrganizationSeat: async () => ({ ok: true }) },
  });
  for (const role of [undefined, 'student', 'instructor', 'enterprise_admin', 'admin']) {
    const response = await POST(new Request('http://localhost/api/auth/register', {
      method: 'POST', body: JSON.stringify({ email: ' Person@Example.com ', role }),
    }));
    assert.equal(response.status, 200);
    assert.equal(saved.at(-1).role, 'user');
    assert.equal(saved.at(-1).email, 'person@example.com');
  }
  const invalid = await POST(new Request('http://localhost/api/auth/register', {
    method: 'POST', body: JSON.stringify({ email: '   ' }),
  }));
  assert.equal(invalid.status, 400);
  assert.equal(saved.length, 5);
});

test('former account roles normalize on login without promoting the first user or special emails', async () => {
  let user;
  let saves = 0;
  const { authOptions } = load('lib/auth-options.ts', {
    'next-auth/providers/email': options => options,
    '@auth/mongodb-adapter': { MongoDBAdapter: () => ({}) },
    nodemailer: {}, './mongodb-adapter': Promise.resolve({}), './db': async () => {},
    '../models/User': { findOne: async () => user },
    '../models/Organization': { findOne: async () => null },
    './workspace-usage': { canAddOrganizationSeat: async () => ({ ok: true }) },
  });
  for (const role of ['student', 'instructor', 'enterprise_admin', 'user']) {
    user = { _id: 'id', email: 'admin@example.com', role, status: 'active', save: async () => { saves++; } };
    const token = await authOptions.callbacks.jwt({ token: { email: user.email } });
    assert.equal(token.role, 'user');
    const session = await authOptions.callbacks.session({ session: { user: {} }, token });
    assert.equal(session.user.role, 'user');
  }
  assert.equal(saves, 3);
});

for (const subscription of [null, { plan: 'pro', active: true }, { plan: 'business', active: false }]) {
  test(`meeting workspace provisions only a missing plan (${subscription?.plan || 'new account'})`, async t => {
    const requests = [];
    t.mock.method(global, 'fetch', async (url, options) => {
      requests.push({ url, options });
      return Response.json({ subscription });
    });
    const { MeetingWorkspace } = load('components/meetings/MeetingWorkspace.tsx', {
      'next/link': ({ children, ...props }) => React.createElement('a', props, children),
      'next/navigation': { usePathname: () => '/meetings' },
    });
    let tree;
    await act(async () => { tree = create(React.createElement(MeetingWorkspace, null, 'Meeting content')); });
    t.after(() => act(() => tree.unmount()));
    assert.equal(requests.filter(r => r.options?.method === 'POST').length, subscription ? 0 : 1);
    assert.equal(tree.root.findByType('main').children[0], 'Meeting content');
    const links = tree.root.findAllByType('a').map(link => link.props.href);
    assert.ok(links.includes('/meetings/recordings'));
    assert.ok(links.includes('/meetings/notes'));
  });
}

test('any signed-in person can start a meeting and failed starts remain retryable', async t => {
  const navigations = [];
  let fail = true;
  t.mock.method(global, 'fetch', async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), { title: 'Instant meeting', description: '' });
    return fail ? Response.json({ error: 'Connection unavailable' }, { status: 503 }) : Response.json({ meetingId: 'new-room' });
  });
  const { MeetingActions } = load('components/meetings/MeetingActions.tsx', {
    'next/navigation': { useRouter: () => ({ push: path => navigations.push(path) }) },
    '@/components/CreateMeetingModal': { CreateMeetingModal: () => null },
    '@/components/JoinModal': { JoinModal: () => null },
    '@/components/ui/gradient-border-button': { GradientBorderButton: props => React.createElement('button', props) },
  });
  let tree;
  await act(async () => { tree = create(React.createElement(MeetingActions)); });
  t.after(() => act(() => tree.unmount()));
  const button = () => tree.root.findAllByType('button').find(item => item.children.includes('Start meeting'));
  await act(async () => button().props.onClick());
  assert.equal(tree.root.findByProps({ role: 'alert' }).children[0], 'Connection unavailable');
  assert.equal(button().props.disabled, false);
  fail = false;
  await act(async () => button().props.onClick());
  assert.deepEqual(navigations, ['/room/new-room']);
});

test('meeting summary deletion checks ownership even for legacy privileged roles', async () => {
  let email = 'other@example.com';
  let saves = 0;
  const { DELETE } = load('app/api/ai/meeting-summary/[meetingId]/route.ts', {
    'next-auth': { getServerSession: async () => ({ user: { email, role: 'instructor' } }) },
    '@/lib/auth-options': { authOptions: {} }, '@/lib/db': async () => {},
    '@/models/Meeting': { findOne: async () => ({ hostEmail: 'host@example.com', save: async () => { saves++; } }) },
  });
  assert.equal((await DELETE(null, { params: { meetingId: 'room' } })).status, 403);
  assert.equal(saves, 0);
  email = 'HOST@example.com';
  assert.equal((await DELETE(null, { params: { meetingId: 'room' } })).status, 200);
  assert.equal(saves, 1);
});
