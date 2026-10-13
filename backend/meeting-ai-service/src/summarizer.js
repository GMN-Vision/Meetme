'use strict';

const ASSEMBLYAI_KEY = process.env.ASSEMBLYAI_API_KEY || process.env.AAI_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const { broadcast } = require('./ws/roomHub');

const ASSEMBLYAI_LLM_URL = 'https://llm-gateway.assemblyai.com/v1/chat/completions';

const buffers = new Map();
const lastSummaries = new Map();

function ensureBuffer(meetingId) {
  if (!buffers.has(meetingId)) {
    buffers.set(meetingId, { captions: [], timer: null });
  }

  return buffers.get(meetingId);
}

async function callAssemblyAIMeetingNotes(text) {
  const prompt = `You are preparing an executive meeting brief from live captions for a product dashboard. Analyze these captions and return ONLY valid JSON.

Schema:
{
  "summary": "5-7 sentence executive brief written as one polished paragraph",
  "keyNotes": ["Topic: specific important takeaway with supporting context"],
  "keyDecisions": ["Decision: what was decided and why it matters"],
  "actionItems": [{"description": "Task with due date/context if explicitly mentioned", "assignee": "Owner if mentioned"}]
}

Rules:
- Keep speaker names exactly as written in the captions.
- Do not invent decisions, owners, or action items.
- Remove filler, repeated phrases, false starts, and transcription noise.
- The summary must explain: meeting purpose/context, the most important discussion, outcomes or decisions, risks/blockers/open questions, and the next steps when supported.
- Every summary sentence must add new information; avoid generic phrases such as "the meeting discussed".
- Prefer specific outcomes, risks, blockers, dates, numbers, owners, and next steps over generic statements.
- Keep each item concise, polished, useful, and evidence-backed without marketing language.
- Limit keyNotes to the 6 strongest points, keyDecisions to 6, and actionItems to 8.
- Use empty arrays when nothing clear is present.
- If the captions are too thin or unclear, say exactly what is known and what is missing; do not pad the brief.

Captions:
${text}`;

  if (GEMINI_KEY) {
    const model = process.env.GEMINI_MEETING_SUMMARY_MODEL || 'gemini-2.5-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1800 } }),
    });
    if (!response.ok) throw new Error(`Gemini meeting summary failed: HTTP ${response.status}`);
    const json = await response.json();
    return parseMeetingNotes(json.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '');
  }

  if (!ASSEMBLYAI_KEY) {
    throw new Error('AssemblyAI API key not configured');
  }

  const response = await fetch(ASSEMBLYAI_LLM_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: ASSEMBLYAI_KEY,
    },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      model: process.env.MEETING_AI_SUMMARY_MODEL || 'claude-sonnet-4-6',
      max_tokens: 1800,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`AssemblyAI LLM Gateway failed: HTTP ${response.status}`);
  }

  const json = await response.json();
  return parseMeetingNotes(json.choices?.[0]?.message?.content || '');
}

function parseMeetingNotes(text) {
  const parsed = parseJsonObject(text);

  if (!parsed) {
    return {
      summary: String(text || '').trim(),
      keyNotes: [],
      keyDecisions: [],
      actionItems: [],
    };
  }

  return {
    summary: cleanText(typeof parsed.summary === 'string' ? parsed.summary : ''),
    keyNotes: normalizeStringList(parsed.keyNotes || parsed.key_notes || parsed.notes).slice(0, 6),
    keyDecisions: normalizeStringList(parsed.keyDecisions || parsed.key_decisions || parsed.decisions).slice(0, 6),
    actionItems: normalizeActionItems(parsed.actionItems || parsed.action_items || parsed.actions),
  };
}

function parseJsonObject(text) {
  const cleaned = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeStringList(value) {
  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((line) => line.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim())
      .filter(Boolean);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      return String(item.text || item.description || item.note || item.decision || item.item || '').trim();
    })
    .filter(Boolean);
}

function normalizeActionItems(value) {
  if (typeof value === 'string') {
    return normalizeStringList(value).map((description) => ({
      description,
      assignee: extractAssignee(description),
    }));
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return {
          description: item.trim(),
          assignee: extractAssignee(item),
        };
      }

      if (!item || typeof item !== 'object') {
        return null;
      }

      const description = String(item.description || item.text || item.item || item.task || '').trim();
      const assignee = String(item.assignee || item.owner || item.assignedTo || '').trim();

      if (!description) {
        return null;
      }

      return {
        description,
        assignee: assignee || extractAssignee(description),
      };
    })
    .filter(Boolean);
}

function cleanText(value) {
  return String(value || '')
    .replace(/^\s*(?:[-*]|\d+[.)])\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}

function extractAssignee(text) {
  const match = String(text || '').match(/^(.*?):\s+.+$/);
  return match ? match[1].trim() : undefined;
}

