type TeamEventNotificationInput = Record<string, unknown>;

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function displayDate(value: unknown): string {
  const date = cleanText(value).split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function displayTime(value: unknown): string {
  const time = cleanText(value);
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  const minute = match[2];
  if (hour > 23) return time;
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function teamEventCreatedNotification(event: TeamEventNotificationInput) {
  const title = cleanText(event.title) || 'Team event';
  const eventType = cleanText(event.eventType).toLowerCase() || 'event';
  const date = displayDate(event.date);
  const time = displayTime(event.startTime);
  const location = cleanText(event.location);
  const schedule = [date, time ? `at ${time}` : ''].filter(Boolean).join(' ');
  const body = [schedule, location].filter(Boolean).join(' · ');
  return {
    title: `New ${eventType}: ${title}`,
    body: body || 'A new event was added to your squad schedule.',
    url: '/calendar',
  };
}
