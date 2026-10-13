'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Check, MoreHorizontal } from 'lucide-react';

type Design = 'current' | 'magenta' | 'zoom';
const DesignContext = createContext<{ design: Design; renderedDesign: Design; select: (design: Design) => void }>({ design: 'zoom', renderedDesign: 'zoom', select: () => {} });

export function DesignThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [design, setDesign] = useState<Design>('zoom');
  useEffect(() => {
    const stored = document.documentElement.dataset.design;
    setDesign(stored === 'current' || stored === 'magenta' || stored === 'zoom' ? stored : 'zoom');
    const sync = (event: StorageEvent) => {
      if (event.key !== 'melanam-design' && event.key !== null) return;
      const next = event.newValue === 'current' || event.newValue === 'magenta' || event.newValue === 'zoom' ? event.newValue : 'zoom';
      setDesign(next);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const renderedDesign = design === 'zoom' && pathname?.startsWith('/meetings') ? 'magenta' : design;
  useEffect(() => {
    document.documentElement.dataset.design = renderedDesign;
  }, [renderedDesign]);
  const select = (next: Design) => {
    setDesign(next);
    try { localStorage.setItem('melanam-design', next); } catch { /* The selection still works without storage. */ }
  };
  return <DesignContext.Provider value={{ design, renderedDesign, select }}>{children}</DesignContext.Provider>;
}

export function DesignSwitcher({ menu = false }: { menu?: boolean }) {
  const { renderedDesign, select } = useContext(DesignContext);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const options = ['current', 'magenta', 'zoom'] as const;

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  if (menu) {
    return <div ref={menuRef} className="relative shrink-0">
      <button ref={triggerRef} type="button" aria-label="Choose UI style" aria-expanded={open} aria-controls="landing-ui-styles" onClick={() => setOpen(value => !value)} className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400">
        <MoreHorizontal size={21} aria-hidden="true" />
      </button>
      {open && <div id="landing-ui-styles" role="group" aria-label="UI styles" className="absolute left-1/2 top-full z-50 mt-3 w-36 -translate-x-1/2 rounded-xl border border-zinc-700 bg-zinc-900 p-1.5 shadow-xl">
        {options.map((option, index) => <button key={option} type="button" aria-pressed={renderedDesign === option} onClick={() => { select(option); setOpen(false); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-sky-400">
          UI {index + 1}{renderedDesign === option && <Check size={15} aria-hidden="true" />}
        </button>)}
      </div>}
    </div>;
  }

  return <div className="design-switcher" role="group" aria-label="Choose interface style">
    {options.map((option, index) => <button key={option} type="button" aria-pressed={renderedDesign === option} onClick={() => select(option)}>UI {index + 1}</button>)}
  </div>;
}
