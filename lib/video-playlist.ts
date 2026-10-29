/** Shared video URL rules for the in-meeting playlist. */

export const MAX_PLAYLIST_ITEMS = 50;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
]);

const DIRECT_VIDEO_EXTENSION = /\.(mp4|webm|ogv|ogg|m3u8)$/i;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function youtubeId(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let id = '';

  if (host === 'youtu.be') {
    id = url.pathname.split('/').filter(Boolean)[0] || '';
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === '/watch' || url.pathname === '/watch/') {
      id = url.searchParams.get('v') || '';
    } else {
      const parts = url.pathname.split('/').filter(Boolean);
      if (['embed', 'shorts', 'live', 'v', 'e'].includes(parts[0])) {
        id = parts[1] || '';
      }
    }
  }

  return YOUTUBE_ID.test(id) ? id : '';
}

/**
 * Returns a URL Jitsi can share, or null when the link is not a supported
 * YouTube video or direct browser-playable video file.
 */
export function normalizeVideoUrl(raw: string): string | null {
  let value = String(raw || '')
    .trim()
    .replace(/^[<("'`]+|[>)"'`]+$/g, '')
    .replace(/[;,]+$/g, '');

  if (!value) return null;

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    if (!/^(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(value)) return null;
    value = `https://${value}`;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const id = youtubeId(url);
  if (id) return `https://www.youtube.com/watch?v=${id}`;

  if (DIRECT_VIDEO_EXTENSION.test(url.pathname)) {
    url.hash = '';
    return url.href;
  }

  return null;
}

export function isYouTubeVideoUrl(url: string) {
  return /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(url);
}

/** A readable fallback title when the provider does not give us one. */
export function getVideoFallbackTitle(url: string) {
  if (isYouTubeVideoUrl(url)) {
    return `YouTube video ${new URL(url).searchParams.get('v') || ''}`.trim();
  }

  try {
    const name = safeDecode(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
    return name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim() || 'Shared video';
  } catch {
    return 'Shared video';
  }
}

/**
 * Accepts a textarea full of links and returns clean, deduplicated URLs plus
 * the entries that were not understood.
 */
export function parseVideoUrls(input: string) {
  const urls: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const token of String(input || '').split(/[\s,]+/)) {
    const candidate = token.trim();
    if (!candidate) continue;

    const normalized = normalizeVideoUrl(candidate);
    if (!normalized) {
      invalid.push(candidate);
      continue;
    }

    if (!seen.has(normalized)) {
      seen.add(normalized);
      urls.push(normalized);
    }
  }

  return { urls, invalid };
}
