import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Meeting from '@/models/Meeting';
import Task from '@/models/Task';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { generateOpenAIMeetingNotes } from '@/lib/openai-meeting-notes';
import { requireCredits, requireFeatureAccess } from '@/lib/membership';
import { checkpointTranscript } from '@/lib/meeting-transcript';

type TranscriptInput = {
  text?: unknown;
  timestamp?: unknown;
  speakerId?: unknown;
  speaker?: unknown;
};

type ActionInput = {
  item?: unknown;
  description?: unknown;
  task?: unknown;
  owner?: unknown;
  assignee?: unknown;
};

type SpeakerInput = {
  speakerId?: unknown;
  label?: unknown;
  id?: unknown;
  name?: unknown;
  speaker?: unknown;
  displayName?: unknown;
  color?: unknown;
};

const SPEAKER_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#FFA502',
  '#95E1D3',
  '#F38181',
  '#AA96DA',
  '#FCBAD3',
];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const meetingId = String(body?.meetingId || '').trim();

    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId is required' }, { status: 400 });
    }

    await dbConnect();

    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const session = await getServerSession(authOptions);
    const internalToken = process.env.MEETING_AI_INTERNAL_TOKEN;
    const suppliedToken = request.headers.get('x-meeting-ai-token') || '';
    const isInternal = Boolean(internalToken && suppliedToken === internalToken);
    const isHost = Boolean(session?.user?.email && session.user.email.toLowerCase() === meeting.hostEmail?.toLowerCase());

    if (!isInternal && !isHost) {
      return NextResponse.json({ error: 'Only the meeting host can save AI results' }, { status: 403 });
    }

    const transcript = normalizeTranscript(body?.transcript);
    const speakerLabels = normalizeSpeakerLabels(body?.speakerLabels, transcript);
    let actionItems = normalizeActionItems(body?.actionItems || body?.actions);
    let keyNotes = normalizeStringArray(body?.keyNotes || body?.key_notes);
    let keyDecisions = normalizeStringArray(body?.keyDecisions || body?.key_decisions);
    let summary = String(body?.summary || body?.text || '').trim();

    if (transcript.length > 0) {
      await checkpointTranscript(meeting, transcript);
      meeting.transcript = mergeTranscript(meeting.transcript || [], transcript);
    }

    if (speakerLabels.length > 0) {
      meeting.speakerLabels = mergeSpeakerLabels(meeting.speakerLabels || [], speakerLabels);
    }

    if (body?.generateSummary === true && Array.isArray(meeting.transcript) && meeting.transcript.length > 0) {
      // Save the transcript before checking access to the optional AI summary.
      if (meeting.isModified('transcript') || meeting.isModified('speakerLabels')) {
        await meeting.save();
      }

      try {
        const chargeEmail = String(isInternal ? meeting.hostEmail : session?.user?.email || '').toLowerCase();
        const isAdmin = Boolean((session?.user as any)?.role === 'admin');

        if (!isAdmin) {
          const featureCheck = await requireFeatureAccess(chargeEmail, 'aiNotes');
          if (!featureCheck.ok) {
            return NextResponse.json(
              { error: featureCheck.error, code: featureCheck.code, membership: featureCheck.membership || null },
              { status: featureCheck.status }
            );
          }

          const creditCheck = await requireCredits(chargeEmail, 5, 'AI meeting summary');
          if (!creditCheck.ok) {
            return NextResponse.json(
              { error: creditCheck.error, code: creditCheck.code, membership: creditCheck.membership || null },
              { status: creditCheck.status }
            );
          }
        }

        const openAiNotes = await generateOpenAIMeetingNotes(meeting.transcript);
        if (openAiNotes?.summary) {
          summary = openAiNotes.summary;
          keyNotes = openAiNotes.keyNotes;
          keyDecisions = openAiNotes.keyDecisions;
          actionItems = openAiNotes.actionItems;
        }
      } catch (error: any) {
        console.warn('[AI save] OpenAI meeting summary failed:', error?.message || error);
      }
    }

    if (summary) {
      meeting.summary = summary;
    }

    if (keyNotes.length > 0) {
      meeting.keyNotes = keyNotes;
    }

    if (keyDecisions.length > 0) {
      meeting.keyDecisions = keyDecisions;
    }

    if (actionItems.length > 0) {
      meeting.actionItems = actionItems;
      await createMissingTasks(meetingId, actionItems);
    }

    await meeting.save();

    return NextResponse.json({
      success: true,
      meeting: {
        meetingId,
        summary: meeting.summary || '',
        keyNotes: meeting.keyNotes || [],
        keyDecisions: meeting.keyDecisions || [],
        actionItems: meeting.actionItems || [],
        transcript: meeting.transcript || [],
        speakerLabels: meeting.speakerLabels || [],
      },
    });
  } catch (error: any) {
    console.error('Error saving AI results:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save AI results' },
      { status: 500 }
    );
  }
}

