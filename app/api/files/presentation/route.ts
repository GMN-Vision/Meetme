import { NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import { verifyActiveMeetingDocumentToken } from '@/lib/meeting-document-access';
import SharedFile from '@/models/SharedFile';
import dbConnect from '@/lib/db';
import { diskPath } from '@/lib/server-file-storage';
import { supabaseServer } from '@/lib/supabaseServer';
import {
  MEETING_FILES_BUCKET,
  getMeetingStorageRoot,
} from '@/lib/meeting-storage';
import { sharedFileExtension } from '@/lib/shared-file-types';
import { convertPresentationToPdf } from '@/lib/powerpoint-presentation';

export const runtime = 'nodejs';
export const maxDuration = 90;
const MAX_SLIDES_BYTES = 100 * 1024 ** 2;

// Uses the same shared-file access model as the existing download route.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('path') || '';
    const meetingId = url.searchParams.get('meetingId') || '';

    if (!key || !meetingId) {
      return NextResponse.json(
        { error: 'A meeting and shared presentation are required.' },
        { status: 400 },
      );
    }

    if (
      key.length > 1024 ||
      key.includes('\\') ||
      key.split('/').some((part) => part === '.' || part === '..')
    ) {
      return NextResponse.json({ error: 'Invalid shared-file reference.' }, { status: 400 });
    }

    const authorization = request.headers.get('authorization') || '';
    const accessToken = authorization.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';

    try {
      await verifyActiveMeetingDocumentToken(accessToken, meetingId);
    } catch {
      return NextResponse.json(
        { error: 'Your meeting document access is invalid or expired.' },
        { status: 403 },
      );
    }

    let name: string;
    let bytes: Uint8Array;
    if (key.startsWith('local/')) {
      const location = diskPath(key);
      await dbConnect();
      const file = await SharedFile.findOne({
        path: key,
        meetingId,
        ready: true,
      }).lean();
      if (!file) return NextResponse.json({ error: 'Shared presentation not found.' }, { status: 404 });
      name = file.name;
      if (file.size > MAX_SLIDES_BYTES) return NextResponse.json({ error: 'Slide previews support presentations up to 100 MB. You can still download this file.' }, { status: 413 });
      if ((await stat(location)).size !== file.size) return NextResponse.json({ error: 'Shared presentation is incomplete.' }, { status: 404 });
      bytes = await readFile(location);
    } else {
      const root = getMeetingStorageRoot('meeting', meetingId);
      if (!key.startsWith(`${root}/`) || key.length <= root.length + 1) {
        return NextResponse.json(
          { error: 'The shared presentation does not belong to this meeting.' },
          { status: 404 },
        );
      }

      name = key.split('/').pop() || '';
      const { data, error } = await supabaseServer.storage.from(MEETING_FILES_BUCKET).download(key);
      if (error || !data) return NextResponse.json({ error: 'Shared presentation not found.' }, { status: 404 });
      if (data.size > MAX_SLIDES_BYTES) return NextResponse.json({ error: 'Slide previews support presentations up to 100 MB.' }, { status: 413 });
      bytes = new Uint8Array(await data.arrayBuffer());
    }
    const extension = sharedFileExtension(name);
    if (!['ppt', 'pptx', 'pps', 'ppsx', 'odp'].includes(extension)) {
      return NextResponse.json({ error: 'Select a PowerPoint or OpenDocument presentation.' }, { status: 400 });
    }
    const pdf = await convertPresentationToPdf(bytes, extension);
    return new Response(new Uint8Array(pdf), { headers: {
      'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="slides.pdf"',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Unable to prepare this presentation.' }, { status: 503 });
  }
}
