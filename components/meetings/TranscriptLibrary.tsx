'use client';

import { useEffect, useState } from 'react';
import { Download, FileText, Search, Share2, Users } from 'lucide-react';
import { downloadTranscript, formatTranscriptTimestamp } from '@/lib/transcript-download';

type SavedTranscript = {
  meetingId: string;
  title: string;
  lines: Array<{ text: string; timestamp: number; speaker: string; speakerId: string }>;
  completedAt?: string;
  updatedAt: string;
  sharedAt?: string;
  isHost: boolean;
};

export function TranscriptLibrary() {
  const [transcripts, setTranscripts] = useState<SavedTranscript[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch('/api/transcripts', { cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not load transcripts.');
        setTranscripts(body.transcripts);
        setError('');
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load transcripts.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);

  const selected = transcripts.find(item => item.meetingId === selectedId) || transcripts[0];
  const lines = [...(selected?.lines || [])].sort((a, b) => a.timestamp - b.timestamp);
  const matchingLines = lines.filter(line => `${line.speaker} ${line.text}`.toLowerCase().includes(query.toLowerCase()));
  const speakers = [...new Set(lines.map(line => line.speaker || 'Speaker'))];

  const share = async () => {
    if (!selected || sharing) return;
    setSharing(true);
    setNotice('');
    setError('');
    try {
      const response = await fetch('/api/transcripts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'share', meetingId: selected.meetingId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not share the transcript.');
      setTranscripts(current => current.map(item => item.meetingId === selected.meetingId ? { ...item, sharedAt: new Date().toISOString() } : item));
      setNotice(body.members ? `Shared with ${body.members} meeting participant${body.members === 1 ? '' : 's'}. They can open it in their Transcripts section.` : 'No signed-in meeting participants are available to share with yet.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not share the transcript.');
    } finally { setSharing(false); }
  };

  if (loading) return <p role="status" className="py-12 text-zinc-400">Loading transcripts…</p>;

  return <section aria-label="Meeting transcripts" className="space-y-4">
    {error && <p role="alert" className="rounded-xl border border-red-400/30 p-4 text-sm text-red-200">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-400/30 p-4 text-sm text-emerald-200">{notice}</p>}
    {!selected ? <div className="rounded-2xl border border-dashed border-zinc-700 px-6 py-16 text-center">
      <FileText className="mx-auto mb-4 h-9 w-9 text-zinc-500" />
      <h2 className="text-lg font-semibold text-white">Your conversations, in writing</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">Meeting transcripts save automatically as speech is transcribed. After the meeting, read, download, or share them here.</p>
    </div> : <div className="grid items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <nav aria-label="Choose a transcript" className="flex gap-2 overflow-x-auto pb-2 lg:max-h-[70vh] lg:flex-col lg:overflow-y-auto">
        {transcripts.map(item => <button key={item.meetingId} type="button" aria-current={selected.meetingId === item.meetingId ? 'true' : undefined} onClick={() => { setSelectedId(item.meetingId); setQuery(''); setNotice(''); }} className={`min-w-56 rounded-2xl border p-4 text-left transition lg:min-w-0 ${selected.meetingId === item.meetingId ? 'border-zinc-500 bg-zinc-800' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600'}`}>
          <FileText className="mb-3 h-5 w-5 text-zinc-400" />
          <span className="block truncate text-sm font-semibold text-white">{item.title}</span>
          <span className="mt-1 block text-xs text-zinc-400">{new Date(item.completedAt || item.updatedAt).toLocaleDateString()} · {item.lines.length} lines</span>
          <span className="mt-3 block text-xs text-zinc-500">{!item.isHost ? 'Shared with you' : !item.completedAt ? 'Saving automatically' : item.sharedAt ? 'Shared with participants' : 'Private to you'}</span>
        </button>)}
      </nav>
      <article className="min-w-0 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
        <header className="border-b border-zinc-800 p-5 sm:p-6">
          <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Meeting transcript</p>
          <h2 className="break-words text-2xl font-semibold tracking-tight text-white">{selected.title}</h2>
          <p className="mt-2 flex items-center gap-2 text-xs text-zinc-400"><Users size={14} /> {speakers.length} speakers · {lines.length} lines</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => downloadTranscript(selected.meetingId, lines)} disabled={!lines.length} className="button-secondary !min-h-10 !px-4 !text-xs"><Download size={15} /> Download transcript</button>
            {selected.isHost && <button type="button" onClick={() => void share()} disabled={sharing || !selected.completedAt || !lines.length} className="button-secondary !min-h-10 !px-4 !text-xs"><Share2 size={15} /> {sharing ? 'Sharing…' : selected.sharedAt ? 'Share again' : 'Share with participants'}</button>}
          </div>
          {!selected.completedAt && <p className="mt-3 text-xs text-zinc-500">Sharing becomes available when the host leaves or ends the meeting.</p>}
          <label className="relative mt-5 block"><span className="sr-only">Search transcript</span><Search size={16} className="absolute left-3 top-3 text-zinc-500" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a word or speaker" className="w-full rounded-xl py-2.5 pl-10 pr-3 text-sm" /></label>
        </header>
        <div className="max-h-[65vh] space-y-5 overflow-y-auto p-5 sm:p-6" tabIndex={0} aria-label="Transcript text">
          {matchingLines.map((line, index) => <div key={`${line.timestamp}-${index}`} className="flex gap-3 sm:gap-4">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-xs font-semibold text-zinc-300">{(line.speaker || 'Speaker').slice(0, 2).toUpperCase()}</span>
            <div className="min-w-0 flex-1"><div className="mb-1 flex flex-wrap items-baseline gap-2"><strong className="text-sm font-medium text-zinc-200">{line.speaker || 'Speaker'}</strong><time className="text-[11px] text-zinc-500">{formatTranscriptTimestamp(line.timestamp)}</time></div><p className="whitespace-pre-wrap break-words text-sm leading-7 text-zinc-300">{line.text}</p></div>
          </div>)}
          {!matchingLines.length && <p className="text-sm text-zinc-400">{query ? 'No matching transcript lines.' : 'Waiting for transcribed speech.'}</p>}
        </div>
      </article>
    </div>}
  </section>;
}
