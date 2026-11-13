import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { verifyActiveMeetingDocumentToken } from '@/lib/meeting-document-access';
import { resolveSharedPresentationFile } from '@/lib/onlyoffice-server';
import { getPresentationKind } from '@/lib/shared-file-types';
import Meeting from '@/models/Meeting';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { consumeMeetingApproval } from '@/lib/meeting-approval-access';

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
  presentation: { path: string; name: string; page?: number; updatedAt: Date | string; presenterKey?: string } | null | undefined,
  participantKey: string,
) {
  if (!presentation) return null;
  if (typeof presentation.path !== 'string' || !presentation.path || typeof presentation.name !== 'string' || !presentation.name) return null;
  return {
    path: presentation.path,
    name: presentation.name,
    page: presentation.page || 1,
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
    await dbConnect();
    const activeMeeting = await Meeting.findOne({ meetingId, endedAt: null }).select('hostEmail');
    if (!activeMeeting) return NextResponse.json({ error: 'The meeting is unavailable.' }, { status: 404 });
    const session = await getServerSession(authOptions);
    const isHost = String(session?.user?.email || '').toLowerCase() === String(activeMeeting.hostEmail).toLowerCase();
    let presentation: { path: string; name: string; presenterKey: string; page: number; updatedAt: Date } | null = null;
    if (body.path !== null) {
      if (typeof body.path !== 'string' || !body.path) {
        return NextResponse.json({ error: 'A shared file is required.' }, { status: 400 });
      }
      const file = await resolveSharedPresentationFile(body.path, meetingId);
      const kind = getPresentationKind(file.name);
      if (!kind || kind === 'media') {
        return NextResponse.json({ error: 'This file cannot be presented in the document viewer.' }, { status: 415 });
      }
      if (kind === 'slides' && !isHost) {
        return NextResponse.json({ error: 'Only the host can present PowerPoint slides.' }, { status: 403 });
      }
      if (!isHost) {
        const approved = await consumeMeetingApproval({ meetingId, approvalId: String(body.approvalId || ''), type: 'present', requesterKey: access.participantKey, payload: { path: file.path } });
        if (!approved) return NextResponse.json({ error: 'Host approval is required to present this file.' }, { status: 403 });
      }
      presentation = { path: file.path, name: file.name, presenterKey: access.participantKey, page: 1, updatedAt: new Date() };
    } else if (!isHost) {
      return NextResponse.json({ error: 'Only the host can stop the shared presentation.' }, { status: 403 });
    }
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

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const meetingId = typeof body.meetingId === 'string' ? body.meetingId : '';
    const page = Number(body.page);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000) {
      return NextResponse.json({ error: 'Invalid page number.' }, { status: 400 });
    }
    const access = await authorize(request, meetingId);
    await dbConnect();
    const meeting = await Meeting.findOneAndUpdate(
      { meetingId, endedAt: null, 'sharedPresentation.presenterKey': access.participantKey, 'sharedPresentation.path': body.path },
      { $set: { 'sharedPresentation.page': page } },
      { new: true },
    ).select('sharedPresentation').lean();
    if (!meeting?.sharedPresentation) return NextResponse.json({ error: 'Only the current presenter can change pages.' }, { status: 403 });
    return NextResponse.json({ presentation: forParticipant(meeting.sharedPresentation, access.participantKey) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
