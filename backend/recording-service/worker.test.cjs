const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
const { createService, authorized, validateStart, safeDirectory } = require('./server.cjs');
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });

test('worker rejects missing credentials, path traversal and invalid caps', () => {
  assert.equal(authorized(undefined, 'secret'), false);
  assert.equal(authorized('Bearer bad', 'secret'), false);
  assert.equal(authorized('Bearer secret', 'secret'), true);
  assert.throws(() => safeDirectory(path.resolve(os.tmpdir()), '../room'));
  assert.throws(() => validateStart({ recordingId: randomUUID(), roomName: '../room', maxDurationSeconds: 60, maxBytes: 1000 }));
  assert.throws(() => validateStart({ recordingId: randomUUID(), roomName: 'room', maxDurationSeconds: -1, maxBytes: 1000 }));
});

test('worker enforces cap, produces playable MP4, uploads privately and survives restart without duplicate capture', { timeout: 40000 }, async t => {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(tempRoot, 'melanam-recording-test-'));
  const mediaRoot = path.join(directory, 'media'), stateRoot = path.join(directory, 'state');
  fs.mkdirSync(mediaRoot); fs.mkdirSync(stateRoot);
  let worker, upstream;
  t.after(async () => {
    if (worker) await close(worker);
    if (upstream) await close(upstream);
    // Explicitly bound recursive cleanup to the fixture directory we created.
    assert.equal(path.dirname(fs.realpathSync(directory)), tempRoot);
    assert.ok(path.basename(directory).startsWith('melanam-recording-test-'));
    fs.rmSync(directory, { recursive: true });
  });
  const source = path.join(directory, 'fixture.mp4');
  await exec('ffmpeg', ['-nostdin', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', source]);
  let starts = 0, stops = 0, currentId, readyCallback = false, uploads = 0;
  const uploaded = path.join(directory, 'uploaded.mp4');
  upstream = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const input = Buffer.concat(chunks);
    if (req.url.endsWith('/startService')) {
      starts++; const body = JSON.parse(input.toString());
      assert.equal(body.sinkType, 'file'); currentId = body.sessionId;
      const folder = path.join(mediaRoot, currentId); fs.mkdirSync(folder); fs.copyFileSync(source, path.join(folder, 'raw.mp4'));
    } else if (req.url.endsWith('/stopService')) {
      stops++; fs.writeFileSync(path.join(mediaRoot, currentId, '.finished'), '');
    } else if (req.url.startsWith('/storage/') && req.method === 'POST') {
      uploads++; assert.equal(req.headers.authorization, 'Bearer storage-secret');
      assert.ok(req.headers['upload-metadata'].includes(Buffer.from(`${currentId}/meeting.mp4`).toString('base64')));
      fs.writeFileSync(uploaded, ''); res.setHeader('Location', '/storage/upload/test');
    } else if (req.url.startsWith('/storage/') && req.method === 'PATCH') {
      assert.equal(Number(req.headers['upload-offset']), fs.statSync(uploaded).size);
      fs.appendFileSync(uploaded, input); res.setHeader('Upload-Offset', String(fs.statSync(uploaded).size));
    } else if (req.url.endsWith('/callback')) {
      readyCallback ||= JSON.parse(input.toString()).status === 'ready';
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}');
  });
  const base = await listen(upstream);
  const env = { RECORDING_WORKER_SECRET: 'test-secret', RECORDING_APP_URL: base, JIBRI_SERVICE_URL: base,
    JITSI_BASE_URL: 'https://meet.example.com', JIBRI_RECORDER_DOMAIN: 'recorder.example.com', JIBRI_RECORDER_USERNAME: 'recorder', JIBRI_RECORDER_PASSWORD: 'test',
    SUPABASE_URL: base, SUPABASE_SERVICE_ROLE_KEY: 'storage-secret', JIBRI_RECORDINGS_PATH: mediaRoot, RECORDING_STATE_PATH: stateRoot };
  worker = createService(env); let workerUrl = await listen(worker);
  const request = (route, body) => fetch(workerUrl + route, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  assert.equal((await fetch(workerUrl + '/health')).status, 401);
  const input = { recordingId: randomUUID(), roomName: 'class', maxDurationSeconds: 2, maxBytes: 800000 };
  assert.equal((await request('/recordings', input)).status, 202);
  await request('/recordings', input);
  const busy = await (await request('/recordings', { ...input, recordingId: randomUUID() })).json();
  assert.equal(busy.status, 'failed');
  let result;
  for (let attempt = 0; attempt < 80; attempt++) {
    result = await (await request(`/recordings/${input.recordingId}`)).json();
    if (result.status === 'ready') break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.equal(result.status, 'ready'); assert.equal(starts, 1); assert.ok(stops >= 1); assert.equal(uploads, 1);
  assert.ok(result.durationSeconds <= 2); assert.ok(fs.existsSync(uploaded));
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'json', uploaded]);
  const codecs = JSON.parse(stdout).streams.map(stream => stream.codec_name);
  assert.ok(codecs.includes('h264')); assert.ok(codecs.includes('aac'));
  assert.equal(readyCallback, true);
  assert.equal(fs.existsSync(path.join(mediaRoot, input.recordingId)), false);
  await close(worker); worker = createService(env); workerUrl = await listen(worker);
  assert.equal((await (await request('/recordings', input)).json()).status, 'ready');
  assert.equal(starts, 1);
  const canceled = { ...input, recordingId: randomUUID() };
  await request(`/recordings/${canceled.recordingId}/stop`, {});
  assert.equal((await (await request('/recordings', canceled)).json()).status, 'failed');
  assert.equal(starts, 1);
});