function normalizeTranscript(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item: TranscriptInput) => ({
      text: String(item?.text || '').trim(),
      timestamp: Number(item?.timestamp || 0),
      speakerId: String(item?.speakerId || item?.speaker || 'speaker').trim(),
      speaker: String(item?.speaker || item?.speakerId || 'Speaker').trim(),
    }))
    .filter((item) => item.text.length > 0);
}

function normalizeSpeakerLabels(value: unknown, transcript: ReturnType<typeof normalizeTranscript>) {
  const speakers = new Map<string, { speakerId: string; name: string; color: string }>();

  if (Array.isArray(value)) {
    value.forEach((item: SpeakerInput, index) => {
      const speakerId = String(item?.speakerId || item?.label || item?.id || '').trim();
      const name = String(item?.name || item?.speaker || item?.displayName || speakerId).trim();
      if (!speakerId || !name) return;

      speakers.set(speakerId, {
        speakerId,
        name,
        color: String(item?.color || SPEAKER_COLORS[index % SPEAKER_COLORS.length]),
      });
    });
  }

  transcript.forEach((item) => {
    if (!item.speakerId || speakers.has(item.speakerId)) return;
    speakers.set(item.speakerId, {
      speakerId: item.speakerId,
      name: item.speaker || item.speakerId,
      color: SPEAKER_COLORS[speakers.size % SPEAKER_COLORS.length],
    });
  });

  return Array.from(speakers.values());
}

function normalizeActionItems(value: unknown): Array<{ item: string; owner?: string }> {
  if (!Array.isArray(value)) return [];

  return value
    .map((item: string | ActionInput) => {
      if (typeof item === 'string') {
        return { item: item.trim(), owner: extractOwner(item) };
      }

      const text = String(item?.item || item?.description || item?.task || '').trim();
      const owner = String(item?.owner || item?.assignee || '').trim() || extractOwner(text);

      return { item: text, owner: owner || undefined };
    })
    .filter((item) => item.item.length > 0);
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => String(item || '').trim())
    .filter((item) => item.length > 0);
}

function mergeTranscript(existing: any[], incoming: ReturnType<typeof normalizeTranscript>) {
  const seen = new Set<string>();
  const merged = [...existing, ...incoming].filter((item: any) => {
    const key = [
      Math.round(Number(item?.timestamp || 0)),
      String(item?.speakerId || ''),
      String(item?.text || '').trim().toLowerCase(),
    ].join('|');

    if (seen.has(key)) return false;
    seen.add(key);
    return String(item?.text || '').trim().length > 0;
  });

  return merged.sort((left: any, right: any) => Number(left.timestamp || 0) - Number(right.timestamp || 0));
}

function mergeSpeakerLabels(existing: any[], incoming: ReturnType<typeof normalizeSpeakerLabels>) {
  const labels = new Map<string, any>();

  [...existing, ...incoming].forEach((speaker: any, index) => {
    const speakerId = String(speaker?.speakerId || speaker?.label || speaker?.id || '').trim();
    const name = String(speaker?.name || speaker?.speaker || speaker?.displayName || '').trim();
    if (!speakerId || !name) return;

    labels.set(speakerId, {
      speakerId,
      name,
      color: speaker?.color || SPEAKER_COLORS[index % SPEAKER_COLORS.length],
    });
  });

  return Array.from(labels.values());
}

async function createMissingTasks(meetingId: string, actionItems: ReturnType<typeof normalizeActionItems>) {
  for (const action of actionItems) {
    const existing = await Task.findOne({ meetingId, title: action.item });
    if (!existing) {
      await Task.create({ meetingId, title: action.item, ownerName: action.owner || '' });
    }
  }
}

function extractOwner(item: string): string | undefined {
  const ownerMatch = item.match(/(?:owner|assign|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  return ownerMatch ? ownerMatch[1] : undefined;
}
