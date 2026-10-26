export const PREVIEW_TYPES: Record<string, string> = {
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg',
  m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/ogg',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif', pdf: 'application/pdf',
};

export function sharedFileExtension(name: string) {
  return name.split('.').pop()?.toLowerCase() || '';
}

export function getPresentationKind(name: string): 'media' | 'image' | 'slides' | 'pdf' | null {
  const extension = sharedFileExtension(name);
  if (['ppt', 'pptx', 'pps', 'ppsx', 'odp'].includes(extension)) return 'slides';
  const mime = PREVIEW_TYPES[extension];
  if (mime?.startsWith('audio/') || mime?.startsWith('video/')) return 'media';
  if (mime?.startsWith('image/')) return 'image';
  return extension === 'pdf' ? 'pdf' : null;
}
