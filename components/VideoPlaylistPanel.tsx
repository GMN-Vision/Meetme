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
import { parseVideoUrls } from '@/lib/video-playlist';

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
    const { urls, invalid } = parseVideoUrls(input);
    setNotice('');

    if (!urls.length) {
      setNotice(invalid.length
        ? 'No supported video links found. Use YouTube links or direct MP4/WebM URLs.'
        : 'Paste one or more video links first.');
      return;
    }

    setWorking('add');
    try {
      const response = await fetch('/api/video-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, urls, addedBy }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Videos could not be added');
      if (data.playlist) setPlaylist(data.playlist);
      setInput('');

      const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
      const unsupported = Array.isArray(data.invalid) ? data.invalid.length : invalid.length;
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
    <div className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <ListVideo className="h-4 w-4" /> Video playlist
          </h2>
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
        Paste video links — one per line
      </label>
      <textarea
        id={`video-playlist-input-${meetingId}`}
        value={input}
        onChange={event => setInput(event.target.value)}
        rows={3}
        disabled={working}
        placeholder={'https://www.youtube.com/watch?v=…\nhttps://youtu.be/…\nhttps://example.com/clip.mp4'}
        className="mb-2 block w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none disabled:opacity-60"
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addVideos}
          disabled={working || !input.trim()}
          aria-label="Add videos to the playlist"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === 'add' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {busy === 'add' ? 'Adding…' : 'Add to playlist'}
        </button>
        <span className="text-xs text-zinc-500">YouTube or direct MP4/WebM links</span>
      </div>

      {current ? (
        <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
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

      <ul className="max-h-[min(22rem,42dvh)] space-y-1.5 overflow-y-auto" aria-label="Video playlist">
        {playlist.items.map((item, index) => {
          const isCurrent = playlist.currentIndex === index;
          return (
            <li
              key={item.id}
              className={`flex items-start gap-2 rounded-xl border px-2.5 py-2 ${
                isCurrent
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-zinc-800 bg-zinc-950/40'
              }`}
            >
              <button
                type="button"
                onClick={() => playItem(item)}
                disabled={working}
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-60"
                aria-label={`Play ${itemLabel(item)}`}
                title="Play in meeting"
              >
                <Play className="h-3.5 w-3.5" />
              </button>

              <div className="min-w-0 flex-1">
                <p className="break-words text-sm text-zinc-100">{itemLabel(item)}</p>
                <p className="mt-0.5 truncate text-[11px] text-zinc-500" title={item.url}>{item.url}</p>
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => moveItem(item, 'up')}
                  disabled={working || index === 0}
                  className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"
                  aria-label={`Move ${itemLabel(item)} up`}
                  title="Move up"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveItem(item, 'down')}
                  disabled={working || index === playlist.items.length - 1}
                  className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"
                  aria-label={`Move ${itemLabel(item)} down`}
                  title="Move down"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(item)}
                  disabled={working}
                  className="rounded p-1.5 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-60"
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

      {!playlist.items.length && !loading ? (
        <div className="mt-3 rounded-lg border border-dashed border-zinc-700 bg-zinc-950/40 px-3 py-4 text-center text-xs text-zinc-400">
          No videos queued yet. Paste several links above to build the meeting playlist.
        </div>
      ) : null}

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
