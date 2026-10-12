'use client';

import { useState } from 'react';

interface CreateMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  scheduled?: boolean;
  onCreate: (payload: { title: string; description: string; scheduledAt?: string }) => Promise<void>;
}

export function CreateMeetingModal({ isOpen, onClose, onCreate, scheduled = false }: CreateMeetingModalProps) {
  const [scheduledTime, setScheduledTime] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Meeting title is required');
      return;
    }

    if (scheduled && (!scheduledTime || !Number.isFinite(new Date(scheduledTime).getTime()) || new Date(scheduledTime).getTime() <= Date.now())) {
      setError('Choose a meeting time in the future.'); return;
    }
    setIsCreating(true);

    try {
      await onCreate({ title: title.trim(), description: description.trim(), ...(scheduled ? { scheduledAt: new Date(scheduledTime).toISOString() } : {}) });
      setScheduledTime('');
      setTitle('');
      setDescription('');
      onClose();
    } catch (createError: any) {
      setError(createError?.message || 'Failed to create meeting');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label={scheduled ? "Schedule a meeting" : "Create a meeting"} className="surface-strong relative w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl p-6 shadow-xl">
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3">
            <p className="section-kicker mb-2">Create room</p>
          </div>
          <h2 className="font-display text-2xl font-semibold text-zinc-100">{scheduled ? 'Schedule a meeting' : 'Set up a meeting'}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Give your meeting a name, add an agenda, and invite your people.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="meeting-title" className="mb-2 block text-sm font-semibold text-zinc-100">Meeting title</label>
            <input
              id="meeting-title"
              required
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Team sync"
              className="input-modern shadow-sm"
            />
          </div>

          <div>
            <label htmlFor="meeting-description" className="mb-2 block text-sm font-semibold text-zinc-100">Description</label>
            <textarea
              id="meeting-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Agenda or context"
              className="input-modern min-h-[120px] resize-none shadow-sm"
              rows={4}
            />
          </div>

          {scheduled && <label className="block text-sm font-semibold text-zinc-100">Date and time
            <input type="datetime-local" required value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className="input-modern mt-2" />
            <span className="mt-2 block text-xs font-normal text-zinc-400">Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Save now and share the invite link; invitations are not sent automatically.</span>
          </label>}
          {error && (
            <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="button-secondary flex-1 border border-zinc-800/80 bg-zinc-900/75"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="button-primary flex-1 shadow-xl"
            >
              {isCreating ? 'Saving...' : scheduled ? 'Schedule meeting' : 'Create room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
