'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Design = 'current' | 'magenta';
const DesignContext = createContext<{ design: Design; select: (design: Design) => void }>({ design: 'magenta', select: () => {} });

export function DesignThemeProvider({ children }: { children: React.ReactNode }) {
  const [design, setDesign] = useState<Design>('magenta');
  useEffect(() => {
    setDesign(document.documentElement.dataset.design === 'current' ? 'current' : 'magenta');
    const sync = (event: StorageEvent) => {
      if (event.key !== 'melanam-design' && event.key !== null) return;
      const next = event.newValue === 'current' ? 'current' : 'magenta';
      document.documentElement.dataset.design = next;
      setDesign(next);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const select = (next: Design) => {
    document.documentElement.dataset.design = next;
    setDesign(next);
    try { localStorage.setItem('melanam-design', next); } catch { /* The selection still works without storage. */ }
  };
  return <DesignContext.Provider value={{ design, select }}>{children}</DesignContext.Provider>;
}

export function DesignSwitcher() {
  const { design, select } = useContext(DesignContext);
  return <div className="design-switcher" role="group" aria-label="App design">
    <button type="button" aria-pressed={design === 'current'} onClick={() => select('current')}>UI 1</button>
    <button type="button" aria-pressed={design === 'magenta'} onClick={() => select('magenta')}>UI 2</button>
  </div>;
}
