export function formatFileBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2).replace(/\.00$/, '')} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1).replace(/\.0$/, '')} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

export async function uploadSharedFile(file: File, meetingId: string, progress: (percent: number) => void) {
  const start = await fetch('/api/files/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, size: file.size, meetingId }) });
  const upload = await start.json();
  if (!start.ok) throw new Error(upload.error || 'Unable to start upload');
  try {
    for (let offset = 0; offset < file.size; offset += upload.chunkBytes) {
      const response = await fetch(`/api/files/upload?path=${encodeURIComponent(upload.path)}&offset=${offset}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' },
        body: file.slice(offset, Math.min(file.size, offset + upload.chunkBytes)),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Upload failed');
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
