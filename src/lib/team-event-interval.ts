export type TeamEventInterval = {
  date: string;
  startMinute: number;
  endMinute: number;
};

function calendarMinute(interval: TeamEventInterval, minute: number): number | null {
  const day = new Date(`${interval.date}T00:00:00.000Z`).getTime();
  return Number.isFinite(day) ? (day / 60_000) + minute : null;
}

export function teamEventIntervalsOverlap(
  left: TeamEventInterval | null,
  right: TeamEventInterval | null,
): boolean {
  if (!left || !right) return false;
  const leftStart = calendarMinute(left, left.startMinute);
  const leftEnd = calendarMinute(left, left.endMinute);
  const rightStart = calendarMinute(right, right.startMinute);
  const rightEnd = calendarMinute(right, right.endMinute);
  return leftStart !== null && leftEnd !== null && rightStart !== null && rightEnd !== null &&
    leftStart < rightEnd && rightStart < leftEnd;
}

export function teamEventConflictDates(interval: TeamEventInterval): string[] {
  const anchor = new Date(`${interval.date}T00:00:00.000Z`);
  if (Number.isNaN(anchor.getTime())) return [interval.date];
  return [-1, 0, 1].map(offset => {
    const date = new Date(anchor);
    date.setUTCDate(anchor.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  });
}

function cleanDate(value: unknown): string {
  const candidate = typeof value === 'string' ? value.trim().split('T')[0] : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return '';
  const date = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== candidate ? '' : candidate;
}

function parseTime(value: unknown): number | null {
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
  return (hour * 60) + minute;
}

export function normalizeTeamEventInterval(data: Record<string, unknown>): TeamEventInterval | null {
  const date = cleanDate(data.date);
  const startMinute = parseTime(data.startTime ?? data.time);
  if (!date || startMinute === null) return null;
  const explicitEnd = parseTime(data.endTime);
  if (data.endTime !== undefined && explicitEnd === null) return null;
  const requestedDuration = Number(data.durationMinutes);
  if (data.durationMinutes !== undefined &&
      (!Number.isInteger(requestedDuration) || requestedDuration < 1 || requestedDuration > 24 * 60)) return null;
  const duration = Number.isInteger(requestedDuration) && requestedDuration > 0 && requestedDuration <= 24 * 60
    ? requestedDuration
    : 60;
  const endMinute = explicitEnd === null
    ? startMinute + duration
    : explicitEnd > startMinute ? explicitEnd : explicitEnd + (24 * 60);
  if (endMinute <= startMinute || endMinute - startMinute > 24 * 60) return null;
  return { date, startMinute, endMinute };
}
