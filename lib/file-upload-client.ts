export function formatFileBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2).replace(/\.00$/, '')} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1).replace(/\.0$/, '')} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

async function uploadResponse(response: Response, fallback: string) {
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = response.status === 413
      ? 'The server rejected the upload size. Try a smaller file or check the server upload limit.'
      : response.status === 401
        ? 'Sign in again before uploading files.'
        : `${fallback} (HTTP ${response.status}). Please try again.`;
    throw new Error(result?.error || message);
  }
  if (!result || typeof result !== 'object') throw new Error('The upload server returned an invalid response. Please try again.');
  return result;
}

export async function uploadSharedFile(file: File, meetingId: string, progress: (percent: number) => void) {
  const start = await fetch('/api/files/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, size: file.size, meetingId }) });
  const upload = await uploadResponse(start, 'Unable to start upload');
  try {
    if (typeof upload.path !== 'string' || !Number.isSafeInteger(upload.chunkBytes) || upload.chunkBytes < 1) {
      throw new Error('The upload server returned an invalid upload configuration.');
    }
    let chunkBytes = upload.chunkBytes;
    for (let offset = 0; offset < file.size;) {
      const end = Math.min(file.size, offset + chunkBytes);
      const response = await fetch(`/api/files/upload?path=${encodeURIComponent(upload.path)}&offset=${offset}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' },
        body: file.slice(offset, end),
      });
      // A proxy may have a lower request-body limit than the app. A 413 means
      // this request was rejected; retry the same offset with fewer bytes.
      if (response.status === 413 && end - offset > 64 * 1024) {
        await response.body?.cancel();
        chunkBytes = Math.max(64 * 1024, Math.floor((end - offset) / 2));
        continue;
      }
      const result = await uploadResponse(response, 'Upload failed');
      if (result.offset !== end) throw new Error('The server did not confirm the uploaded bytes. Please try again.');
      offset = result.offset;
      progress(Math.round(result.offset / file.size * 100));
    }
    return upload;
  } catch (error) {
    // Release reserved storage after a cancelled or failed upload.
    await fetch('/api/files/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: upload.path }) }).catch(() => null);
    throw error;
  }
}
