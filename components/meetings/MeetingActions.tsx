'use client';

import { HoverBorderGradient } from '@/components/ui/hover-border-gradient';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarDays, LogIn, Plus, Video } from 'lucide-react';
import { CreateMeetingModal } from '@/components/CreateMeetingModal';
import { JoinModal } from '@/components/JoinModal';

export function MeetingActions({ onScheduled }: { onScheduled?: () => void }) {
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduledMessage, setScheduledMessage] = useState('');
  const router = useRouter();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState('');

  const createMeeting = async (payload: { title: string; description: string; scheduledAt?: string }) => {
    const response = await fetch('/api/create-meeting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || 'Failed to create meeting');
    if (!data?.meetingId) throw new Error('The meeting could not be opened. Please try again.');
    if (payload.scheduledAt) {
      setScheduledMessage('Meeting scheduled. Copy its invite link from Upcoming meetings.');
      onScheduled?.(); return;
    }
    router.push(`/room/${encodeURIComponent(data.meetingId)}`);
  };

  const handleStartMeeting = async () => {
    setError('');
    setIsStarting(true);
    try {
      await createMeeting({ title: 'Instant meeting', description: '' });
    } catch (startError: any) {
      setError(startError?.message || 'Failed to start meeting');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <>
      <section id="live-sessions" aria-label="Start or join a meeting" className="scroll-mt-28">
        {scheduledMessage && <p role="status" className="mb-4 text-sm text-sky-300">{scheduledMessage}</p>}
        {error ? <p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}
        <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr] lg:gap-4">
          <div className="meeting-start-card relative isolate overflow-hidden rounded-3xl border border-zinc-700/70 bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950 p-6 sm:p-8">
            <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 -z-10 h-80 w-80 rounded-full border border-white/5 p-10"><div className="h-full w-full rounded-full border border-white/5 p-10"><div className="h-full w-full rounded-full border border-white/10" /></div></div>
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5"><Video className="h-6 w-6 text-zinc-100" /></div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[.15em] text-zinc-400">A conversation away</p>
            <h2 className="max-w-sm text-2xl font-semibold tracking-tight text-white sm:text-3xl">Bring your people together.</h2>
            <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-400">Open a room in one click. Share the link and let the conversation begin.</p>
            <HoverBorderGradient type="button" onClick={handleStartMeeting} disabled={isStarting} className="button-primary mt-7 w-full gap-3 sm:w-auto">{isStarting ? 'Starting...' : 'Start meeting'}<ArrowRight aria-hidden="true" size={16} /></HoverBorderGradient>
          </div>
          <div className="grid gap-3 lg:gap-4">
            <button type="button" onClick={() => setIsScheduleOpen(true)} className="group flex items-center gap-4 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-5 text-left transition hover:border-zinc-600 hover:bg-zinc-900 sm:p-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-800"><CalendarDays size={21} /></span>
              <span className="min-w-0 flex-1"><span className="block text-base font-semibold text-white">Schedule meeting</span><span className="mt-1 block text-sm leading-6 text-zinc-400">Choose a date and time for your next conversation.</span></span>
              <ArrowRight size={18} className="shrink-0 text-zinc-500 transition group-hover:text-white" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setIsJoinModalOpen(true)} className="group flex items-center gap-4 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-5 text-left transition hover:border-zinc-600 hover:bg-zinc-900 sm:p-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-800"><LogIn size={21} /></span>
              <span className="min-w-0 flex-1"><span className="block text-base font-semibold text-white">Join meeting</span><span className="mt-1 block text-sm leading-6 text-zinc-400">Have an invite? Enter a link or room code.</span></span>
              <ArrowRight size={18} className="shrink-0 text-zinc-500 transition group-hover:text-white" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setIsCreateModalOpen(true)} className="group flex items-center gap-4 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-5 text-left transition hover:border-zinc-600 hover:bg-zinc-900 sm:p-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-800"><Plus size={21} /></span>
              <span className="min-w-0 flex-1"><span className="block text-base font-semibold text-white">Create meeting</span><span className="mt-1 block text-sm leading-6 text-zinc-400">Give your room a name and add an agenda.</span></span>
              <ArrowRight size={18} className="shrink-0 text-zinc-500 transition group-hover:text-white" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>
      <CreateMeetingModal isOpen={isScheduleOpen} scheduled onClose={() => setIsScheduleOpen(false)} onCreate={createMeeting} />
      <JoinModal isOpen={isJoinModalOpen} onClose={() => setIsJoinModalOpen(false)} />
      <CreateMeetingModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onCreate={createMeeting} />
    </>
  );
}
