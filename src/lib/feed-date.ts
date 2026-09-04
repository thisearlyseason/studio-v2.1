import { formatDistance } from 'date-fns';

type TimestampLike = {
  seconds?: unknown;
  _seconds?: unknown;
  nanoseconds?: unknown;
  _nanoseconds?: unknown;
  toDate?: () => Date;
};

export function feedTimestampToDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (!value || typeof value !== 'object') return null;

  const timestamp = value as TimestampLike;
  if (typeof timestamp.toDate === 'function') {
    try {
      const date = timestamp.toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
    } catch {
      // Fall through to serialized emulator Timestamp fields.
    }
  }
  const seconds = Number(timestamp.seconds ?? timestamp._seconds);
  const nanoseconds = Number(timestamp.nanoseconds ?? timestamp._nanoseconds ?? 0);
  if (!Number.isFinite(seconds) || !Number.isFinite(nanoseconds)) return null;
  const date = new Date((seconds * 1000) + Math.floor(nanoseconds / 1_000_000));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatFeedDistance(value: unknown, baseDate = new Date()): string {
  const date = feedTimestampToDate(value);
  if (!date || Number.isNaN(baseDate.getTime())) return 'recently';
  return formatDistance(date, baseDate, { addSuffix: true });
}
