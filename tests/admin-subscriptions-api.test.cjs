const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');

function fixture() {
  const RealSubscription = load('models/Subscription.ts').default;
  let authorized = true, saves = 0, connections = 0, failure, existing;
  const user = { _id: '507f1f77bcf86cd799439011', email: 'member@example.com', name: 'Member' };
  const build = values => {
    const doc = new RealSubscription({ userId: user._id, userEmail: user.email, plan: 'free', status: 'pending', ...values });
    doc.save = async () => { await doc.validate(); saves++; return doc; };
    return doc;
  };
  const doc = build({ _id: '507f1f77bcf86cd799439012' });
  existing = doc;
  class Subscription {
    constructor(values) { return build(values); }
    static async findById() { if (failure) throw failure; return existing; }
    static findOne() { return { sort: async () => { if (failure) throw failure; return existing; } }; }
    static find() { return { sort: async () => { if (failure) throw failure; return existing ? [existing] : []; } }; }
  }
  const db = async () => { connections++; };
  const billing = load('lib/billing-plans.ts');
  const membership = load('lib/membership.ts', { '@/lib/db': db });
  const api = load('app/api/admin/subscriptions/route.ts', {
    '../../../../lib/db': db,
    '../../../../models/Subscription': Subscription,
    '../../../../models/User': { findOne: async () => user, find: () => ({ sort: () => ({ lean: async () => [user] }) }) },
    '../../../../lib/admin-auth': { getAdminAuthorization: async () => ({ authorized, username: 'test-admin' }) },
    '../../../../lib/billing-plans': billing, '../../../../lib/membership': membership,
  });
  return { api, doc, billing, setAuthorized: value => { authorized = value; }, setExisting: value => { existing = value; }, setFailure: value => { failure = value; },
    saves: () => saves, connections: () => connections,
    patch: values => api.PATCH(new Request('http://app/api/admin/subscriptions', { method: 'PATCH', body: JSON.stringify(values) })),
  };
}

test('admin API loads memberships and saves plan, cycle and activation with real schema validation', async () => {
  const f = fixture();
  const list = await f.api.GET(new Request('http://app/api/admin/subscriptions'));
  assert.equal(list.status, 200); assert.equal((await list.json()).subscriptions.length, 1);
  const response = await f.patch({ subscriptionId: String(f.doc._id), plan: 'pro', billingCycle: 'annual', status: 'active', notes: 'Updated membership' });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const { subscription } = await response.json();
  assert.equal(subscription.plan, 'pro'); assert.equal(subscription.billingCycle, 'annual');
  assert.equal(subscription.amount, f.billing.getPlanPrice('pro', 'annual'));
  assert.equal(subscription.active, true); assert.ok(subscription.currentPeriodEnd);
  assert.equal(f.doc.adminOverrideBy, 'test-admin'); assert.equal(f.saves(), 1);
});

test('email-only edits reuse existing memberships and new members can select a plan', async () => {
  const f = fixture();
  assert.equal((await f.patch({ userEmail: ' MEMBER@example.com ', plan: 'business' })).status, 200);
  assert.equal(f.doc.plan, 'business'); assert.equal(f.saves(), 1);
  f.setExisting(null);
  const response = await f.patch({ userEmail: 'member@example.com', plan: 'pro', action: 'activate' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).subscription.active, true);
  assert.equal(f.saves(), 2);
});

test('invalid membership edits return actionable 400 responses without database writes', async () => {
  const f = fixture();
  for (const values of [null, [], { subscriptionId: 'broken' }, { userEmail: {} },
    { status: 'expired' }, { plan: 'invalid' }, { billingCycle: 'weekly' }, { amount: -1 },
    { usedCredits: 'NaN' }, { currentPeriodEnd: 'invalid-date' }, { cancelAtPeriodEnd: 'false' },
    { action: 'extend', extendDays: -2 }, { action: 'grantCredits', creditAmount: 1.5 }]) {
    const response = await f.patch(values && !Array.isArray(values) ? { userEmail: 'member@example.com', ...values } : values);
    assert.equal(response.status, 400); assert.ok((await response.json()).error);
  }
  const malformed = await f.api.PATCH(new Request('http://app/api/admin/subscriptions', { method: 'PATCH', body: '{' }));
  assert.equal(malformed.status, 400);
  assert.equal(f.connections(), 0); assert.equal(f.saves(), 0);
  f.setAuthorized(false);
  assert.equal((await f.patch({ userEmail: 'member@example.com', plan: 'pro' })).status, 403);
  assert.equal(f.connections(), 0);
});

test('database and schema failures return JSON instead of unhandled 500 pages', async t => {
  t.mock.method(console, 'error', () => {});
  const f = fixture();
  for (const [error, expected] of [[Object.assign(Error('offline'), { name: 'MongoServerSelectionError' }), 503],
    [Object.assign(Error('duplicate'), { code: 11000 }), 409], [Error('unexpected'), 500]]) {
    f.setFailure(error);
    const response = await f.patch({ subscriptionId: String(f.doc._id), plan: 'pro' });
    assert.equal(response.status, expected); assert.ok((await response.json()).error);
  }
  f.setFailure(null);
  f.doc.currency = 'invalid';
  const invalid = await f.patch({ subscriptionId: String(f.doc._id), plan: 'pro' });
  assert.equal(invalid.status, 400); assert.match((await invalid.json()).error, /currency/);
  assert.equal(f.saves(), 0);
});

test('malformed or truncated admin cookies are denied without throwing a 500', async () => {
  const auth = load('lib/admin-auth.ts', {
    'next-auth': { getServerSession: async () => null },
    './auth-options': { authOptions: {} },
    'next/headers': { cookies: () => ({ toString: () => '', get: () => undefined }) },
  });
  const token = auth.createAdminToken('test-admin');
  assert.ok(auth.verifyAdminToken(token));
  assert.equal(auth.verifyAdminToken(token.split('.')[0] + '.short'), null);
  for (const cookie of ['melanam_admin_session=%E0%A4%A', 'melanam_admin_session=' + token.split('.')[0] + '.short']) {
    assert.equal((await auth.getAdminAuthorization(new Request('http://app', { headers: { cookie } }))).authorized, false);
  }
});
