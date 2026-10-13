const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const policy = load('lib/recording-policy.ts');
const recordingId = '7fe97eea-b90e-44b5-a042-2c284288c5ca';

test('authenticated host streams a server MP4 with seek ranges and download headers', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'melanam-recording-'));
  const directory = path.join(root, recordingId);
  const file = path.join(directory, 'meeting-output.mp4');
  fs.mkdirSync(directory);
  fs.writeFileSync(file, Buffer.from('0123456789'));
  const previous = process.env.RECORDING_STORAGE_DIR;
  process.env.RECORDING_STORAGE_DIR = root;
  assert.ok(await load('lib/local-recording.ts').localRecordingFile(recordingId));
  t.after(() => {
    if (previous === undefined) delete process.env.RECORDING_STORAGE_DIR;
    else process.env.RECORDING_STORAGE_DIR = previous;
    if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(directory);
    fs.rmdirSync(root);
  });
  const { GET, DELETE } = load('app/api/recording/[id]/route.ts', {
    '@/lib/server-recording': {
      recordingUser: async () => 'host@example.com',
      recordingErrorResponse: error => new Response(JSON.stringify({ error: error.message }), { status: error.status || 500 }),
      RecordingError: class extends Error { constructor(message, status) { super(message); this.status = status; } },
    },
    '@/lib/recording-policy': policy,
    '@/models/Recording': {
      findOne: async () => ({ recordingId, meetingId: 'room', hostEmail: 'host@example.com', status: 'ready',
        expiresAt: new Date(Date.now() + 60000), storagePath: `${recordingId}/meeting.mp4` }),
      updateOne: async () => ({ modifiedCount: 1 }),
    },
    '@/lib/supabaseServer': { supabaseServer: { storage: { from: () => { throw Error('must serve local media'); } } } },
  });
  const params = { params: { id: recordingId } };
  const request = (suffix = '', headers = {}) => ({ url: `https://app.example/api/recording/${recordingId}${suffix}`,
    nextUrl: new URL(`https://app.example/api/recording/${recordingId}${suffix}`), headers: new Headers(headers) });
  const full = await GET(request(), params);
  assert.equal(full.status, 200, full.status === 200 ? '' : await full.text());
  assert.equal(full.headers.get('content-type'), 'video/mp4');
  assert.equal(await full.text(), '0123456789');
  const seek = await GET(request('', { range: 'bytes=3-5' }), params);
  assert.equal(seek.status, 206);
  assert.equal(seek.headers.get('content-range'), 'bytes 3-5/10');
  assert.equal(await seek.text(), '345');
  const download = await GET(request('?download=1'), params);
  assert.equal(download.headers.get('content-disposition'), 'attachment; filename="Meeting-room.mp4"');
  assert.equal(await download.text(), '0123456789');
  const invalid = await GET(request('', { range: 'bytes=20-' }), params);
  assert.equal(invalid.status, 416);
  const deleted = await DELETE(request(), params);
  assert.equal(deleted.status, 200);
  assert.equal(fs.existsSync(file), false);
});
