'use client';

import { useEffect, useRef, useState } from 'react';
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist/build/pdf.mjs';

GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

function PageCanvas({ document, page, thumbnail = false }: { document: PDFDocumentProxy; page: number; thumbnail?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(!thumbnail);

  useEffect(() => {
    if (!thumbnail || !canvas.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '300px' });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [thumbnail]);

  useEffect(() => {
    if (!visible || !canvas.current) return;
    let cancelled = false;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    void document.getPage(page).then(pdfPage => {
      if (cancelled || !canvas.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const targetWidth = thumbnail ? 128 : Math.min(1400, Math.max(600, canvas.current.parentElement?.clientWidth || 900));
      const viewport = pdfPage.getViewport({ scale: targetWidth / base.width });
      const context = canvas.current.getContext('2d');
      if (!context) return;
      canvas.current.width = Math.ceil(viewport.width);
      canvas.current.height = Math.ceil(viewport.height);
      renderTask = pdfPage.render({ canvasContext: context, viewport });
      void renderTask.promise.catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [document, page, thumbnail, visible]);

  return <canvas ref={canvas} aria-label={`Page ${page}`} className={thumbnail ? 'mx-auto max-h-24 max-w-full bg-white object-contain' : 'max-h-full max-w-full bg-white object-contain shadow-xl'} />;
}

export default function PresentationPages({ meetingId, path, participantKey, page, isPresenter, onPageChange }: {
  meetingId: string; path: string; participantKey: string; page: number; isPresenter: boolean;
  onPageChange: (page: number) => Promise<void>;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let loaded: PDFDocumentProxy | null = null;
    setDocument(null);
    setError('');
    void (async () => {
      try {
        const token = localStorage.getItem(`melanam:meeting-document-access:${meetingId}:${participantKey}`);
        if (!token) throw new Error('Document access has expired. Rejoin the meeting.');
        const response = await fetch(`/api/files/presentation?path=${encodeURIComponent(path)}&meetingId=${encodeURIComponent(meetingId)}`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store',
        });
        if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'The presentation could not be opened.'); }
        const bytes = new Uint8Array(await response.arrayBuffer());
        loaded = await getDocument({ data: bytes }).promise;
        if (!controller.signal.aborted) setDocument(loaded);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'The presentation could not be opened.');
      }
    })();
    return () => { controller.abort(); if (loaded) void loaded.destroy(); };
  }, [meetingId, path, participantKey]);

  const currentPage = document ? Math.min(Math.max(page || 1, 1), document.numPages) : 1;
  const changePage = async (next: number) => {
    if (!document || changing || next < 1 || next > document.numPages || next === currentPage) return;
    setChanging(true);
    try { await onPageChange(next); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not change pages.'); }
    finally { setChanging(false); }
  };

  return <div className="flex h-full min-h-0 w-full flex-col bg-zinc-950 text-white">
    {isPresenter && document && <div className="flex min-h-12 shrink-0 items-center justify-center gap-3 border-b border-zinc-700 px-2 text-sm">
      <button type="button" onClick={() => void changePage(currentPage - 1)} disabled={changing || currentPage <= 1} className="rounded-lg border border-zinc-600 px-3 py-1.5 disabled:opacity-40">Previous</button>
      <span aria-live="polite">Page {currentPage} of {document.numPages}</span>
      <button type="button" onClick={() => void changePage(currentPage + 1)} disabled={changing || currentPage >= document.numPages} className="rounded-lg border border-zinc-600 px-3 py-1.5 disabled:opacity-40">Next</button>
    </div>}
    {error && <p role="alert" className="p-3 text-sm text-amber-300">{error}</p>}
    {!document && !error && <p role="status" className="p-4 text-center text-sm">Preparing pages…</p>}
    {document && <div className="flex min-h-0 flex-1">
      {isPresenter && <nav aria-label="Page thumbnails" className="hidden w-40 shrink-0 overflow-y-auto border-r border-zinc-700 p-2 sm:block">
        {Array.from({ length: document.numPages }, (_, index) => index + 1).map(number =>
          <button key={number} type="button" onClick={() => void changePage(number)} disabled={changing} aria-current={number === currentPage ? 'page' : undefined} className={`mb-2 w-full rounded-lg border p-1 text-xs ${number === currentPage ? 'border-sky-400 bg-sky-950' : 'border-zinc-700 bg-zinc-900'}`}>
            <PageCanvas document={document} page={number} thumbnail />
            <span>Page {number}</span>
          </button>)}
      </nav>}
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden p-2" aria-label={`Presented page ${currentPage}`}>
        <PageCanvas document={document} page={currentPage} />
      </div>
    </div>}
  </div>;
}

export function PdfFilePreview({ url }: { url: string }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let loaded: PDFDocumentProxy | null = null;
    setDocument(null);
    setError('');
    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('PDF preview is unavailable.');
        loaded = await getDocument({ data: new Uint8Array(await response.arrayBuffer()) }).promise;
        if (!controller.signal.aborted) setDocument(loaded);
      } catch { if (!controller.signal.aborted) setError('PDF preview is unavailable.'); }
    })();
    return () => { controller.abort(); if (loaded) void loaded.destroy(); };
  }, [url]);
  if (error) return <p className="p-2 text-xs text-amber-300">{error}</p>;
  if (!document) return <p role="status" className="p-2 text-xs text-zinc-400">Loading PDF pages…</p>;
  return <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto p-1" aria-label={`${document.numPages} PDF page previews`}>
    {Array.from({ length: document.numPages }, (_, index) => index + 1).map(number => <div key={number} className="rounded border border-zinc-700 bg-zinc-900 p-1 text-center text-xs text-zinc-300"><PageCanvas document={document} page={number} thumbnail /><span>Page {number}</span></div>)}
  </div>;
}
