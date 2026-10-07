const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');

function accessRoute(plan = { maxMeetingMinutes: 180, maxParticipants: 25 }) {
  const participants = new Map();
  let quotaReads = 0;
  let email = 'host@example.com';
  const members = new Set();
  const meeting = {
    meetingId: 'room', hostEmail: 'host@example.com',
    activeSessionStartedAt: null, activeSessionEndsAt: null,
    maxMeetingMinutes: 180, maxParticipants: 25,
    save: async () => {},
  };
  const route = load('app/api/meeting-access/route.ts', {
    '@/lib/db': async () => {},
    '@/lib/auth': { auth: async () => email ? { user: { email } } : null },
    '@/lib/recording-policy': load('lib/recording-policy.ts'),
    '@/models/MeetingMember': { updateOne: async (query) => members.add(query.userEmail) },
    '@/models/Meeting': { findOne: async () => meeting },
    '@/models/MeetingParticipant': {
      deleteOne: async ({ participantKey }) => participants.delete(participantKey),
      deleteMany: async ({ lastSeenAt }) => {
        for (const [key, entry] of participants) {
          if (entry.lastSeenAt < lastSeenAt.$lt) participants.delete(key);
        }
      },
      countDocuments: async () => participants.size,
      findOne: ({ participantKey }) => ({ lean: async () => participants.get(participantKey) }),
      updateOne: async ({ participantKey }, update, options) => {
        if (participants.has(participantKey) || options?.upsert) participants.set(participantKey, update.$set);
      },
    },
    '@/lib/workspace-usage': { getWorkspaceQuota: async () => {
      quotaReads++;
      return { plan: plan.maxMeetingMinutes === null ? 'enterprise' : 'free', planDefinition: plan };
    } },
  });
  return {
    meeting, participants, members, setEmail: (value) => { email = value; }, quotaReads: () => quotaReads,
    request: (participantKey, action = 'heartbeat') => route.POST({
      json: async () => ({ meetingId: 'room', participantKey, action }),
    }),
  };
}

test('server admits 25 participants, rejects a 26th, and preserves the session deadline', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-30T12:00:00Z') });
  const room = accessRoute();
  for (let i = 0; i < 25; i++) assert.equal((await room.request(`tab-${i}`, 'join')).status, 200);
  const deadline = room.meeting.activeSessionEndsAt.getTime();
  assert.equal(deadline - Date.now(), 180 * 60_000);
  assert.equal((await room.request('tab-26', 'join')).status, 403);
  t.mock.timers.tick(179 * 60_000);
  assert.equal((await room.request('tab-0')).status, 200);
  assert.equal(room.meeting.activeSessionEndsAt.getTime(), deadline);
  t.mock.timers.tick(60_000);
  const response = await room.request('tab-0');
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'MEETING_DURATION_REACHED');
});

test('a backgrounded participant renews its existing slot before stale presence is pruned', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-30T12:00:00Z') });
  const room = accessRoute({ maxMeetingMinutes: 180, maxParticipants: 1 });
  await room.request('presenter', 'join');
  const deadline = room.meeting.activeSessionEndsAt.getTime();
  t.mock.timers.tick(4 * 60_000);
  assert.equal((await room.request('late-guest', 'join')).status, 403);
  t.mock.timers.tick(2 * 60_000);
  assert.equal((await room.request('presenter')).status, 200);
  assert.equal(room.participants.size, 1);
  assert.equal(room.meeting.activeSessionEndsAt.getTime(), deadline);
});

test('unlimited plan limits remain null and are not reinitialized on every heartbeat', async () => {
  const room = accessRoute({ maxMeetingMinutes: null, maxParticipants: null });
  await room.request('host', 'join');
  await room.request('host');
  assert.equal(room.meeting.activeSessionEndsAt, null);
  assert.equal(room.meeting.maxParticipants, null);
  assert.equal(room.quotaReads(), 1);
});

test('leaving releases only that tab and invalid actions cannot change presence', async () => {
  const room = accessRoute();
  await room.request('tab-1', 'join');
  await room.request('tab-2', 'join');
  assert.equal((await room.request('tab-1', 'invalid')).status, 400);
  assert.equal(room.participants.size, 2);
  await room.request('tab-1', 'leave');
  assert.equal(room.participants.has('tab-2'), true);
  assert.equal(room.participants.size, 1);
});

test('only the host starts the room, and ended rooms cannot reopen', async () => {
  const room = accessRoute();
  room.setEmail('member@example.com');
  assert.equal((await room.request('member', 'join')).status, 403);
  assert.equal(room.members.size, 0);
  room.setEmail('HOST@example.com');
  assert.equal((await room.request('host', 'join')).status, 200);
  room.setEmail('member@example.com');
  assert.equal((await room.request('member', 'join')).status, 200);
  assert.ok(room.members.has('member@example.com'));
  room.meeting.endedAt = new Date();
  const denied = await room.request('member');
  assert.equal((await denied.json()).code, 'MEETING_ENDED');
  room.setEmail('host@example.com');
  assert.equal((await room.request('host')).status, 403);
});
