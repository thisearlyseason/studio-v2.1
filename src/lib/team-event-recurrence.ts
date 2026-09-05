export type TeamEventRecurrenceFrequency = 'weekly';

function parseCalendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('A valid calendar date is required.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('A valid calendar date is required.');
  }
  return date;
}

export function buildRecurringEventDates(
  startDate: string,
  frequency: TeamEventRecurrenceFrequency,
  count: number,
): string[] {
  if (frequency !== 'weekly') throw new Error('Unsupported recurrence frequency.');
  if (!Number.isInteger(count) || count < 2 || count > 52) {
    throw new Error('Recurrence count must be between 2 and 52.');
  }
  const start = parseCalendarDate(startDate);
  return Array.from({ length: count }, (_value, index) => {
    const occurrence = new Date(start);
    occurrence.setUTCDate(start.getUTCDate() + (index * 7));
    return occurrence.toISOString().slice(0, 10);
  });
}
