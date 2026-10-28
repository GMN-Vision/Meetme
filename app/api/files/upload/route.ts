import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getWorkspaceQuota, assertStorageCapacity } from '@/lib/workspace-usage';
import { CHUNK_BYTES, FILE_LIMITS, diskPath, withStorageLock, cleanupExpiredUploads } from '@/lib/server-file-storage';
import { getMeetingStorageRoot } from '@/lib/meeting-storage';
import SharedFile from '@/models/SharedFile';
import { mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import dbConnect from '@/lib/db';

export const runtime = 'nodejs';

async function identity() {
  const session = await getServerSession(authOptions);
  return { email: String(session?.user?.email || '').toLowerCase(), admin: (session?.user as any)?.role === 'admin' };
}

// Reserve the full file size before accepting bytes. Each PUT is at most 4 MiB.
export async function POST(req: Request) {
  try {
    const user = await identity();
    if (!user.email) return NextResponse.json({ error: 'Sign in to upload files' }, { status: 401 });
    const { meetingId, name, size } = await req.json();
    if (typeof name !== 'string' || !name.trim() || name.length > 255 || !Number.isSafeInteger(size) || size < 1) {
      return NextResponse.json({ error: 'A file name and positive file size are required' }, { status: 400 });
    }
    getMeetingStorageRoot('meeting', String(meetingId || ''));
    const quota = await getWorkspaceQuota(user.email, user.admin);
    if (!quota?.planDefinition.features.files) return NextResponse.json({ error: 'File sharing is not included in your plan' }, { status: 402 });
    if (size > FILE_LIMITS[quota.plan]) return NextResponse.json({ error: 'This file exceeds your plan\'s per-file limit' }, { status: 413 });
    await cleanupExpiredUploads();
    return await withStorageLock(`workspace:${quota.scope}:${quota.scopeId}`, async () => {
      const capacity = await assertStorageCapacity(user.email, size, user.admin);
      if (!capacity.ok) return NextResponse.json({ error: capacity.error }, { status: 402 });
      const key = `local/${meetingId}/${randomUUID()}`;
      await mkdir(path.dirname(diskPath(key)), { recursive: true });
      const handle = await open(diskPath(key), 'wx');
      await handle.close();
      try {
        await SharedFile.create({ path: key, meetingId, name, size, ownerEmail: user.email,
          workspace: `${quota.scope}:${quota.scopeId}`, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) });
      } catch (error) { await unlink(diskPath(key)); throw error; }
      return NextResponse.json({ path: key, chunkBytes: CHUNK_BYTES });
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Unable to start upload' }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await identity();
    if (!user.email) return NextResponse.json({ error: 'Sign in to upload files' }, { status: 401 });
    const url = new URL(req.url);
    const key = url.searchParams.get('path') || '';
    diskPath(key);
    const offset = Number(url.searchParams.get('offset'));
    if (!Number.isSafeInteger(offset) || offset < 0) return NextResponse.json({ error: 'Invalid offset' }, { status: 400 });
    await dbConnect();
    return await withStorageLock(key, async () => {
      const file = await SharedFile.findOne({ path: key, ownerEmail: user.email, ready: false, expiresAt: { $gt: new Date() } });
      if (!file) return NextResponse.json({ error: 'Upload not found or expired' }, { status: 404 });
      if (offset !== file.offset) return NextResponse.json({ error: 'Upload offset mismatch' }, { status: 409 });
      if (!req.body) return NextResponse.json({ error: 'Missing file data' }, { status: 400 });
      const reader = req.body.getReader();
      const handle = await open(diskPath(key), 'r+');
      let received = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (received + value.byteLength > CHUNK_BYTES || offset + received + value.byteLength > file.size) {
            await reader.cancel();
            throw new Error('Upload chunk exceeds allowed size');
          }
          let written = 0;
          while (written < value.byteLength) {
            const result = await handle.write(value, written, value.byteLength - written, offset + received + written);
            if (!result.bytesWritten) throw new Error('Unable to write upload');
            written += result.bytesWritten;
          }
          received += value.byteLength;
        }
        if (!received) throw new Error('Empty upload chunk');
        await handle.sync();
        file.offset += received;
        file.ready = file.offset === file.size;
        await file.save();
        return NextResponse.json({ path: key, offset: file.offset, ready: file.ready });
      } finally { await handle.close(); reader.releaseLock(); }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 400 });
  }
}
