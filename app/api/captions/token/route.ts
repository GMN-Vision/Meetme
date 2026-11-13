import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { requireFeatureAccess } from '@/lib/membership';
import { verifyMeetingApprovalToken } from '@/lib/meeting-approval-access';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Sign in to start captions.' }, { status: 401 });
  if ((session.user as any).role !== 'admin') {
    const access = await requireFeatureAccess(email.toLowerCase(), 'captions');
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  }
  try {
    const { meetingId } = await request.json();
    await verifyMeetingApprovalToken((request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), String(meetingId || ''));
  } catch {
    return NextResponse.json({ error: 'Rejoin the meeting before starting captions.' }, { status: 403 });
  }
  const key = process.env.ASSEMBLYAI_API_KEY || process.env.AAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'Live transcription is not configured.' }, { status: 503 });
  try {
    const response = await fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=60', {
      headers: { Authorization: key }, cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('token request failed');
    const { token } = await response.json();
    if (typeof token !== 'string' || !token) throw new Error('missing token');
    return NextResponse.json({ token, model: process.env.ASSEMBLYAI_SPEECH_MODEL || 'universal-3-6-pro' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Live transcription is unavailable. Please try again.' }, { status: 502 });
  }
}
