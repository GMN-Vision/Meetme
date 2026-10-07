const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { uploadRecording } = require('./upload.cjs');

test('large uploads resume after a lost chunk response without uploading duplicate bytes', async t => {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(tempRoot, 'melanam-upload-test-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(dir)), tempRoot);
    assert.ok(path.basename(dir).startsWith('melanam-upload-test-'));
    fs.rmSync(dir, { recursive: true });
  });
  const file = path.join(dir, 'recording.mp4');
  const size = 6 * 1024 * 1024 + 200;
  fs.writeFileSync(file, Buffer.alloc(size, 7));
  let offset = 0, creates = 0, chunks = 0, loseResponse = true;
  t.mock.method(global, 'fetch', async (url, options) => {
    if (options.method === 'POST') {
      creates++;
      assert.equal(options.headers['Upload-Length'], String(size));
      return new Response('', { status: 201, headers: { Location: 'https://storage.example/upload/id' } });
    }
    if (options.method === 'HEAD') return new Response(null, { headers: { 'Upload-Offset': String(offset) } });
    assert.equal(options.method, 'PATCH'); assert.equal(Number(options.headers['Upload-Offset']), offset);
    assert.ok(options.body.byteLength <= 6 * 1024 * 1024);
    offset += options.body.byteLength; chunks++;
    if (loseResponse) { loseResponse = false; throw new TypeError('connection lost after server committed the chunk'); }
    return new Response(null, { status: 204, headers: { 'Upload-Offset': String(offset) } });
  });
  const job = {};
  const args = { file, size, storagePath: 'id/meeting.mp4', env: { SUPABASE_URL: 'https://storage.example', SUPABASE_SERVICE_ROLE_KEY: 'secret' }, job, save: () => {} };
  await assert.rejects(uploadRecording(args));
  assert.ok(job.uploadUrl);
  await uploadRecording(args);
  assert.equal(offset, size); assert.equal(chunks, 2); assert.equal(creates, 1);
});
