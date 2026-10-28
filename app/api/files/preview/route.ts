import { NextResponse } from 'next/server';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { verifyActiveMeetingDocumentToken } from '@/lib/meeting-document-access';
import SharedFile from '@/models/SharedFile';
import dbConnect from '@/lib/db';
import { diskPath } from '@/lib/server-file-storage';
import { supabaseServer } from '@/lib/supabaseServer';
import { MEETING_FILES_BUCKET, getMeetingStorageRoot } from '@/lib/meeting-storage';
import { PREVIEW_TYPES, sharedFileExtension } from '@/lib/shared-file-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PREVIEW_BYTES = 100 * 1024 ** 2;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('path') || '';
    const meetingId = url.searchParams.get('meetingId') || '';

    if (!key || !meetingId || key.length > 1024 ||
        key.includes('\\') ||
        key.split('/').some(part => part === '.' || part === '..')) {
      return NextResponse.json({ error: 'Invalid meeting file reference.' }, { status: 400 });
    }

    const authorization = request.headers.get('authorization') || '';
    const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

    try {
      await verifyActiveMeetingDocumentToken(accessToken, meetingId);
    } catch {
      return NextResponse.json({ error: 'Meeting document access is invalid or expired.' }, { status: 403 });
    }

    let name = '';
    let size = 0;
    let body: ReadableStream;

    if (key.startsWith('local/')) {
      const location = diskPath(key);
      await dbConnect();

      const file = await SharedFile.findOne({
        path: key,
        meetingId,
        ready: true,
      }).lean();

      if (!file) {
        return NextResponse.json({ error: 'File not found in this meeting.' }, { status: 404 });
      }

      name = file.name;
      size = file.size;

      const info = await stat(location).catch(() => null);
      if (!info?.isFile() || info.size !== file.size) {
        return NextResponse.json({ error: 'File is unavailable or incomplete.' }, { status: 404 });
      }
      if (size > MAX_PREVIEW_BYTES) {
        return NextResponse.json({ error: 'Preview supports files up to 100 MB.' }, { status: 413 });
      }

      body = Readable.toWeb(createReadStream(location)) as ReadableStream;
    } else {
      const storageRoot = getMeetingStorageRoot('meeting', meetingId);
      if (!key.startsWith(storageRoot + '/') || key.length <= storageRoot.length + 1) {
        return NextResponse.json({ error: 'File does not belong to this meeting.' }, { status: 404 });
      }

      name = key.split('/').pop() || '';
      const { data, error } = await supabaseServer.storage
        .from(MEETING_FILES_BUCKET)
        .download(key);

      if (error || !data) {
        return NextResponse.json({ error: 'File not found.' }, { status: 404 });
      }
      size = data.size;
      if (size > MAX_PREVIEW_BYTES) {
        return NextResponse.json({ error: 'Preview supports files up to 100 MB.' }, { status: 413 });
      }
      body = data.stream();
    }

    const extension = sharedFileExtension(name);
    const mime = PREVIEW_TYPES[extension];

    // This endpoint is for safe inline image/PDF previews, not arbitrary HTML.
    if (!(mime === 'application/pdf' || mime?.startsWith('image/'))) {
      return NextResponse.json({ error: 'This file type cannot be previewed here.' }, { status: 415 });
    }

    const safeName = encodeURIComponent(name).replace(/['()*]/g, c =>
      '%' + c.charCodeAt(0).toString(16)
    );

    return new Response(body, {
      headers: {
        'Content-Type': mime,
        'Content-Length': String(size),
        'Content-Disposition': `inline; filename*=UTF-8''${safeName}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Unable to load this meeting preview.' }, { status: 500 });
  }
}
