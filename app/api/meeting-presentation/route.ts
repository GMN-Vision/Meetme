import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { verifyActiveMeetingDocumentToken } from '@/lib/meeting-document-access';
import { resolveSharedPresentationFile } from '@/lib/onlyoffice-server';
import { getPresentationKind } from '@/lib/shared-file-types';
import Meeting from '@/models/Meeting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authorize(request: Request, meetingId: string) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  return verifyActiveMeetingDocumentToken(token, meetingId);
}

function failure(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Unable to update the presentation.' },
    { status: 400 },
  );
}

function forParticipant(
  presentation: { path: string; name: string; updatedAt: Date | string; presenterKey?: string } | null | undefined,
  participantKey: string,
) {
  if (!presentation) return null;
  return {
    path: presentation.path,
    name: presentation.name,
    updatedAt: presentation.updatedAt,
    isPresenter: presentation.presenterKey === participantKey,
  };
}

export async function GET(request: Request) {
  try {
    const meetingId = new URL(request.url).searchParams.get('meetingId') || '';
    const access = await authorize(request, meetingId);
    await dbConnect();
    const meeting = await Meeting.findOne({ meetingId }).select('sharedPresentation').lean();
    return NextResponse.json({ presentation: forParticipant(meeting?.sharedPresentation, access.participantKey) }, {
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
    const access = await authorize(request, meetingId);
    let presentation: { path: string; name: string; presenterKey: string; updatedAt: Date } | null = null;
    if (body.path !== null) {
      if (typeof body.path !== 'string' || !body.path) {
        return NextResponse.json({ error: 'A shared file is required.' }, { status: 400 });
      }
      const file = await resolveSharedPresentationFile(body.path, meetingId);
      const kind = getPresentationKind(file.name);
      if (!kind || kind === 'media') {
        return NextResponse.json({ error: 'This file cannot be presented in the document viewer.' }, { status: 415 });
      }
      presentation = { path: file.path, name: file.name, presenterKey: access.participantKey, updatedAt: new Date() };
    }
    await dbConnect();
    const meeting = await Meeting.findOneAndUpdate(
      { meetingId, endedAt: null },
      { $set: { sharedPresentation: presentation } },
      { new: true },
    ).select('sharedPresentation').lean();
    if (!meeting) return NextResponse.json({ error: 'The meeting is unavailable.' }, { status: 404 });
    return NextResponse.json({ presentation: forParticipant(meeting.sharedPresentation, access.participantKey) }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return failure(error);
  }
}
