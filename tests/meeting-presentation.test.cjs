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
      ONLYOFFICE_EXTENSIONS: new Set(['pptx', 'pdf']),
      resolveOnlyOfficeFile: async (path, meetingId) => ({ path, meetingId, name: 'Slides.pptx', extension: path.endsWith('pptx') ? 'pptx' : 'exe' }),
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
  assert.equal((await post('files/virus.exe')).status, 415);
  assert.equal((await post(null)).status, 200);
  assert.equal((await (await route.GET(new Request('https://app.example/api/meeting-presentation?meetingId=room', { headers }))).json()).presentation, null);
  assert.equal((await route.GET(new Request('https://app.example/api/meeting-presentation?meetingId=room'))).status, 400);
});
