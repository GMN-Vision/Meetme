const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');

test('OmniEdit keeps host File controls and limits participant slides to the active presentation', async t => {
  const previousUrl = process.env.NEXTAUTH_URL;
  process.env.NEXTAUTH_URL = 'https://melanam.com';
  t.after(() => {
    if (previousUrl === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = previousUrl;
  });
  let email = 'host@example.com';
  let sharedPresentation = null;
  const route = load('app/api/onlyoffice/config/route.ts', {
    'next-auth': { getServerSession: async () => ({ user: { email } }) },
    '@/lib/auth-options': { authOptions: {} },
    '@/models/Meeting': { findOne: () => ({ select: () => ({ lean: async () => ({ hostEmail: 'host@example.com', sharedPresentation }) }) }) },
    '@/lib/meeting-document-access': { verifyActiveMeetingDocumentToken: async () => ({ participantKey: 'viewer' }) },
    '@/lib/onlyoffice-server': {
      ONLYOFFICE_EXTENSIONS: new Set(['pptx']),
      onlyOfficeDocumentKey: () => 'document-key',
      resolveOnlyOfficeFile: async () => ({ extension: 'pptx', path: 'local/room/file', meetingId: 'room', name: 'Slides.pptx' }),
      signOnlyOfficeConfig: () => 'signed-config',
      signOnlyOfficePayload: () => 'signed-file',
    },
  });
  const request = () => new Request('https://melanam.com/api/onlyoffice/config?path=local%2Froom%2Ffile&meetingId=room', {
    headers: { Authorization: 'Bearer joined' },
  });
  const response = await route.GET(request());
  assert.equal(response.status, 200);
  const { config, isHost } = await response.json();
  assert.equal(isHost, true);
  assert.equal(config.type, 'desktop');
  assert.equal(config.editorConfig.mode, 'view');
  assert.deepEqual(config.editorConfig.customization.layout, {
    leftMenu: true, rightMenu: false, statusBar: false, toolbar: true,
  });
  assert.equal(config.document.permissions.download, false);
  assert.equal(config.document.permissions.print, false);
  email = 'participant@example.com';
  assert.equal((await route.GET(request())).status, 403);
  sharedPresentation = { path: 'local/room/file' };
  const viewer = await route.GET(request());
  assert.equal(viewer.status, 200);
  const viewerConfig = (await viewer.json()).config;
  assert.equal(viewerConfig.type, 'embedded');
  assert.equal(viewerConfig.editorConfig.mode, 'view');
  assert.equal(viewerConfig.editorConfig.customization.layout.toolbar, false);
});
