const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');

test('Jitsi tokens grant moderator status only when explicitly requested', () => {
  const { createJitsiJwt } = load('lib/jitsi-jwt.ts');
  const base = { roomName: 'room', domain: 'meet.example', user: { id: 'member', name: 'Member' }, secret: 'test-secret' };
  const claims = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  assert.equal(claims(createJitsiJwt(base)).moderator, false);
  assert.equal(claims(createJitsiJwt({ ...base, moderator: true })).context.user.affiliation, 'owner');
});

test('meeting-end rejects a participant before changing meeting state', async () => {
  let updates = 0;
  const { POST } = load('app/api/meeting-end/route.ts', {
    '@/models/Meeting': { updateOne: async () => { updates++; } },
    '@/lib/server-recording': {
      recordingUser: async () => 'member@example.com',
      hostMeeting: async () => { throw new Error('Only the meeting host can end this meeting.'); },
      stopServerRecording: async () => {},
      recordingErrorResponse: error => new Response(error.message, { status: 403 }),
    },
  });
  const response = await POST({ json: async () => ({ meetingId: 'room' }) });
  assert.equal(response.status, 403);
  assert.equal(updates, 0);
});

test('public meetings require role-signed Jitsi tokens', async t => {
  const previous = process.env.JITSI_JWT_SECRET;
  t.after(() => { if (previous === undefined) delete process.env.JITSI_JWT_SECRET; else process.env.JITSI_JWT_SECRET = previous; });
  let email = 'member@example.com';
  let moderator;
  const { GET } = load('app/api/meeting-token/route.ts', {
    '../../../lib/db': async () => {},
    '../../../models/Meeting': { findOne: async () => ({ meetingId: 'room', hostEmail: 'host@example.com', hostId: 'host', isPrivate: false, activeSessionStartedAt: new Date(), maxMeetingMinutes: 60 }) },
    '../../../lib/jitsi-jwt': { createJitsiJwt: options => { moderator = options.moderator; return 'signed'; } },
    '../../../lib/jitsi-room': { normalizeJitsiRoomName: value => value },
    'next-auth': { getServerSession: async () => ({ user: { email } }) },
    '../../../lib/auth-options': { authOptions: {} },
  });
  const request = { nextUrl: new URL('https://app.example/api/meeting-token?meetingId=room') };
  delete process.env.JITSI_JWT_SECRET;
  assert.equal((await GET(request)).status, 500);
  process.env.JITSI_JWT_SECRET = 'a'.repeat(32);
  assert.equal((await GET(request)).status, 200);
  assert.equal(moderator, false);
  email = 'host@example.com';
  assert.equal((await GET(request)).status, 200);
  assert.equal(moderator, true);
});
