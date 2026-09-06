import { format, isValid } from 'date-fns';

/**
 * Calendar data is a local-date contract.  Legacy Firestore records can still
 * contain malformed strings, so never pass an invalid value to date-fns view
 * calculations where it would make the entire Calendar fail to render.
 */
export function calendarEventDate(value: unknown): Date | null {
  if (value instanceof Date) return isValid(value) ? value : null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00`);
  return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === value ? parsed : null;
}
