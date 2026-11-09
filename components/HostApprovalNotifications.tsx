'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, Check, X } from 'lucide-react';

type ApprovalRequest = {
  id: string;
  type: 'video' | 'file' | 'present' | 'screen';
  requesterName: string;
  payload: { name?: string; url?: string; size?: number };
};

const descriptions: Record<ApprovalRequest['type'], string> = {
  video: 'play a video', file: 'share a file', present: 'present a file', screen: 'share their screen',
};

export default function HostApprovalNotifications({ meetingId }: { meetingId: string }) {
  const [isHost, setIsHost] = useState(false);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const seenCount = useRef(0);

  useEffect(() => {
    let stopped = false;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/meeting-approvals?meetingId=${encodeURIComponent(meetingId)}`, { cache: 'no-store' });
        if (response.status === 403) { if (!stopped) setIsHost(false); return; }
        if (!response.ok) return;
        const result = await response.json();
        if (stopped) return;
        const next = Array.isArray(result.requests) ? result.requests : [];
        setIsHost(true);
        setRequests(next);
        if (next.length > seenCount.current) setOpen(true);
        seenCount.current = next.length;
      } catch { /* Keep the last known requests during a temporary network failure. */ }
    };
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [meetingId]);

  const decide = async (requestId: string, decision: 'approve' | 'reject') => {
    setBusyId(requestId);
    setError('');
    try {
      const response = await fetch('/api/meeting-approvals', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, requestId, decision }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not decide this request.');
      setRequests(current => current.filter(item => item.id !== requestId));
      seenCount.current = Math.max(0, seenCount.current - 1);
    } catch (reason: any) { setError(reason?.message || 'Could not decide this request.'); }
    finally { setBusyId(''); }
  };

  if (!isHost) return null;
  return <div className="relative">
    <button type="button" onClick={() => setOpen(value => !value)} aria-label={`Host approval requests${requests.length ? `, ${requests.length} pending` : ''}`} aria-expanded={open} className="relative flex h-10 w-10 items-center justify-center rounded-xl text-zinc-100 hover:bg-zinc-800">
      <Bell className="h-5 w-5" />
      {requests.length > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-300 px-1 text-[10px] font-bold text-zinc-950">{requests.length}</span>}
    </button>
    {open && <div className="absolute right-0 top-12 z-[1200] max-h-[min(70dvh,30rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-zinc-100 shadow-2xl">
      <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Host approvals</h2><button type="button" onClick={() => setOpen(false)} aria-label="Close host approvals" className="rounded p-1 hover:bg-zinc-800"><X className="h-4 w-4" /></button></div>
      {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
      {requests.length === 0 ? <p className="mt-3 text-xs text-zinc-400">No requests waiting.</p> : <ul className="mt-3 space-y-2">
        {requests.map(request => <li key={request.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <p className="text-xs leading-5"><strong className="break-words">{request.requesterName}</strong> wants to {descriptions[request.type]}.</p>
          {request.payload.name && <p className="mt-1 break-all text-[11px] text-zinc-400">{request.payload.name}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={!!busyId} onClick={() => void decide(request.id, 'approve')} className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-sky-300 px-2 text-xs font-semibold text-zinc-950 hover:bg-sky-200 disabled:opacity-60"><Check className="h-3.5 w-3.5" /> Accept</button>
            <button type="button" disabled={!!busyId} onClick={() => void decide(request.id, 'reject')} className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg border border-zinc-700 px-2 text-xs font-semibold hover:bg-zinc-800 disabled:opacity-60"><X className="h-3.5 w-3.5" /> Reject</button>
          </div>
        </li>)}
      </ul>}
    </div>}
  </div>;
}
