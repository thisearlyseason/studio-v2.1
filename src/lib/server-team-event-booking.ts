export type TeamEventInterval = {
  date: string;
  startMinute: number;
  endMinute: number;
};

export function buildTeamEventBooking({
  bookingId,
  teamId,
  eventId,
  event,
  interval,
  now,
}: {
  bookingId: string;
  teamId: string;
  eventId: string;
  event: Record<string, unknown>;
  interval: TeamEventInterval;
  now: string;
}): Record<string, unknown> {
  return {
    id: bookingId,
    sourceType: 'team-event',
    sourceId: `team-event:${teamId}:${eventId}`,
    sourceGameId: eventId,
    hostTeamId: teamId,
    teamIds: [teamId],
    resourceId: typeof event.resourceId === 'string' ? event.resourceId.trim() : '',
    location: typeof event.location === 'string' ? event.location.trim() : '',
    date: interval.date,
    startMinute: interval.startMinute,
    endMinute: interval.endMinute,
    updatedAt: now,
  };
}
