'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

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

export function DesignSwitcher() {
  const { renderedDesign, select } = useContext(DesignContext);
  return <div className="design-switcher" role="group" aria-label="App design">
    <button type="button" aria-pressed={renderedDesign === 'current'} onClick={() => select('current')}>UI 1</button>
    <button type="button" aria-pressed={renderedDesign === 'magenta'} onClick={() => select('magenta')}>UI 2</button>
    <button type="button" aria-pressed={renderedDesign === 'zoom'} onClick={() => select('zoom')}>UI 3</button>
  </div>;
}
