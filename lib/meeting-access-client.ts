/** Only explicit policy decisions may end an established media session. */
export function isMeetingAccessDenied(status: number, body: { code?: string }) {
  return status === 403 && (
    body.code === 'MEETING_DURATION_REACHED' || body.code === 'PARTICIPANT_LIMIT_REACHED'
  );
}

/** Keep one heartbeat in flight; a slow or unavailable API must not hang up media. */
export function startMeetingAccessHeartbeat(options: {
  meetingId: string;
  participantKey: string;
  onDenied: (message: string) => void;
  onSession: (endsAt: string | null) => void;
}) {
  let stopped = false;
  let controller: AbortController | null = null;

  const heartbeat = async () => {
    if (stopped || controller) return;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 10_000);
    try {
      const response = await fetch('/api/meeting-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: options.meetingId, participantKey: options.participantKey, action: 'heartbeat' }),
        signal: controller.signal,
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (stopped) return;
      if (response.ok && body.success === true) {
        options.onSession(body.sessionEndsAt || null);
      } else if (isMeetingAccessDenied(response.status, body)) {
        stopped = true;
        options.onDenied(body.error || 'Your access to this meeting has ended.');
      }
    } catch {
      // Network failures and API outages do not imply that the call has ended.
    } finally {
      clearTimeout(timeout);
      controller = null;
    }
  };

  const interval = setInterval(() => void heartbeat(), 30_000);
  return {
    check: heartbeat,
    stop: () => {
      stopped = true;
      clearInterval(interval);
      controller?.abort();
    },
  };
}
