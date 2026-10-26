'use client';

import { useEffect, useState } from 'react';
import { getPresentationKind } from '@/lib/shared-file-types';
import { JITSI_SCREEN_PRESENT_EVENT, getSharedVideoUrl } from '@/lib/jitsi-features';

export default function PresentPage() {
  const [file, setFile] = useState({ path: '', name: '', meetingId: '' });
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const kind = getPresentationKind(file.name);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const next = { path: query.get('path') || '', name: query.get('name') || '', meetingId: query.get('meetingId') || '' };
    setFile(next);
    const controller = new AbortController();
    let objectUrl = '';
    const prepare = async () => {
      if (!next.path || !next.meetingId || !getPresentationKind(next.name)) {
        setError('This file cannot be presented.'); setLoading(false); return;
      }
      try {
        if (getPresentationKind(next.name) === 'slides') {
          const response = await fetch(`/api/files/presentation?path=${encodeURIComponent(next.path)}`, { signal: controller.signal });
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || 'The slides could not be prepared.');
          }
          const blob = await response.blob();
          if (controller.signal.aborted) return;
          objectUrl = URL.createObjectURL(blob);
          setSource(objectUrl);
        } else setSource(getSharedVideoUrl(next.path, window.location.origin));
      } catch (error: any) { if (!controller.signal.aborted) setError(error.message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void prepare();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, []);
  const share = () => {
    try {
      if (!window.opener || window.opener.closed) throw new Error();
      const event = new CustomEvent(JITSI_SCREEN_PRESENT_EVENT, { cancelable: true, detail: { meetingId: file.meetingId } });
      window.opener.dispatchEvent(event);
      setNotice(event.defaultPrevented ? 'Select this presentation tab or window in the browser sharing picker.' : 'Join the meeting before presenting.');
    } catch { setNotice('Keep the meeting tab open. You can also use Share screen in the meeting and select this tab.'); }
  };
  return <main className="fixed inset-0 z-[1100] flex flex-col bg-zinc-950 text-white">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 p-3">
      <h1 className="min-w-0 truncate text-sm font-medium">{file.name || 'Presentation'}</h1>
      <button type="button" disabled={loading || !!error} onClick={share} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm disabled:opacity-50">Share in meeting</button>
      {notice && <p role="status" className="basis-full text-sm text-amber-300">{notice}</p>}
    </header>
    <div className="flex min-h-0 flex-1 items-center justify-center">
      {loading ? <p role="status">Preparing presentation...</p> : error ? <p role="alert" className="max-w-xl p-6 text-center text-amber-300">{error}</p> : kind === 'image' ? (
        // Shared file URLs are served by the app rather than the image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source} alt={file.name} className="h-full w-full object-contain" onError={() => setError('This image could not be opened.')} />
      ) : <iframe title={file.name} src={source} className="h-full w-full border-0 bg-white" />}
    </div>
  </main>;
}
