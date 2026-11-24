import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import dbConnect from '@/lib/db';
import Meeting from '@/models/Meeting';
import MeetingMember from '@/models/MeetingMember';
import MeetingTranscript from '@/models/MeetingTranscript';
import { checkpointTranscript } from '@/lib/meeting-transcript';

export const dynamic = 'force-dynamic';

export async function GET() {
  const email = (await getServerSession(authOptions))?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: 'Sign in to view transcripts.' }, { status: 401 });
  try {
    await dbConnect();
    const saved = await MeetingTranscript.find({ $or: [{ hostEmail: email }, { sharedWith: email, completedAt: { $ne: null } }] }).sort({ updatedAt: -1 }).lean();
    const legacy = await Meeting.find({ hostEmail: email, 'transcript.0': { $exists: true }, meetingId: { $nin: saved.map((item: any) => item.meetingId) } }).select('meetingId title hostEmail transcript endedAt updatedAt').lean();
    const transcripts = [...saved, ...legacy.map((item: any) => ({ ...item, lines: item.transcript, completedAt: item.endedAt, sharedWith: [] }))];
    return NextResponse.json({ transcripts: transcripts.map((item: any) => ({
      meetingId: item.meetingId, title: item.title, lines: item.lines,
      completedAt: item.completedAt, updatedAt: item.updatedAt, sharedAt: item.sharedAt,
      isHost: item.hostEmail.toLowerCase() === email,
    })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Could not load transcripts. Please try again.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const email = (await getServerSession(authOptions))?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: 'Sign in to manage transcripts.' }, { status: 401 });
  try {
    const { meetingId, action, lines } = await request.json();
    if (typeof meetingId !== 'string' || !['complete', 'share'].includes(action)) return NextResponse.json({ error: 'Invalid transcript request.' }, { status: 400 });
    await dbConnect();
    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting || meeting.hostEmail.toLowerCase() !== email) return NextResponse.json({ error: 'Only the host can manage this transcript.' }, { status: 403 });
    if (action === 'complete') {
      await checkpointTranscript(meeting, [...(meeting.transcript || []), ...(Array.isArray(lines) ? lines : [])], true);
      return NextResponse.json({ success: true });
    }
    let transcript = await MeetingTranscript.findOne({ meetingId });
    if (!transcript && meeting.transcript?.length && meeting.endedAt) {
      await checkpointTranscript(meeting, meeting.transcript, true);
      transcript = await MeetingTranscript.findOne({ meetingId });
    }
    if (!transcript?.completedAt || !transcript.lines.length) return NextResponse.json({ error: 'The transcript can be shared after the host leaves or ends the meeting.' }, { status: 409 });
    const members = await MeetingMember.find({ meetingId }).select('userEmail').lean();
    const sharedWith = [...new Set(members.map(member => member.userEmail.toLowerCase()).filter(member => member !== email))];
    await MeetingTranscript.updateOne({ meetingId, hostEmail: email, completedAt: { $ne: null } }, { $set: { sharedAt: new Date(), sharedWith } });
    return NextResponse.json({ success: true, members: sharedWith.length });
  } catch {
    return NextResponse.json({ error: 'Could not save the transcript. Please try again.' }, { status: 500 });
  }
}
