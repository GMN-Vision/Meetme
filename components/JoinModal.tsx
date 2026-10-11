'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface JoinModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function JoinModal({ isOpen, onClose }: JoinModalProps) {
  const [meetingId, setMeetingId] = useState('');
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const router = useRouter();

  const normalizeMeetingId = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return '';

    // Accept full invite links like http://localhost:3000/room/abc123
    try {
      const parsed = new URL(trimmed);
      const parts = parsed.pathname.split('/').filter(Boolean);
      const roomIndex = parts.findIndex((part) => part === 'room');
      if (roomIndex >= 0 && parts[roomIndex + 1]) {
        return decodeURIComponent(parts[roomIndex + 1]);
      }
    } catch {
      // Not a URL, treat as direct meeting id.
    }

    return trimmed;
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsJoining(true);

    const normalizedMeetingId = normalizeMeetingId(meetingId);

    if (!normalizedMeetingId) {
      setError('Please enter a meeting ID');
      setIsJoining(false);
      return;
    }

    const controller = new AbortController();
    const requestTimeout = window.setTimeout(() => controller.abort(), 10000);

    try {
      // Verify meeting exists
      const response = await fetch(
        `/api/get-meeting?id=${encodeURIComponent(normalizedMeetingId)}`,
        {
          signal: controller.signal,
        }
      );
      window.clearTimeout(requestTimeout);
      
      if (!response.ok) {
        setError('Meeting not found');
        return;
      }

      router.push(`/room/${encodeURIComponent(normalizedMeetingId)}`);
      setMeetingId('');
      onClose();
    } catch (err) {
      if ((err as any)?.name === 'AbortError') {
        setError('Join request timed out. Please try again.');
      } else {
        setError('Failed to join meeting');
      }
      console.error(err);
    } finally {
      window.clearTimeout(requestTimeout);
      setIsJoining(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label="Join a meeting" className="surface-strong relative w-full max-w-md overflow-hidden rounded-2xl p-6 shadow-xl">
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3">
            <p className="section-kicker mb-2">Join room</p>
          </div>
          <h2 className="font-display text-2xl font-semibold text-zinc-100">Enter a meeting link or ID</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Paste a full invite URL or a room code and jump straight in.</p>
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-zinc-100">
              Meeting ID
            </label>
            <input
              type="text"
              value={meetingId}
              onChange={(e) => setMeetingId(e.target.value)}
              placeholder="Enter meeting ID"
              className="input-modern shadow-sm"
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
              disabled={isJoining}
              className="button-secondary flex-1 border border-zinc-800/80 bg-zinc-900/75"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isJoining}
              className="button-primary flex-1 shadow-xl"
            >
              {isJoining ? 'Joining...' : 'Join'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
