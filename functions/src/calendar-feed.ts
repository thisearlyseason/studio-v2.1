const DEFAULT_TIME_ZONE = "America/Edmonton";

export type CalendarFeedEvent = Record<string, unknown> & {
  id: string;
  teamId: string;
};

export type CalendarFeedTeam = {
  name: string;
  timeZone?: string;
};

type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** Fold content lines at 75 UTF-8 octets as required by RFC 5545. */
function foldLine(line: string): string {
  const lines: string[] = [];
  let current = "";

  for (const character of line) {
    if (Buffer.byteLength(current + character, "utf8") > 75) {
      lines.push(current);
      current = ` ${character}`;
    } else {
      current += character;
    }
  }

  lines.push(current);
  return lines.join("\r\n");
}

function parseDate(value: unknown): Pick<LocalDateTime, "year" | "month" | "day"> | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) return null;

  return { year, month, day };
}

function parseTime(value: unknown): Pick<LocalDateTime, "hour" | "minute"> | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (minute > 59) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "AM" && hour === 12) hour = 0;
    if (meridiem === "PM" && hour !== 12) hour += 12;
  } else if (hour > 23) {
    return null;
  }

  return { hour, minute };
}

function toLocalDateTime(date: unknown, time: unknown): LocalDateTime | null {
  const parsedDate = parseDate(date);
  const parsedTime = parseTime(time) || { hour: 0, minute: 0 };
  return parsedDate ? { ...parsedDate, ...parsedTime } : null;
}

function addMinutes(value: LocalDateTime, minutes: number): LocalDateTime {
  const shifted = new Date(Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    value.hour,
    value.minute + minutes
  ));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function localValue(value: LocalDateTime): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.year}${pad(value.month)}${pad(value.day)}T${pad(value.hour)}${pad(value.minute)}00`;
}

function utcValue(value: Date): string {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") {
      const parsed = toDate.call(value) as Date;
      return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
    }
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function validTimeZone(value: unknown): string {
  if (typeof value !== "string" || value.length > 100) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function eventEnd(event: CalendarFeedEvent, start: LocalDateTime): LocalDateTime {
  const explicit = toLocalDateTime(event.endDate || event.date, event.endTime);
  if (!event.endTime || !explicit) return addMinutes(start, 60);

  const startValue = Date.UTC(start.year, start.month - 1, start.day, start.hour, start.minute);
  const endValue = Date.UTC(explicit.year, explicit.month - 1, explicit.day, explicit.hour, explicit.minute);
  if (endValue > startValue) return explicit;

  // A finish time earlier than the start time without an explicit end date is an overnight event.
  return event.endDate ? addMinutes(start, 60) : addMinutes(explicit, 24 * 60);
}

export function buildCalendarFeed(
  events: CalendarFeedEvent[],
  teams: Record<string, CalendarFeedTeam>,
  calendarName: string,
  generatedAt = new Date()
): string {
  const stamp = utcValue(generatedAt);
  const hasMultipleTeams = new Set(events.map(event => event.teamId)).size > 1;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Squad//Family Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:${escapeText(calendarName)}`),
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];

  for (const event of events) {
    const start = toLocalDateTime(event.date, event.startTime);
    if (!start) continue;

    const team = teams[event.teamId] || { name: "Team" };
    const teamName = asText(team.name, "Team");
    const timeZone = validTimeZone(event.timeZone || team.timeZone);
    const end = eventEnd(event, start);
    const title = asText(event.title, "Untitled Event");
    const prefix = hasMultipleTeams ? `[${teamName}] ` : "";
    const description = [
      `Team: ${teamName}`,
      `Type: ${asText(event.eventType, "Event")}`,
      `League: ${asText(event.leagueName, "N/A")}`,
      asText(event.description),
    ].filter(Boolean).join("\n");
    const updatedAt = asDate(event.updatedAt) || asDate(event.createdAt);
    const sequence = typeof event.sequence === "number" && Number.isSafeInteger(event.sequence)
      ? Math.max(0, event.sequence)
      : 0;
    const uid = `${encodeURIComponent(event.teamId)}-${encodeURIComponent(event.id)}@thesquad.pro`;

    lines.push(
      "BEGIN:VEVENT",
      foldLine(`UID:${uid}`),
      `DTSTAMP:${stamp}`,
      `LAST-MODIFIED:${updatedAt ? utcValue(updatedAt) : stamp}`,
      `SEQUENCE:${sequence}`,
      `DTSTART;TZID=${timeZone}:${localValue(start)}`,
      `DTEND;TZID=${timeZone}:${localValue(end)}`,
      foldLine(`SUMMARY:${escapeText(prefix + title)}`),
      foldLine(`LOCATION:${escapeText(asText(event.location))}`),
      foldLine(`DESCRIPTION:${escapeText(description)}`),
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
