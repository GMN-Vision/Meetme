'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, RefreshCw, Video, X } from 'lucide-react';
import { MeetingCard } from '@/components/MeetingCard';
import { MeetingActions } from './MeetingActions';
import { AIMeetingNotesPanel } from './AIMeetingNotesPanel';

type SavedMeeting = {
  scheduledAt?: string;
  meetingId: string; title: string; hostEmail: string; createdAt: string;
  summary?: string; keyNotes?: string[]; keyDecisions?: string[];
  actionItems?: Array<{ item?: string; owner?: string }>;
  transcript?: Array<{ text?: string; timestamp?: number; speakerId?: string; speaker?: string }>;
};

export function MeetingDashboard({ view = 'meetings' }: { view?: 'meetings' | 'notes' }) {
  const [upcomingMeetings, setUpcomingMeetings] = useState<SavedMeeting[]>([]);
  const [meetings, setMeetings] = useState<SavedMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/get-meetings', { cache: 'no-store', signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to load meetings.');
      if (!signal?.aborted) { setMeetings(body.meetings || []); setUpcomingMeetings(body.upcomingMeetings || []); }
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

  const filteredMeetings = meetings.filter(meeting =>
    `${meeting.title} ${meeting.hostEmail} ${meeting.meetingId}`.toLowerCase().includes(search.trim().toLowerCase())
  ).sort((a, b) => {
    const difference = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return sort === 'newest' ? difference : -difference;
  });

  return <div className="space-y-9 sm:space-y-12">
    {view === 'meetings' && <MeetingActions onScheduled={() => void refresh()} />}
    {view === 'meetings' && upcomingMeetings.length > 0 && <section aria-labelledby="upcoming-meetings-title" className="space-y-5">
      <h2 id="upcoming-meetings-title" className="text-xl font-semibold text-white">Upcoming meetings</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{upcomingMeetings.map(meeting => <MeetingCard key={meeting.meetingId} {...meeting} />)}</div>
    </section>}
    {view === 'meetings' && <section aria-labelledby="recent-meetings-title" className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 id="recent-meetings-title" className="text-xl font-semibold tracking-tight text-white">Recent meetings</h2><p className="mt-1 text-sm text-zinc-400">Your latest rooms, ready to return to.</p></div>
        <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh meetings" title="Refresh meetings" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      {(meetings.length > 0 || search) && <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1"><Search size={17} aria-hidden="true" className="pointer-events-none absolute left-4 top-4 text-zinc-500" /><input type="search" aria-label="Search recent meetings" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title, host, or room code" className="input-modern !pl-11 !pr-11 text-sm" />{search && <button type="button" aria-label="Clear search" className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center text-zinc-400" onClick={() => setSearch('')}><X size={16} /></button>}</div>
        <select aria-label="Sort recent meetings" value={sort} onChange={e => setSort(e.target.value)} className="min-h-12 rounded-xl px-4 text-sm text-zinc-300 sm:w-44"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
      </div>}
      {error ? <div role="alert" className="rounded-2xl border border-red-400/25 bg-red-400/5 p-5 text-sm text-red-200"><p>{error}</p><button onClick={() => void refresh()} className="mt-3 underline underline-offset-4">Try again</button></div>
      : loading ? <div role="status" aria-label="Loading meetings" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map(index => <div key={index} className="h-52 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50" />)}<span className="sr-only">Loading meetings…</span></div>
      : filteredMeetings.length ? <><p aria-live="polite" className="text-xs text-zinc-500">{search ? `${filteredMeetings.length} of ${meetings.length} recent meetings` : `${meetings.length} recent ${meetings.length === 1 ? 'meeting' : 'meetings'}`}</p><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filteredMeetings.map(meeting => <MeetingCard key={meeting.meetingId} {...meeting} />)}</div></>
      : <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/20 px-6 py-10 text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800/60"><Video size={22} className="text-zinc-400" /></span>
        <h3 className="font-semibold text-zinc-200">{search ? 'No matching meetings' : 'Your next conversation starts here'}</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-400">{search ? 'Try another title, host, or room code.' : 'Start a meeting or create a named room above. Your recent rooms will appear here.'}</p>
        {search && <button onClick={() => setSearch('')} className="button-secondary mt-5">Clear search</button>}
      </div>}
    </section>}
    {view === 'notes' && (error ? <div role="alert" className="text-red-300"><p>{error}</p><button onClick={() => void refresh()} className="mt-2 underline">Try again</button></div> : loading ? <p role="status" className="py-8 text-zinc-400">Loading your notes…</p> : <AIMeetingNotesPanel meetings={meetings} title="Meeting notes" />)}
  </div>;
}
