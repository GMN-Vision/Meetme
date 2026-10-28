import { NextResponse } from 'next/server';
import { verifyActiveMeetingDocumentToken } from '@/lib/meeting-document-access';
import {
  ONLYOFFICE_EXTENSIONS,
  onlyOfficeDocumentKey,
  resolveOnlyOfficeFile,
  signOnlyOfficeConfig,
  signOnlyOfficePayload,
} from '@/lib/onlyoffice-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function documentType(extension: string) {
  if (['pdf'].includes(extension)) return 'pdf';

  if (['xls', 'xlsx', 'xlsm', 'ods', 'csv', 'tsv'].includes(extension)) {
    return 'cell';
  }

  if (['ppt', 'pptx', 'pps', 'ppsx', 'odp'].includes(extension)) {
    return 'slide';
  }

  return 'word';
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const path = url.searchParams.get('path') || '';
    const meetingId = url.searchParams.get('meetingId') || '';

    if (!path || !meetingId) {
      return NextResponse.json(
        { error: 'A meeting and shared file are required.' },
        { status: 400 },
      );
    }

    const authorization = request.headers.get('authorization') || '';
    const accessToken = authorization.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';

    const access = await verifyActiveMeetingDocumentToken(accessToken, meetingId);
    const file = await resolveOnlyOfficeFile(path, meetingId);

    if (!ONLYOFFICE_EXTENSIONS.has(file.extension)) {
      return NextResponse.json(
        { error: 'Unsupported document type.' },
        { status: 415 },
      );
    }

    const appBase = process.env.NEXTAUTH_URL;

    if (!appBase) {
      throw new Error('The Melanam application URL is not configured.');
    }

    const baseUrl = new URL(appBase);

    if (baseUrl.protocol !== 'https:' || baseUrl.hostname !== 'melanam.com') {
      throw new Error('The configured Melanam application URL is invalid.');
    }

    // The Document Server downloads the file server-to-server, so its URL
    // uses a short-lived signed token instead of a browser session cookie.
    const fileToken = signOnlyOfficePayload({
      purpose: 'onlyoffice-file',
      path: file.path,
      meetingId: file.meetingId,
      participantKey: access.participantKey,
      exp: Math.floor(Date.now() / 1000) + 10 * 60,
    });

    const documentUrl = new URL('/api/onlyoffice/file', baseUrl);
    documentUrl.searchParams.set('token', fileToken);

    const config: Record<string, any> = {
      documentType: documentType(file.extension),
      document: {
        fileType: file.extension,
        key: onlyOfficeDocumentKey(meetingId, file),
        title: file.name,
        url: documentUrl.toString(),
        permissions: {
          edit: false,
          download: true,
          print: true,
          review: false,
          comment: false,
        },
      },
      editorConfig: {
        mode: 'view',
        lang: 'en',
        user: {
          id: `viewer-${onlyOfficeDocumentKey(meetingId, file).slice(0, 16)}`,
          name: 'Melanam meeting participant',
        },
      },
      height: '100%',
      width: '100%',
    };

    config.token = signOnlyOfficeConfig(config);

    return NextResponse.json(
      { config, name: file.name, documentType: config.documentType },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: any) {
    const message = error?.message || 'Unable to prepare the document.';
    const status = /not found|unavailable|ended|does not belong/i.test(message)
      ? 404
      : /secret|configured|invalid/i.test(message)
        ? 503
        : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
