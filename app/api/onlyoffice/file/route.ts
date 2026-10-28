import { NextResponse } from 'next/server';
import { assertActiveMeetingParticipant } from '@/lib/meeting-document-access';
import {
  openOnlyOfficeFile,
  resolveOnlyOfficeFile,
  verifyOnlyOfficePayload,
} from '@/lib/onlyoffice-server';
import { PREVIEW_TYPES } from '@/lib/shared-file-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';

    if (!token) {
      return NextResponse.json({ error: 'Missing document token.' }, { status: 401 });
    }

    const payload = verifyOnlyOfficePayload(token);
    await assertActiveMeetingParticipant(payload.meetingId, payload.participantKey);
    const file = await resolveOnlyOfficeFile(payload.path, payload.meetingId);
    const opened = await openOnlyOfficeFile(file);

    const mime = PREVIEW_TYPES[file.extension] || 'application/octet-stream';

    return new Response(opened.stream, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(opened.size),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    // Do not expose filesystem paths, storage errors, or token details.
    return NextResponse.json(
      { error: 'The document link is invalid, expired, or unavailable.' },
      { status: 403 },
    );
  }
}
