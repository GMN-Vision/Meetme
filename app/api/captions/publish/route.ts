import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { requireFeatureAccess } from '@/lib/membership';

const CAPTION_BACKEND_URL = (process.env.CAPTION_BACKEND_URL || process.env.MEETING_AI_CONTROL_URL || `http://localhost:${process.env.MEETING_AI_PORT || 4010}`).replace(/\/$/, '');

async function requirePaidCaptions() {
  const session = await getServerSession(authOptions);
  const userEmail = String(session?.user?.email || '').toLowerCase();

  if (!userEmail) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Sign in and upgrade to Pro or Business to start captions', code: 'AUTH_REQUIRED' },
        { status: 401 }
      ),
    };
  }

  if ((session?.user as any)?.role === 'admin') {
    return { ok: true as const };
  }

  const featureCheck = await requireFeatureAccess(userEmail, 'captions');
  if (!featureCheck.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: featureCheck.error, code: featureCheck.code, membership: featureCheck.membership || null },
        { status: featureCheck.status }
      ),
    };
  }

  return { ok: true as const };
}

export async function GET() {
  const check = await requirePaidCaptions();
  if (!check.ok) return check.response;

  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest) {
  const check = await requirePaidCaptions();
  if (!check.ok) return check.response;

  try {
    const body = await request.json();
    const meetingId = String(body?.meetingId || '').trim();
    const text = String(body?.text || '').trim();

    if (!meetingId || !text) {
      return NextResponse.json({ error: 'meetingId and text are required' }, { status: 400 });
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
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[captions/publish] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Caption publish failed' },
      { status: 500 }
    );
  }
}
