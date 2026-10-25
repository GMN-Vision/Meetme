const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { AsyncLocalStorage } = require('node:async_hooks');
const { randomBytes, createHash } = require('node:crypto');
const load = require('./load-typescript.cjs');

test('multi-chunk upload becomes visible in another participant view and downloads byte-for-byte over HTTP', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'melanam-sharing-flow-'));
  const previous = process.env.FILE_STORAGE_PATH;
  process.env.FILE_STORAGE_PATH = root;
  const realFetch = global.fetch;
  const identities = new AsyncLocalStorage();
  const documents = new Map();
  let legacyMode = 'ok';
  const matches = (doc, filter) => Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === 'object' && '$gt' in value) return doc[key] > value.$gt;
    if (value && typeof value === 'object' && '$lte' in value) return doc[key] <= value.$lte;
    return doc[key] === value;
  });
  const model = {
    create: async values => {
      documents.set(values.path, { ...values, _id: values.path, ready: false, offset: 0, createdAt: new Date() });
    },
    find: filter => {
      const query = { sort: () => query, lean: async () => [...documents.values()].filter(doc => matches(doc, filter)).map(doc => ({ ...doc })) };
      return query;
    },
    findOne: filter => {
      const saved = [...documents.values()].find(doc => matches(doc, filter));
      const doc = saved && { ...saved, save: async function () { const { save, ...values } = this; documents.set(values.path, values); } };
      const query = Promise.resolve(doc);
      query.lean = async () => saved && { ...saved };
      return query;
    },
    exists: async filter => [...documents.values()].some(doc => matches(doc, filter)),
    deleteOne: async filter => { for (const [key, doc] of documents) if (matches(doc, filter)) documents.delete(key); },
  };
  const mocks = {
    '@/lib/db': async () => {}, '@/models/SharedFile': model,
    '@/models/Meeting': { exists: async () => false },
    'next-auth': { getServerSession: async () => identities.getStore() ? { user: { email: identities.getStore() } } : null },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/workspace-usage': {
      getWorkspaceQuota: async () => ({ plan: 'free', scope: 'user', scopeId: 'uploader@example.com', planDefinition: { features: { files: true } } }),
      assertStorageCapacity: async () => ({ ok: true }),
    },
    '@/lib/supabaseServer': { supabaseServer: { storage: { from: () => ({
      list: async (_folder, options) => {
        if (legacyMode === 'throw') throw new Error('Legacy outage');
        if (legacyMode === 'error') return { error: { message: 'Legacy outage' } };
        const files = legacyMode === 'many' ? Array.from({ length: 1105 }, (_, index) => ({ name: `old-${index}.txt` })) : [];
        return { data: files.slice(options.offset, options.offset + options.limit) };
      },
      download: async () => ({ data: new Blob(['older file']), error: null }),
    }) } } },
  };
  const storage = load('lib/server-file-storage.ts', mocks);
  mocks['@/lib/server-file-storage'] = storage;
  const routes = Object.fromEntries(['upload', 'list', 'download', 'url', 'delete'].map(name => [name, load(`app/api/files/${name}/route.ts`, mocks)]));
  const server = http.createServer((incoming, outgoing) => {
    identities.run(incoming.headers['x-test-user'] || '', async () => {
      try {
        const url = new URL(incoming.url, 'http://localhost');
        const handler = routes[url.pathname.split('/').pop()]?.[incoming.method];
        const request = new Request(url, { method: incoming.method, headers: incoming.headers,
          ...(!['GET', 'HEAD'].includes(incoming.method) ? { body: Readable.toWeb(incoming), duplex: 'half' } : {}) });
        const response = handler ? await handler(request) : new Response('Not found', { status: 404 });
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        if (response.body) await pipeline(Readable.fromWeb(response.body), outgoing);
        else outgoing.end();
      } catch (error) { outgoing.destroy(error); }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const participantFetch = (url, options = {}) => realFetch(new URL(url, origin), options);
  t.after(async () => {
    global.fetch = realFetch;
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    if (previous === undefined) delete process.env.FILE_STORAGE_PATH; else process.env.FILE_STORAGE_PATH = previous;
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(root).startsWith('melanam-sharing-flow-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const listing = async (meetingId = 'shared-room') => {
    const response = await participantFetch(`/api/files/list?meetingId=${meetingId}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return response.json();
  };
  let uploadPath, chunkCount = 0;
  global.fetch = async (url, options = {}) => {
    const response = await participantFetch(url, { ...options, headers: { ...options.headers, 'x-test-user': 'uploader@example.com' } });
    if (options.method === 'POST') uploadPath = (await response.clone().json()).path;
    if (options.method === 'PUT') {
      chunkCount++;
      if (chunkCount === 1) {
        assert.deepEqual((await listing()).files, [], 'participant cannot see a partial upload');
        assert.equal((await participantFetch(`/api/files/download?path=${encodeURIComponent(uploadPath)}`)).status, 404);
      }
    }
    return response;
  };
  const bytes = randomBytes(storage.CHUNK_BYTES * 2 + 1031);
  const file = new Blob([bytes]); file.name = 'meeting notes + résumé.pdf';
  const progress = [];
  await load('lib/file-upload-client.ts').uploadSharedFile(file, 'shared-room', value => progress.push(value));
  assert.equal(chunkCount, 3); assert.equal(progress.at(-1), 100);
  const files = (await listing()).files;
  assert.equal(files.length, 1); assert.equal(files[0].name, file.name); assert.equal(files[0].size, bytes.length);
  assert.deepEqual((await listing('different-room')).files, [], 'files are scoped to their meeting');
  const linkResponse = await participantFetch(`/api/files/url?path=${encodeURIComponent(uploadPath)}`);
  const { url: downloadUrl } = await linkResponse.json();
  const downloaded = await participantFetch(downloadUrl);
  assert.equal(downloaded.status, 200);
  assert.equal(Number(downloaded.headers.get('content-length')), bytes.length);
  const hash = data => createHash('sha256').update(data).digest('hex');
  assert.equal(hash(Buffer.from(await downloaded.arrayBuffer())), hash(bytes));
  const preview = await participantFetch(`${downloadUrl}&preview=1`, { headers: { Range: 'bytes=0-1023' } });
  assert.equal(preview.status, 206);
  assert.equal(preview.headers.get('content-type'), 'application/pdf');
  assert.match(preview.headers.get('content-disposition'), /^inline;/);
  assert.equal(preview.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), bytes.subarray(0, 1024));
  const legacyPreview = await participantFetch('/api/files/download?path=shared-room/photo.png&preview=1');
  assert.equal(legacyPreview.headers.get('content-type'), 'image/png');
  assert.match(legacyPreview.headers.get('content-disposition'), /^inline;/);
  const activeContent = await participantFetch('/api/files/download?path=shared-room/page.html&preview=1');
  assert.match(activeContent.headers.get('content-disposition'), /^attachment;/);
  assert.equal(activeContent.headers.get('content-type'), 'application/octet-stream');
  const suffix = await participantFetch(downloadUrl, { headers: { Range: 'bytes=-1031' } });
  assert.equal(suffix.status, 206);
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), bytes.subarray(-1031));
  for (const range of ['bytes=1000000000-', 'bytes=0-1,4-5', 'bytes=-0', 'bytes=abc']) {
    assert.equal((await participantFetch(downloadUrl, { headers: { Range: range } })).status, 416);
  }
  for (legacyMode of ['error', 'throw']) {
    const result = await listing(); assert.equal(result.files[0].path, uploadPath); assert.ok(result.warning);
    assert.equal((await participantFetch(downloadUrl)).status, 200);
  }
  legacyMode = 'many'; assert.equal((await listing()).files.length, 1106, 'legacy pagination does not hide older uploads');
  legacyMode = 'ok';
  const otherUserDelete = await participantFetch('/api/files/delete', { method: 'DELETE', headers: { 'x-test-user': 'participant@example.com' }, body: JSON.stringify({ path: uploadPath }) });
  assert.equal(otherUserDelete.status, 403);
  const deleted = await participantFetch('/api/files/delete', { method: 'DELETE', headers: { 'x-test-user': 'uploader@example.com' }, body: JSON.stringify({ path: uploadPath }) });
  assert.equal(deleted.status, 200);
  assert.deepEqual((await listing()).files, []);
  assert.equal((await participantFetch(downloadUrl)).status, 404);
  // File acceptance must not depend on extension case or browser MIME metadata.
  for (const [name, mime, previewType] of [
    ['photo.png', 'image/png', 'image/png'],
    ['PHOTO.PNG', '', 'image/png'],
    ['clip.MP4', 'video/mp4', 'video/mp4'],
    ['photo.jpeg', 'image/jpeg', 'image/jpeg'],
    ['photo.JPG', '', 'image/jpeg'],
    ['notes.docx', '', 'application/octet-stream'],
    ['files.zip', 'application/zip', 'application/octet-stream'],
  ]) {
    const content = randomBytes(1031);
    const media = new Blob([content], { type: mime }); media.name = name;
    await load('lib/file-upload-client.ts').uploadSharedFile(media, 'shared-room', () => {});
    assert.ok((await listing()).files.some(file => file.name === name), `${name} is accepted and listed`);
    const response = await participantFetch(`/api/files/download?path=${encodeURIComponent(uploadPath)}&preview=1`);
    assert.equal(response.status, 200, name);
    assert.equal(response.headers.get('content-type'), previewType, name);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), content, `${name} retains all bytes`);
  }
});

for (const componentName of ['FileShare', 'UploadMedia']) {
  test(`${componentName} participant polling reveals working download links and preserves files through temporary outages`, async t => {
    const React = require('react');
    const { create, act } = require('react-test-renderer');
    const previousWindow = global.window;
    const polls = [];
    let visible = false, fail = false, callsToUrl = 0, view;
    global.window = { setInterval: cb => { polls.push(cb); return polls.length; }, clearInterval: () => {}, setTimeout: () => 1 };
    t.after(() => { if (view) act(() => view.unmount()); global.window = previousWindow; });
    t.mock.method(console, 'error', () => {});
    const key = 'local/shared-room/8fec32e9-271c-48fe-a5f1-405b2413705c';
    t.mock.method(global, 'fetch', async url => {
      if (url.startsWith('/api/files/url')) { callsToUrl++; return Response.json({}, { status: 503 }); }
      if (url.startsWith('/api/meeting-activity')) return Response.json({ activity: [] });
      if (fail) return Response.json({ error: 'Temporary failure' }, { status: 503 });
      return Response.json({ files: visible ? [{ name: 'Shared notes.pdf', path: key }] : [] });
    });
    const Component = load(`components/${componentName}.tsx`, {
      './FileAllowance': { __esModule: true, default: () => null, useFileAllowance: () => ({ limits: null, refresh: async () => {} }) },
      './FileUpload': { FileUpload: () => null },
    }).default;
    await act(async () => { view = create(React.createElement(Component, { meetingId: 'shared-room' })); });
    assert.equal(view.root.findAllByType('a').length, 0);
    visible = true;
    await act(async () => { polls[0](); });
    const links = view.root.findAllByType('a'); assert.equal(links.length, 2);
    for (const link of links) assert.equal(link.props.href, `/api/files/download?path=${encodeURIComponent(key)}`);
    assert.equal(callsToUrl, 0, 'links are immediately usable without signed-URL requests');
    fail = true;
    await act(async () => { polls[0](); });
    assert.equal(view.root.findAllByType('a').length, 2, 'temporary polling errors do not erase shared files');
    assert.match(JSON.stringify(view.toJSON()), /Retrying automatically/);
    fail = false; visible = false;
    await act(async () => { polls[0](); });
    assert.equal(view.root.findAllByType('a').length, 0, 'deleted files disappear on the next poll');
  });
}

test('guests and participants without a resolved subscription can open the meeting Files panel', async t => {
  const React = require('react');
  const { create, act } = require('react-test-renderer');
  const previousDocument = global.document;
  global.document = { addEventListener: () => {}, removeEventListener: () => {} };
  t.after(() => { global.document = previousDocument; });
  let authenticated = false;
  t.mock.method(global, 'fetch', async () => Response.json({ error: 'Subscription unavailable' }, { status: 503 }));
  const { Navbar } = load('components/Navbar.tsx', {
    'next/link': { __esModule: true, default: props => React.createElement('a', props) },
    'next/image': { __esModule: true, default: props => React.createElement('img', props) },
    'next/navigation': {
      usePathname: () => '/room/shared-room', useSearchParams: () => new URLSearchParams(),
      useRouter: () => ({ push: () => { throw Error('Viewing shared files must not redirect to sign in'); } }),
    },
    'next-auth/react': { useSession: () => authenticated ? { data: { user: { email: 'viewer@example.com' } }, status: 'authenticated' } : { data: null, status: 'unauthenticated' } },
    './FileShare': { __esModule: true, default: props => React.createElement('section', { 'data-shared-meeting': props.meetingId }, 'Shared files') },
    './SharedFileNotifications': { __esModule: true, default: () => null },
    './DesignTheme': { DesignSwitcher: () => null },
    './AudioCapture': { AudioCapture: () => null },
    './Whiteboard': { __esModule: true, default: () => null },
    './YouTubeStreamModal': { YouTubeStreamModal: () => null },
    '@/hooks/useRecording': { useRecording: () => ({}) },
    '@/hooks/useLivestream': { useLivestream: () => ({}) },
  });
  for (const signedIn of [false, true]) {
    authenticated = signedIn;
    let view;
    try {
      await act(async () => { view = create(React.createElement(Navbar)); });
      assert.equal(view.root.findAllByType('section').length, 0);
      await act(async () => { view.root.findByProps({ 'aria-label': 'Open upload media' }).props.onClick(); });
      assert.equal(view.root.findByType('section').props['data-shared-meeting'], 'shared-room');
      await act(async () => { view.root.findByProps({ 'aria-label': 'Close upload media' }).props.onClick(); });
      assert.equal(view.root.findAllByType('section').length, 0);
    } finally { if (view) act(() => view.unmount()); }
  }
});

