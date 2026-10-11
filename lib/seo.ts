const DEFAULT_PUBLIC_URL = 'https://melanam.com';

export const SITE_NAME = 'Melanam';
export const SITE_DESCRIPTION =
  'Melanam is a video conferencing app for team calls, AI notes, recordings, captions, whiteboards, files, and follow-up tasks.';

export const SEO_KEYWORDS = [
  'Melanam',
  'melanam meeting app',
  'video meetings',
  'screen sharing',
  'web conferencing',
  'AI meeting notes',
  'meeting recordings',
  'live captions',
  'Jitsi meeting platform',
  'online collaboration',
];

export function getPublicSiteUrl() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    DEFAULT_PUBLIC_URL;

  try {
    const url = new URL(configuredUrl);
    const isLocal = ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname);

    if (isLocal) return DEFAULT_PUBLIC_URL;

    return url.origin;
  } catch {
    return DEFAULT_PUBLIC_URL;
  }
}

export function absoluteUrl(path = '/') {
  return new URL(path, getPublicSiteUrl()).toString();
}
