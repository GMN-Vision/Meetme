'use client';

import { useCallback, useEffect, useState } from 'react';
import { MeetingCard } from '@/components/MeetingCard';
import { MeetingActions } from './MeetingActions';
import { AIMeetingNotesPanel } from './AIMeetingNotesPanel';

type SavedMeeting = {
  meetingId: string; title: string; hostEmail: string; createdAt: string;
  summary?: string; keyNotes?: string[]; keyDecisions?: string[];
  actionItems?: Array<{ item?: string; owner?: string }>;
  transcript?: Array<{ text?: string; timestamp?: number; speakerId?: string; speaker?: string }>;
};

export function MeetingDashboard({ view = 'meetings' }: { view?: 'meetings' | 'notes' }) {
  const [meetings, setMeetings] = useState<SavedMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/get-meetings', { cache: 'no-store', signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to load meetings.');
      if (!signal?.aborted) setMeetings(body.meetings || []);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : 'Unable to load meetings.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  return <div className="space-y-8">
    {view === 'meetings' && <MeetingActions />}
    {error ? <div role="alert" className="text-red-300"><p>{error}</p><button onClick={() => void refresh()} className="mt-2 underline">Try again</button></div>
      : loading ? <p role="status" className="py-8 text-zinc-400">Loading your {view === 'notes' ? 'notes' : 'meetings'}…</p>
      : view === 'notes' ? <AIMeetingNotesPanel meetings={meetings} title="Meeting notes" />
      : <section aria-labelledby="recent-meetings-title">
        <h2 id="recent-meetings-title" className="mb-4 text-xl font-semibold text-white">Your recent meetings</h2>
        {meetings.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {meetings.map(meeting => <MeetingCard key={meeting.meetingId} {...meeting} />)}
        </div> : <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-zinc-400">Your meetings will appear here. Start your first call above.</div>}
      </section>}
  </div>;
}
