'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Play, Share2, Video, Trash2 } from 'lucide-react';

type Recording = {
  recordingId: string; meetingId: string; title: string; status: string;
  createdAt: string; durationSeconds: number; expiresAt?: string; sharedAt?: string; isHost: boolean; error?: string;
};
export function MeetingRecordings() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [quota, setQuota] = useState<{ plan: string; usedSeconds: number; storedBytes: number; limits: { monthlyMinutes: number; storageGb: number; retentionDays: number } } | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/recording', { cache: 'no-store', signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Unable to load recordings.');
    if (!signal?.aborted) {
      setRecordings(body.recordings || []); setLoaded(true);
      setError(body.syncPending ? 'Recording status could not be refreshed. Retrying automatically.' : '');
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/recording/quota', { cache: 'no-store', signal: controller.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(body => { if (!controller.signal.aborted) setQuota(body); }).catch(() => {});
    const poll = () => { void refresh(controller.signal).catch((err) => { if (!controller.signal.aborted) setError(err.message); }); };
    poll();
    const interval = setInterval(poll, 10000);
    window.addEventListener('focus', poll);
    return () => { controller.abort(); clearInterval(interval); window.removeEventListener('focus', poll); };
  }, [refresh]);
  const act = async (recording: Recording, action: 'share' | 'delete') => {
    if (action === 'delete' && !window.confirm('Delete this recording for you and everyone it was shared with?')) return;
    setBusy(recording.recordingId); setError('');
    try {
      const response = await fetch(action === 'share' ? '/api/recording/share' : `/api/recording/${recording.recordingId}`, {
        method: action === 'share' ? 'POST' : 'DELETE', headers: { 'Content-Type': 'application/json' },
        ...(action === 'share' ? { body: JSON.stringify({ meetingId: recording.meetingId }) } : {}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to update recording.');
      if (action === 'delete') setPlaying(null);
      await refresh();
    } catch (err: any) { setError(err.message); }
    finally { setBusy(''); }
  };
  const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50';
  return (
    <section aria-labelledby="meeting-recordings-title" className="rounded-xl border border-[#2a3039] bg-[#12151a] p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <Video className="h-5 w-5 text-cyan-400" />
        <h2 id="meeting-recordings-title" className="text-lg font-semibold text-slate-100">Meeting recordings</h2>
      </div>
      <p className="mt-2 text-sm text-slate-400">Your recordings and meetings shared with you. Hosts decide when to share with their recent meeting group.</p>
      {quota && <p className="mt-2 text-xs text-cyan-300">{quota.plan}: {Math.ceil(quota.usedSeconds / 60)} / {quota.limits.monthlyMinutes} recording minutes used this month · {(quota.storedBytes / 1024 ** 3).toFixed(1)} / {quota.limits.storageGb} GB · {quota.limits.retentionDays}-day retention. Usage updates after processing; minutes reset monthly in UTC.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
      {!recordings.length && <p className="mt-4 text-sm text-slate-400">{loaded ? 'After the host ends a recorded meeting, it will appear here once processed. Server recording is included on every plan.' : 'Loading recordings...'}</p>}
      <div className="mt-4 grid gap-3">
        {recordings.map(recording => {
          const ready = recording.status === 'ready' && Boolean(recording.expiresAt && Date.parse(recording.expiresAt) > Date.now());
          return (
            <article key={recording.recordingId} className="rounded-lg border border-slate-700 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words font-semibold text-slate-100">{recording.title}</h3>
                  <p className="mt-1 text-xs text-slate-400">{new Date(recording.createdAt).toLocaleString()} · {recording.isHost ? (recording.sharedAt ? 'Shared with meeting group' : 'Private to you') : 'Shared by host'}</p>
                  <p className="mt-1 text-xs text-slate-400">{ready ? `${Math.ceil(recording.durationSeconds / 60)} min · Available until ${new Date(recording.expiresAt!).toLocaleDateString()}` : recording.status === 'failed' ? recording.error || 'Recording failed' : recording.status === 'expired' || recording.status === 'ready' ? 'Recording expired or deleted' : 'Processing recording...'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ready && <>
                    <button className={button} onClick={() => setPlaying(playing === recording.recordingId ? null : recording.recordingId)}><Play className="h-4 w-4" />{playing === recording.recordingId ? 'Close' : 'Watch'}</button>
                    <a className={button} href={`/api/recording/${recording.recordingId}?download=1`}><Download className="h-4 w-4" />Download</a>
                    {recording.isHost && !recording.sharedAt && <button className={button} disabled={Boolean(busy)} onClick={() => void act(recording, 'share')}><Share2 className="h-4 w-4" />{busy === recording.recordingId ? 'Sharing...' : 'Share meeting with group'}</button>}
                  </>}
                  {recording.isHost && ready && <button className={button} disabled={Boolean(busy)} aria-label={`Delete recording of ${recording.title}`} onClick={() => void act(recording, 'delete')}><Trash2 className="h-4 w-4" /></button>}
                </div>
              </div>
              {ready && playing === recording.recordingId && <video className="mt-4 aspect-video w-full rounded-lg bg-black" controls playsInline preload="metadata" src={`/api/recording/${recording.recordingId}`} onError={() => setError('Unable to play this recording. Try downloading it or opening it again.')} />}
            </article>
          );
        })}
      </div>
    </section>
  );
}
