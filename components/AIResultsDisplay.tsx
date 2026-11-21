'use client';

import { useMemo, useState } from 'react';
import { downloadTranscript, formatTranscriptTimestamp } from '@/lib/transcript-download';
import {
  IconChevronDown,
  IconChecks,
  IconClipboardList,
  IconDownload,
  IconFileText,
  IconUsers,
} from '@tabler/icons-react';

interface ISpeaker {
  speakerId: string;
  name: string;
  color: string;
}

interface ITranscript {
  text: string;
  timestamp: number;
  speakerId: string;
  speaker: string;
}

interface IActionItem {
  item: string;
  owner?: string;
}

interface AIResultsDisplayProps {
  meetingId: string;
  summary?: string;
  keyNotes?: string[];
  keyDecisions?: string[];
  actionItems?: IActionItem[];
  transcript?: ITranscript[];
  speakerLabels?: ISpeaker[];
  className?: string;
}

type BriefSection = {
  id: 'notes' | 'decisions';
  title: string;
  items: string[];
  icon: typeof IconFileText;
  emptyText: string;
};

export function AIResultsDisplay({
  meetingId,
  summary,
  keyNotes = [],
  keyDecisions = [],
  actionItems = [],
  transcript = [],
  speakerLabels = [],
  className = '',
}: AIResultsDisplayProps) {
  const [showTranscript, setShowTranscript] = useState(false);
  const polishedSummary = cleanText(summary);
  const summaryPoints = useMemo(() => splitSummary(polishedSummary), [polishedSummary]);
  const notes = useMemo(() => cleanList(keyNotes), [keyNotes]);
  const decisions = useMemo(() => cleanList(keyDecisions), [keyDecisions]);
  const actions = useMemo(
    () => actionItems
      .map((item) => ({ item: cleanText(item?.item), owner: cleanText(item?.owner) }))
      .filter((item) => item.item.length > 0),
    [actionItems]
  );

  const hasAIContent = polishedSummary || notes.length > 0 || decisions.length > 0 || actions.length > 0 || transcript.length > 0;
  if (!hasAIContent) return null;

  const leadSummary = summaryPoints[0] || 'A meeting brief will appear once enough context has been captured.';
  const supportingSummary = summaryPoints.slice(1, 5);
  const sections: BriefSection[] = [
    { id: 'notes', title: 'Key notes', items: notes, icon: IconFileText, emptyText: 'No key notes were identified yet.' },
    { id: 'decisions', title: 'Decisions', items: decisions, icon: IconChecks, emptyText: 'No explicit decisions were captured.' },
  ];

  const getSpeakerColor = (speakerId: string) => speakerLabels.find((item) => item.speakerId === speakerId)?.color || '#334155';

  return (
    <div className={`ai-brief ${className}`}>
      <section className="ai-brief__overview">
        <div className="ai-brief__heading">
          <div>
            <p className="ai-brief__eyebrow">AI meeting intelligence</p>
            <h3 className="ai-brief__title">Executive brief</h3>
            <p className="ai-brief__description">The outcome, decisions and next steps from this meeting.</p>
          </div>
          <div className="ai-brief__metrics" aria-label="Meeting brief counts">
            <Metric label="Notes" value={notes.length} />
            <Metric label="Decisions" value={decisions.length} />
            <Metric label="Actions" value={actions.length} />
          </div>
        </div>

        <div className="ai-brief__takeaway">
          <p className="ai-brief__takeaway-label">Main takeaway</p>
          <p className="ai-brief__takeaway-text">{leadSummary}</p>
        </div>

        {supportingSummary.length > 0 ? (
          <ol className="ai-brief__summary-points">
            {supportingSummary.map((point, index) => (
              <li key={`${point}-${index}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{point}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <div className="ai-brief__grid">
        {sections.map((section) => <BriefList key={section.id} section={section} />)}
      </div>

      <section className="ai-brief__actions">
        <div className="ai-brief__section-heading">
          <IconClipboardList className="h-5 w-5" />
          <div>
            <p className="ai-brief__eyebrow">Follow-up</p>
            <h4>Action ledger</h4>
          </div>
        </div>
        {actions.length > 0 ? (
          <ol className="ai-brief__action-list">
            {actions.map((action, index) => (
              <li key={`${action.item}-${index}`}>
                <span className="ai-brief__action-index">{String(index + 1).padStart(2, '0')}</span>
                <p>{action.item}</p>
                <span className="ai-brief__owner">{action.owner ? `Owner: ${action.owner}` : 'Owner unassigned'}</span>
              </li>
            ))}
          </ol>
        ) : <p className="ai-brief__empty">No action items were assigned.</p>}
      </section>

      {transcript.length > 0 ? (
        <section className="ai-brief__transcript">
          <div className="ai-brief__transcript-toolbar">
            <button type="button" onClick={() => setShowTranscript((value) => !value)} className="ai-brief__transcript-toggle" aria-expanded={showTranscript}>
              <span className="ai-brief__transcript-icon"><IconUsers className="h-4 w-4" /></span>
              <span>
                <strong>Speaker transcript</strong>
                <small>{transcript.length} entries from {speakerLabels.length || 'unknown'} speakers</small>
              </span>
              <IconChevronDown className={`ai-brief__chevron h-5 w-5 ${showTranscript ? 'ai-brief__chevron--open' : ''}`} />
            </button>
            <button type="button" onClick={() => downloadTranscript(meetingId, transcript)} className="ai-brief__download" title="Save transcript" aria-label="Save transcript">
              <IconDownload className="h-4 w-4" />
            </button>
          </div>
          {showTranscript ? (
            <div className="ai-brief__transcript-list">
              {transcript.map((entry, index) => (
                <article key={`${entry.timestamp}-${entry.speakerId}-${index}`} className="ai-brief__transcript-entry">
                  <div>
                    <span className="ai-brief__speaker" style={{ backgroundColor: getSpeakerColor(entry.speakerId) }}>{entry.speaker || entry.speakerId || 'Speaker'}</span>
                    <time>{formatTranscriptTimestamp(entry.timestamp)}</time>
                  </div>
                  <p>{entry.text}</p>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="ai-brief__metric"><strong>{value}</strong><span>{label}</span></div>;
}

function BriefList({ section }: { section: BriefSection }) {
  const Icon = section.icon;
  return (
    <section className={`ai-brief__list ai-brief__list--${section.id}`}>
      <div className="ai-brief__section-heading">
        <Icon className="h-5 w-5" />
        <div><p className="ai-brief__eyebrow">Meeting record</p><h4>{section.title}</h4></div>
      </div>
      {section.items.length > 0 ? (
        <ol>
          {section.items.map((item, index) => <li key={`${section.id}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{item}</p></li>)}
        </ol>
      ) : <p className="ai-brief__empty">{section.emptyText}</p>}
    </section>
  );
}

function cleanText(value?: string) {
  return String(value || '').replace(/\s+/g, ' ').replace(/\s+([,.!?;:])/g, '$1').trim();
}

function cleanList(items: string[]) {
  const seen = new Set<string>();
  return items.map(cleanText).filter((item) => {
    if (!item) return false;
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function splitSummary(value: string) {
  const sentences = cleanText(value).match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return (sentences || []).map(cleanText).filter(Boolean).slice(0, 6);
}

export default AIResultsDisplay;
