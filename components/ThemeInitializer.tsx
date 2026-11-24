"use client";

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const THEME_KEY = 'melanam:color-theme';

function applyTheme(theme: string) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

export default function ThemeInitializer() {
  useEffect(() => {
    try {
      applyTheme('dark');
    } catch (_) {}
  }, []);

  return null;
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const syncTheme = () => setDark(document.documentElement.dataset.theme === 'dark');
    syncTheme();
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_KEY) {
        applyTheme(event.newValue === 'dark' ? 'dark' : 'light');
        syncTheme();
      }
    };
    window.addEventListener('melanam-theme-change', syncTheme);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('melanam-theme-change', syncTheme);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    applyTheme(next);
    setDark(next === 'dark');
    try { localStorage.setItem(THEME_KEY, next); } catch { /* Theme works without storage. */ }
    window.dispatchEvent(new Event('melanam-theme-change'));
  };

  return <button type="button" onClick={toggle} className="theme-toggle" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
    {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    <span className="hidden sm:inline">{dark ? 'Light mode' : 'Dark mode'}</span>
  </button>;
}
