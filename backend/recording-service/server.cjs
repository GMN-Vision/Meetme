'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { timingSafeEqual } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const { uploadRecording } = require('./upload.cjs');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const terminal = job => ['ready', 'failed'].includes(job.status);

function validateStart(body) {
  if (!UUID.test(body.recordingId) || !/^[a-z0-9_-]{1,128}$/.test(body.roomName) ||
      !Number.isSafeInteger(body.maxDurationSeconds) || body.maxDurationSeconds < 1 || body.maxDurationSeconds > 86400 ||
      !Number.isSafeInteger(body.maxBytes) || body.maxBytes < 1 || body.maxBytes > 1e12) throw new Error('Invalid recording request.');
}
function authorized(header, secret) {
  if (!secret || !header) return false;
  const a = Buffer.from(header), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
function safeDirectory(root, id) {
  if (!UUID.test(id)) throw new Error('Invalid recording ID.');
  const directory = path.resolve(root, id);
  if (path.dirname(directory) !== root) throw new Error('Invalid recording directory.');
  if (fs.existsSync(directory) && fs.realpathSync(directory) !== directory) throw new Error('Symlinks are not allowed.');
  return directory;
}

function createService(env = process.env) {
  for (const name of ['RECORDING_WORKER_SECRET', 'RECORDING_APP_URL', 'JIBRI_SERVICE_URL', 'JITSI_BASE_URL', 'JIBRI_RECORDER_DOMAIN', 'JIBRI_RECORDER_USERNAME', 'JIBRI_RECORDER_PASSWORD', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JIBRI_RECORDINGS_PATH', 'RECORDING_STATE_PATH']) {
    if (!env[name]) throw new Error(`${name} must be configured.`);
  }
  const root = path.resolve(env.JIBRI_RECORDINGS_PATH);
  const stateRoot = path.resolve(env.RECORDING_STATE_PATH);
  fs.mkdirSync(root, { recursive: true }); fs.mkdirSync(stateRoot, { recursive: true });
  if (fs.realpathSync(root) !== root || fs.realpathSync(stateRoot) !== stateRoot) throw new Error('Use real absolute paths, not symlinks.');
  const jobs = new Map();
  for (const file of fs.readdirSync(stateRoot)) {
    if (!file.endsWith('.json') || !UUID.test(file.slice(0, -5))) continue;
    const job = JSON.parse(fs.readFileSync(path.join(stateRoot, file), 'utf8'));
    jobs.set(job.recordingId, job);
  }
  const save = job => {
    job.notifyPending = true;
    const file = path.join(stateRoot, `${job.recordingId}.json`);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(job), { mode: 0o600 }); fs.renameSync(`${file}.tmp`, file);
    jobs.set(job.recordingId, job);
  };
  const snapshot = job => ({
    recordingId: job.recordingId, status: job.status, startedAt: job.startedAt, stoppedAt: job.stoppedAt,
    durationSeconds: job.durationSeconds || 0, storagePath: job.storagePath, sizeBytes: job.sizeBytes || 0, error: job.error || '',
  });
  const appRequest = (route, body) => fetch(`${env.RECORDING_APP_URL.replace(/\/$/, '')}${route}`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.RECORDING_WORKER_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const notifying = new Set();
  const notify = async job => {
    if (notifying.has(job.recordingId)) return;
    notifying.add(job.recordingId);
    const sent = JSON.stringify(snapshot(job));
    try {
      const response = await appRequest('/api/recording/callback', JSON.parse(sent));
      if (response.ok && sent === JSON.stringify(snapshot(job))) {
        job.notifyPending = false;
        const file = path.join(stateRoot, `${job.recordingId}.json`);
        fs.writeFileSync(`${file}.tmp`, JSON.stringify(job), { mode: 0o600 }); fs.renameSync(`${file}.tmp`, file);
      }
    } catch { /* Durable retry on the next sweep. */ }
    finally { notifying.delete(job.recordingId); }
  };
  // Jibri's stop endpoint is instance-wide. Serialize all calls and dedicate this
  // instance to this worker, never to the browser or the livestream service.
  let jibriQueue = Promise.resolve();
  const jibri = (method, payload) => {
    const operation = jibriQueue.then(async () => {
      const response = await fetch(`${env.JIBRI_SERVICE_URL.replace(/\/$/, '')}/jibri/api/v1.0/${method}`, {
        method: method === 'health' ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(env.JIBRI_API_SECRET ? { Authorization: `Bearer ${env.JIBRI_API_SECRET}` } : {}) },
        body: payload ? JSON.stringify(payload) : undefined, signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`Jibri ${method} failed (${response.status}).`);
    });
    jibriQueue = operation.catch(() => {});
    return operation;
  };
  const stop = async job => {
    if (terminal(job) || job.status === 'processing') return;
    // Persist intent before contacting Jibri, so restarts retry a failed stop.
    job.stopRequested = true; save(job);
    await jibri('stopService');
    if (terminal(job)) return;
    job.status = 'processing'; job.stoppedAt ||= new Date().toISOString(); save(job);
  };
  const cleanupMedia = job => {
    const directory = safeDirectory(root, job.recordingId);
    // Delete only this validated UUID directory, after upload has succeeded.
    if (fs.existsSync(directory)) fs.rmSync(directory, { recursive: true });
  };
  const processing = new Set();
  const finalize = async job => {
    if (processing.has(job.recordingId) || terminal(job)) return;
    processing.add(job.recordingId);
    try {
      const directory = safeDirectory(root, job.recordingId);
      const inputs = fs.existsSync(directory) ? fs.readdirSync(directory).filter(file => /\.(mp4|mkv|webm)$/i.test(file) && file !== 'meeting-output.mp4') : [];
      if (inputs.length !== 1) throw new Error('Recording media is missing or incomplete.');
      const input = path.join(directory, inputs[0]);
      if (fs.lstatSync(input).isSymbolicLink()) throw new Error('Invalid recording media.');
      const output = path.join(directory, 'meeting-output.mp4');
      if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw new Error('Invalid output path.');
      // H.264/AAC MP4 with faststart works in current mobile and desktop browsers.
      if (!job.outputReady || !fs.existsSync(output)) {
        await exec(env.FFMPEG_PATH || 'ffmpeg', ['-nostdin', '-y', '-i', input, '-t', String(job.maxDurationSeconds),
          '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
          '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2',
          '-b:v', '2200k', '-maxrate', '2800k', '-bufsize', '5600k', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', output],
        { timeout: 6 * 3600000, maxBuffer: 16 * 1024 * 1024 });
        job.outputReady = true; job.uploadUrl = null; save(job);
      }
      const { stdout } = await exec(env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', output]);
      const duration = Number(JSON.parse(stdout).format.duration);
      const size = fs.statSync(output).size;
      if (!Number.isFinite(duration) || duration <= 0 || size > job.maxBytes) throw new Error('Recording exceeded its reserved storage allowance.');
      const storagePath = `${job.recordingId}/meeting.mp4`;
      await uploadRecording({ file: output, size, storagePath, env, job, save });
      Object.assign(job, { status: 'ready', storagePath, sizeBytes: size, durationSeconds: Math.min(Math.ceil(duration), job.maxDurationSeconds), error: '' });
      save(job); cleanupMedia(job);
    } catch (error) {
      job.processingAttempts = (job.processingAttempts || 0) + 1;
      // Keep media for up to three processing/upload attempts, including restarts.
      if (job.processingAttempts >= 3) {
        job.status = 'failed'; job.error = 'Recording processing failed. Contact support.';
        job.durationSeconds = job.startedAt ? Math.min(job.maxDurationSeconds, Math.max(0, Math.ceil((Date.parse(job.stoppedAt) - Date.parse(job.startedAt)) / 1000))) : 0;
      }
      job.retryAfter = Date.now() + 30000; save(job);
      console.error(`[recording ${job.recordingId}] ${error.message}`);
    } finally { processing.delete(job.recordingId); void notify(job); }
  };
  let sweeping = false;
  let lastMaintenance = 0;
  const sweep = async () => {
    if (sweeping) return; sweeping = true;
    try {
      for (const job of jobs.values()) {
        try {
          if (job.notifyPending) void notify(job);
          if (terminal(job)) {
            // Failed raw media is retained for a day for operator recovery only.
            if (job.status === 'ready' || Date.now() - Date.parse(job.stoppedAt || job.createdAt) > 86400000) cleanupMedia(job);
            continue;
          }
          const directory = safeDirectory(root, job.recordingId);
          const finished = fs.existsSync(path.join(directory, '.finished'));
          if (finished && job.status !== 'processing') {
            job.status = 'processing'; job.stoppedAt ||= new Date().toISOString(); save(job);
          }
          if (job.status === 'starting' && fs.existsSync(directory)) {
            const media = fs.readdirSync(directory).find(file => /\.(mp4|mkv|webm)$/i.test(file));
            if (media && fs.statSync(path.join(directory, media)).size > 0) {
              job.status = 'recording'; job.startedAt = new Date().toISOString(); save(job);
            }
          }
          if (job.status !== 'processing' && (job.stopRequested || Date.now() >= job.deadline || (job.status === 'starting' && Date.now() - Date.parse(job.createdAt) > 120000))) await stop(job);
          if (job.status === 'processing' && Date.now() >= (job.retryAfter || 0)) void finalize(job);
        } catch (error) { console.error(`[recording ${job.recordingId}] ${error.message}`); }
      }
      if (Date.now() - lastMaintenance > 60000) {
        lastMaintenance = Date.now();
        void appRequest('/api/recording/maintenance', {}).catch(() => {});
      }
    } finally { sweeping = false; }
  };
  const server = http.createServer(async (request, response) => {
    const reply = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)); };
    if (!authorized(request.headers.authorization, env.RECORDING_WORKER_SECRET)) return reply(401, { error: 'Unauthorized' });
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/health') { await jibri('health'); return reply(200, { ok: true }); }
      if (request.method === 'POST' && url.pathname === '/recordings') {
        let input = '';
        for await (const chunk of request) { input += chunk; if (input.length > 8192) return reply(413, { error: 'Request too large.' }); }
        const body = JSON.parse(input); validateStart(body);
        const existing = jobs.get(body.recordingId);
        if (existing) return reply(200, snapshot(existing));
        if ([...jobs.values()].some(job => !terminal(job))) {
          // Persist rejected IDs so polling can release their app reservations.
          const rejected = { ...body, status: 'failed', error: 'Recorder is busy. Please try again shortly.', createdAt: new Date().toISOString(), durationSeconds: 0 };
          save(rejected); return reply(200, snapshot(rejected));
        }
        const job = { ...body, status: 'starting', createdAt: new Date().toISOString(), deadline: Date.now() + body.maxDurationSeconds * 1000 };
        save(job);
        void jibri('startService', {
          sessionId: job.recordingId, sinkType: 'file',
          callParams: { callUrlInfo: { baseUrl: env.JITSI_BASE_URL.replace(/\/$/, ''), callName: job.roomName } },
          callLoginParams: { domain: env.JIBRI_RECORDER_DOMAIN, username: env.JIBRI_RECORDER_USERNAME, password: env.JIBRI_RECORDER_PASSWORD },
        }).catch(async () => {
          // Timeout may mean capture started; attempt a stop and retain the lock if unavailable.
          job.stopRequested = true; save(job);
          try { await stop(job); } catch { /* Sweep retries. */ }
        });
        return reply(202, snapshot(job));
      }
      const match = url.pathname.match(/^\/recordings\/([a-f0-9-]+)(\/stop)?$/);
      if (match && UUID.test(match[1])) {
        let job = jobs.get(match[1]);
        if (request.method === 'POST' && match[2]) {
          if (!job) {
            // A stop racing an in-flight start creates a durable cancellation tombstone.
            job = { recordingId: match[1], status: 'failed', error: 'Recording was canceled before capture started.', createdAt: new Date().toISOString(), durationSeconds: 0 };
            save(job);
          } else await stop(job);
          return reply(200, snapshot(job));
        }
        if (request.method === 'GET' && !match[2]) return reply(200, job ? snapshot(job) : { recordingId: match[1], status: 'missing' });
      }
      reply(404, { error: 'Not found' });
    } catch (error) { reply(503, { error: 'Recording service request failed. Please retry.' }); }
  });
  const timer = setInterval(() => void sweep(), 1000);
  server.on('close', () => clearInterval(timer));
  return server;
}
if (require.main === module) {
  createService().listen(Number(process.env.RECORDING_PORT || 4020), process.env.RECORDING_HOST || '127.0.0.1', () => console.log('Recording worker listening'));
}
module.exports = { createService, validateStart, authorized, safeDirectory };
