const fs = require('node:fs/promises');

// Supabase requires 6 MiB TUS chunks. Persist the URL so a worker restart can
// resume a multi-GB recording without buffering the whole file or starting over.
async function uploadRecording({ file, size, storagePath, env, job, save }) {
  const endpoint = env.SUPABASE_UPLOAD_URL || `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/upload/resumable`;
  const headers = { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY, 'Tus-Resumable': '1.0.0', 'x-upsert': 'true' };
  let offset = 0;
  if (job.uploadUrl) {
    if (new URL(job.uploadUrl).origin !== new URL(endpoint).origin) throw new Error('Invalid upload origin.');
    const response = await fetch(job.uploadUrl, { method: 'HEAD', headers, signal: AbortSignal.timeout(30000) });
    if (response.status === 404 || response.status === 410) { job.uploadUrl = null; save(job); }
    else {
      if (!response.ok) throw new Error(`Unable to resume upload (${response.status}).`);
      offset = Number(response.headers.get('Upload-Offset'));
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > size) throw new Error('Invalid upload offset.');
    }
  }
  if (!job.uploadUrl) {
    const metadata = { bucketName: 'meeting-recordings', objectName: storagePath, contentType: 'video/mp4', cacheControl: '300' };
    const response = await fetch(endpoint, {
      method: 'POST', headers: { ...headers, 'Upload-Length': String(size),
        'Upload-Metadata': Object.entries(metadata).map(([key, value]) => `${key} ${Buffer.from(value).toString('base64')}`).join(',') },
      signal: AbortSignal.timeout(30000),
    });
    const location = response.headers.get('Location');
    if (!response.ok || !location) throw new Error(`Unable to create upload (${response.status}).`);
    const uploadUrl = new URL(location, endpoint);
    if (uploadUrl.origin !== new URL(endpoint).origin) throw new Error('Invalid upload origin.');
    job.uploadUrl = uploadUrl.href; save(job);
  }
  const handle = await fs.open(file, 'r');
  try {
    const buffer = Buffer.alloc(6 * 1024 * 1024);
    while (offset < size) {
      const length = Math.min(buffer.length, size - offset);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      if (bytesRead !== length) throw new Error('Recording file changed during upload.');
      const response = await fetch(job.uploadUrl, {
        method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/offset+octet-stream', 'Upload-Offset': String(offset) },
        body: buffer.subarray(0, bytesRead), signal: AbortSignal.timeout(120000),
      });
      if (!response.ok || Number(response.headers.get('Upload-Offset')) !== offset + bytesRead) throw new Error(`Upload chunk failed (${response.status}).`);
      offset += bytesRead;
    }
  } finally { await handle.close(); }
}
module.exports = { uploadRecording };
