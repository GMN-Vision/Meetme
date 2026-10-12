export const GUIDE_FALLBACK = 'I cannot answer that specific question right now. For meeting help, open /help-center or contact gmnnetwork@gmail.com. You can also ask me how to start, schedule, or join a meeting, or where to find recordings and notes.';

export function getGuideAnswer(question: string): string | null {
  const text = question.toLowerCase();
  if (/\b(schedul\w*|book\w*)\b/.test(text) && /\b(meeting|room|call)\b/.test(text)) return '1. Sign in and open /meetings.\n2. Click Schedule meeting.\n3. Enter a title, optional agenda, and a future date and time in your displayed timezone.\n4. Click Schedule meeting. Find the room under Upcoming meetings and use Copy link to invite your people. Scheduling saves the room; it does not send invitations automatically.';
  if (/\b(start|create|host|begin|open)\b/.test(text) && /\b(meeting|room|call)\b/.test(text)) return '1. Sign in and open /meetings.\n2. Click Start meeting to open an instant room. For a named room, click Create meeting, enter a Meeting title, and click Create room.\n3. Allow camera and microphone access when prompted.\n4. Use Copy link in the room toolbar to invite your people.';
  if (/\bjoin\b/.test(text) && /\b(meeting|room|call)\b/.test(text)) return '1. Open the invite link your host shared, or go to /meetings.\n2. Click Join meeting and enter the invite URL or room code.\n3. Click Join. If access fails, check the link and make sure you are using the correct account.';
  if (/\b(notes|summar\w*|transcript\w*)\b/.test(text) && /\b(where|find|view|see|access)\b/.test(text)) return 'Open /meetings/notes (the Meeting notes tab). Processed summaries, decisions, action items, and transcripts appear there when available. After a session ends, processing may take a few minutes.';
  if (/\brecordings?\b/.test(text) && /\b(where|find|view|watch|download)\b/.test(text)) return 'Open /meetings/recordings (the Recordings tab). You can watch or download ready recordings available to your account. Processing recordings may take a few minutes to become playable.';
  return null;
}
