export const recurrenceLabels = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly (every 2 weeks)',
  monthly: 'Monthly',
  bimonthly: 'Bi-monthly (every 2 months)',
  weekdays: 'Specific days',
  dates: 'Specific dates',
} as const;

export type TeamEventRecurrenceFrequency = keyof typeof recurrenceLabels;
export type TeamEventRecurrence = {
  frequency: TeamEventRecurrenceFrequency;
  count: number;
  weekdays?: number[];
  dates?: string[];
};

function parseCalendarDate(value: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('A valid calendar date is required.');
  const date = new Date(value + 'T00:00:00.000Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('A valid calendar date is required.');
  return date;
}

export function shiftCalendarDate(value: string, days: number): string {
  if (!Number.isInteger(days)) throw new Error('A whole calendar-day offset is required.');
  const date = parseCalendarDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  const result = date.toISOString().slice(0, 10);
  parseCalendarDate(result);
  return result;
}

export function calendarDayOffset(start: string, end: string): number {
  return (parseCalendarDate(end).getTime() - parseCalendarDate(start).getTime()) / 86_400_000;
}

export function buildRecurringEventDates(
  startDate: string,
  frequency: TeamEventRecurrenceFrequency,
  count: number,
  selection: Pick<TeamEventRecurrence, 'dates' | 'weekdays'> = {},
): string[] {
  const anchor = parseCalendarDate(startDate);
  if (!Object.prototype.hasOwnProperty.call(recurrenceLabels, frequency)) throw new Error('Unsupported recurrence frequency.');
  if (frequency === 'dates' && count === 1) throw new Error('Select at least one additional date.');
  if (!Number.isInteger(count) || count < 2 || count > 52) throw new Error('Recurrence count must be between 2 and 52.');
  if (frequency === 'dates') {
    const dates = selection.dates;
    if (!Array.isArray(dates) || dates.length !== count - 1 || new Set(dates).size !== dates.length) {
      throw new Error('Select 1 to 51 different dates after the start date.');
    }
    for (const date of dates) {
      parseCalendarDate(date);
      if (date <= startDate) throw new Error('Additional dates must follow the start date.');
    }
    return [startDate, ...[...dates].sort()];
  }
  if (frequency === 'weekdays') {
    const days = selection.weekdays;
    if (!Array.isArray(days) || !days.length || days.length > 7 || days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('Choose at least one weekday.');
    const dates = [];
    for (let offset = 0; dates.length < count; offset++) {
      if (days.includes((anchor.getUTCDay() + offset) % 7)) dates.push(shiftCalendarDate(startDate, offset));
    }
    return dates;
  }
  return Array.from({ length: count }, (_, index) => {
    if (frequency === 'weekly' || frequency === 'biweekly') return shiftCalendarDate(startDate, index * (frequency === 'weekly' ? 7 : 14));
    const date = new Date(anchor);
    date.setUTCMonth(anchor.getUTCMonth() + index * (frequency === 'monthly' ? 1 : 2) + 1, 0);
    date.setUTCDate(Math.min(anchor.getUTCDate(), date.getUTCDate()));
    const result = date.toISOString().slice(0, 10);
    parseCalendarDate(result);
    return result;
  });
}
