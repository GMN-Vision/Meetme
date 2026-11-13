const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');

test('joined participants can present a validated document in the room and stop it', async () => {
  let sharedPresentation = null;
  let email = 'host@example.com';
  const chain = () => ({ select: () => ({ lean: async () => ({ sharedPresentation, hostEmail: 'host@example.com' }), hostEmail: 'host@example.com' }) });
  const route = load('app/api/meeting-presentation/route.ts', {
    '@/lib/db': async () => {},
    'next-auth': { getServerSession: async () => ({ user: { email } }) },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/meeting-approval-access': { consumeMeetingApproval: async () => true },
    '@/lib/meeting-document-access': {
      verifyActiveMeetingDocumentToken: async (token, meetingId) => {
        if (!['valid', 'viewer'].includes(token) || meetingId !== 'room') throw new Error('Access denied');
        return { meetingId, participantKey: token === 'valid' ? 'participant:presenter' : 'participant:viewer' };
      },
    },
    '@/lib/onlyoffice-server': {
      resolveSharedPresentationFile: async (path, meetingId) => ({ path, meetingId, name: path.split('/').pop(), extension: path.split('.').pop() }),
    },
    '@/models/Meeting': {
      findOne: chain,
      findOneAndUpdate: (query, update) => {
        if ('sharedPresentation.page' in update.$set) {
          if (sharedPresentation?.path !== query['sharedPresentation.path'] || sharedPresentation?.presenterKey !== query['sharedPresentation.presenterKey']) return { select: () => ({ lean: async () => null }) };
          sharedPresentation.page = update.$set['sharedPresentation.page'];
        } else sharedPresentation = update.$set.sharedPresentation;
        return chain();
      },
    },
  });
  const headers = { Authorization: 'Bearer valid' };
  const post = path => route.POST(new Request('https://app.example/api/meeting-presentation', {
    method: 'POST', headers, body: JSON.stringify({ meetingId: 'room', path }),
  }));
  assert.equal((await post('files/Slides.pptx')).status, 200);
  const view = await route.GET(new Request('https://app.example/api/meeting-presentation?meetingId=room', { headers }));
  assert.equal((await view.json()).presentation.path, 'files/Slides.pptx');
  const changePage = (token, page) => route.PATCH(new Request('https://app.example/api/meeting-presentation', {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ meetingId: 'room', path: 'files/Slides.pptx', page }),
  }));
  assert.equal((await changePage('viewer', 2)).status, 403);
  assert.equal((await changePage('valid', 2)).status, 200);
  assert.equal((await (await route.GET(new Request('https://app.example/api/meeting-presentation?meetingId=room', { headers: { Authorization: 'Bearer viewer' } }))).json()).presentation.page, 2);
  assert.equal((await changePage('valid', 0)).status, 400);
  const presenterView = (await (await route.GET(new Request('https://app.example/api/meeting-presentation?meetingId=room', { headers }))).json()).presentation;
  assert.equal(presenterView.isPresenter, true);
  assert.equal('presenterKey' in presenterView, false, 'the presenter participant key stays on the server');
  const attendeeView = (await (await route.GET(new Request('https://app.example/api/meeting-presentation?meetingId=room', { headers: { Authorization: 'Bearer viewer' } }))).json()).presentation;
  assert.equal(attendeeView.isPresenter, false);
  assert.equal('note' in sharedPresentation, false, 'speech notes never enter meeting state');
  assert.equal((await post('files/photo.JPG')).status, 200);
  assert.equal((await (await route.GET(new Request('https://app.example/api/meeting-presentation?meetingId=room', { headers }))).json()).presentation.name, 'photo.JPG');
  assert.equal((await post('files/photo.jpeg')).status, 200);
  assert.equal((await post('files/local-page.html')).status, 200);
  assert.equal((await post('files/local-page.HTM')).status, 200);
  assert.equal((await post('files/audio.mp3')).status, 415);
  assert.equal((await post('files/virus.exe')).status, 415);
  const previousPresentation = sharedPresentation;
  sharedPresentation = { path: 'files/legacy.pdf', presenterKey: 'participant:presenter', updatedAt: new Date() };
  assert.equal((await (await route.GET(new Request('https://app.example/api/meeting-presentation?meetingId=room', { headers }))).json()).presentation, null, 'incomplete legacy state cannot reach the room viewer');
  sharedPresentation = previousPresentation;
  email = 'participant@example.com';
  assert.equal((await post('files/Slides.pptx')).status, 403, 'participant cannot present slides even with approval');
  assert.equal((await post(null)).status, 403, 'only the host can stop presenting');
  email = 'host@example.com';
  assert.equal((await post(null)).status, 200);
  assert.equal((await (await route.GET(new Request('https://app.example/api/meeting-presentation?meetingId=room', { headers }))).json()).presentation, null);
  assert.equal((await route.GET(new Request('https://app.example/api/meeting-presentation?meetingId=room'))).status, 400);
});

test('shared JPG files resolve for presentation while the Office viewer still rejects them', async () => {
  const { resolveSharedPresentationFile, resolveOnlyOfficeFile } = load('lib/onlyoffice-server.ts', {
    '@/lib/db': async () => {},
    '@/models/Meeting': { findOne: () => ({ lean: async () => ({ endedAt: null }) }) },
    '@/models/SharedFile': { findOne: () => ({ lean: async () => ({ name: 'meeting-photo.JPG', size: 4 }) }) },
    '@/lib/server-file-storage': { diskPath: () => '/shared-photo' },
    '@/lib/supabaseServer': { supabaseServer: {} },
    'node:fs/promises': { stat: async () => ({ isFile: () => true, size: 4, mtimeMs: 1 }) },
  });
  const local = await resolveSharedPresentationFile('local/room/123', 'room');
  assert.equal(local.name, 'meeting-photo.JPG');
  assert.equal(local.extension, 'jpg');
  const legacy = await resolveSharedPresentationFile('room/old-photo.jpeg', 'room');
  assert.equal(legacy.extension, 'jpeg');
  await assert.rejects(resolveOnlyOfficeFile('local/room/123', 'room'), /not supported by the document viewer/);
});
