
/**
 * @fileOverview Utilities for generating calendar export links and ICS files.
 */

import { format, addHours } from 'date-fns';

export interface CalendarEvent {
  title: string;
  start: Date;
  end?: Date;
  location?: string;
  description?: string;
}

/**
 * Generates a Google Calendar link for a specific single event.
 * Note: Google URLs do not officially support multiple events in a single template.
 */
export function generateGoogleCalendarLink(event: CalendarEvent): string {
  // Use local time format without 'Z' for Google Template URLs to avoid offset shifts
  const startStr = format(event.start, "yyyyMMdd'T'HHmmss");
  const end = event.end || addHours(event.start, 1);
  const endStr = format(end, "yyyyMMdd'T'HHmmss");
  
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${startStr}/${endStr}`,
    details: event.description || '',
    location: event.location || '',
  });

  return `https://www.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generates and downloads an ICS file for one or more events.
 * Follows RFC 5545 specifications for maximum compatibility with Outlook, Google, and Apple.
 * Uses "Floating Time" (local time without Z) which is standard for local sports schedules.
 */
export function downloadICS(events: CalendarEvent[], fileName: string = 'squad_schedule.ics') {
  const escapeText = (str: string = '') => str.replace(/[,;]/g, '\\$&').replace(/\n/g, '\\n');
  const formatDate = (date: Date) => format(date, "yyyyMMdd'T'HHmmss");

  let icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Squad//Tactical Coordination Hub//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Squad Schedule'
  ];

  events.forEach(event => {
    // Basic validation to prevent crashing on invalid dates
    if (isNaN(event.start.getTime())) return;

    const startStr = formatDate(event.start);
    const end = event.end || addHours(event.start, 1);
    const endStr = formatDate(end);
    
    icsLines.push(
      'BEGIN:VEVENT',
      `UID:${Date.now()}-${Math.random().toString(36).substring(7)}@thesquad.pro`,
      `DTSTAMP:${formatDate(new Date())}Z`, // DTSTAMP is always UTC
      `DTSTART:${startStr}`, // Floating time (Local)
      `DTEND:${endStr}`,     // Floating time (Local)
      `SUMMARY:${escapeText(event.title)}`,
      `LOCATION:${escapeText(event.location)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'TRANSP:OPAQUE',
      'END:VEVENT'
    );
  });

  icsLines.push('END:VCALENDAR');

  const icsString = icsLines.join('\r\n');
  const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
  
  // Standard download handler
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
