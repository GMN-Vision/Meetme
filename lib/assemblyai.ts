/**
 * AssemblyAI integration service
 * Handles transcription, translation, summarization, and real-time captions
 * API key is only stored on the server, never exposed to the client
 */

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const ASSEMBLYAI_API_BASE = 'https://api.assemblyai.com/v2';

// Supported languages for AssemblyAI
export const SUPPORTED_LANGUAGES = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  ru: 'Russian',
  ja: 'Japanese',
  zh: 'Chinese (Mandarin)',
  vi: 'Vietnamese',
  th: 'Thai',
  ko: 'Korean',
  tr: 'Turkish',
  hi: 'Hindi',
  ar: 'Arabic',
} as const;

export type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGES;

export type SpeakerNameMap = Record<string, string>;

type AssemblyAIUtterance = {
  text?: string;
  start?: number;
  end?: number;
  speaker?: string | number;
};

type MeetingNotesResult = {
  summary: string;
  keyNotes: string[];
  keyDecisions: string[];
  actionItems: string[];
};

class AssemblyAIService {
  private apiKey: string;
  private baseUrl: string = ASSEMBLYAI_API_BASE;

  constructor() {
    if (!ASSEMBLYAI_API_KEY) {
      throw new Error('ASSEMBLYAI_API_KEY environment variable is not set');
    }
    this.apiKey = ASSEMBLYAI_API_KEY;
  }

  private getHeaders() {
    return {
      Authorization: this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Submit audio file for transcription and translation
   */
  async submitTranscription(
    audioUrl: string,
    options: {
      language?: SupportedLanguage;
      detectLanguage?: boolean;
      speakerLabels?: boolean;
      wordBoost?: string[];
      redact?: string[]; // PII redaction
    } = {}
  ) {
    const body = {
      audio_url: audioUrl,
      speech_models: ['universal-3-5-pro', 'universal-2'],
      language_code: options.language || 'en',
      speaker_labels: options.speakerLabels ?? true,
    };

    const response = await fetch(`${this.baseUrl}/transcript`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`AssemblyAI API error: ${error.error || error.message}`);
    }

    return response.json();
  }

  /**
   * Poll for transcription status
   */
  async getTranscription(transcriptId: string) {
    const response = await fetch(`${this.baseUrl}/transcript/${transcriptId}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to fetch transcription: ${error.error || error.message}`);
    }

    return response.json();
  }

  /**
   * Translate transcript text
   */
  async translateText(
    text: string,
    targetLanguage: SupportedLanguage = 'en'
  ): Promise<string> {
    return this.generateTextWithProvider(
      `Translate the following text to ${SUPPORTED_LANGUAGES[targetLanguage]}. Return only the translation:\n\n${text}`,
      false
    );
  }

  /**
   * Generate meeting summary using the AssemblyAI LLM Gateway.
   */
  async generateSummary(transcriptId: string): Promise<{
    summary: string;
    keyNotes: string[];
    keyDecisions: string[];
    actionItems: string[];
  }> {
    return this.generateMeetingNotes(transcriptId);
  }

  /**
   * Generate structured meeting notes from a completed transcript.
   */
  async generateMeetingNotes(
    transcriptId: string,
    speakerNameMap: SpeakerNameMap = {}
  ): Promise<MeetingNotesResult> {
    const transcript = await this.getTranscription(transcriptId);

    if (transcript.status !== 'completed') {
      throw new Error('Transcript not yet completed');
    }

    const transcriptText = this.formatTranscriptForNotes(transcript, speakerNameMap);
    const prompt = `You are preparing an executive meeting brief for a product dashboard. Analyze this transcript and return ONLY valid JSON.

Schema:
{
  "summary": "5-7 sentence executive brief written as one polished paragraph",
  "keyNotes": ["Topic: specific important takeaway with supporting context"],
  "keyDecisions": ["Decision: what was decided and why it matters"],
  "actionItems": ["Owner: task with due date/context if explicitly mentioned; otherwise task"]
}

Rules:
- Use the speaker names exactly as shown in the transcript.
- Do not invent decisions, owners, or tasks.
- Remove filler, repeated phrases, false starts, and transcription noise.
- The summary must explain: meeting purpose/context, the most important discussion, outcomes or decisions, risks/blockers/open questions, and the next steps when supported.
- Every summary sentence must add new information; avoid generic phrases such as "the meeting discussed".
- Prefer specific outcomes, risks, blockers, dates, numbers, owners, and next steps over generic statements.
- Keep each list item concise, polished, useful, and evidence-backed without marketing language.
- Limit keyNotes to the 6 strongest points, keyDecisions to 6, and actionItems to 8.
- If there are no items for a list, return an empty array.
- If the transcript is too short or unclear, say exactly what is known and what is missing; do not pad the brief.

Transcript:
${transcriptText}`;

    const response = await this.generateTextWithProvider(prompt, true);
    const notes = this.parseMeetingNotes(response);

    return {
      summary: this.cleanSummary(notes.summary || response.trim()),
      keyNotes: notes.keyNotes,
      keyDecisions: notes.keyDecisions,
      actionItems: notes.actionItems,
    };
  }

