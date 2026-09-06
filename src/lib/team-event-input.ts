import { normalizeTeamEventInterval } from './team-event-interval';

function cleanCalendarDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function clockMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? (hours * 60) + minutes : null;
}

/** Server-side validation shared by create, update, and series mutations. */
export function validateTeamEventInput(value: Record<string, unknown>): void {
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  if (!title || title.length > 200) throw new Error('A valid event title is required.');
  const date = cleanCalendarDate(value.date);
  if (!date || !normalizeTeamEventInterval(value)) throw new Error('A valid event date and time are required.');
  if (value.endDate === undefined) return;
  const endDate = cleanCalendarDate(value.endDate);
  if (!endDate || endDate < date) throw new Error('A valid event end date is required.');
  const start = clockMinutes(value.startTime);
  const end = clockMinutes(value.endTime);
  if (endDate === date && start !== null && end !== null && end <= start) {
    throw new Error('An event end time must follow its start time on the same day.');
  }
  if (endDate > date && endDate !== new Date(new Date(`${date}T00:00:00.000Z`).getTime() + 86_400_000).toISOString().slice(0, 10)) {
    throw new Error('An event may not span more than one day.');
  }
}
