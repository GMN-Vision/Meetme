type TranscriptEntry = {
  text?: unknown;
  speaker?: unknown;
  speakerId?: unknown;
  timestamp?: unknown;
};

type OpenAIMeetingNotes = {
  summary: string;
  keyNotes: string[];
  keyDecisions: string[];
  actionItems: Array<{ item: string; owner?: string }>;
};

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_OPENAI_MEETING_MODEL = 'gpt-4o-mini';

export async function generateOpenAIMeetingNotes(
  transcriptEntries: TranscriptEntry[]
): Promise<OpenAIMeetingNotes | null> {
  const transcript = formatTranscript(transcriptEntries);

  if (!transcript) {
    return null;
  }

  try {
    return await generateWithOpenAI(transcript);
  } catch (error) {
    if (!process.env.GEMINI_API_KEY) throw error;
    return generateWithGemini(transcript);
  }
}

async function generateWithOpenAI(transcript: string): Promise<OpenAIMeetingNotes> {
  const apiKey = getOpenAIKey();
  const model =
    process.env.OPENAI_MEETING_SUMMARY_MODEL ||
    process.env.OPENAI_MODEL ||
    DEFAULT_OPENAI_MEETING_MODEL;

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: [
                'You create meeting summaries for a production meeting app.',
                'Use only the transcript evidence. Do not invent decisions, owners, dates, or tasks.',
                'Return only valid JSON matching the requested schema.',
              ].join(' '),
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: buildPrompt(transcript),
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'meeting_notes',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              summary: { type: 'string' },
              keyNotes: {
                type: 'array',
                maxItems: 6,
                items: { type: 'string' },
              },
              keyDecisions: {
                type: 'array',
                maxItems: 6,
                items: { type: 'string' },
              },
              actionItems: {
                type: 'array',
                maxItems: 8,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    item: { type: 'string' },
                    owner: { type: 'string' },
                  },
                  required: ['item', 'owner'],
                },
              },
            },
            required: ['summary', 'keyNotes', 'keyDecisions', 'actionItems'],
          },
        },
      },
    }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body?.error?.message || body?.error || response.statusText;
    throw new Error(`OpenAI meeting summary failed: ${message}`);
  }

  return normalizeMeetingNotes(parseOpenAIJson(body));
}

async function generateWithGemini(transcript: string): Promise<OpenAIMeetingNotes> {
  const model = process.env.GEMINI_MEETING_SUMMARY_MODEL || 'gemini-2.5-flash';
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(transcript) }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1800 },
    }),
  });
  if (!response.ok) throw new Error(`Gemini meeting summary failed: HTTP ${response.status}`);
  const body = await response.json();
  const outputText = body.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || '';
  return normalizeMeetingNotes(parseOpenAIJson({ output_text: outputText }));
}

export function normalizeOpenAIActionItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return {
          item: cleanText(item),
          owner: extractOwner(item) || undefined,
        };
      }

      if (!item || typeof item !== 'object') {
        return null;
      }

      const objectItem = item as Record<string, unknown>;
      const text = cleanText(
        objectItem.item ||
        objectItem.description ||
        objectItem.task ||
        objectItem.text ||
        ''
      );
      const owner = cleanText(objectItem.owner || objectItem.assignee || objectItem.assignedTo || '');

      if (!text) {
        return null;
      }

      return {
        item: text,
        owner: owner || extractOwner(text) || undefined,
      };
    })
    .filter(Boolean) as Array<{ item: string; owner?: string }>;
}

function getOpenAIKey() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();

  if (!key) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  if (/\s/.test(key)) {
    throw new Error('OPENAI_API_KEY must be a single line with no spaces or line breaks');
  }

  return key;
}

function buildPrompt(transcript: string) {
  return `Analyze this meeting transcript after the meeting has ended.

Return JSON with:
- summary: 5-7 sentence polished executive summary.
- keyNotes: up to 6 specific important takeaways.
- keyDecisions: up to 6 decisions. Use an empty array if no decision is explicit.
- actionItems: up to 8 tasks. Each item must include "item" and "owner"; use "" for owner when not explicit.

Rules:
- Keep speaker names exactly as shown.
- Do not invent decisions, owners, due dates, or action items.
- Remove filler, repetition, false starts, and transcription noise.
- Mention risks, blockers, open questions, and next steps only when supported by the transcript.
- If the transcript is too short or unclear, say exactly what is known and what is missing.

Transcript:
${transcript}`;
}

function formatTranscript(entries: TranscriptEntry[]) {
  return entries
    .map((entry) => {
      const text = cleanText(entry?.text || '');
      if (!text) {
        return '';
      }

      const speaker = cleanText(entry?.speaker || entry?.speakerId || 'Speaker');
      return `${speaker}: ${text}`;
    })
    .filter(Boolean)
    .join('\n')
    .slice(0, 120_000);
}

function parseOpenAIJson(body: any) {
  const outputText =
    body?.output_text ||
    body?.output?.flatMap((item: any) => item?.content || [])
      ?.map((content: any) => content?.text || '')
      ?.join('\n') ||
    '';

  const cleaned = String(outputText || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  if (!cleaned) {
    throw new Error('OpenAI returned an empty meeting summary');
  }

  return JSON.parse(cleaned);
}

function normalizeMeetingNotes(value: any): OpenAIMeetingNotes {
  return {
    summary: cleanText(value?.summary || ''),
    keyNotes: normalizeStringList(value?.keyNotes || value?.key_notes || value?.notes, 6),
    keyDecisions: normalizeStringList(value?.keyDecisions || value?.key_decisions || value?.decisions, 6),
    actionItems: normalizeOpenAIActionItems(value?.actionItems || value?.action_items || value?.actions),
  };
}

function normalizeStringList(value: unknown, limit: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  return value
    .map((item) => cleanText(item))
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function cleanText(value: unknown) {
  return String(value || '')
    .replace(/^\s*(?:[-*]|\d+[.)])\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}

function extractOwner(item: string): string | undefined {
  const ownerMatch = item.match(/^(.*?):\s+.+$/);
  return ownerMatch ? ownerMatch[1].trim() : undefined;
}
