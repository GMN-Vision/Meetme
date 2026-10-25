const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const load = require('./load-typescript.cjs');

test('server uploads reserve quota, enforce ownership and offsets, stream downloads and release storage', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'melanam-files-'));
  const previous = process.env.FILE_STORAGE_PATH;
  process.env.FILE_STORAGE_PATH = root;
  t.after(() => {
    if (previous === undefined) delete process.env.FILE_STORAGE_PATH;
    else process.env.FILE_STORAGE_PATH = previous;
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(root).startsWith('melanam-files-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  let email = 'owner@example.com', used = 0;
  const documents = [];
  const model = {
    create: async values => {
      const doc = { ...values, _id: documents.length + 1, ready: false, offset: 0, save: async () => {} };
      documents.push(doc); return doc;
    },
    find: () => ({ lean: async () => [] }),
    findOne: filter => {
      const doc = documents.find(d => (!filter.path || d.path === filter.path) &&
        (!filter.ownerEmail || d.ownerEmail === filter.ownerEmail) &&
        (filter.ready === undefined || d.ready === filter.ready) &&
        (!filter.expiresAt || d.expiresAt > filter.expiresAt.$gt));
      const result = Promise.resolve(doc);
      result.lean = async () => doc;
      return result;
    },
    deleteOne: async filter => { const i = documents.findIndex(d => d._id === filter._id); if (i >= 0) documents.splice(i, 1); },
  };
  const quota = { plan: 'free', scope: 'user', scopeId: 'owner@example.com', planDefinition: { features: { files: true } } };
  const mocks = {
    '@/lib/db': async () => {}, '@/models/SharedFile': model,
    'next-auth': { getServerSession: async () => email ? { user: { email } } : null },
    '@/lib/auth-options': { authOptions: {} },
    '@/models/Meeting': { exists: async () => false },
    '@/lib/supabaseServer': { supabaseServer: {} },
    '@/lib/workspace-usage': {
      getWorkspaceQuota: async () => quota,
      assertStorageCapacity: async (_email, size) => ({ ok: used + documents.reduce((sum, d) => sum + d.size, 0) + size <= 12, error: 'Storage full' }),
    },
  };
  const storage = load('lib/server-file-storage.ts', mocks);
  mocks['@/lib/server-file-storage'] = storage;
  const { POST, PUT } = load('app/api/files/upload/route.ts', mocks);
  const { DELETE } = load('app/api/files/delete/route.ts', mocks);
  const init = (size = 10, meetingId = 'room') => POST(new Request('https://app/api/files/upload', {
    method: 'POST', body: JSON.stringify({ meetingId, name: 'résumé.txt', size }),
  }));
  assert.equal((await init(100 * 1024 ** 2 + 1)).status, 413);
  assert.equal((await init(1, '../escape')).status, 400);
  email = ''; assert.equal((await init()).status, 401); email = 'owner@example.com';
  const response = await init(); assert.equal(response.status, 200);
  const upload = await response.json();
  assert.equal((await init(3)).status, 402, 'pending upload reserves its full size');
  const put = (offset, body) => PUT(new Request(`https://app/api/files/upload?path=${encodeURIComponent(upload.path)}&offset=${offset}`, { method: 'PUT', body }));
  email = 'intruder@example.com'; assert.equal((await put(0, 'abc')).status, 404); email = 'owner@example.com';
  assert.equal((await put(1, 'abc')).status, 409);
  assert.equal((await put(0, Buffer.alloc(storage.CHUNK_BYTES + 1))).status, 400);
  assert.equal((await storage.localDownload(upload.path)).status, 404, 'partial uploads cannot be downloaded');
  assert.equal((await put(0, '01234')).status, 200);
  assert.equal((await put(0, '01234')).status, 409, 'duplicate chunks cannot overwrite committed data');
  const last = await put(5, '56789'); assert.equal((await last.json()).ready, true);
  assert.equal(fs.readFileSync(storage.diskPath(upload.path), 'utf8'), '0123456789');
  const download = await storage.localDownload(upload.path);
  assert.equal(await download.text(), '0123456789');
  assert.match(download.headers.get('content-disposition'), /r%C3%A9sum%C3%A9.txt/);
  const range = await storage.localDownload(upload.path, new Request('https://app/download', { headers: { Range: 'bytes=3-5' } }));
  assert.equal(range.status, 206); assert.equal(await range.text(), '345');
  assert.throws(() => storage.diskPath('local/../../secret'));
  const remove = () => DELETE(new Request('https://app/api/files/delete', { method: 'DELETE', body: JSON.stringify({ path: upload.path }) }));
  email = 'intruder@example.com'; assert.equal((await remove()).status, 403); email = 'owner@example.com';
  assert.equal((await remove()).status, 200);
  assert.equal(fs.existsSync(storage.diskPath(upload.path)), false);
  assert.equal((await init()).status, 200, 'deletion releases quota');
  // A second writer cannot enter the same workspace reservation section.
  await storage.withStorageLock('quota', async () => {
    await assert.rejects(storage.withStorageLock('quota', async () => {}), /Another upload/);
  });
});

test('client splits files into small requests and cleans up reservations after errors', async () => {
  const { uploadSharedFile } = load('lib/file-upload-client.ts');
  const originalFetch = global.fetch;
  const calls = [], progress = [];
  let fail = false;
  global.fetch = async (url, init) => {
    calls.push({ url, ...init });
    if (init.method === 'POST') return Response.json({ path: 'local/room/id', chunkBytes: 4 });
    if (init.method === 'DELETE') return Response.json({ ok: true });
    if (fail) return Response.json({ error: 'Disk full' }, { status: 400 });
    return Response.json({ offset: Number(new URL(url, 'https://app').searchParams.get('offset')) + init.body.size });
  };
  try {
    const file = new Blob(['0123456789']); file.name = 'file.txt';
    await uploadSharedFile(file, 'room', value => progress.push(value));
    assert.deepEqual(calls.filter(c => c.method === 'PUT').map(c => c.body.size), [4, 4, 2]);
    assert.deepEqual(progress, [40, 80, 100]);
    fail = true;
    await assert.rejects(uploadSharedFile(file, 'room', () => {}), /Disk full/);
    assert.equal(calls.at(-1).method, 'DELETE');
  } finally { global.fetch = originalFetch; }
});

test('media uploads negotiate proxy request limits without skipping or duplicating bytes', async t => {
  const { uploadSharedFile } = load('lib/file-upload-client.ts');
  const accepted = [], sizes = [], progress = [];
  let offset = 0;
  t.mock.method(global, 'fetch', async (url, init) => {
    if (init.method === 'POST') return Response.json({ path: 'local/room/id', chunkBytes: 4 * 1024 ** 2 });
    assert.equal(init.method, 'PUT', 'successful negotiation must not delete the upload');
    assert.equal(Number(new URL(url, 'https://app').searchParams.get('offset')), offset);
    sizes.push(init.body.size);
    if (init.body.size > 1024 ** 2) return new Response('<html>Request too large</html>', { status: 413 });
    accepted.push(Buffer.from(await init.body.arrayBuffer()));
    offset += init.body.size;
    return Response.json({ offset });
  });
  const bytes = Buffer.alloc(5 * 1024 ** 2 + 13, 0xab);
  const file = new Blob([bytes], { type: 'video/mp4' }); file.name = 'clip.MP4';
  await uploadSharedFile(file, 'room', value => progress.push(value));
  assert.deepEqual(sizes.slice(0, 3), [4 * 1024 ** 2, 2 * 1024 ** 2, 1024 ** 2]);
  assert.deepEqual(Buffer.concat(accepted), bytes);
  assert.equal(progress.at(-1), 100);
});

test('non-JSON upload failures give useful errors and release reserved storage', async t => {
  const { uploadSharedFile } = load('lib/file-upload-client.ts');
  let deleted = false;
  t.mock.method(global, 'fetch', async (_url, init) => {
    if (init.method === 'POST') return Response.json({ path: 'local/room/id', chunkBytes: 4 });
    if (init.method === 'DELETE') { deleted = true; return Response.json({ ok: true }); }
    return new Response('<html>Bad Gateway</html>', { status: 502 });
  });
  const file = new Blob(['jpeg']); file.name = 'photo.jpeg';
  await assert.rejects(uploadSharedFile(file, 'room', () => {}), /Upload failed \(HTTP 502\)/);
  assert.equal(deleted, true);
});

test('allowance API shows each plan limit and reduces the send allowance to remaining storage', async () => {
  let plan = 'free', signedIn = true, used = 0;
  const { BILLING_PLAN_MAP } = load('lib/billing-plans.ts');
  const storage = load('lib/server-file-storage.ts', { '@/models/SharedFile': {}, '@/lib/db': async () => {} });
  const { GET } = load('app/api/files/limits/route.ts', {
    'next-auth': { getServerSession: async () => signedIn ? { user: { email: 'user@example.com' } } : null },
    '@/lib/auth-options': { authOptions: {} },
    '@/lib/server-file-storage': storage,
    '@/lib/workspace-usage': {
      getWorkspaceQuota: async () => ({ plan, planDefinition: BILLING_PLAN_MAP[plan] }),
      getWorkspaceStorageUsageBytes: async () => used,
    },
  });
  for (const [key, maximum] of Object.entries({ free: 100 * 1024 ** 2, pro: 1024 ** 3, business: 5 * 1024 ** 3, enterprise: 10 * 1024 ** 3 })) {
    plan = key;
    const response = await GET(); assert.equal(response.status, 200);
    const allowance = await response.json();
    assert.equal(allowance.maxFileBytes, maximum);
    assert.equal(allowance.availableFileBytes, maximum);
  }
  plan = 'free'; used = 1024 ** 3 - 10;
  let allowance = await (await GET()).json();
  assert.equal(allowance.availableFileBytes, 10);
  used += 20;
  allowance = await (await GET()).json();
  assert.equal(allowance.availableFileBytes, 0);
  signedIn = false; assert.equal((await GET()).status, 401);
});
