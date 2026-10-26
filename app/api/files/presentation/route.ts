import { NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import SharedFile from '@/models/SharedFile';
import dbConnect from '@/lib/db';
import { diskPath } from '@/lib/server-file-storage';
import { supabaseServer } from '@/lib/supabaseServer';
import { MEETING_FILES_BUCKET } from '@/lib/meeting-storage';
import { sharedFileExtension } from '@/lib/shared-file-types';
import { convertPresentationToPdf } from '@/lib/powerpoint-presentation';

export const runtime = 'nodejs';
export const maxDuration = 90;
const MAX_SLIDES_BYTES = 100 * 1024 ** 2;

// Uses the same shared-file access model as the existing download route.
export async function GET(request: Request) {
  try {
    const key = new URL(request.url).searchParams.get('path') || '';
    if (!key) return NextResponse.json({ error: 'A shared presentation is required.' }, { status: 400 });
    let name: string;
    let bytes: Uint8Array;
    if (key.startsWith('local/')) {
      const location = diskPath(key);
      await dbConnect();
      const file = await SharedFile.findOne({ path: key, ready: true }).lean();
      if (!file) return NextResponse.json({ error: 'Shared presentation not found.' }, { status: 404 });
      name = file.name;
      if (file.size > MAX_SLIDES_BYTES) return NextResponse.json({ error: 'Slide previews support presentations up to 100 MB. You can still download this file.' }, { status: 413 });
      if ((await stat(location)).size !== file.size) return NextResponse.json({ error: 'Shared presentation is incomplete.' }, { status: 404 });
      bytes = await readFile(location);
    } else {
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
