const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');

test('joined participants can present a validated document in the room and stop it', async () => {
  let sharedPresentation = null;
  const chain = () => ({ select: () => ({ lean: async () => ({ sharedPresentation }) }) });
  const route = load('app/api/meeting-presentation/route.ts', {
    '@/lib/db': async () => {},
    '@/lib/meeting-document-access': {
      verifyActiveMeetingDocumentToken: async (token, meetingId) => {
        if (token !== 'valid' || meetingId !== 'room') throw new Error('Access denied');
      },
    },
    '@/lib/onlyoffice-server': {
      resolveSharedPresentationFile: async (path, meetingId) => ({ path, meetingId, name: path.split('/').pop(), extension: path.split('.').pop() }),
    },
    '@/models/Meeting': {
      findOne: chain,
      findOneAndUpdate: (_query, update) => {
        sharedPresentation = update.$set.sharedPresentation;
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
  assert.equal((await post('files/photo.JPG')).status, 200);
  assert.equal((await (await route.GET(new Request('https://app.example/api/meeting-presentation?meetingId=room', { headers }))).json()).presentation.name, 'photo.JPG');
  assert.equal((await post('files/photo.jpeg')).status, 200);
  assert.equal((await post('files/audio.mp3')).status, 415);
  assert.equal((await post('files/virus.exe')).status, 415);
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
