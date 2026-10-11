'use client';

import { useState } from 'react';

interface CreateMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (payload: { title: string; description: string }) => Promise<void>;
}

export function CreateMeetingModal({ isOpen, onClose, onCreate }: CreateMeetingModalProps) {
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

    setIsCreating(true);

    try {
      await onCreate({ title: title.trim(), description: description.trim() });
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
      <div role="dialog" aria-modal="true" aria-label="Create a meeting" className="surface-strong relative w-full max-w-md overflow-hidden rounded-2xl p-6 shadow-xl">
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3">
            <p className="section-kicker mb-2">Create room</p>
          </div>
          <h2 className="font-display text-2xl font-semibold text-zinc-100">Set up a meeting</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Give your meeting a name, add an agenda, and invite your people.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-zinc-100">Meeting title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Team sync"
              className="input-modern shadow-sm"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-zinc-100">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Agenda or context"
              className="input-modern min-h-[120px] resize-none shadow-sm"
              rows={4}
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
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
              {isCreating ? 'Creating...' : 'Create room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}