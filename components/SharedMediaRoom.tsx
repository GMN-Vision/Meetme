'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Download, Maximize2, Minimize2, MonitorPlay } from 'lucide-react';

interface SharedMediaFile { name: string; path: string; uploadedAt?: number }

export default function SharedMediaRoom({ meetingId, children }: { meetingId: string; children: ReactNode }) {
  const [files, setFiles] = useState<SharedMediaFile[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [notice, setNotice] = useState('');
  const [failedPath, setFailedPath] = useState('');
  const [size, setSize] = useState(40);
  const [panelHeight, setPanelHeight] = useState(360);
  const [expanded, setExpanded] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stopped = false;
    let busy = false;
    let knownPaths = new Set<string>();
    let initialized = false;
    setFiles([]);
    setSelectedPath('');
    setNotice('');
    setExpanded(false);
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const response = await fetch(`/api/files/list?meetingId=${encodeURIComponent(meetingId)}`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error('Refresh failed');
        if (stopped) return;
        const next: SharedMediaFile[] = [...(data.files || [])].sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
        const newest = next.find(file => !knownPaths.has(file.path));
        const firstLoad = !initialized;
        if ((firstLoad || newest) && next.length) {
          const sharedFile = newest || next[0];
          const extension = sharedFile.name.split('.').pop()?.toLowerCase() || '';
          setSize(40);
          setPanelHeight(extension === 'pdf' ? 560 : /^(mp3|wav|ogg)$/.test(extension) ? 300 : 480);
          setExpanded(true);
        } else if (!next.length) {
          setExpanded(false);
        }
        setFiles(next);
        setSelectedPath(current => {
          if (firstLoad || newest) return (newest || next[0])?.path || '';
          return next.some(file => file.path === current) ? current : next[0]?.path || '';
        });
        initialized = true;
        knownPaths = new Set(next.map(file => file.path));
        setNotice(data.warning || '');
      } catch {
        if (!stopped) setNotice('Shared media could not be refreshed. Retrying automatically…');
      } finally { busy = false; }
    };
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [meetingId]);

  const selected = files.find(file => file.path === selectedPath);
  const name = selected?.name.split('/').pop() || '';
  const extension = name.split('.').pop()?.toLowerCase();
  const downloadUrl = selected ? `/api/files/download?path=${encodeURIComponent(selected.path)}` : '';
  const previewUrl = `${downloadUrl}&preview=1`;
  const failed = !!selected && failedPath === selected.path;
  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const bounds = layoutRef.current?.getBoundingClientRect();
    if (!bounds) return;
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setSize(Math.max(25, Math.min(65, (bounds.right - event.clientX) / bounds.width * 100)));
    }
  };
  const moveHeight = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const panel = layoutRef.current?.querySelector('aside')?.getBoundingClientRect();
    if (panel) setPanelHeight(Math.max(240, Math.min(720, event.clientY - panel.top)));
  };
  const changeSize = (large: boolean) => { setExpanded(large); setSize(large ? 60 : 30); setPanelHeight(large ? 560 : 280); };

  return (
    <div ref={layoutRef} className="shared-media-room" data-display={expanded ? 'expanded' : 'compact'} style={{ '--media-width': `${size}%`, '--media-height': `${panelHeight}px` } as CSSProperties}>
      <div className="shared-media-main">{children}</div>
      <aside className="shared-media-panel rounded-lg border border-zinc-800 bg-zinc-950" aria-label="Shared media display">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 p-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><MonitorPlay size={18} /> Shared display</h2>
          <div className="flex gap-1">
            <button type="button" onClick={() => changeSize(false)} aria-label="Make shared display smaller" title="Smaller" className="rounded p-2 hover:bg-zinc-800"><Minimize2 size={16} /></button>
            <button type="button" onClick={() => changeSize(true)} aria-label="Make shared display larger" title="Larger" className="rounded p-2 hover:bg-zinc-800"><Maximize2 size={16} /></button>
          </div>
        </div>
        {notice && <p role="status" className="px-3 pt-2 text-xs text-amber-300">{notice}</p>}
        {!expanded ? <button type="button" onClick={() => setExpanded(true)} className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-3 text-center text-xs text-zinc-400 hover:text-zinc-100" aria-label="Expand shared display">
          <MonitorPlay size={24} />
          <span className="max-w-full truncate">{selected ? name : 'Waiting for shared media'}</span>
          <span>{selected ? 'Click to view' : 'New files open automatically'}</span>
        </button> : selected ? <>
          <div className="flex items-center gap-2 p-3">
            <select aria-label="Displayed shared file" value={selectedPath} onChange={event => { setSelectedPath(event.target.value); setFailedPath(''); }} className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 p-2 text-sm">
              {files.map(file => <option key={file.path} value={file.path}>{file.name.split('/').pop()}</option>)}
            </select>
            <a href={downloadUrl} target="_blank" rel="noreferrer" aria-label={`Download ${name}`} className="rounded p-2 hover:bg-zinc-800"><Download size={18} /></a>
          </div>
          <div className="shared-media-preview relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black p-2" aria-label={`Preview of ${name}`}>
            {!failed && /^(png|jpe?g|gif|webp)$/.test(extension || '') ? (
              // Shared uploads use the authenticated file endpoint rather than the image optimizer.
              // eslint-disable-next-line @next/next/no-img-element
              <img key={selected.path} src={previewUrl} alt={name} onError={() => setFailedPath(selected.path)} className="h-full w-full object-contain" />
            ) : !failed && /^(mp4|webm)$/.test(extension || '') ? (
              <video key={selected.path} src={previewUrl} controls playsInline preload="metadata" onError={() => setFailedPath(selected.path)} className="h-full w-full object-contain" />
            ) : !failed && /^(mp3|wav|ogg)$/.test(extension || '') ? (
              <audio key={selected.path} src={previewUrl} controls preload="metadata" onError={() => setFailedPath(selected.path)} className="w-full" />
            ) : !failed && extension === 'pdf' ? (
              <iframe key={selected.path} src={previewUrl} title={name} className="h-full w-full border-0 bg-white" />
            ) : <div className="p-5 text-center text-sm text-zinc-400"><p>{failed ? 'This media could not be played.' : 'Preview is unavailable for this file type.'}</p><a href={downloadUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-zinc-100 underline">Download {name}</a></div>}
          </div>
          <p className="p-3 text-xs text-zinc-400" role="status">New uploads open here for everyone. Use Files to share media.</p>
        </> : <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-zinc-400"><MonitorPlay size={32} /><p>Share a file using Files to display it here for everyone in the room.</p><p className="text-xs">Images, videos, audio and PDFs</p></div>}
        <div role="separator" aria-label="Resize shared display" aria-orientation="vertical" tabIndex={0} aria-valuemin={25} aria-valuemax={65} aria-valuenow={size}
          className="shared-media-resizer" onPointerDown={resize} onPointerMove={move} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            event.preventDefault();
            const increase = event.key === 'ArrowLeft';
            setSize(value => Math.max(25, Math.min(65, value + (increase ? 5 : -5))));
          }} />
        <div role="separator" aria-label="Resize shared display height" aria-orientation="horizontal" tabIndex={0} aria-valuemin={240} aria-valuemax={720} aria-valuenow={panelHeight}
          className="shared-media-height-resizer" onPointerDown={resize} onPointerMove={moveHeight}
          onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onKeyDown={event => {
            if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault();
            setPanelHeight(value => Math.max(240, Math.min(720, value + (event.key === 'ArrowDown' ? 40 : -40))));
          }} />
      </aside>
    </div>
  );
}
