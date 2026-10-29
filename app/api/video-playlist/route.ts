import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import VideoPlaylist from '@/models/VideoPlaylist';
import {
  MAX_PLAYLIST_ITEMS,
  getVideoFallbackTitle,
  isYouTubeVideoUrl,
  normalizeVideoUrl,
  parseVideoUrls,
} from '@/lib/video-playlist';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...noStoreHeaders,
      ...(init?.headers || {}),
    },
  });
}

function serialize(playlist: any) {
  const items = Array.isArray(playlist?.items) ? playlist.items : [];
  const currentIndex = Number.isInteger(playlist?.currentIndex)
    && playlist.currentIndex >= 0
    && playlist.currentIndex < items.length
    ? playlist.currentIndex
    : null;

  return {
    meetingId: playlist?.meetingId || '',
    items: items.map((item: any) => ({
      id: item.id,
      url: item.url,
      title: item.title || getVideoFallbackTitle(item.url),
      addedBy: item.addedBy || '',
      addedAt: item.addedAt ? new Date(item.addedAt).toISOString() : null,
      playedAt: item.playedAt ? new Date(item.playedAt).toISOString() : null,
    })),
    currentIndex,
    playing: Boolean(playlist?.playing) && currentIndex !== null,
    updatedAt: playlist?.updatedAt ? new Date(playlist.updatedAt).toISOString() : null,
  };
}

async function readBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function resolveVideoTitle(url: string) {
  const fallback = getVideoFallbackTitle(url);

  if (!isYouTubeVideoUrl(url)) {
    return fallback;
  }

  try {
    const endpoint = new URL('https://www.youtube.com/oembed');
    endpoint.searchParams.set('url', url);
    endpoint.searchParams.set('format', 'json');
    const response = await fetch(endpoint, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(3500),
    });

    if (!response.ok) return fallback;

    const data = await response.json();
    const title = String(data?.title || '').trim();
    return title ? title.slice(0, 200) : fallback;
  } catch {
    return fallback;
  }
}

function collectUrls(body: any) {
  const invalid: string[] = [];
  const candidates: string[] = [];

  if (Array.isArray(body?.urls)) {
    candidates.push(...body.urls.map((value: unknown) => String(value || '')));
  } else if (typeof body?.input === 'string') {
    const parsed = parseVideoUrls(body.input);
    candidates.push(...parsed.urls);
    invalid.push(...parsed.invalid);
  } else if (typeof body?.url === 'string') {
    candidates.push(body.url);
  }

  const urls: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const normalized = normalizeVideoUrl(candidate);
    if (!normalized) {
      if (candidate.trim()) invalid.push(candidate.trim());
      continue;
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      urls.push(normalized);
    }
  }

  return { urls, invalid };
}

function resolveIndex(playlist: any, body: any) {
  const items = Array.isArray(playlist?.items) ? playlist.items : [];
  const index = Number(body?.index);
  if (Number.isInteger(index) && index >= 0 && index < items.length) return index;

  const itemId = String(body?.itemId || '').trim();
  if (itemId) {
    const found = items.findIndex((item: any) => item.id === itemId);
    if (found >= 0) return found;
  }

  return -1;
}

function markPlayed(playlist: any, index: number) {
  const item = playlist.items?.[index];
  if (item) item.playedAt = new Date();
}

