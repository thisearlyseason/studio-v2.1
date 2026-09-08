import { format, isValid, startOfDay } from 'date-fns';

/**
 * Calendar data is a local-date contract.  Legacy Firestore records can still
 * contain malformed strings, so never pass an invalid value to date-fns view
 * calculations where it would make the entire Calendar fail to render.
 */
export function calendarEventDate(value: unknown): Date | null {
  if (value instanceof Date) return isValid(value) ? value : null;
  if (typeof value !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const instant = new Date(value);
    return isValid(instant) ? instant : null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00`);
  return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === value ? parsed : null;
}

export function isCalendarDateOnOrAfter(value: unknown, reference = new Date()): boolean {
  const parsed = calendarEventDate(value);
  return parsed !== null && parsed.getTime() >= startOfDay(reference).getTime();
}

export function calendarDateLabel(value: unknown): { month: string; day: string } | null {
  const parsed = calendarEventDate(value);
  return parsed ? { month: format(parsed, 'MMM'), day: format(parsed, 'dd') } : null;
}

function clockMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().toUpperCase().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59) return null;
  if (match[3]) {
    if (hour < 1 || hour > 12) return null;
    if (match[3] === 'PM' && hour !== 12) hour += 12;
    if (match[3] === 'AM' && hour === 12) hour = 0;
  } else if (hour > 23) return null;
  return hour * 60 + minute;
}

export function calendarEventIsUpcoming(
  event: { date?: unknown; endDate?: unknown; startTime?: unknown },
  reference = new Date(),
): boolean {
  const start = calendarEventDate(event.date);
  const end = calendarEventDate(event.endDate ?? event.date);
  if (!start || !end) return false;

  const todayKey = format(reference, 'yyyy-MM-dd');
  const startKey = format(start, 'yyyy-MM-dd');
  const endKey = format(end, 'yyyy-MM-dd');
  if (endKey < todayKey) return false;
  if (startKey > todayKey || endKey > todayKey) return true;

  const scheduledMinutes = clockMinutes(event.startTime);
  if (scheduledMinutes === null) return true;
  return scheduledMinutes > reference.getHours() * 60 + reference.getMinutes();
}
