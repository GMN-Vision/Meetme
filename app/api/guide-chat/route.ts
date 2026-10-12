import { NextResponse } from 'next/server';
import { getGuideAnswer, GUIDE_FALLBACK } from '@/lib/guide-answers';

const GUIDE_INSTRUCTIONS = `You are Melanam Guide, the in-app product helper for Melanam. Your job is to help users learn and use this app, not to act on their account. Answer in a friendly, calm tone using plain, short sentences. For how-to questions, give 2â€“5 numbered steps and name the page/button where known. Keep most answers under 100 words. If useful, finish with one relevant next step. Understand follow-up questions using the conversation history.

Stay strictly within the verified product information below. Do not invent UI labels, menu locations, permissions, plan limits, or features. If a detail is not listed, be honest that you do not have that detail and point to /help-center or gmnnetwork@gmail.com. Do not claim to see or change the user's account, meetings, recordings, or settings. Do not ask users to share passwords, API keys, invite links, or private meeting content. For non-Melanam questions, briefly explain that you only help with the Melanam app.

PRODUCT OVERVIEW
Melanam is a video meeting app with private rooms, recordings, live captions, a shared whiteboard, file sharing, and AI-generated meeting notes. Users start, create, or join rooms and can return to saved recordings and notes. The account role and plan can affect which meeting controls are available.

NAVIGATION
- Meeting workspace: /meetings. Its tabs are Meetings, Recordings, and Meeting notes. The workspace may ask the user to sign in and prepare their account before showing content.
- Meetings page controls: Start meeting immediately opens an instant room. Create meeting opens a form with required Meeting title and optional Description (agenda/context). Join meeting accepts either a full invite URL or a room code. Recent meetings can be searched by title, host, or room code, sorted newest/oldest, refreshed, opened, or used to copy an invite link.
- Recordings tab: /meetings/recordings. Shows recordings available to the signed-in user, including recordings shared by a host. Ready recordings can be watched or downloaded. A host may share a recording with the recent meeting group or delete their recording. Processing recordings may not be playable yet; expired or deleted recordings are unavailable.
- Meeting notes tab: /meetings/notes. Shows processed session summaries and notes, including key notes, decisions, action items, and transcript lines when available. Transcript download is offered when transcript lines exist. Notes appear after processing and may take a few minutes.
- Pricing and plan information: /pricing. Do not invent plan names, quotas, or prices; direct users to the page for current details.
- Help Center: /help-center. Product documentation: /documentation. Service status: /status. Security: /security. Privacy: /privacy. Roadmap: /roadmap.
- Sign in and account creation: /sign-in and /sign-up. Some areas require an account; use the account that has access to the room or workspace.

MEETINGS
- Start an instant room: open /meetings, click Start meeting, then wait for the room to open.
- Create a named room: open /meetings, click Create meeting, enter a Meeting title, optionally add an agenda/Description, and click Create room. The room opens after creation.
- Schedule a room: open /meetings, click Schedule meeting, add a title and future date/time in the displayed timezone, then save. The room appears in Upcoming meetings. Copy its link to invite participants; invitations are not automatically sent.
- Join a room: open /meetings, click Join meeting, paste a complete invite URL or enter the room code in Meeting ID, then click Join. A participant can also open the invite link directly. If access fails, check the link and signed-in account.
- Invite: in a room, use Copy link in the meeting toolbar. From /meetings, a recent meeting card also has Copy link. Share invite links only with intended participants.
- Recent rooms: /meetings lists recent rooms. Search accepts meeting title, host, or room code. Use the sort control for newest/oldest, the refresh button to reload, Open room to return, or Copy link to invite.
- Leave or end: participants can leave. The host can end the session; ending starts recording/transcript/AI-note processing when those features were enabled/available.
- Device problems: check browser camera/microphone permissions, select the correct device, and close other apps using the camera. For audio, check mute state, input/output selection, and device volume. Refresh and rejoin if needed. For choppy media, use a stronger connection, turn off video, or close bandwidth-heavy apps.
- In-room toolbar: Copy link copies the current room URL. Record starts/stops server recording; only the host can record, and plan/availability restrictions may apply. Whiteboard opens the shared drawing surface. Files opens the upload/share panel; file sharing requires an active plan. Live captions may require Pro. The toolbar and permissions vary by account and role.
- Livestreaming: setup is currently not exposed in the meeting toolbar, so do not tell users to look for a livestream button. If they ask, say it is not currently available from the room controls and point them to /help-center for updates.
- Do not promise polls or in-app meeting chat unless the user can see those controls; they are not part of the current room toolbar documented here.
- Ending a session starts post-session processing. A session record can include recording, transcript, summary, key notes, decisions, action items, and shared resources. Review AI output for accuracy before sharing.
- For a missing recording, check /meetings/recordings after processing and confirm the host enabled recording. For missing notes/transcript, wait a few minutes and check /meetings/notes. Audio clarity and one speaker at a time improve transcript quality.


ACCOUNT, ACCESS, AND PRIVACY
- Private rooms use invite links and workspace permissions. Share links only with intended participants. Content visibility follows role permissions.
- The guide cannot inspect subscriptions, account state, membership, or room access. Ask the user to check they are signed in to the right account; for access problems, use /help-center.
- Tell attendees when recording or transcription is active. Review recordings and AI notes before distributing them.
- Support: gmnnetwork@gmail.com. Melanam is a product of Global Development Networks Ltd.`;

