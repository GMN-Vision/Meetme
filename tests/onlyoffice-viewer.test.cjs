const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');

test('shared document viewer requests content without editor chrome', async t => {
  const previousUrl = process.env.NEXTAUTH_URL;
  process.env.NEXTAUTH_URL = 'https://melanam.com';
  t.after(() => {
    if (previousUrl === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = previousUrl;
  });
  const route = load('app/api/onlyoffice/config/route.ts', {
    '@/lib/meeting-document-access': { verifyActiveMeetingDocumentToken: async () => ({ participantKey: 'viewer' }) },
    '@/lib/onlyoffice-server': {
      ONLYOFFICE_EXTENSIONS: new Set(['pptx']),
      onlyOfficeDocumentKey: () => 'document-key',
      resolveOnlyOfficeFile: async () => ({ extension: 'pptx', path: 'local/room/file', meetingId: 'room', name: 'Slides.pptx' }),
      signOnlyOfficeConfig: () => 'signed-config',
      signOnlyOfficePayload: () => 'signed-file',
    },
  });
  const response = await route.GET(new Request('https://melanam.com/api/onlyoffice/config?path=local%2Froom%2Ffile&meetingId=room', {
    headers: { Authorization: 'Bearer joined' },
  }));
  assert.equal(response.status, 200);
  const { config } = await response.json();
  assert.equal(config.type, 'embedded');
  assert.equal(config.editorConfig.mode, 'view');
  assert.deepEqual(config.editorConfig.customization.layout, {
    leftMenu: false, rightMenu: false, statusBar: false, toolbar: false,
  });
  assert.equal(config.document.permissions.download, false);
  assert.equal(config.document.permissions.print, false);
});
