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
      <section id="live-sessions" className="meeting-actions scroll-mt-24 grid overflow-hidden rounded-lg border border-[#2a3039] bg-[#12151a] lg:grid-cols-[0.72fr_1.28fr]">
        <div className="meeting-actions__intro border-b border-[#2a3039] bg-[#101319] p-5 lg:border-b-0 lg:border-r">
          <Video className="h-5 w-5 text-[#37d7ff]" />
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-[#37d7ff]">Meetings</p>
          <h3 className="mt-2 font-display text-xl font-semibold text-[#f4f7fa]">Start a conversation</h3>
          {error ? <p role="alert" className="mt-4 border border-[#ef6b73] bg-[#27171b] px-3 py-2 text-sm text-[#efb2b7]">{error}</p> : null}
        </div>
        <div className="grid gap-px bg-[#2a3039] sm:grid-cols-3">
          {actions.map(({ title, icon: Icon, button }) => (
            <div key={title} className="meeting-action flex min-h-[170px] flex-col justify-between bg-[#12151a] p-5">
              <div>
                <Icon className="h-5 w-5 text-[#37d7ff]" />
                <h4 className="mt-8 text-base font-semibold text-[#f4f7fa]">{title}</h4>
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
