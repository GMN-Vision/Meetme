import { createReadStream } from 'node:fs';
import { lstat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export async function localRecordingFile(recordingId: string) {
  if (!UUID.test(recordingId)) return null;
  const root = path.resolve(process.env.RECORDING_STORAGE_DIR || process.env.JIBRI_RECORDINGS_PATH || '/srv/melanam/recordings');
  const directory = path.join(root, recordingId);
  const file = path.join(directory, 'meeting-output.mp4');
  try {
    const [rootInfo, directoryInfo, fileInfo] = await Promise.all([lstat(root), lstat(directory), lstat(file)]);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || !directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() ||
        !fileInfo.isFile() || fileInfo.isSymbolicLink() || fileInfo.size <= 0) return null;
    return { file, size: fileInfo.size };
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export function localRecordingResponse(request: Request, file: string, size: number, filename: string) {
  const range = request.headers.get('range');
  let start = 0, end = size - 1;
  const headers = new Headers({
    'Accept-Ranges': 'bytes', 'Content-Type': 'video/mp4',
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${new URL(request.url).searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
  });
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      headers.set('Content-Range', `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    if (!match[1]) {
      const length = Number(match[2]);
      if (!Number.isSafeInteger(length) || length <= 0) {
        headers.set('Content-Range', `bytes */${size}`);
        return new Response(null, { status: 416, headers });
      }
      start = Math.max(0, size - length);
    } else {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : end;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) {
        headers.set('Content-Range', `bytes */${size}`);
        return new Response(null, { status: 416, headers });
      }
      end = Math.min(end, size - 1);
    }
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  }
  headers.set('Content-Length', String(end - start + 1));
  const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
  return new Response(stream, { status: range ? 206 : 200, headers });
}

export async function deleteLocalRecording(file: string) {
  await unlink(file);
}
