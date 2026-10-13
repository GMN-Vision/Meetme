import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { requireCredits, requireFeatureAccess } from '@/lib/membership';

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY || process.env.AAI_API_KEY || '';
const ASSEMBLYAI_TRANSCRIBE_LANGUAGE = process.env.ASSEMBLYAI_TRANSCRIBE_LANGUAGE || process.env.AAI_TRANSCRIBE_LANGUAGE || '';
const CAPTION_BACKEND_URL = (process.env.CAPTION_BACKEND_URL || process.env.MEETING_AI_CONTROL_URL || `http://localhost:${process.env.MEETING_AI_PORT || 4010}`).replace(/\/$/, '');

type AssemblyAIUtterance = {
  text?: string;
  speaker?: string | number;
};

type AssemblyAITranscript = {
  status?: string;
  text?: string;
  utterances?: AssemblyAIUtterance[];
};

async function uploadToAssemblyAI(audioFile: File): Promise<string> {
  const headers: Record<string, string> = {
    authorization: ASSEMBLYAI_API_KEY,
  };
  const contentType = resolveAudioContentType(audioFile);

  if (contentType) {
    headers['content-type'] = contentType;
  }

  const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers,
    body: audioFile,
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    throw new Error(`AssemblyAI upload failed: ${uploadResponse.status} ${text}`);
  }

  const json = await uploadResponse.json();
  return json.upload_url;
}

async function transcribeAudio(audioUrl: string): Promise<AssemblyAITranscript> {
  const createResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      authorization: ASSEMBLYAI_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      speech_models: ['universal-3-5-pro', 'universal-2'],
      ...(ASSEMBLYAI_TRANSCRIBE_LANGUAGE
        ? { language_detection: false, language_code: ASSEMBLYAI_TRANSCRIBE_LANGUAGE }
        : { language_detection: true }),
      speaker_labels: true,
      punctuate: true,
      format_text: true,
    }),
  });

  if (!createResponse.ok) {
    const text = await createResponse.text();
    throw new Error(`AssemblyAI create failed: ${createResponse.status} ${text}`);
  }

  const created = await createResponse.json();
  const transcriptId = created.id;

  const startedAt = Date.now();
  while (Date.now() - startedAt < 60000) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      headers: { authorization: ASSEMBLYAI_API_KEY },
    });

    if (!pollResponse.ok) {
      const text = await pollResponse.text();
      throw new Error(`AssemblyAI poll failed: ${pollResponse.status} ${text}`);
    }

    const status = await pollResponse.json();
    if (status.status === 'completed') {
      return status as AssemblyAITranscript;
    }

    if (status.status === 'error') {
      throw new Error(`AssemblyAI transcription failed: ${status.error || 'unknown error'}`);
    }
  }

  throw new Error('AssemblyAI transcription timed out');
}

function extractCaptionSegments(
  transcript: AssemblyAITranscript,
  localSpeakerName?: string,
  localSpeakerId?: string
) {
  const utterances = Array.isArray(transcript.utterances) ? transcript.utterances : [];
  const speakerName = cleanSpeakerName(localSpeakerName);
  const speakerId = cleanSpeakerId(localSpeakerId);

  if (utterances.length > 0) {
    return utterances
      .map((utterance) => ({
        text: String(utterance?.text || '').trim(),
        speakerId: speakerId || String(utterance?.speaker || '1'),
        speaker: speakerName || `Speaker ${String(utterance?.speaker || '1')}`,
      }))
      .filter((segment) => segment.text.length > 0);
  }

  const text = String(transcript.text || '').trim();
  return text
    ? [{
        text,
        speakerId: speakerId || 'local-user',
        speaker: speakerName || 'You',
      }]
    : [];
}

async function postCaption(meetingId: string, text: string, speaker = 'You', speakerId?: string): Promise<void> {
  const payload = {
    text,
    speaker,
    speakerId,
    final: true,
    timestamp: Date.now(),
  };

  const response = await fetch(`${CAPTION_BACKEND_URL}/api/rooms/${encodeURIComponent(meetingId)}/captions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Caption publish failed: ${response.status} ${body}`);
  }
}

export async function POST(request: NextRequest) {
  if (!ASSEMBLYAI_API_KEY) {
    return NextResponse.json({ error: 'AssemblyAI API key not configured' }, { status: 500 });
  }

  try {
    const session = await getServerSession(authOptions);
    const userEmail = String(session?.user?.email || '').toLowerCase();
    if (!userEmail) {
      return NextResponse.json({ error: 'Sign in and select a plan to use server captions' }, { status: 401 });
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const meetingId = formData.get('meetingId') as string;
    const speakerName = formData.get('speakerName') as string | null;
    const speakerId = formData.get('speakerId') as string | null;
    const durationSeconds = Math.max(1, Number(formData.get('durationSeconds') || 3));

    if (!audioFile || !meetingId) {
      return NextResponse.json({ error: 'Missing audio or meetingId' }, { status: 400 });
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());

    if (buffer.length < 1000) {
      return NextResponse.json({ silence: true });
    }

    if ((session.user as any)?.role !== 'admin') {
      const featureCheck = await requireFeatureAccess(userEmail, 'captions');
      if (!featureCheck.ok) {
        return NextResponse.json(
          { error: featureCheck.error, code: featureCheck.code, membership: featureCheck.membership || null },
          { status: featureCheck.status }
        );
      }

      const creditCheck = await requireCredits(userEmail, Math.max(0.05, Math.round((durationSeconds / 60) * 100) / 100), 'live captions');
      if (!creditCheck.ok) {
        return NextResponse.json(
          { error: creditCheck.error, code: creditCheck.code, membership: creditCheck.membership || null },
          { status: creditCheck.status }
        );
      }
    }

    const audioUrl = await uploadToAssemblyAI(audioFile);
    const transcript = await transcribeAudio(audioUrl);
    const segments = extractCaptionSegments(
      transcript,
      speakerName || undefined,
      speakerId || undefined
    );

    if (segments.length === 0) {
      return NextResponse.json({ silence: true });
    }

    for (const segment of segments) {
      await postCaption(meetingId, segment.text, segment.speaker, segment.speakerId);
    }

    return NextResponse.json({ text: String(transcript.text || '').trim(), segments });
  } catch (error) {
    console.error('[transcribe-audio] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Transcription failed' },
      { status: 500 }
    );
  }
}

function resolveAudioContentType(audioFile: File) {
  const fileType = String(audioFile.type || '').trim();

  if (fileType) {
    return fileType;
  }

  const fileName = String(audioFile.name || '').toLowerCase();

  if (fileName.endsWith('.ogg')) {
    return 'audio/ogg';
  }

  if (fileName.endsWith('.mp4')) {
    return 'audio/mp4';
  }

  if (fileName.endsWith('.webm')) {
    return 'audio/webm';
  }

  return '';
}

function cleanSpeakerName(value?: string | null) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanSpeakerId(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._:-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
