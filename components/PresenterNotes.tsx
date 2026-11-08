'use client';

import { useEffect, useId, useState } from 'react';

const NOTE_CHANGED_EVENT = 'melanam:presenter-note-changed';
export const SPEECH_NOTE_PATH = 'meeting-speech-note';

export default function PresenterNotes({ meetingId, filePath, owner }: {
  meetingId: string;
  filePath: string;
  owner: string;
}) {
  const [note, setNote] = useState('');
  const noteId = useId();
  const storageKey = `melanam:presenter-notes:${encodeURIComponent(owner)}:${encodeURIComponent(meetingId)}:${encodeURIComponent(filePath)}`;

  useEffect(() => {
    const refresh = () => {
      try {
        setNote(localStorage.getItem(storageKey) || '');
      } catch {
        setNote('');
      }
    };
    const onStorage = (event: StorageEvent) => { if (event.key === storageKey) refresh(); };
    const onNoteChanged = (event: Event) => { if ((event as CustomEvent<string>).detail === storageKey) refresh(); };
    refresh();
    if (typeof window === 'undefined') return;
    window.addEventListener('storage', onStorage);
    window.addEventListener(NOTE_CHANGED_EVENT, onNoteChanged);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(NOTE_CHANGED_EVENT, onNoteChanged);
    };
  }, [storageKey]);

  const updateNote = (value: string) => {
    setNote(value);
    try {
      if (value) localStorage.setItem(storageKey, value);
      else localStorage.removeItem(storageKey);
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(NOTE_CHANGED_EVENT, { detail: storageKey }));
    } catch {
      // Keep the current draft visible if browser storage is unavailable.
    }
  };

  return <div className="border-t border-zinc-800 bg-zinc-900/80 p-4">
    <label htmlFor={noteId} className="block text-sm font-semibold text-white">Private presenter notes</label>
    <p className="mb-3 mt-1 text-xs text-zinc-400">Write your speech cues here. Only you can see them; they stay in this browser.</p>
    <textarea
      id={noteId}
      value={note}
      onChange={event => updateNote(event.target.value)}
      placeholder="Opening remarks, key points, and reminders..."
      rows={6}
      spellCheck
      className="min-h-36 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-base leading-7 text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-sky-500"
    />
  </div>;
}
