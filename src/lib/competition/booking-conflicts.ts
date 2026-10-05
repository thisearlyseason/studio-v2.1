import { zonedInstant } from "./schedule";
export type SharedBooking = {
  date: unknown;
  startMinute: unknown;
  endMinute: unknown;
  resourceId?: unknown;
  teamIds?: unknown;
  startMs?: unknown;
  endMs?: unknown;
  timezone?: unknown;
  restMinutes?: unknown;
  venueKey?: unknown;
  travelMinutes?: unknown;
  turnaroundMinutes?: unknown;
  conflictingResourceIds?: unknown;
};
/** Shared by legacy leagues, legacy tournaments and the versioned tournament workspace. */
export function sharedBookingConflicts(
  a: SharedBooking,
  b: SharedBooking,
): { team: boolean; resource: boolean } {
  const teamsA = Array.isArray(a.teamIds) ? a.teamIds : [],
    teamsB = Array.isArray(b.teamIds) ? b.teamIds : [];
  const sameTeam = teamsA.some((id) => teamsB.includes(id));
  const sameResource =
    !!a.resourceId &&
    (a.resourceId === b.resourceId ||
      (Array.isArray(a.conflictingResourceIds) &&
        a.conflictingResourceIds.includes(b.resourceId)) ||
      (Array.isArray(b.conflictingResourceIds) &&
        b.conflictingResourceIds.includes(a.resourceId)));
  if (!sameTeam && !sameResource) return { team: false, resource: false };
  const timezone = String(a.timezone || b.timezone || "");
  function interval(value: SharedBooking): [number, number] {
    if (Number.isFinite(value.startMs) && Number.isFinite(value.endMs))
      return [Number(value.startMs), Number(value.endMs)];
    const start = Number(value.startMinute),
      end = Number(value.endMinute);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      throw new Error("Invalid existing booking interval.");
    // Legacy wall-clock bookings inherit the shared competition/venue timezone.
    const base = timezone
      ? zonedInstant(
          String(value.date),
          start,
          String(value.timezone || timezone),
        )
      : Date.parse(`${String(value.date)}T00:00:00Z`) + start * 60000;
    return [base, base + (end - start) * 60000];
  }
  const venue = (value: SharedBooking) =>
    typeof value.venueKey === "string"
      ? value.venueKey
      : typeof value.resourceId === "string" && value.resourceId.includes(":")
        ? value.resourceId.split(":")[0]
        : null;
  const changingVenues = !!venue(a) && !!venue(b) && venue(a) !== venue(b);
  const left = interval(a),
    right = interval(b);
  const overlaps = (gap: number) =>
    left[0] < right[1] + gap * 60000 && right[0] < left[1] + gap * 60000;
  return {
    team:
      sameTeam &&
      overlaps(
        Math.max(
          Number(a.restMinutes) || 0,
          Number(b.restMinutes) || 0,
          changingVenues
            ? Math.max(
                Number(a.travelMinutes) || 0,
                Number(b.travelMinutes) || 0,
              )
            : 0,
        ),
      ),
    resource:
      sameResource &&
      overlaps(
        Math.max(
          Number(a.turnaroundMinutes) || 0,
          Number(b.turnaroundMinutes) || 0,
        ),
      ),
  };
}
export function adjacentBookingDates(dates: string[]): string[] {
  return [
    ...new Set(
      dates.flatMap((date) =>
        [-1, 0, 1].map((delta) =>
          new Date(Date.parse(`${date}T12:00:00Z`) + delta * 86400000)
            .toISOString()
            .slice(0, 10),
        ),
      ),
    ),
  ];
}
