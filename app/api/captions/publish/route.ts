import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { requireFeatureAccess } from '@/lib/membership';

const CAPTION_BACKEND_URL = (process.env.CAPTION_BACKEND_URL || process.env.MEETING_AI_CONTROL_URL || `http://localhost:${process.env.MEETING_AI_PORT || 4010}`).replace(/\/$/, '');

/**
 * Live captions publish several times per second, and every interim update used
 * to re-run a membership database query before the text could reach the room.
 * A positive result is remembered briefly, so the publish path stays a plain
 * forward. Starting subtitles still checks the plan from scratch.
 */
const CAPTION_ACCESS_TTL_MS = 60_000;
const captionAccessCache = new Map<string, number>();
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function hasCachedCaptionAccess(email: string) {
  const expiresAt = captionAccessCache.get(email);
  if (expiresAt === undefined) return false;
  if (expiresAt > Date.now()) return true;
  captionAccessCache.delete(email);
  return false;
}

function cacheCaptionAccess(email: string) {
  if (captionAccessCache.size > 5000) captionAccessCache.clear();
  captionAccessCache.set(email, Date.now() + CAPTION_ACCESS_TTL_MS);
}

async function requirePaidCaptions({ fresh = false }: { fresh?: boolean } = {}) {
  const session = await getServerSession(authOptions);
  const userEmail = String(session?.user?.email || '').toLowerCase();

  if (!userEmail) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Sign in and upgrade to Pro or Business to start captions', code: 'AUTH_REQUIRED' },
        { status: 401, headers: NO_STORE }
      ),
    };
  }

  if ((session?.user as any)?.role === 'admin') {
    return { ok: true as const };
  }

  if (!fresh && hasCachedCaptionAccess(userEmail)) {
    return { ok: true as const };
  }

  const featureCheck = await requireFeatureAccess(userEmail, 'captions');
  if (!featureCheck.ok) {
    captionAccessCache.delete(userEmail);
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: featureCheck.error, code: featureCheck.code, membership: featureCheck.membership || null },
        { status: featureCheck.status, headers: NO_STORE }
      ),
    };
  }

  cacheCaptionAccess(userEmail);
  return { ok: true as const };
}

export async function GET() {
  const check = await requirePaidCaptions({ fresh: true });
  if (!check.ok) return check.response;

  return NextResponse.json({ success: true }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const check = await requirePaidCaptions();
  if (!check.ok) return check.response;

  try {
    const body = await request.json();
    const meetingId = String(body?.meetingId || '').trim();
    const text = String(body?.text || '').trim();

    if (!meetingId || !text) {
      return NextResponse.json({ error: 'meetingId and text are required' }, { status: 400, headers: NO_STORE });
    }

    const response = await fetch(`${CAPTION_BACKEND_URL}/api/rooms/${encodeURIComponent(meetingId)}/captions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        speaker: String(body?.speaker || 'You').trim() || 'You',
        speakerId: String(body?.speakerId || 'local-user').trim() || 'local-user',
        final: Boolean(body?.final),
        timestamp: Number(body?.timestamp || Date.now()),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Caption publish failed: ${response.status} ${errorText}` },
        { status: 502, headers: NO_STORE }
      );
    }

    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (error) {
    console.error('[captions/publish] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Caption publish failed' },
      { status: 500, headers: NO_STORE }
    );
  }
}
