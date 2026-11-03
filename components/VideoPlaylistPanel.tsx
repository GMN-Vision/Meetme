'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ListVideo,
  LoaderCircle,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {
  JITSI_PLAYLIST_PLAY_EVENT,
  JITSI_PLAYLIST_STOP_EVENT,
} from '@/lib/jitsi-features';
import { normalizeVideoUrl } from '@/lib/video-playlist';
import { HoverBorderGradient } from '@/components/ui/hover-border-gradient';

type PlaylistItem = {
  id: string;
  url: string;
  title: string;
  addedBy?: string;
  addedAt?: string | null;
  playedAt?: string | null;
};

type Playlist = {
  meetingId: string;
  items: PlaylistItem[];
  currentIndex: number | null;
  playing: boolean;
  updatedAt?: string | null;
};

const EMPTY_PLAYLIST = (meetingId: string): Playlist => ({
  meetingId,
  items: [],
  currentIndex: null,
  playing: false,
  updatedAt: null,
});

function itemLabel(item: PlaylistItem) {
  return item.title || item.url;
}

export default function VideoPlaylistPanel({
  meetingId,
  addedBy = '',
  className = '',
  onClose,
}: {
  meetingId: string;
  addedBy?: string;
  className?: string;
  onClose?: () => void;
}) {
  const [playlist, setPlaylist] = useState<Playlist>(() => EMPTY_PLAYLIST(meetingId));
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);

  useEffect(() => {
    let stopped = false;
    let polling = false;

    const refresh = async () => {
      if (polling) return;
      polling = true;
      try {
        const response = await fetch(`/api/video-playlist?meetingId=${encodeURIComponent(meetingId)}`, { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Playlist could not be refreshed');
        if (stopped || busyRef.current) return;
        setPlaylist(data.playlist || EMPTY_PLAYLIST(meetingId));
      } catch {
        if (!stopped && !busyRef.current) setNotice('The playlist is temporarily unavailable. Retrying automatically…');
      } finally {
        polling = false;
        if (!stopped) setLoading(false);
      }
    };

    void refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [meetingId]);

  const setWorking = (value: string) => {
    busyRef.current = Boolean(value);
    setBusy(value);
  };

  const updatePlaylist = async (action: string, extra: Record<string, unknown> = {}) => {
    setWorking(action);
    try {
      const response = await fetch('/api/video-playlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, action, updatedBy: addedBy, ...extra }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Playlist could not be updated');
      if (data.playlist) setPlaylist(data.playlist);
      return true;
    } catch (error: any) {
      setNotice(error?.message || 'Playlist could not be updated');
      return false;
    } finally {
      setWorking('');
    }
  };

  const dispatchPlay = (item: PlaylistItem) => {
    const detail = { meetingId, url: item.url, title: itemLabel(item), message: '' };
    const event = new CustomEvent(JITSI_PLAYLIST_PLAY_EVENT, { cancelable: true, detail });
    window.dispatchEvent(event);
    if (!event.defaultPrevented) {
      setNotice(detail.message || 'Join the meeting before playing a video.');
      return false;
    }
    return true;
  };

  const dispatchStop = () => {
    const detail = { meetingId, message: '' };
    const event = new CustomEvent(JITSI_PLAYLIST_STOP_EVENT, { cancelable: true, detail });
    window.dispatchEvent(event);
    if (!event.defaultPrevented) {
      setNotice(detail.message || 'The meeting is not ready to stop video.');
      return false;
    }
    return true;
  };

  const playItem = async (item: PlaylistItem) => {
    setNotice('');
    if (!dispatchPlay(item)) return;
    await updatePlaylist('play', { itemId: item.id });
  };

  const stopPlayback = async () => {
    setNotice('');
    if (!dispatchStop()) return;
    await updatePlaylist('stop');
  };

  const step = async (action: 'next' | 'previous') => {
    setNotice('');
    if (!playlist.items.length) {
      setNotice('Add a video before using the playlist controls.');
      return;
    }

    const length = playlist.items.length;
    const current = playlist.currentIndex ?? -1;
    const index = action === 'next'
      ? (current + 1) % length
      : (current <= 0 ? length - 1 : current - 1);
    const item = playlist.items[index];

    if (!item || !dispatchPlay(item)) return;
    await updatePlaylist(action);
  };

  const addVideos = async () => {
    const url = normalizeVideoUrl(input);
    setNotice('');

    if (!url) {
      setNotice(input.trim()
        ? 'Use a YouTube link or a direct MP4/WebM video link.'
        : 'Paste a video link first.');
      return;
    }

    setWorking('add');
    try {
      const response = await fetch('/api/video-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, urls: [url], addedBy }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Videos could not be added');
      if (data.playlist) setPlaylist(data.playlist);
      setInput('');

      const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
      const unsupported = Array.isArray(data.invalid) ? data.invalid.length : 0;
      const messages = [`Added ${data.added || 0} video${data.added === 1 ? '' : 's'} to the playlist.`];
      if (skipped) messages.push(`${skipped} already in the playlist.`);
      if (unsupported) messages.push(`${unsupported} unsupported link${unsupported === 1 ? '' : 's'} skipped.`);
      setNotice(messages.join(' '));
    } catch (error: any) {
      setNotice(error?.message || 'Videos could not be added');
    } finally {
      setWorking('');
    }
  };

  const removeItem = async (item: PlaylistItem) => {
    setNotice('');
    const isCurrent = playlist.currentIndex !== null
      && playlist.items[playlist.currentIndex]?.id === item.id;
    if (isCurrent && playlist.playing) dispatchStop();
    await updatePlaylist('remove', { itemId: item.id });
  };

  const moveItem = async (item: PlaylistItem, direction: 'up' | 'down') => {
    setNotice('');
    await updatePlaylist('move', { itemId: item.id, direction });
  };

  const clearPlaylist = async () => {
    if (!playlist.items.length) return;
    setNotice('');
    if (playlist.playing) dispatchStop();
    await updatePlaylist('clear');
  };

  const current = playlist.currentIndex !== null ? playlist.items[playlist.currentIndex] : null;
  const working = Boolean(busy);

  return (
    <div className={`rounded-3xl border border-zinc-700/70 bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950 p-5 ${className}`}>
      <div className="mb-5 flex items-start justify-between gap-3 border-b border-zinc-700/70 pb-4">
        <div className="min-w-0">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-100"><ListVideo className="h-5 w-5" /></span>
          <h2 className="text-base font-semibold tracking-tight text-white">Video playlist</h2>
          <p className="mt-0.5 text-xs text-zinc-400">Queue videos once and play them for everyone in the room.</p>
        </div>
        <span className="shrink-0 text-xs text-zinc-400">{loading ? 'Syncing…' : `${playlist.items.length} video${playlist.items.length === 1 ? '' : 's'}`}</span>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Close video playlist"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {notice ? (
        <div className="mb-3 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-300" role="status">
          {notice}
        </div>
      ) : null}

      <label htmlFor={`video-playlist-input-${meetingId}`} className="mb-1 block text-xs font-medium text-zinc-300">
        Video link
      </label>
      <input
        type="url"
        id={`video-playlist-input-${meetingId}`}
        value={input}
        onChange={event => setInput(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (!working) void addVideos(); } }}
        disabled={working}
        placeholder="Paste a YouTube or video link"
        className="input-modern mb-3 block w-full text-sm disabled:opacity-60"
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <HoverBorderGradient
          type="button"
          onClick={addVideos}
          disabled={working || !input.trim()}
          aria-label="Add video to the playlist"
          className="w-full gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === 'add' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {busy === 'add' ? 'Adding…' : playlist.items.length ? 'Add another video' : 'Add video'}
        </HoverBorderGradient>
        <span className="text-xs text-zinc-500">YouTube or direct MP4/WebM links</span>
      </div>

      {current ? (
        <div className="mb-3 rounded-xl border border-sky-400/25 bg-sky-400/5 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-300">
            {playlist.playing ? 'Now playing' : 'Selected video'}
          </p>
          <p className="mt-1 break-words text-sm font-medium text-zinc-100">{itemLabel(current)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => playItem(current)}
              disabled={working}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2 py-1.5 text-xs text-zinc-100 hover:bg-zinc-800 disabled:opacity-60"
              aria-label="Play the selected video in the meeting"
            >
              <Play className="h-3.5 w-3.5" /> Play
            </button>
            <button
              type="button"
              onClick={stopPlayback}
              disabled={working || !playlist.playing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2 py-1.5 text-xs text-zinc-100 hover:bg-zinc-800 disabled:opacity-60"
              aria-label="Stop the shared video"
            >
              <Square className="h-3.5 w-3.5" /> Stop
            </button>
            <button
              type="button"
              onClick={() => step('previous')}
              disabled={working || playlist.items.length < 2}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2 py-1.5 text-xs text-zinc-100 hover:bg-zinc-800 disabled:opacity-60"
              aria-label="Play the previous video"
            >
              <SkipBack className="h-3.5 w-3.5" /> Previous
            </button>
            <button
              type="button"
              onClick={() => step('next')}
              disabled={working || playlist.items.length < 2}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2 py-1.5 text-xs text-zinc-100 hover:bg-zinc-800 disabled:opacity-60"
              aria-label="Play the next video"
            >
              Next <SkipForward className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      <ul className="space-y-1.5" aria-label="Video playlist">
        {playlist.items.map((item, index) => {
          const isCurrent = playlist.currentIndex === index;
          return (
            <li
              key={item.id}
              className={`flex flex-wrap items-start gap-2 rounded-xl border px-2.5 py-2 ${
                isCurrent
                  ? 'border-sky-400/30 bg-sky-400/5'
                  : 'border-zinc-800 bg-zinc-950/40'
              }`}
            >
              <button
                type="button"
                onClick={() => playItem(item)}
                disabled={working}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-60 sm:h-8 sm:w-8"
                aria-label={`Play ${itemLabel(item)}`}
                title="Play in meeting"
              >
                <Play className="h-3.5 w-3.5" />
              </button>

              <div className="min-w-0 flex-1">
                <p className="break-words text-sm text-zinc-100">{itemLabel(item)}</p>
                <p className="mt-0.5 truncate text-[11px] text-zinc-500" title={item.url}>{item.url}</p>
              </div>

              <div className="flex w-full items-center justify-end gap-1 border-t border-zinc-800 pt-1 sm:w-auto sm:border-0 sm:pt-0 xl:w-full xl:border-t xl:pt-1">
                <button
                  type="button"
                  onClick={() => moveItem(item, 'up')}
                  disabled={working || index === 0}
                  className="rounded p-2.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30 sm:p-1.5 xl:p-2.5"
                  aria-label={`Move ${itemLabel(item)} up`}
                  title="Move up"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveItem(item, 'down')}
                  disabled={working || index === playlist.items.length - 1}
                  className="rounded p-2.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30 sm:p-1.5 xl:p-2.5"
                  aria-label={`Move ${itemLabel(item)} down`}
                  title="Move down"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(item)}
                  disabled={working}
                  className="rounded p-2.5 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-60 sm:p-1.5 xl:p-2.5"
                  aria-label={`Remove ${itemLabel(item)} from the playlist`}
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {playlist.items.length > 0 ? (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-zinc-500">
          <span>Use Next when a video finishes.</span>
          <button
            type="button"
            onClick={clearPlaylist}
            disabled={working}
            className="rounded px-2 py-1 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-60"
          >
            Clear playlist
          </button>
        </div>
      ) : null}
    </div>
  );
}
