export function parseScheduledAt(value: unknown, now = Date.now()): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error('Choose a valid meeting date and time.');
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= now) {
    throw new Error('Choose a meeting time in the future.');
  }
  return date;
}
