'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, LogIn, Rocket, Video } from 'lucide-react';
import { CreateMeetingModal } from '@/components/CreateMeetingModal';
import { JoinModal } from '@/components/JoinModal';
import { GradientBorderButton } from '@/components/ui/gradient-border-button';

export function MeetingActions() {
  const router = useRouter();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState('');

  const createMeeting = async (payload: { title: string; description: string }) => {
    const response = await fetch('/api/create-meeting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || 'Failed to create meeting');
    if (!data?.meetingId) throw new Error('The meeting could not be opened. Please try again.');
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

  const actions = [
    { title: 'Create room', icon: CalendarPlus, button: <GradientBorderButton variant="create" onClick={() => setIsCreateModalOpen(true)}>Create meeting</GradientBorderButton> },
    { title: 'Join by invite', icon: LogIn, button: <GradientBorderButton variant="join" onClick={() => setIsJoinModalOpen(true)}>Join meeting</GradientBorderButton> },
    { title: 'Start now', icon: Rocket, button: <GradientBorderButton variant="dark" onClick={handleStartMeeting} disabled={isStarting}>{isStarting ? 'Starting...' : 'Start meeting'}</GradientBorderButton> },
  ];

  return (
    <>
      <section id="live-sessions" aria-label="Start or join a meeting" className="scroll-mt-28">
        {error ? <p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}
        <div className="grid gap-4 sm:grid-cols-3">
          {actions.map(({ title, icon: Icon, button }) => (
            <div key={title} className="template-card template-feature flex min-h-[220px] flex-col justify-between">
              <div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800"><Icon className="h-5 w-5 text-zinc-300" /></span>
                <h2 className="mt-5 text-lg font-semibold text-white">{title}</h2>
              </div>
              <div className="mt-5">{button}</div>
            </div>
          ))}
        </div>
      </section>
      <JoinModal isOpen={isJoinModalOpen} onClose={() => setIsJoinModalOpen(false)} />
      <CreateMeetingModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onCreate={createMeeting} />
    </>
  );
}
