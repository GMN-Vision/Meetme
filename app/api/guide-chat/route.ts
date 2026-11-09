import { NextResponse } from 'next/server';
import { getGuideAnswer, GUIDE_FALLBACK, GUIDE_PRODUCT_CONTEXT } from '@/lib/guide-answers';

export const runtime = 'nodejs';

const PAGE_CONTEXT: Record<string, string> = {
  '/': 'Public home page. Use the site navigation for Features, Pricing, About, sign in, and getting started.',
  '/meetings': 'Meeting workspace. The user can start, create, schedule, or join a meeting and browse recent meetings.',
  '/meetings/recordings': 'Recordings page. The user can watch and download ready recordings they can access.',
  '/meetings/notes': 'Meeting notes page. Processed summaries and transcripts appear here when available.',
  '/pricing': 'Pricing page. Current plan details are visible here; do not guess the user’s subscription.',
  '/help-center': 'Help Center page with troubleshooting and support contact details.',
  '/documentation': 'Documentation page with product guidance.',
};

function pageContext(path: unknown) {
  if (typeof path !== 'string') return '';
  if (PAGE_CONTEXT[path]) return PAGE_CONTEXT[path];
  if (/^\/room\/[^/]+$/.test(path)) return 'Live meeting room. The page has Video playlist and Shared files side panels. The room navbar has Copy link, Subtitles, Whiteboard, and host approvals. The host also has End meeting for all. Never assume the current role, plan, or active feature state.';
  if (/^\/recordings\/[^/]+$/.test(path)) return 'Individual recording page. The guide cannot inspect which recording this user can access.';
  return '';
}

function offlineAnswer(messages: Array<{ role: 'user' | 'assistant'; content: string }>, page: unknown) {
  const current = messages.at(-1)?.content || '';
  const previous = messages.slice(0, -1).reverse().find(message => message.role === 'user')?.content || '';
  const answer = getGuideAnswer(current, previous);
  if (answer) return answer;
  if (/\b(this page|here|on this screen)\b/i.test(current)) {
    if (typeof page === 'string' && /^\/room\/[^/]+$/.test(page)) return 'You are on a meeting room page. Use Video playlist for shared videos, Shared files for uploads and presentations, or the room navbar for Copy link, Subtitles, and Whiteboard. The host sees approval requests in the navbar.';
    if (page === '/meetings') return 'This is your meeting workspace. You can start, create, schedule, or join a meeting, then open recent rooms. Use Recordings or Meeting notes to revisit previous sessions.';
  }
  return GUIDE_FALLBACK;
}

export async function POST(request: Request) {
  let fallbackAnswer = GUIDE_FALLBACK;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Send a valid question.' }, { status: 400 });
    const messages = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
    if (!messages.length || messages.some((message: any) =>
      !message || !['user', 'assistant'].includes(message.role) ||
      typeof message.content !== 'string' || !message.content.trim() || message.content.length > 1000
    )) return NextResponse.json({ error: 'Send a question of up to 1,000 characters.' }, { status: 400 });
    if (messages.at(-1).role !== 'user') return NextResponse.json({ error: 'Send a user question.' }, { status: 400 });

    const question = messages.at(-1).content.trim();
    fallbackAnswer = offlineAnswer(messages, body.page);
    // Give the most common one-step questions an immediate, verified answer.
    // Nuanced requests and follow-ups go through the model with full context.
    if (messages.length === 1 && question.length < 140 && !/\b(and|but|also|except|however)\b/i.test(question)) {
      const direct = getGuideAnswer(question);
      if (direct) return NextResponse.json({ answer: direct });
    }

    const apiKey = process.env.GEMINI_GUIDE_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ answer: offlineAnswer(messages, body.page) });
    const model = process.env.GEMINI_GUIDE_MODEL?.trim() || 'gemini-2.5-flash';
    const instruction = `You are Melanam Guide, an in-app product expert. Help the user complete their task with the exact controls and page names in the verified guide below. Use conversation history for follow-ups. Use the current page hint when relevant. Give concise steps for how-to questions; explain causes and next checks for troubleshooting. If a role or plan matters, say which role or plan is needed. Do not invent buttons, quotas, prices, account state, or technical capabilities. If the guide lacks the answer, say what is uncertain and ask one specific clarifying question or direct the user to /help-center. Do not ask for passwords, API keys, invite links, or private meeting content. For unrelated questions, say you help with Melanam.\n\n${GUIDE_PRODUCT_CONTEXT}\n\nCurrent page: ${pageContext(body.page) || 'unknown'}`;
    const contents = messages.map((message: { role: 'user' | 'assistant'; content: string }) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content.trim() }],
    }));
    const result = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: instruction }] },
        contents,
        generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!result.ok) {
      console.error('Guide provider unavailable:', result.status);
      return NextResponse.json({ answer: offlineAnswer(messages, body.page) });
    }
    const data = await result.json();
    const answer = data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('').trim();
    return NextResponse.json({ answer: answer || offlineAnswer(messages, body.page) });
  } catch (error) {
    console.error('Guide chat error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ answer: fallbackAnswer });
  }
}
