import crypto from 'crypto';

export interface JitsiJwtUser {
  id: string;
  name: string;
  email?: string;
}

function base64Url(input: Buffer | string): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buffer
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function createJitsiJwt(params: {
  roomName: string;
  domain: string;
  user: JitsiJwtUser;
  secret: string;
  issuer?: string;
  ttlSeconds?: number;
  moderator?: boolean;
}) {
  const {
    roomName,
    domain,
    user,
    secret,
    issuer = 'melanam',
    ttlSeconds = 4 * 60 * 60,
    moderator = true,
  } = params;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    aud: 'jitsi',
    iss: issuer,
    sub: domain,
    room: roomName,
    exp: now + ttlSeconds,
    nbf: now - 10,
    context: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    },
    moderator,
  };

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();

  return `${encodedHeader}.${encodedPayload}.${base64Url(signature)}`;
}