  /**
   * Use Gemini when configured, or the AssemblyAI LLM Gateway.
   */
  private async generateTextWithProvider(prompt: string, jsonOutput: boolean): Promise<string> {
    if (process.env.GEMINI_API_KEY) {
      const model = process.env.GEMINI_MEETING_SUMMARY_MODEL || 'gemini-2.5-flash';
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { ...(jsonOutput ? { responseMimeType: 'application/json' } : {}), maxOutputTokens: 1800 } }),
      });
      if (!response.ok) throw new Error(`Gemini meeting notes failed: HTTP ${response.status}`);
      const result = await response.json();
      return String(result.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || '');
    }

    const response = await fetch('https://llm-gateway.assemblyai.com/v1/chat/completions', {
      method: 'POST',
      headers: this.getHeaders(),
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: process.env.MEETING_AI_SUMMARY_MODEL || 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1800,
      }),
    });

    if (!response.ok) {
      throw new Error(`AssemblyAI LLM Gateway failed: HTTP ${response.status}`);
    }

    const result = await response.json();
    return String(result.choices?.[0]?.message?.content || '');
  }

  /**
   * Parse bullet-point list from LLM response
   */
  private parseBulletList(text: string): string[] {
    return text
      .split('\n')
      .filter(line => line.trim().match(/^[-•*]/))
      .map(line => line.replace(/^[-•*]\s*/, '').trim())
      .filter(line => line.length > 0);
  }

  private parseMeetingNotes(text: string): MeetingNotesResult {
    const parsed = this.parseJsonObject(text);

    if (!parsed) {
      return {
        summary: this.cleanSummary(text),
        keyNotes: [],
        keyDecisions: [],
        actionItems: [],
      };
    }

    return {
      summary: this.cleanSummary(typeof parsed.summary === 'string' ? parsed.summary : ''),
      keyNotes: this.normalizeStringList(parsed.keyNotes || parsed.key_notes || parsed.notes, 6),
      keyDecisions: this.normalizeStringList(parsed.keyDecisions || parsed.key_decisions || parsed.decisions, 6),
      actionItems: this.normalizeStringList(parsed.actionItems || parsed.action_items || parsed.actions, 8),
    };
  }

  private parseJsonObject(text: string): any | null {
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

  private parseResponseList(text: string): string[] {
    return String(text || '')
      .split('\n')
      .map((line) => line.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim())
      .filter((line) => line.length > 0);
  }

  private normalizeStringList(value: any, limit = 8): string[] {
    const seen = new Set<string>();
    const normalize = (item: string) => this.cleanListItem(item);

    const unique = (items: string[]) => items
      .map(normalize)
      .filter((item) => {
        if (!item) return false;
        const key = item.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);

    if (typeof value === 'string') {
      return unique(this.parseResponseList(value));
    }

    if (!Array.isArray(value)) {
      return [];
    }

    return unique(value
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item === 'object') {
          return String(
            item.text ||
            item.description ||
            item.note ||
            item.decision ||
            item.item ||
            item.task ||
            ''
          ).trim();
        }

        return '';
      }));
  }

  private cleanSummary(value: string): string {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.!?;:])/g, '$1')
      .trim();
  }

  private cleanListItem(value: string): string {
    return String(value || '')
      .replace(/^\s*(?:[-*]|\d+[.)])\s*/, '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.!?;:])/g, '$1')
      .trim();
  }

  private formatTranscriptForNotes(transcript: any, speakerNameMap: SpeakerNameMap): string {
    const utterances = Array.isArray(transcript.utterances)
      ? transcript.utterances as AssemblyAIUtterance[]
      : [];

    if (utterances.length === 0) {
      return String(transcript.text || '').trim();
    }

    const speakerIndexes = this.getSpeakerIndexes(utterances);

    return utterances
      .map((utterance) => {
        const speakerId = this.normalizeSpeakerLabel(utterance.speaker);
        const speakerName = this.resolveSpeakerName(
          speakerId,
          speakerIndexes.get(speakerId) || 0,
          speakerNameMap
        );

        return `${speakerName}: ${String(utterance.text || '').trim()}`;
      })
      .filter((line) => line.trim().length > 0)
      .join('\n');
  }

  private getSpeakerIndexes(utterances: AssemblyAIUtterance[]): Map<string, number> {
    const speakerIndexes = new Map<string, number>();

    utterances.forEach((utterance) => {
      const speakerId = this.normalizeSpeakerLabel(utterance.speaker);
      if (!speakerIndexes.has(speakerId)) {
        speakerIndexes.set(speakerId, speakerIndexes.size);
      }
    });

    return speakerIndexes;
  }

  private normalizeSpeakerLabel(label: unknown): string {
    return String(label ?? '').trim() || 'unknown';
  }

  private resolveSpeakerName(
    speakerId: string,
    speakerIndex: number,
    speakerNameMap: SpeakerNameMap
  ): string {
    const candidateKeys = [
      speakerId,
      `Speaker ${speakerId}`,
      `speaker:${speakerId}`,
      `speaker-${speakerId}`,
    ];

    for (const key of candidateKeys) {
      const mappedName = speakerNameMap[key]?.trim();
      if (mappedName) {
        return mappedName;
      }
    }

    return this.fallbackSpeakerName(speakerId, speakerIndex);
  }

  private fallbackSpeakerName(speakerId: string, speakerIndex: number): string {
    if (/^[a-z]$/i.test(speakerId)) {
      return `Speaker ${speakerId.toUpperCase()}`;
    }

    return `Speaker ${speakerIndex + 1}`;
  }

  /**
   * Get speaker labels from transcript
   */
  async getSpeakerLabels(
    transcriptId: string,
    speakerNameMap: SpeakerNameMap = {}
  ): Promise<Array<{ label: string; speaker: string }>> {
    const transcript = await this.getTranscription(transcriptId);

    if (!Array.isArray(transcript.utterances)) {
      return [];
    }

    // Extract unique speakers with their labels
    const speakers = new Map<string, string>();
    transcript.utterances.forEach((utterance: AssemblyAIUtterance) => {
      const speakerId = this.normalizeSpeakerLabel(utterance.speaker);
      if (!speakers.has(speakerId)) {
        speakers.set(
          speakerId,
          this.resolveSpeakerName(speakerId, speakers.size, speakerNameMap)
        );
      }
    });

    return Array.from(speakers.entries()).map(([label, speaker]) => ({
      label,
      speaker,
    }));
  }

  /**
   * Get transcript with timestamps and speaker labels
   */
  async getDetailedTranscript(
    transcriptId: string,
    speakerNameMap: SpeakerNameMap = {}
  ): Promise<
    Array<{
      text: string;
      start: number;
      end: number;
      speakerId: string;
      speaker: string;
    }>
  > {
    const transcript = await this.getTranscription(transcriptId);

    if (!Array.isArray(transcript.utterances)) {
      return [];
    }

    const speakerIndexes = this.getSpeakerIndexes(transcript.utterances);

    return transcript.utterances.map((utterance: AssemblyAIUtterance) => {
      const speakerId = this.normalizeSpeakerLabel(utterance.speaker);

      return {
        text: String(utterance.text || ''),
        start: Number(utterance.start || 0),
        end: Number(utterance.end || 0),
        speakerId,
        speaker: this.resolveSpeakerName(
          speakerId,
          speakerIndexes.get(speakerId) || 0,
          speakerNameMap
        ),
      };
    });
  }
}

// Singleton instance
let assemblyaiInstance: AssemblyAIService | null = null;

export function getAssemblyAIService(): AssemblyAIService {
  if (!assemblyaiInstance) {
    assemblyaiInstance = new AssemblyAIService();
  }
  return assemblyaiInstance;
}

export default AssemblyAIService;
