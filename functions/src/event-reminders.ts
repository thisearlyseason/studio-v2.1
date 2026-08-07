export type ReminderEvent = {
  date?: unknown;
  startTime?: unknown;
  eventType?: unknown;
  type?: unknown;
  title?: unknown;
  location?: unknown;
  status?: unknown;
  isArchived?: unknown;
};

const DEFAULT_TIME_ZONE = "America/Edmonton";
const REMINDER_START_MINUTES = 6 * 60;

export function parseClockMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3];
  if (minutes > 59 || hours > (meridiem ? 12 : 23) || hours < 0 || (meridiem && hours < 1)) {
    return null;
  }
  if (meridiem === "am") hours = hours === 12 ? 0 : hours;
  if (meridiem === "pm") hours = hours === 12 ? 12 : hours + 12;
  return (hours * 60) + minutes;
}

export function formatClockTime(value: unknown): string | null {
  const totalMinutes = parseClockMinutes(value);
  if (totalMinutes === null) return null;
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function normalizeEventKind(event: ReminderEvent): string {
  const raw = String(event.eventType || event.type || "").trim().toLowerCase();
  if (raw.includes("game") || raw.includes("match")) return "game";
  if (raw.includes("practice") || raw.includes("training")) return "practice";
  if (raw.includes("tournament")) return "tournament";
  if (raw.includes("meeting")) return "meeting";
  if (raw.includes("tryout")) return "tryout";

  const title = String(event.title || "").toLowerCase();
  if (title.includes("game") || title.includes("match") || title.includes(" vs ")) return "game";
  if (title.includes("practice") || title.includes("training")) return "practice";
  if (title.includes("tournament")) return "tournament";
  return "event";
}

export function buildUpcomingEventMessage(event: ReminderEvent): string {
  const kind = normalizeEventKind(event);
  const time = formatClockTime(event.startTime) || "a time to be confirmed";
  const location = typeof event.location === "string" && event.location.trim()
    ? event.location.trim()
    : "a location to be confirmed";
  return `You have an upcoming ${kind} at ${time}, ${location}.`;
}

export function getZonedClock(
  now: Date,
  requestedTimeZone?: string
): { date: string; minutes: number; timeZone: string } {
  const timeZone = requestedTimeZone || DEFAULT_TIME_ZONE;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return getZonedClock(now, DEFAULT_TIME_ZONE);
  }

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    minutes: (hour * 60) + minute,
    timeZone,
  };
}

export function shouldSendSameDayReminder(
  event: ReminderEvent,
  now: Date,
  timeZone?: string
): boolean {
  if (event.isArchived === true || String(event.status || "").toLowerCase() === "cancelled") return false;
  if (typeof event.date !== "string") return false;
  const eventMinutes = parseClockMinutes(event.startTime);
  if (eventMinutes === null) return false;

  const local = getZonedClock(now, timeZone);
  return event.date === local.date &&
    local.minutes >= REMINDER_START_MINUTES &&
    eventMinutes > local.minutes;
}

export function candidateDateKeys(now: Date): string[] {
  return [-1, 0, 1].map((offset) => {
    const date = new Date(now.getTime() + (offset * 24 * 60 * 60 * 1000));
    return date.toISOString().slice(0, 10);
  });
}