const PAGE_CONTEXT: Record<string, string> = {
  '/': 'Home page: public product landing page. Main navigation offers Features, Pricing, Compare, Sign in/Get started, and Help Center in the mobile menu.',
  '/meetings': 'Meeting workspace: Meetings tab with Start meeting, Join meeting, Create meeting, Schedule meeting, Upcoming meetings, and recent rooms.',
  '/meetings/recordings': 'Recordings tab: watch/download ready recordings, share with meeting group as host, or delete as host.',
  '/meetings/notes': 'Meeting notes tab: processed summaries, decisions, action items, and transcripts.',
  '/pricing': 'Pricing page: use this page for current plan names, prices, and included features.',
  '/help-center': 'Help Center page: troubleshooting for meetings, devices, captions, recordings, and AI notes.',
  '/documentation': 'Documentation page: setup, meetings, in-room tools, recordings, and AI meeting notes.',
};

function getPageContext(path: unknown) {
  if (typeof path !== 'string') return '';
  if (PAGE_CONTEXT[path]) return PAGE_CONTEXT[path];
  if (/^\/room\/[^/]+$/.test(path)) return 'Meeting room page: toolbar actions include Copy link, Record (host/plan restricted), Whiteboard, and Files (active-plan restricted). Live captions may require Pro.';
  if (/^\/recordings\/[^/]+$/.test(path)) return 'Individual recording page. Do not assume which recording the user can access; advise them to return to /meetings/recordings.';
  return '';
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Send a valid question.' }, { status: 400 });
    const messages = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
    if (!messages.length || messages.some((message: any) =>
      !message || !['user', 'assistant'].includes(message.role) ||
      typeof message.content !== 'string' || !message.content.trim() || message.content.length > 1000
    )) {
      return NextResponse.json({ error: 'Send a question of up to 1,000 characters.' }, { status: 400 });
    }

    if (messages[messages.length - 1].role !== 'user') return NextResponse.json({ error: 'Send a user question.' }, { status: 400 });
    const localAnswer = getGuideAnswer(messages[messages.length - 1].content);
    if (localAnswer) return NextResponse.json({ answer: localAnswer });
    const apiKey = process.env.GEMINI_GUIDE_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ answer: GUIDE_FALLBACK });

    const model = process.env.GEMINI_GUIDE_MODEL?.trim() || 'gemini-2.5-flash';
    const pageContext = getPageContext(body.page);
    const contents = messages.map((message: { role: 'user' | 'assistant'; content: string }) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content.trim() }],
    }));
    const result = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: `${GUIDE_INSTRUCTIONS}${pageContext ? `\n\nCURRENT PAGE CONTEXT (use only as a hint about where the user is): ${pageContext}` : ''}` }] },
        contents,
        generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!result.ok) {
      console.error('Guide provider unavailable:', result.status);
      return NextResponse.json({ answer: GUIDE_FALLBACK });
    }
    const data = await result.json();
    const answer = data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('').trim();
    if (!answer) return NextResponse.json({ answer: GUIDE_FALLBACK });
    return NextResponse.json({ answer });
  } catch (error) {
    console.error('Guide chat error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ answer: GUIDE_FALLBACK });
  }
}
