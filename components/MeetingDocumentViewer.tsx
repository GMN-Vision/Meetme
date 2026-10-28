'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MonitorUp, X } from 'lucide-react';
import { JITSI_SCREEN_PRESENT_EVENT, JITSI_DOCUMENT_PRESENT_EVENT } from '@/lib/jitsi-features';
import { sharedFileExtension } from '@/lib/shared-file-types';

interface DocumentRequest {
  path: string;
  name: string;
}

export default function MeetingDocumentViewer({
  meetingId,
  participantKey,
}: {
  meetingId: string;
  participantKey: string;
}) {
  const [document, setDocument] = useState<DocumentRequest | null>(null);
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const extension = document ? sharedFileExtension(document.name) : '';

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<DocumentRequest>).detail;
      if (!detail?.path || !detail?.name) return;
      event.preventDefault();
      setDocument(detail);
      setSource('');
      setError('');
      setNotice('');
    };
    window.addEventListener(JITSI_DOCUMENT_PRESENT_EVENT, open);
    return () => window.removeEventListener(JITSI_DOCUMENT_PRESENT_EVENT, open);
  }, []);

  useEffect(() => {
    if (!document || !participantKey) return;

    const controller = new AbortController();
    let objectUrl = '';

    const prepare = async () => {
      try {
        const tokenKey = `melanam:meeting-document-access:${meetingId}:${participantKey}`;
        const token = localStorage.getItem(tokenKey);
        if (!token) throw new Error('Meeting document access is missing. Leave and rejoin the meeting.');

        const slides = ['ppt', 'pptx', 'pps', 'ppsx', 'odp'].includes(extension);
        const previewable = extension === 'pdf' ||
          ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'].includes(extension);

        if (!slides && !previewable) {
          throw new Error('This file type is not supported in the in-room viewer yet.');
        }

        const endpoint = slides ? '/api/files/presentation' : '/api/files/preview';
        const query = new URLSearchParams({ path: document.path, meetingId });
        const response = await fetch(`${endpoint}?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
          cache: 'no-store',
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || 'The file could not be prepared.');
        }

        objectUrl = URL.createObjectURL(await response.blob());
        if (!controller.signal.aborted) setSource(objectUrl);
      } catch (cause: any) {
        if (!controller.signal.aborted) {
          setError(cause?.message || 'This file could not be opened.');
        }
      }
    };

    void prepare();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [document, extension, meetingId, participantKey]);

  if (!document || typeof window === 'undefined') return null;

  const close = () => setDocument(null);
  const share = () => {
    const event = new CustomEvent(JITSI_SCREEN_PRESENT_EVENT, {
      cancelable: true,
      detail: { meetingId },
    });
    window.dispatchEvent(event);
    setNotice(event.defaultPrevented
      ? 'Choose this Melanam tab in your browser sharing picker.'
      : 'Join the meeting before sharing your screen.');
  };

  return createPortal(
    <div className="fixed inset-0 z-[1200] flex flex-col bg-zinc-950 text-white"
      role="dialog" aria-modal="true" aria-label={`Presentation: ${document.name}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{document.name}</h2>
        <button type="button" onClick={share}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm hover:bg-emerald-500">
          <MonitorUp size={16} /> Share screen
        </button>
        <button type="button" onClick={close} aria-label="Close presentation"
          className="rounded-lg p-2 hover:bg-zinc-800"><X size={18} /></button>
        {notice && <p role="status" className="basis-full text-sm text-amber-300">{notice}</p>}
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
        {error
          ? <p role="alert" className="max-w-xl p-6 text-center text-amber-300">{error}</p>
          : !source
            ? <p role="status" className="text-sm text-zinc-300">Preparing presentation...</p>
            : ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'].includes(extension)
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={source} alt={document.name} className="h-full w-full object-contain" />
              : <iframe title={document.name} src={source} className="h-full w-full border-0 bg-white" />}
      </div>
    </div>,
    window.document.body,
  );
}
