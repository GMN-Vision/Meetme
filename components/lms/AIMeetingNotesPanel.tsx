'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Download,
  FileText,
  ListChecks,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { GlowCard } from '@/components/ui/glow-card';

type TranscriptEntry = {
  text?: string;
  timestamp?: number;
  speakerId?: string;
  speaker?: string;
};

type ActionItem = {
  item?: string;
  owner?: string;
};

type AIMeeting = {
  _id?: string;
  meetingId: string;
  title?: string;
  summary?: string;
  keyNotes?: string[];
  keyDecisions?: string[];
  actionItems?: ActionItem[];
  transcript?: TranscriptEntry[];
  speakerLabels?: Array<{ speakerId: string; name: string }>;
  updatedAt?: string;
};

interface AIMeetingNotesPanelProps {
  meetings?: AIMeeting[];
  title?: string;
}

export function AIMeetingNotesPanel({
  meetings = [],
  title = 'AI Meeting Notes',
}: AIMeetingNotesPanelProps) {
  const [localMeetings, setLocalMeetings] = useState<AIMeeting[]>(meetings);
  const [visibleCount, setVisibleCount] = useState(3);
  const [deletingMeetingId, setDeletingMeetingId] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setLocalMeetings(meetings);
    setVisibleCount(3);
  }, [meetings]);

  const allMeetings = useMemo(
    () => localMeetings.filter((meeting) => (
      cleanText(meeting?.summary) ||
      (meeting?.keyNotes || []).length > 0 ||
      (meeting?.keyDecisions || []).length > 0 ||
      (meeting?.actionItems || []).length > 0 ||
      (meeting?.transcript || []).length > 0
    )),
    [localMeetings]
  );

  const visibleMeetings = allMeetings.slice(0, visibleCount);

  const totalNotes = allMeetings.reduce((count, meeting) => count + (meeting.keyNotes || []).length, 0);
  const totalActions = allMeetings.reduce((count, meeting) => count + (meeting.actionItems || []).length, 0);

  const handleDeleteSummary = async (meeting: AIMeeting) => {
    if (!meeting.meetingId || deletingMeetingId) return;

    const confirmed = window.confirm('Delete this meeting summary from the dashboard?');
    if (!confirmed) return;

    setDeletingMeetingId(meeting.meetingId);
    setMessage('');

    try {
      const response = await fetch(`/api/ai/meeting-summary/${encodeURIComponent(meeting.meetingId)}`, {
        method: 'DELETE',
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(body.error || 'Failed to delete summary');
        return;
      }

      setLocalMeetings((current) => current.filter((item) => item.meetingId !== meeting.meetingId));
      setMessage('Summary deleted');
    } catch {
      setMessage('Failed to delete summary');
    } finally {
      setDeletingMeetingId('');
    }
  };

  return (
    <GlowCard id="meeting-insights" className="ai-notes-panel scroll-mt-24">
      <div className="ai-notes-panel__header flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-md border border-[#37d7ff]/45 bg-[#12303a] px-2.5 py-1 text-xs font-bold text-[#58defe]">
            <Sparkles className="h-4 w-4" />
            Meeting Intelligence
          </div>
          <h3 className="mt-2 font-display text-xl font-semibold text-[#f4f7fa]">{title}</h3>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <PanelMetric label="Briefs" value={allMeetings.length} />
          <PanelMetric label="Notes" value={totalNotes} />
          <PanelMetric label="Actions" value={totalActions} />
        </div>
      </div>

      {message ? (
        <div className="mt-3 rounded-md border border-[#2a3039] bg-[#181c22] px-3 py-2 text-sm font-semibold text-[#a7b1bc]">
          {message}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {visibleMeetings.map((meeting) => {
          const notes = cleanList(meeting.keyNotes || []).slice(0, 2);
          const decisions = cleanList(meeting.keyDecisions || []).slice(0, 1);
          const actions = (meeting.actionItems || [])
            .map((item) => ({ item: cleanText(item?.item), owner: cleanText(item?.owner) }))
            .filter((item) => item.item.length > 0)
            .slice(0, 1);
          const summaryPoints = splitSummary(cleanText(meeting.summary));
          const leadSummary =
            summaryPoints[0] ||
            'Summary is still being prepared for this meeting.';

          return (
            <article key={meeting._id || meeting.meetingId} className="ai-notes-card">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[15px] font-semibold text-[#f4f7fa]">
                      {meeting.title || meeting.meetingId}
                    </p>
                    <span className="rounded-md border border-[#343c47] bg-[#181c22] px-2 py-1 text-sm font-semibold text-[#9ca8b8]">
                      {meeting.updatedAt ? new Date(meeting.updatedAt).toLocaleDateString() : 'Recent'}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-[#b8c2ce]">{leadSummary}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-medium text-[#a7b1bc]">
                    <StatChip icon={FileText} label={`${(meeting.transcript || []).length} transcript lines`} />
                    <StatChip icon={Users} label={`${(meeting.speakerLabels || []).length || 0} speakers`} />
                    <StatChip icon={CheckCircle2} label={`${(meeting.keyDecisions || []).length} decisions`} />
                    <StatChip icon={ListChecks} label={`${(meeting.actionItems || []).length} actions`} />
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => downloadTranscript(meeting)}
                    disabled={(meeting.transcript || []).length === 0}
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-[#343c47] bg-[#181c22] px-2.5 text-xs font-semibold text-[#58defe] transition hover:border-[#37d7ff]/70 hover:bg-[#12303a] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Transcript
                  </button>
                  <Link
                    href={`/recordings/${encodeURIComponent(meeting.meetingId)}`}
                    className="inline-flex h-8 items-center rounded-md bg-[#26303d] px-2.5 text-xs font-semibold text-[#f4f7fa] transition hover:bg-[#343f4d]"
                  >
                    Open Brief
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleDeleteSummary(meeting)}
                    disabled={deletingMeetingId === meeting.meetingId}
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-[#f87171]/45 bg-[#21171a] px-2.5 text-xs font-semibold text-[#ff9292] transition hover:bg-[#321b20] disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Delete meeting summary"
                    title="Delete meeting summary"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>

              <MeetingHighlights notes={notes} decisions={decisions} actions={actions} />
            </article>
          );
        })}

        {allMeetings.length > visibleCount ? (
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + 3)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[#343c47] bg-[#181c22] px-3 text-sm font-semibold text-[#a7b1bc] transition hover:border-[#37d7ff]/70 hover:text-[#58defe]"
          >
            <ChevronDown className="h-4 w-4" />
            Show more summaries
          </button>
        ) : visibleCount > 3 && allMeetings.length > 3 ? (
          <button
            type="button"
            onClick={() => setVisibleCount(3)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[#343c47] bg-[#181c22] px-3 text-sm font-semibold text-[#a7b1bc] transition hover:border-[#37d7ff]/70 hover:text-[#58defe]"
          >
            <ChevronUp className="h-4 w-4" />
            Show fewer
          </button>
        ) : null}

        {allMeetings.length === 0 ? (
          <div className="rounded-md border border-dashed border-[#343c47] bg-[#181c22] p-4 text-sm leading-6 text-[#9ca8b8]">
            Professional summaries, key notes, decisions, action items, and downloadable transcripts will appear here after meetings are processed.
          </div>
        ) : null}
      </div>

      <CompactRecordingHistory />
    </GlowCard>
  );
}

function PanelMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[5.25rem] rounded-md border border-[#343c47] bg-[#181c22] px-3 py-2">
      <div className="text-base font-semibold text-[#f4f7fa]">{value}</div>
      <div className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9ca8b8]">{label}</div>
    </div>
  );
}

function StatChip({ icon: Icon, label }: { icon: typeof FileText; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#343c47] bg-[#181c22] px-2.5 py-1">
      <Icon className="h-3.5 w-3.5 text-[#37d7ff]" />
      {label}
    </span>
  );
}

function MeetingHighlights({
  notes,
  decisions,
  actions,
}: {
  notes: string[];
  decisions: string[];
  actions: Array<{ item: string; owner: string }>;
}) {
  const sections = [
    notes.length > 0 ? { title: 'Key Notes', items: notes } : null,
    decisions.length > 0 ? { title: 'Decisions', items: decisions } : null,
    actions.length > 0
      ? { title: 'Actions', items: actions.map((action) => action.owner ? `${action.owner}: ${action.item}` : action.item) }
      : null,
  ].filter((section): section is { title: string; items: string[] } => Boolean(section));

  if (sections.length === 0) return null;

  return (
    <div className={`ai-notes-card__details mt-4 grid gap-2 ${sections.length === 1 ? 'lg:grid-cols-1' : sections.length === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
      {sections.map((section) => <MiniList key={section.title} title={section.title} items={section.items} />)}
    </div>
  );
}

function MiniList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-[#343c47] bg-[#181c22] p-3">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#9ca8b8]">{title}</p>
      <div className="mt-2 space-y-1.5">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="flex gap-2 text-xs leading-4 text-[#d5dbe3]">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#37d7ff]" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type RecordingHistoryItem = {
  _id?: string;
  meetingId?: string;
  title?: string;
  recorded?: boolean;
  recordedBy?: string;
  recordingDuration?: string;
  recordingDurationSeconds?: number;
  recordingDate?: string;
  recordingStatus?: string;
};

function CompactRecordingHistory() {
  const [meetings, setMeetings] = useState<RecordingHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch('/api/meeting-history');
        const body = await response.json().catch(() => ({}));

        if (active && response.ok) {
          setMeetings((body.meetings || []).filter((meeting: RecordingHistoryItem) => meeting.recorded).slice(0, 3));
        }
      } catch {
        if (active) {
          setMeetings([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-950">Meeting History</h4>
        <span className="text-xs font-semibold text-slate-500">Metadata only</span>
      </div>

      {loading ? (
        <p className="mt-2 text-sm text-slate-500">Loading history...</p>
      ) : meetings.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No downloaded recordings yet.</p>
      ) : (
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          {meetings.map((meeting) => (
            <div key={meeting._id || meeting.meetingId} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="truncate text-sm font-semibold text-slate-950">{meeting.title || meeting.meetingId || 'Meeting'}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="h-3.5 w-3.5" />
                  {formatShortDuration(meeting.recordingDurationSeconds, meeting.recordingDuration)}
                </span>
                <span>{meeting.recordingStatus || 'Downloaded'}</span>
              </div>
              <p className="mt-1 truncate text-xs text-slate-500">{meeting.recordedBy || 'Recorder'} &middot; {meeting.recordingDate || 'Recent'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function downloadTranscript(meeting: AIMeeting) {
  const lines = (meeting.transcript || []).map((entry) => {
    const speaker = entry.speaker || entry.speakerId || 'Speaker';
    return `[${formatTimestamp(Number(entry.timestamp || 0))}] ${speaker}: ${entry.text || ''}`;
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `transcript-${meeting.meetingId}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function cleanText(value?: string) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}

function cleanList(items: string[]) {
  const seen = new Set<string>();

  return items
    .map(cleanText)
    .filter((item) => {
      if (!item) return false;
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function splitSummary(value: string) {
  const sentences = cleanText(value)
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g);

  return (sentences || [])
    .map(cleanText)
    .filter((sentence) => sentence.length > 0)
    .slice(0, 5);
}

function formatShortDuration(totalSeconds?: number, fallbackLabel?: string) {
  const parsedSeconds = Number(totalSeconds || 0) || parseDurationLabel(fallbackLabel);

  if (parsedSeconds <= 0) {
    return fallbackLabel || '-';
  }

  const hours = Math.floor(parsedSeconds / 3600);
  const minutes = Math.floor((parsedSeconds % 3600) / 60);
  const seconds = parsedSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
  }

  if (minutes > 0) {
    return `${minutes} min`;
  }

  return `${seconds} sec`;
}

function parseDurationLabel(value?: string) {
  const match = String(value || '').match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return 0;

  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function formatTimestamp(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
