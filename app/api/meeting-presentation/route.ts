import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { verifyActiveMeetingDocumentToken } from '@/lib/meeting-document-access';
import { resolveOnlyOfficeFile, ONLYOFFICE_EXTENSIONS } from '@/lib/onlyoffice-server';
import Meeting from '@/models/Meeting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authorize(request: Request, meetingId: string) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  await verifyActiveMeetingDocumentToken(token, meetingId);
}

function failure(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Unable to update the presentation.' },
    { status: 400 },
  );
}

export async function GET(request: Request) {
  try {
    const meetingId = new URL(request.url).searchParams.get('meetingId') || '';
    await authorize(request, meetingId);
    await dbConnect();
    const meeting = await Meeting.findOne({ meetingId }).select('sharedPresentation').lean();
    return NextResponse.json({ presentation: meeting?.sharedPresentation || null }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const meetingId = typeof body.meetingId === 'string' ? body.meetingId : '';
    await authorize(request, meetingId);
    let presentation: { path: string; name: string; updatedAt: Date } | null = null;
    if (body.path !== null) {
      if (typeof body.path !== 'string' || !body.path) {
        return NextResponse.json({ error: 'A shared file is required.' }, { status: 400 });
      }
      const file = await resolveOnlyOfficeFile(body.path, meetingId);
      if (!ONLYOFFICE_EXTENSIONS.has(file.extension)) {
        return NextResponse.json({ error: 'Unsupported document type.' }, { status: 415 });
      }
      presentation = { path: file.path, name: file.name, updatedAt: new Date() };
    }
    await dbConnect();
    const meeting = await Meeting.findOneAndUpdate(
      { meetingId, endedAt: null },
      { $set: { sharedPresentation: presentation } },
      { new: true },
    ).select('sharedPresentation').lean();
    if (!meeting) return NextResponse.json({ error: 'The meeting is unavailable.' }, { status: 404 });
    return NextResponse.json({ presentation: meeting.sharedPresentation || null }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return failure(error);
  }
}
