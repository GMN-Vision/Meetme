'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import TaskList from '@/components/TaskList';
import ParticipationAnalytics from '@/components/ParticipationAnalytics';
import FileShare from '@/components/FileShare';
import AIResultsDisplay from '@/components/AIResultsDisplay';

type MeetingData = {
  _id: string;
  meetingId: string;
  title: string;
  description?: string;
  summary?: string;
  keyNotes?: string[];
  keyDecisions?: string[];
  actionItems?: any[];
  transcript?: Array<{ text: string; timestamp: number; speakerId?: string; speaker?: string }>;
  speakerLabels?: any[];
};

export default function RecordingPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [meeting, setMeeting] = useState<MeetingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMeeting = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/get-meeting?id=${encodeURIComponent(id)}`);
        if (!response.ok) {
          router.push('/');
          return;
        }

        const body = await response.json();
        setMeeting(body.meeting || null);
      } catch (error) {
        console.error('fetch recording page', error);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchMeeting();
    }
  }, [id, router]);

  if (loading) {
    return <div className="p-6 text-sm font-medium text-zinc-400">Loading meeting brief...</div>;
  }

  if (!meeting) {
    return <div className="p-6 text-red-600">Meeting brief not found.</div>;
  }

  return (
    <div className="mx-auto w-full max-w-[80rem] px-4 py-8 sm:px-5">
      <div className="mb-5 border-b border-[#27272a] pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-300">Recording and AI insights</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-zinc-100">
          {meeting.title || meeting.meetingId}
        </h1>
        {meeting.description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">{meeting.description}</p>
        ) : null}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <AIResultsDisplay
            meetingId={meeting.meetingId}
            summary={meeting.summary}
            keyNotes={meeting.keyNotes || []}
            keyDecisions={meeting.keyDecisions || []}
            actionItems={(meeting.actionItems || []).map((action: any) => (
              typeof action === 'string'
                ? { item: action }
                : {
                    item: action?.item || action?.description || action?.task || '',
                    owner: action?.owner || action?.assignee || '',
                  }
            ))}
            transcript={(meeting.transcript || []).map((entry) => ({
              text: entry.text,
              timestamp: entry.timestamp,
              speakerId: entry.speakerId || entry.speaker || 'speaker',
              speaker: entry.speaker || entry.speakerId || 'Speaker',
            }))}
            speakerLabels={meeting.speakerLabels || []}
          />

          <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="font-display text-lg font-semibold text-zinc-100">Participation</h2>
            <div className="mt-3">
              <ParticipationAnalytics meetingId={meeting.meetingId} />
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="font-display text-lg font-semibold text-zinc-100">Tasks</h2>
            <div className="mt-3">
              <TaskList meetingId={meeting.meetingId} />
            </div>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="font-display text-lg font-semibold text-zinc-100">Files</h2>
            <div className="mt-3">
              <FileShare meetingId={meeting.meetingId} />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
