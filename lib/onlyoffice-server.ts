import {
  createHmac,
  createHash,
  timingSafeEqual,
} from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';

import dbConnect from '@/lib/db';
import Meeting from '@/models/Meeting';
import SharedFile from '@/models/SharedFile';
import { diskPath } from '@/lib/server-file-storage';
import { supabaseServer } from '@/lib/supabaseServer';
import { MEETING_FILES_BUCKET, getMeetingStorageRoot } from '@/lib/meeting-storage';
import { sharedFileExtension } from '@/lib/shared-file-types';

export const ONLYOFFICE_EXTENSIONS = new Set([
  'doc', 'docx', 'docm', 'odt', 'rtf', 'txt',
  'html', 'htm', 'xps',
  'xls', 'xlsx', 'xlsm', 'ods', 'csv', 'tsv',
  'ppt', 'pptx', 'pps', 'ppsx', 'odp',
  'pdf',
]);

export type OnlyOfficeFile = {
  path: string;
  meetingId: string;
  name: string;
  extension: string;
  size: number | null;
  modifiedAt: number | null;
  localPath?: string;
  storage: 'local' | 'supabase';
};

export function onlyOfficeSecret() {
  const secret = process.env.ONLYOFFICE_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('ONLYOFFICE server secret is not configured correctly.');
  }
  return secret;
}

function encode(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

export function signOnlyOfficePayload(payload: Record<string, unknown>) {
  const body = encode(JSON.stringify(payload));
  const signature = createHmac('sha256', onlyOfficeSecret())
    .update(body)
    .digest('base64url');

  return `${body}.${signature}`;
}

export function verifyOnlyOfficePayload(token: string) {
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Invalid or expired document link.');

  const [body, signature] = parts;
  const expected = createHmac('sha256', onlyOfficeSecret())
    .update(body)
    .digest();

  let actual: Buffer;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    throw new Error('Invalid document link.');
  }

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('Invalid document link.');
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));

  if (
    payload?.purpose !== 'onlyoffice-file' ||
    typeof payload.path !== 'string' ||
    typeof payload.meetingId !== 'string' ||
    typeof payload.participantKey !== 'string' ||
    !payload.participantKey ||
    payload.participantKey.length > 200 ||
    typeof payload.exp !== 'number' ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error('Invalid or expired document link.');
  }

  return payload as {
    purpose: string;
    path: string;
    meetingId: string;
    participantKey: string;
    exp: number;
  };
}

export function signOnlyOfficeConfig(config: Record<string, any>) {
  const header = encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = encode(JSON.stringify(config));
  const message = `${header}.${payload}`;

  const signature = createHmac('sha256', onlyOfficeSecret())
    .update(message)
    .digest('base64url');

  return `${message}.${signature}`;
}

export async function resolveOnlyOfficeFile(
  key: string,
  meetingId: string,
): Promise<OnlyOfficeFile> {
  if (
    !meetingId ||
    !/^[a-zA-Z0-9_-]+$/.test(meetingId) ||
    !key ||
    key.length > 1024 ||
    key.includes('\\') ||
    key.split('/').some((part) => part === '.' || part === '..')
  ) {
    throw new Error('Invalid shared-file reference.');
  }

  await dbConnect();

  const meeting = await Meeting.findOne({ meetingId }).lean();

  if (!meeting || meeting.endedAt) {
    throw new Error('This meeting is unavailable.');
  }

  if (
    meeting.activeSessionEndsAt &&
    new Date(meeting.activeSessionEndsAt).getTime() <= Date.now()
  ) {
    throw new Error('This meeting has ended.');
  }

  if (key.startsWith('local/')) {
    const file = await SharedFile.findOne({
      path: key,
      meetingId,
      ready: true,
    }).lean();

    if (!file) throw new Error('Shared file not found.');

    const location = diskPath(key);
    const info = await stat(location).catch(() => null);

    if (!info?.isFile() || info.size !== file.size) {
      throw new Error('The shared file is unavailable or incomplete.');
    }

    const extension = sharedFileExtension(file.name);

    if (!ONLYOFFICE_EXTENSIONS.has(extension)) {
      throw new Error('This file type is not supported by the document viewer.');
    }

    return {
      path: key,
      meetingId,
      name: file.name,
      extension,
      size: info.size,
      modifiedAt: info.mtimeMs,
      localPath: location,
      storage: 'local',
    };
  }

  // Legacy Supabase files must be located inside this meeting's folder.
  const root = getMeetingStorageRoot('meeting', meetingId);

  if (!key.startsWith(`${root}/`) || key.length <= root.length + 1) {
    throw new Error('The shared file does not belong to this meeting.');
  }

  const name = path.posix.basename(key);
  const extension = sharedFileExtension(name);

  if (!name || !ONLYOFFICE_EXTENSIONS.has(extension)) {
    throw new Error('This file type is not supported by the document viewer.');
  }

  return {
    path: key,
    meetingId,
    name,
    extension,
    size: null,
    modifiedAt: null,
    storage: 'supabase',
  };
}

export async function openOnlyOfficeFile(file: OnlyOfficeFile) {
  if (file.storage === 'local' && file.localPath) {
    const info = await stat(file.localPath).catch(() => null);

    if (!info?.isFile() || info.size !== file.size) {
      throw new Error('The shared file is no longer available.');
    }

    return {
      stream: Readable.toWeb(createReadStream(file.localPath)) as ReadableStream,
      size: info.size,
    };
  }

  const { data, error } = await supabaseServer.storage
    .from(MEETING_FILES_BUCKET)
    .download(file.path);

  if (error || !data) {
    throw new Error('The shared file could not be retrieved from storage.');
  }

  return {
    stream: data.stream(),
    size: data.size,
  };
}

export function onlyOfficeDocumentKey(meetingId: string, file: OnlyOfficeFile) {
  return createHash('sha256')
    .update(`${meetingId}:${file.path}:${file.size ?? 'legacy'}`)
    .digest('hex')
    .slice(0, 40);
}
