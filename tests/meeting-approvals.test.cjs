const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');

test('only the host can approve a participant file request', async () => {
  let email = 'participant@example.com';
  let saved = null;
  const approvalModel = {
    findOne: () => { const query = Promise.resolve(saved); query.lean = async () => saved; return query; },
    find: () => ({ sort: () => ({ limit: () => ({ lean: async () => saved && saved.status === 'pending' ? [saved] : [] }) }) }),
    create: async values => { saved = { ...values, _id: '0123456789abcdef01234567' }; return saved; },
    findOneAndUpdate: async (_query, update) => {
      if (!saved || saved.status !== 'pending') return null;
      saved.status = update.$set.status;
      return saved;
    },
  };
  const route = load('app/api/meeting-approvals/route.ts', {
    '@/lib/db': async () => {},
    'next-auth': { getServerSession: async () => ({ user: { email } }) },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/meeting-approval-access': {
      verifyMeetingApprovalToken: async () => ({ participantKey: 'participant:one' }),
      consumeMeetingApproval: async () => false,
    },
    '@/lib/video-playlist': { normalizeVideoUrl: value => value },
    '@/lib/onlyoffice-server': { resolveSharedPresentationFile: async () => null },
    '@/models/Meeting': { findOne: async () => ({ hostEmail: 'host@example.com' }) },
    '@/models/MeetingParticipant': { findOne: () => ({ lean: async () => ({ userEmail: 'participant@example.com' }) }) },
    '@/models/MeetingApproval': approvalModel,
    '@/models/VideoPlaylist': { findOne: () => ({ lean: async () => null }) },
  });
  const request = (method, body, auth = false) => new Request('https://app.example/api/meeting-approvals?meetingId=room', {
    method,
    headers: { ...(auth ? { Authorization: 'Bearer joined' } : {}), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal((await route.GET(request('GET'))).status, 403);
  const created = await route.POST(request('POST', { meetingId: 'room', type: 'file', name: 'slides.pdf', size: 100 }, true));
  assert.equal(created.status, 201);
  const { requestId } = await created.json();
  assert.equal((await route.PATCH(request('PATCH', { meetingId: 'room', requestId, decision: 'approve' }))).status, 403);
  email = 'host@example.com';
  assert.equal((await route.GET(request('GET'))).status, 200);
  assert.equal((await route.PATCH(request('PATCH', { meetingId: 'room', requestId, decision: 'approve' }))).status, 200);
  assert.equal(saved.status, 'approved');
  assert.equal((await route.PATCH(request('PATCH', { meetingId: 'room', requestId, decision: 'reject' }))).status, 409);
});

test('host approval polling is empty before the meeting starts', async () => {
  let email = 'host@example.com';
  const route = load('app/api/meeting-approvals/route.ts', {
    '@/lib/db': async () => {},
    'next-auth': { getServerSession: async () => ({ user: { email } }) },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/meeting-approval-access': {},
    '@/lib/video-playlist': {},
    '@/lib/onlyoffice-server': {},
    '@/models/Meeting': { findOne: async query => query.activeSessionStartedAt ? null : { hostEmail: 'host@example.com' } },
    '@/models/MeetingParticipant': {},
    '@/models/MeetingApproval': {},
    '@/models/VideoPlaylist': {},
  });
  const request = new Request('https://app.example/api/meeting-approvals?meetingId=room');
  const response = await route.GET(request);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { requests: [] });
  email = 'participant@example.com';
  assert.equal((await route.GET(request)).status, 404);
});

test('an approval is bound to its participant and can be used once', async () => {
  const id = '0123456789abcdef01234567';
  let status = 'approved';
  const { consumeMeetingApproval } = load('lib/meeting-approval-access.ts', {
    '@/lib/meeting-document-access': { assertActiveMeetingParticipant: async () => ({}) },
    '@/models/MeetingApproval': { findOneAndUpdate: async query => {
      if (query._id !== id || query.meetingId !== 'room' || query.type !== 'file'
        || query.requesterEmail !== 'participant@example.com' || query['payload.name'] !== 'slides.pdf'
        || query['payload.size'] !== 100 || status !== 'approved') return null;
      status = 'used';
      return { status };
    } },
  });
  const approval = { meetingId: 'room', approvalId: id, type: 'file', requesterEmail: 'participant@example.com', payload: { name: 'slides.pdf', size: 100 } };
  assert.equal(await consumeMeetingApproval({ ...approval, requesterEmail: 'other@example.com' }), false);
  assert.equal(await consumeMeetingApproval({ ...approval, payload: { name: 'wrong.pdf', size: 100 } }), false);
  assert.equal(await consumeMeetingApproval(approval), true);
  assert.equal(await consumeMeetingApproval(approval), false);
});
