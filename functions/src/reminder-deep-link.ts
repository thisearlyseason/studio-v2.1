export type ReminderDeepLinkEntry = {
  teamId: string;
  eventId: string;
};

/** Builds an encoded, tenant-scoped route for a scheduled event reminder. */
export function buildReminderDeepLink(entry: ReminderDeepLinkEntry): string {
  const params = new URLSearchParams({
    teamId: entry.teamId,
    eventId: entry.eventId,
  });
  return `/calendar?${params.toString()}`;
}