export async function GET(request: Request) {
  try {
    const meetingId = (new URL(request.url).searchParams.get('meetingId') || '').trim();
    if (!meetingId) return json({ error: 'missing meetingId' }, { status: 400 });

    await db();
    const playlist = await VideoPlaylist.findOne({ meetingId }).lean();

    return json({
      playlist: playlist
        ? serialize(playlist)
        : { meetingId, items: [], currentIndex: null, playing: false, updatedAt: null },
    });
  } catch (error: any) {
    console.error('[video-playlist] load failed:', error?.message || error);
    return json({ error: 'Could not load the video playlist' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const meetingId = String(body?.meetingId || '').trim();
    if (!meetingId) return json({ error: 'missing meetingId' }, { status: 400 });

    const { urls, invalid } = collectUrls(body);
    if (!urls.length) {
      return json({
        error: 'Add at least one YouTube link or direct video URL.',
        invalid,
      }, { status: 400 });
    }

    await db();
    let playlist: any = await VideoPlaylist.findOne({ meetingId });
    if (!playlist) {
      playlist = new VideoPlaylist({ meetingId, items: [], currentIndex: null, playing: false });
    }

    const existing = new Set<string>((playlist.items || []).map((item: any) => item.url));
    const room = Math.max(0, MAX_PLAYLIST_ITEMS - (playlist.items?.length || 0));
    const accepted = urls.filter(url => !existing.has(url)).slice(0, room);
    const skipped = [
      ...urls.filter(url => existing.has(url)),
      ...urls.filter(url => !existing.has(url)).slice(room),
    ];

    if (!accepted.length) {
      return json({
        playlist: serialize(playlist),
        added: 0,
        skipped,
        invalid,
      });
    }

    const addedBy = String(body?.addedBy || '').trim().slice(0, 160);
    const titles = await Promise.all(accepted.map(resolveVideoTitle));
    const now = new Date();

    accepted.forEach((url, index) => {
      playlist.items.push({
        id: randomUUID(),
        url,
        title: titles[index],
        addedBy,
        addedAt: now,
        playedAt: null,
      });
    });

    playlist.updatedBy = addedBy;
    await playlist.save();

    return json({
      playlist: serialize(playlist),
      added: accepted.length,
      skipped,
      invalid,
    });
  } catch (error: any) {
    console.error('[video-playlist] add failed:', error?.message || error);
    return json({ error: 'Could not add videos to the playlist' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await readBody(request);
    const meetingId = String(body?.meetingId || '').trim();
    const action = String(body?.action || '').trim();
    if (!meetingId) return json({ error: 'missing meetingId' }, { status: 400 });

    await db();
    const playlist: any = await VideoPlaylist.findOne({ meetingId });
    if (!playlist) return json({ error: 'Playlist not found' }, { status: 404 });

    const items: any[] = Array.isArray(playlist.items) ? playlist.items : [];
    const updatedBy = String(body?.updatedBy || '').trim().slice(0, 160);

    if (action === 'play') {
      const index = resolveIndex(playlist, body);
      if (index < 0) return json({ error: 'Video not found in the playlist' }, { status: 404 });
      playlist.currentIndex = index;
      playlist.playing = true;
      markPlayed(playlist, index);
    } else if (action === 'stop') {
      playlist.playing = false;
    } else if (action === 'next' || action === 'previous') {
      if (!items.length) return json({ error: 'The playlist is empty' }, { status: 400 });

      const current = Number.isInteger(playlist.currentIndex) ? playlist.currentIndex : -1;
      const nextIndex = action === 'next'
        ? (current + 1) % items.length
        : (current <= 0 ? items.length - 1 : current - 1);

      playlist.currentIndex = nextIndex;
      playlist.playing = true;
      markPlayed(playlist, nextIndex);
    } else if (action === 'remove') {
      const index = resolveIndex(playlist, body);
      if (index < 0) return json({ error: 'Video not found in the playlist' }, { status: 404 });

      const wasCurrent = playlist.currentIndex === index;
      items.splice(index, 1);

      if (!items.length) {
        playlist.currentIndex = null;
        playlist.playing = false;
      } else if (wasCurrent) {
        playlist.currentIndex = null;
        playlist.playing = false;
      } else if (Number.isInteger(playlist.currentIndex) && index < playlist.currentIndex) {
        playlist.currentIndex -= 1;
      }
    } else if (action === 'move') {
      const index = resolveIndex(playlist, body);
      if (index < 0) return json({ error: 'Video not found in the playlist' }, { status: 404 });

      const direction = String(body?.direction || '').trim();
      const target = direction === 'up' ? index - 1 : direction === 'down' ? index + 1 : -1;
      if (target < 0 || target >= items.length) {
        return json({ playlist: serialize(playlist) });
      }

      const currentId = Number.isInteger(playlist.currentIndex)
        ? items[playlist.currentIndex]?.id
        : null;
      [items[index], items[target]] = [items[target], items[index]];

      if (currentId) {
        const found = items.findIndex(item => item.id === currentId);
        playlist.currentIndex = found >= 0 ? found : null;
      }
    } else if (action === 'clear') {
      items.splice(0, items.length);
      playlist.currentIndex = null;
      playlist.playing = false;
    } else {
      return json({ error: 'Unknown playlist action' }, { status: 400 });
    }

    playlist.markModified('items');
    playlist.updatedBy = updatedBy;
    await playlist.save();

    return json({ playlist: serialize(playlist) });
  } catch (error: any) {
    console.error('[video-playlist] update failed:', error?.message || error);
    return json({ error: 'Could not update the video playlist' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const meetingId = (new URL(request.url).searchParams.get('meetingId') || '').trim();
    if (!meetingId) return json({ error: 'missing meetingId' }, { status: 400 });

    await db();
    await VideoPlaylist.deleteOne({ meetingId });
    return json({
      playlist: { meetingId, items: [], currentIndex: null, playing: false, updatedAt: null },
    });
  } catch (error: any) {
    console.error('[video-playlist] delete failed:', error?.message || error);
    return json({ error: 'Could not clear the video playlist' }, { status: 500 });
  }
}
