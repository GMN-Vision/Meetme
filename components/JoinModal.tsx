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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
      <div className="surface-strong relative w-full max-w-md overflow-hidden rounded-[2rem] p-6 shadow-[0_30px_90px_rgba(15,23,42,0.24)]">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500" />
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3">
            <p className="section-kicker mb-2">Join room</p>
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-sm font-semibold text-amber-700 ring-1 ring-amber-500/15">
              Quick join
            </span>
          </div>
          <h2 className="font-display text-2xl font-semibold text-slate-950">Enter a meeting link or ID</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Paste a full invite URL or a room code and jump straight in.</p>
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
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
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isJoining}
              className="button-secondary flex-1 border border-slate-200/80 bg-white/75"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isJoining}
              className="button-primary flex-1 shadow-[0_14px_30px_rgba(29,78,216,0.26)]"
            >
              {isJoining ? 'Joining...' : 'Join'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
