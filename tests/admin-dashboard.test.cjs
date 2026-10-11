const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const load = require('./load-typescript.cjs');

test('organization editing requires admin access and validates changes before saving', async () => {
  let authorized = false;
  let saves = 0;
  const org = { policies: { requirePassword: true }, save: async () => { saves++; } };
  const { PUT } = load('app/api/admin/organizations/route.ts', {
    '../../../../lib/admin-auth': { getAdminAuthorization: async () => ({ authorized }) },
    '../../../../lib/db': async () => {},
    '../../../../models/Organization': { findById: async () => org, findOne: async () => null },
    '../../../../models/User': {},
  });
  const body = { orgId: '123456789012345678901234', name: ' Example ', domain: 'EXAMPLE.COM', billingPlan: 'basic', recordingAllowed: false, chatEnabled: true };
  const request = changes => new Request('http://localhost/api/admin/organizations', { method: 'PUT', body: JSON.stringify({ ...body, ...changes }) });
  assert.equal((await PUT(request({}))).status, 403);
  authorized = true;
  assert.equal((await PUT(request({ recordingAllowed: 'false' }))).status, 400);
  assert.equal((await PUT(request({ domain: 'https://example.com' }))).status, 400);
  assert.equal(saves, 0);
  assert.equal((await PUT(request({}))).status, 200);
  assert.equal(org.name, 'Example');
  assert.equal(org.domain, 'example.com');
  assert.deepEqual(org.policies, { requirePassword: true, recordingAllowed: false, chatEnabled: true });
  assert.equal(saves, 1);
});

test('membership edits save explicitly and a failed save preserves the draft for retry', async t => {
  const subscription = { _id: 'sub', userEmail: 'member@example.com', plan: 'free', billingCycle: 'monthly', amount: 0, currency: 'INR', status: 'active', active: true, selected: true, creditBalance: 10, currentPeriodEnd: null };
  const writes = [];
  let fail = true;
  t.mock.method(global, 'fetch', async (_url, options) => {
    if (options.method === 'PATCH') {
      const body = JSON.parse(options.body);
      writes.push(body);
      return fail ? Response.json({ error: 'Please retry' }, { status: 500 }) : Response.json({ subscription: { ...subscription, ...body } });
    }
    return Response.json({ subscriptions: [subscription] });
  });
  const Component = load('components/AdminSubscriptionTable.tsx', {
    '@/lib/billing-plans': { BILLING_PLANS: [{ key: 'free', title: 'Free' }, { key: 'pro', title: 'Pro' }], getPlanPrice: plan => plan === 'pro' ? 100 : 0 },
  }).default;
  let tree;
  await act(async () => { tree = create(React.createElement(Component)); });
  t.after(() => act(() => tree.unmount()));
  const button = label => tree.root.findAllByType('button').find(node => node.children.includes(label));
  await act(async () => button('Edit membership').props.onClick());
  const plan = tree.root.findAllByType('select').find(node => node.props.value === 'free');
  await act(async () => plan.props.onChange({ target: { value: 'pro' } }));
  assert.equal(writes.length, 0);
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(writes[0].plan, 'pro');
  assert.equal(writes[0].amount, 100);
  assert.equal(tree.root.findByProps({ role: 'alert' }).children[0].children[0], 'Please retry');
  assert.ok(tree.root.findByType('form'));
  fail = false;
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(writes.length, 2);
  assert.equal(tree.root.findAllByType('form').length, 0);
  assert.ok(tree.root.findByProps({ role: 'status' }));
});
