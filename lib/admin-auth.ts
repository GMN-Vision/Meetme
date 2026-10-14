import crypto from 'crypto';
import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth-options';

const ADMIN_COOKIE = 'melanam_admin_session';

function getSecret() {
  return process.env.ADMIN_PANEL_SECRET || process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET || 'change-me';
}

function getConfiguredAdmin() {
  return {
    username: (process.env.ADMIN_PANEL_USERNAME || '').trim(),
    password: process.env.ADMIN_PANEL_PASSWORD || '',
  };
}

export function createAdminToken(username: string) {
  const payload = JSON.stringify({ username, iat: Date.now() });
  const encoded = Buffer.from(payload).toString('base64url');
  const signature = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyAdminToken(token: string | undefined | null) {
  if (!token) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  const actualSignature = Buffer.from(signature);
  const expectedSignature = Buffer.from(expected);
  if (actualSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(actualSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as { username?: string; iat?: number };
    if (!payload.username) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getAdminAuthorization(request?: Request) {
  const session = await getServerSession(authOptions);
  if (session && (session.user as any)?.role === 'admin') {
    return { authorized: true, source: 'nextauth' as const, username: session.user?.email || 'admin' };
  }

  const cookieHeader = request?.headers.get('cookie') || cookies().toString();
  const match = cookieHeader.match(new RegExp(`${ADMIN_COOKIE}=([^;]+)`));
  let token: string | undefined;
  try { token = match?.[1] ? decodeURIComponent(match[1]) : cookies().get(ADMIN_COOKIE)?.value; }
  catch { return { authorized: false, source: 'none' as const, username: '' }; }
  const payload = verifyAdminToken(token);
  if (payload?.username) {
    return { authorized: true, source: 'cookie' as const, username: payload.username };
  }

  return { authorized: false, source: 'none' as const, username: '' };
}

export function getAdminCredentials() {
  return getConfiguredAdmin();
}

export function getAdminCookieName() {
  return ADMIN_COOKIE;
}
