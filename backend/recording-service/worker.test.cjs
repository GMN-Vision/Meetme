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

test('worker enforces cap, produces playable MP4 locally and survives restart without duplicate capture', { timeout: 40000 }, async t => {
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
  // A 4:3, 10 FPS source exercises padding and frame-rate normalization.
  await exec('ffmpeg', ['-nostdin', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', source]);
  let starts = 0, stops = 0, currentId, readyCallback = false;
  upstream = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const input = Buffer.concat(chunks);
    if (req.url.endsWith('/startService')) {
      starts++; const body = JSON.parse(input.toString());
      assert.equal(body.sinkType, 'file'); currentId = body.sessionId;
      const folder = path.join(mediaRoot, currentId); fs.mkdirSync(folder); fs.copyFileSync(source, path.join(folder, 'raw.mp4'));
    } else if (req.url.endsWith('/stopService')) {
      stops++; fs.writeFileSync(path.join(mediaRoot, currentId, '.finished'), '');
    } else if (req.url.endsWith('/callback')) {
      readyCallback ||= JSON.parse(input.toString()).status === 'ready';
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}');
  });
  const base = await listen(upstream);
  const env = { RECORDING_WORKER_SECRET: 'test-secret', RECORDING_APP_URL: base, JIBRI_SERVICE_URL: base,
    JITSI_BASE_URL: 'https://meet.example.com', JIBRI_RECORDER_DOMAIN: 'recorder.example.com', JIBRI_RECORDER_USERNAME: 'recorder', JIBRI_RECORDER_PASSWORD: 'test',
    JIBRI_RECORDINGS_PATH: mediaRoot, RECORDING_STATE_PATH: stateRoot };
  worker = createService(env); let workerUrl = await listen(worker);
  const request = (route, body) => fetch(workerUrl + route, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  assert.equal((await fetch(workerUrl + '/health')).status, 401);
  const input = { recordingId: randomUUID(), roomName: 'class', maxDurationSeconds: 2, maxBytes: 1400000 };
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
  assert.equal(result.status, 'ready'); assert.equal(starts, 1); assert.ok(stops >= 1);
  assert.ok(result.durationSeconds <= 2);
  assert.equal(result.storagePath, `${input.recordingId}/meeting-output.mp4`);
  const output = path.join(mediaRoot, input.recordingId, 'meeting-output.mp4');
  assert.ok(fs.existsSync(output), 'final MP4 must remain on local storage');
  assert.ok(!fs.existsSync(path.join(mediaRoot, input.recordingId, 'raw.mp4')), 'raw input should be cleaned up');
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,avg_frame_rate,pix_fmt,sample_aspect_ratio', '-of', 'json', output]);
  const streams = JSON.parse(stdout).streams;
  const codecs = streams.map(stream => stream.codec_name);
  assert.ok(codecs.includes('h264')); assert.ok(codecs.includes('aac'));
  const video = streams.find(stream => stream.codec_name === 'h264');
  assert.equal(video.width, 1920); assert.equal(video.height, 1080);
  assert.equal(video.avg_frame_rate, '30/1');
  assert.equal(video.pix_fmt, 'yuv420p'); assert.equal(video.sample_aspect_ratio, '1:1');
  assert.ok(fs.statSync(output).size <= input.maxBytes);
  assert.equal(readyCallback, true);
  assert.ok(fs.existsSync(path.join(mediaRoot, input.recordingId)), 'recording directory must remain');
  await close(worker); worker = createService(env); workerUrl = await listen(worker);
  assert.equal((await (await request('/recordings', input)).json()).status, 'ready');
  assert.equal(starts, 1);
  const canceled = { ...input, recordingId: randomUUID() };
  await request(`/recordings/${canceled.recordingId}/stop`, {});
  assert.equal((await (await request('/recordings', canceled)).json()).status, 'failed');
  assert.equal(starts, 1);
});
