/**
 * @fileOverview Utilities for generating calendar export links and ICS files.
 *
 * RFC 5545 compliant ICS generation.
 * Key fields for update propagation:
 *   - UID: Stable identifier derived from event ID + team. Calendar apps use this to REPLACE existing events on update.
 *   - SEQUENCE: Increment triggers update in subscribed calendars.
 *   - LAST-MODIFIED: ISO timestamp; calendar apps skip re-download if unchanged.
 *   - DTSTAMP: When the iCal event object was created (not the event date).
 */

import { format, addHours, addMinutes, parseISO, isValid as isValidDate } from 'date-fns';

export interface CalendarEvent {
  /** Internal event ID from Firestore — used to derive a stable UID */
  id?: string;
  title: string;
  start: Date;
  end?: Date;
  location?: string;
  description?: string;
  /** Team or squad the event belongs to */
  teamName?: string;
  /** Child/athlete participant name (for parent household feeds) */
  childName?: string;
  /** Tournament round label e.g. "WB Semi-Finals" */
  round?: string;
  /** Opponent or other team in the match */
  opponent?: string;
  /** Event type: game | practice | tournament | meeting | other */
  eventType?: string;
  /** Firestore updatedAt / last modified timestamp */
  lastModified?: Date;
  /** Increment when content changes so subscribed calendars resync */
  sequence?: number;
  /** Optional URL to the event detail page */
  url?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const escapeICS = (str: string = '') =>
  str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');

const fmtDateTime = (date: Date) => format(date, "yyyyMMdd'T'HHmmss");
const fmtDateTimeUTC = (date: Date) => format(date, "yyyyMMdd'T'HHmmss") + 'Z';

/**
 * Fold long iCal lines to ≤75 octets per RFC 5545 §3.1
 */
const fold = (line: string): string => {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let i = 0;
  chunks.push(line.slice(0, 75));
  i = 75;
  while (i < line.length) {
    chunks.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return chunks.join('\r\n');
};

/**
 * Derives a stable UID from the event's Firestore id.
 * Calendar apps (Google, Apple, Outlook) match on UID — if the same UID
 * is seen in a feed update with a higher SEQUENCE, they replace the entry
 * instead of creating a duplicate.
 */
const stableUID = (event: CalendarEvent): string => {
  const base = event.id
    ? `${event.id}-${(event.teamName || 'squad').toLowerCase().replace(/\s+/g, '-')}`
    : `${event.title.toLowerCase().replace(/\s+/g, '-')}-${event.start.getTime()}`;
  return `${base}@thesquad.pro`;
};

/**
 * Builds the rich DESCRIPTION field for an iCal event.
 * Includes: team, child/athlete, round, opponent, raw description.
 * Keeps updates meaningful when events change (e.g. time shift).
 */
const buildDescription = (event: CalendarEvent): string => {
  const parts: string[] = [];

  if (event.teamName) parts.push(`Squad: ${event.teamName}`);
  if (event.childName) parts.push(`Athlete: ${event.childName}`);
  if (event.eventType) parts.push(`Type: ${event.eventType.toUpperCase()}`);
  if (event.round) parts.push(`Round: ${event.round}`);
  if (event.opponent) parts.push(`Opponent: ${event.opponent}`);
  if (event.location) parts.push(`Venue: ${event.location}`);
  if (event.url) parts.push(`Details: ${event.url}`);
  if (event.description) parts.push(`\nNotes: ${event.description}`);

  parts.push('\n—\nPowered by The Squad • thesquad.pro');
  return parts.join('\n');
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Generates a Google Calendar "Add event" link for a single event.
 */
export function generateGoogleCalendarLink(event: CalendarEvent): string {
  const startStr = fmtDateTime(event.start);
  const end = event.end || addHours(event.start, 1);
  const endStr = fmtDateTime(end);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${startStr}/${endStr}`,
    details: buildDescription(event),
    location: event.location || '',
  });

  return `https://www.google.com/calendar/render?${params.toString()}`;
}

/**
 * Converts app TeamEvent objects to CalendarEvent format for ICS generation.
 * Pass children array from the parent household context to enrich events.
 */
export function teamEventToCalendarEvent(
  e: any,
  opts: { teamName?: string; childName?: string; baseUrl?: string } = {}
): CalendarEvent {
  const toDate = (d: any): Date | null => {
    if (!d) return null;
    if (d instanceof Date) return d;
    if (d.toDate) return d.toDate();
    if (d.seconds) return new Date(d.seconds * 1000);
    try {
      const p = typeof d === 'string' ? parseISO(d) : new Date(d);
      return isValidDate(p) ? p : null;
    } catch { return null; }
  };

  const start = toDate(e.date) || new Date();

  // Parse startTime string like "08:00 AM" / "14:30" and apply to date
  const applyTime = (base: Date, timeStr?: string): Date => {
    if (!timeStr) return base;
    const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!m) return base;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (m[3]?.toUpperCase() === 'PM' && h !== 12) h += 12;
    if (m[3]?.toUpperCase() === 'AM' && h === 12) h = 0;
    const d = new Date(base);
    d.setHours(h, min, 0, 0);
    return d;
  };

  const startWithTime = applyTime(start, e.startTime);
  const end = toDate(e.endDate) || addHours(startWithTime, e.isTournament ? 24 : 1.5);
  const lastModified = toDate(e.updatedAt) || toDate(e.createdAt);

  return {
    id: e.id,
    title: e.title,
    start: startWithTime,
    end,
    location: e.location,
    eventType: e.eventType,
    teamName: opts.teamName || e.teamName,
    childName: opts.childName,
    round: e.round,
    opponent: e.opponent,
    description: e.description,
    lastModified: lastModified || undefined,
    sequence: e.sequence || 0,
    url: opts.baseUrl ? `${opts.baseUrl}/events` : undefined,
  };
}

/**
 * Generates an ICS string from an array of CalendarEvents.
 * RFC 5545 compliant: stable UIDs, SEQUENCE, LAST-MODIFIED for update propagation.
 */
export function generateICSString(
  events: CalendarEvent[],
  calendarName: string = 'The Squad Schedule'
): string {
  const now = new Date();
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Squad//Tactical Coordination Hub//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${escapeICS(calendarName)}`),
    'X-WR-CALDESC:Auto-synced schedule from The Squad',
    'X-WR-TIMEZONE:America/New_York',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  events.forEach(event => {
    if (!event.start || isNaN(event.start.getTime())) return;

    const end = event.end && !isNaN(event.end.getTime())
      ? event.end
      : addHours(event.start, event.eventType === 'tournament' ? 24 : 1.5);

    const uid = stableUID(event);
    const dtstamp = fmtDateTimeUTC(now);
    const lastMod = event.lastModified
      ? fmtDateTimeUTC(event.lastModified)
      : dtstamp;
    const description = buildDescription(event);
    const summaryPrefix = event.childName ? `[${event.childName}] ` : '';
    const summary = `${summaryPrefix}${event.title}`;
    const seq = event.sequence ?? 0;

    lines.push(
      'BEGIN:VEVENT',
      fold(`UID:${uid}`),
      `DTSTAMP:${dtstamp}`,
      `LAST-MODIFIED:${lastMod}`,
      `SEQUENCE:${seq}`,
      `DTSTART:${fmtDateTime(event.start)}`,
      `DTEND:${fmtDateTime(end)}`,
      fold(`SUMMARY:${escapeICS(summary)}`),
      fold(`LOCATION:${escapeICS(event.location || '')}`),
      fold(`DESCRIPTION:${escapeICS(description)}`),
      ...(event.url ? [fold(`URL:${event.url}`)] : []),
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'END:VEVENT'
    );
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Generates and downloads an ICS file directly in the browser.
 */
export function downloadICS(
  events: CalendarEvent[],
  fileName: string = 'squad_schedule.ics',
  calendarName?: string
) {
  const icsString = generateICSString(events, calendarName);
  const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
