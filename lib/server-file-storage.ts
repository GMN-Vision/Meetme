import { createReadStream } from 'node:fs';
import { mkdir, open, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import SharedFile from '@/models/SharedFile';
import dbConnect from '@/lib/db';

export const CHUNK_BYTES = 4 * 1024 * 1024;
export const FILE_LIMITS = { free: 100 * 1024 ** 2, pro: 1024 ** 3, business: 5 * 1024 ** 3, enterprise: 10 * 1024 ** 3 };
export const storageRoot = () => path.resolve(process.env.FILE_STORAGE_PATH || path.join(process.cwd(), 'data', 'meeting-files'));

export function diskPath(key: string) {
  if (!/^local\/[a-zA-Z0-9_-]+\/[a-f0-9-]{36}$/.test(key)) throw new Error('Invalid file path');
  return path.join(storageRoot(), ...key.split('/'));
}

// Exclusive filesystem locks coordinate quota reservations and writes across Node workers.
// All application instances must use the same persistent volume.
export async function withStorageLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  const directory = path.join(storageRoot(), '.locks');
  await mkdir(directory, { recursive: true });
  const lockPath = path.join(directory, createHash('sha256').update(key).digest('hex'));
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (error: any) {
    if (error.code === 'EEXIST') throw new Error('Another upload is being processed. Please try again.');
    throw error;
  }
  try { return await action(); }
  finally { await lock.close(); await unlink(lockPath); }
}

export async function cleanupExpiredUploads() {
  await dbConnect();
  const expired = await SharedFile.find({ ready: false, expiresAt: { $lte: new Date() } }).lean();
  for (const file of expired) {
    try {
      await withStorageLock(file.path, async () => {
        const stillExpired = await SharedFile.exists({ _id: file._id, ready: false, expiresAt: { $lte: new Date() } });
        if (!stillExpired) return;
        await unlink(diskPath(file.path)).catch((error) => { if (error.code !== 'ENOENT') throw error; });
        await SharedFile.deleteOne({ _id: file._id, ready: false });
      });
    } catch { /* An active writer owns the lock; retry on the next upload. */ }
  }
}

export async function localDownload(key: string, request?: Request) {
  await dbConnect();
  const file = await SharedFile.findOne({ path: key, ready: true }).lean();
  if (!file) return new Response('File not found', { status: 404 });
  const location = diskPath(key);
  const info = await stat(location).catch(() => null);
  if (!info?.isFile() || info.size !== file.size) return new Response('File not found', { status: 404 });
  let start = 0, end = file.size - 1;
  const range = request?.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${file.size}` } });
    start = match[1] ? Number(match[1]) : Math.max(0, file.size - Number(match[2]));
    end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= file.size || end < start) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${file.size}` } });
    }
  }
  const stream = Readable.toWeb(createReadStream(location, { start, end })) as ReadableStream;
  return new Response(stream, { status: range ? 206 : 200, headers: {
    'Content-Type': 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${file.size}` } : {}),
    'Content-Length': String(end - start + 1),
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}