async function summarizeMeeting(meetingId, captions) {
  try {
    const combined = captions
      .map((caption) => {
        const speaker = caption.speaker || (caption.speakerId ? `Speaker ${caption.speakerId}` : 'Speaker');
        return `${speaker}: ${caption.text}`;
      })
      .join('\n');

    const notes = await callAssemblyAIMeetingNotes(combined);

    if (!notes.summary) {
      notes.summary = fallbackSummarize(captions).summary;
    }

    publishSummary(meetingId, notes);
  } catch (err) {
    console.error('[summarizer] error summarizing meeting', meetingId, err.message || err);

    try {
      publishSummary(meetingId, fallbackSummarize(captions));
    } catch (fallbackError) {
      console.error('[summarizer] fallback error', fallbackError && fallbackError.message);
    }
  }
}

function fallbackSummarize(captions) {
  const cleanedCaptions = captions
    .map((caption) => ({
      speaker: cleanText(caption.speaker || 'Speaker'),
      text: cleanText(caption.text || ''),
    }))
    .filter((caption) => caption.text.length > 0);

  if (cleanedCaptions.length === 0) {
    return {
      summary: 'No useful live captions were captured yet, so a reliable summary cannot be prepared.',
      keyNotes: [],
      keyDecisions: [],
      actionItems: [],
    };
  }

  const speakers = Array.from(new Set(cleanedCaptions.map((caption) => caption.speaker))).filter(Boolean);
  const opening = cleanedCaptions[0];
  const latest = cleanedCaptions[cleanedCaptions.length - 1];
  const summaryParts = [
    `Live captions captured ${cleanedCaptions.length} substantive update${cleanedCaptions.length === 1 ? '' : 's'}${speakers.length ? ` from ${speakers.join(', ')}` : ''}.`,
    opening ? `The discussion opened with ${opening.speaker}: ${opening.text}` : '',
    latest && latest.text !== opening?.text ? `The latest focus was ${latest.speaker}: ${latest.text}` : '',
    'Review the transcript for full context before treating this fallback brief as final.',
  ].filter(Boolean);

  const keyNotes = uniqueStrings(
    cleanedCaptions
      .slice(-6)
      .map((caption) => `${caption.speaker}: ${caption.text}`)
  );
  const actionKeywords = ['action', 'todo', 'follow up', 'follow-up', 'deadline', 'will', 'please', 'assign', 'assign to'];
  const actionItems = cleanedCaptions
    .filter((caption) => actionKeywords.some((keyword) => String(caption.text || '').toLowerCase().includes(keyword)))
    .map((caption) => ({ description: String(caption.text || '').trim(), assignee: undefined }))
    .filter((item) => item.description.length > 0);

  return {
    summary: summaryParts.join(' '),
    keyNotes,
    keyDecisions: [],
    actionItems,
  };
}

function uniqueStrings(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = String(item || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function publishSummary(meetingId, notes) {
  const timestamp = Date.now();
  const payload = {
    type: 'summary',
    meetingId,
    summary: String(notes.summary || '').trim(),
    keyNotes: Array.isArray(notes.keyNotes) ? notes.keyNotes : [],
    keyDecisions: Array.isArray(notes.keyDecisions) ? notes.keyDecisions : [],
    actionItems: Array.isArray(notes.actionItems) ? notes.actionItems : [],
    actions: Array.isArray(notes.actionItems) ? notes.actionItems : [],
    timestamp,
  };

  broadcast(meetingId, payload);
  lastSummaries.set(meetingId, {
    summary: payload.summary,
    keyNotes: payload.keyNotes,
    keyDecisions: payload.keyDecisions,
    actionItems: payload.actionItems,
    actions: payload.actions,
    timestamp,
  });
}

function scheduleSummarize(meetingId) {
  const buffer = ensureBuffer(meetingId);
  if (buffer.timer) return;

  buffer.timer = setTimeout(async () => {
    const captions = buffer.captions.splice(0, buffer.captions.length);
    buffer.timer = null;
    if (captions.length === 0) return;
    await summarizeMeeting(meetingId, captions);
  }, 30_000);
}

async function addCaption(meetingId, payload) {
  try {
    const buffer = ensureBuffer(meetingId);
    buffer.captions.push({
      speaker: payload.speaker || 'Speaker',
      speakerId: payload.speakerId || undefined,
      text: payload.text || '',
    });

    if (buffer.captions.length >= 20) {
      const captions = buffer.captions.splice(0, buffer.captions.length);
      if (buffer.timer) {
        clearTimeout(buffer.timer);
        buffer.timer = null;
      }

      await summarizeMeeting(meetingId, captions);
      return;
    }

    scheduleSummarize(meetingId);
  } catch (err) {
    console.error('[summarizer] addCaption error', err.message || err);
  }
}

async function flushMeeting(meetingId) {
  try {
    const buffer = ensureBuffer(meetingId);
    if (!buffer || !buffer.captions || buffer.captions.length === 0) {
      return getLastSummary(meetingId) || null;
    }

    const captions = buffer.captions.splice(0, buffer.captions.length);

    if (buffer.timer) {
      clearTimeout(buffer.timer);
      buffer.timer = null;
    }

    await summarizeMeeting(meetingId, captions);
    return getLastSummary(meetingId) || null;
  } catch (err) {
    console.error('[summarizer] flushMeeting error', err && err.message ? err.message : err);
    throw err;
  }
}

function getLastSummary(meetingId) {
  return lastSummaries.get(meetingId) || null;
}

module.exports = { addCaption, getLastSummary, flushMeeting };
