import { venueKey } from "./venues";
import { CompetitionError, type Conflict, type Topology } from "./types";
import {
  canShareTeam,
  maximumAppearances,
  reachability,
  type Reachability,
} from "./reachability";
export type Resource = {
  id: string;
  name: string;
  conflictsWith?: string[];
  venueId?: string;
  venueName?: string;
  surfaceName?: string;
  address?: string;
};
export type Window = { date: string; startTime: string; endTime: string };
export type Booking = {
  id: string;
  resourceId: string;
  start: number;
  end: number;
  teamIds: string[];
  rest?: number;
  venueKey?: string;
  travel?: number;
  turnaround?: number;
  conflictsWith?: string[];
};
export type ScheduledGame = {
  id: string;
  matchId: string;
  game: number;
  resourceId: string;
  date: string;
  time: string;
  start: number;
  end: number;
};
export type ScheduleOptions = {
  resources: Resource[];
  windows: Window[];
  duration: number;
  rest: number;
  travel?: number;
  turnaround: number;
  maxGamesPerDay: number;
  bookings?: Booking[];
  searchLimit?: number;
};
export function minutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(value.trim());
  if (!match)
    throw new CompetitionError("INVALID_TIME", `Invalid time: ${value}.`);
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23))
    throw new CompetitionError("INVALID_TIME", `Invalid time: ${value}.`);
  if (match[3]) hour = (hour % 12) + (match[3].toUpperCase() === "PM" ? 12 : 0);
  return hour * 60 + minute;
}
const clock = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
/** Explicit timezone conversion; rejects missing or ambiguous DST wall times. */
export function zonedInstant(
  date: string,
  minute: number,
  timezone: string,
): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new CompetitionError("INVALID_DATE", "Use a valid calendar date.");
  const [y, m, d] = date.split("-").map(Number);
  const midnight = Date.UTC(y, m - 1, d);
  if (new Date(midnight).toISOString().slice(0, 10) !== date)
    throw new CompetitionError("INVALID_DATE", "Invalid calendar date.");
  const target = midnight + minute * 60_000;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const wall = (instant: number) => {
    const p = Object.fromEntries(
      formatter.formatToParts(instant).map((p) => [p.type, p.value]),
    );
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  };
  const offsets = new Set(
    [-36, -12, 0, 12, 36].map((h) => {
      const t = target + h * 3600000;
      return wall(t) - t;
    }),
  );
  const candidates = [...offsets]
    .map((offset) => target - offset)
    .filter((t) => wall(t) === target);
  if (candidates.length !== 1)
    throw new CompetitionError(
      "DST_TIME",
      `${date} ${clock(minute)} is ${candidates.length ? "ambiguous" : "unavailable"} in ${timezone}. Choose another time.`,
    );
  return candidates[0];
}
function resourcesOverlap(a: string, b: string, resources: Resource[]) {
  return (
    a === b ||
    resources.find((r) => r.id === a)?.conflictsWith?.includes(b) ||
    resources.find((r) => r.id === b)?.conflictsWith?.includes(a)
  );
}
function overlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
  gap = 0,
) {
  return a.start < b.end + gap * 60000 && b.start < a.end + gap * 60000;
}
function dependencies(topology: Topology, id: string): string[] {
  const match = topology.matches.find((m) => m.id === id)!;
  const ids = new Set<string>(match.dependsOn || []);
  match.sources.forEach((source) => {
    if (source.kind === "winner" || source.kind === "loser")
      ids.add(source.matchId);
    if (source.kind === "rank")
      topology.matches
        .filter((m) => m.pool === source.group)
        .forEach((m) => ids.add(m.id));
  });
  return [...ids];
}
function validateOptions(options: ScheduleOptions) {
  if (
    !options.resources.length ||
    new Set(options.resources.map((r) => r.id)).size !==
      options.resources.length
  )
    throw new CompetitionError(
      "INVALID_RESOURCES",
      "Choose distinct playing surfaces.",
    );
  if (
    !options.windows.length ||
    new Set(options.windows.map((w) => w.date)).size !== options.windows.length
  )
    throw new CompetitionError(
      "INVALID_WINDOWS",
      "Provide one availability window per date.",
    );
  if (
    (options.travel !== undefined &&
      (!Number.isInteger(options.travel) ||
        options.travel < 0 ||
        options.travel > 720)) ||
    !Number.isInteger(options.duration) ||
    options.duration < 1 ||
    options.duration > 720 ||
    !Number.isInteger(options.rest) ||
    options.rest < 0 ||
    !Number.isInteger(options.turnaround) ||
    options.turnaround < 0 ||
    !Number.isInteger(options.maxGamesPerDay) ||
    options.maxGamesPerDay < 1
  )
    throw new CompetitionError(
      "INVALID_LIMITS",
      "Use valid whole-minute durations and positive daily game limits.",
    );
}
export function validateAvailability(
  topology: Topology,
  options: ScheduleOptions,
): void {
  validateOptions(options);
  if (
    options.travel &&
    options.resources.some((r) => venueKey(r) === "unspecified")
  )
    throw new CompetitionError(
      "VENUE_REQUIRED",
      "Assign a venue to every surface before enabling the venue-change gap.",
    );
  for (const window of options.windows) {
    const start = zonedInstant(
        window.date,
        minutes(window.startTime),
        topology.rules.timezone,
      ),
      end = zonedInstant(
        window.date,
        minutes(window.endTime),
        topology.rules.timezone,
      );
    if (end <= start)
      throw new CompetitionError(
        "INVALID_WINDOW",
        "Daily availability must end after it starts. Split overnight availability across dates.",
      );
  }
}
function allSlots(topology: Topology, options: ScheduleOptions) {
  return options.windows
    .flatMap((window) => {
      const start = minutes(window.startTime),
        end = minutes(window.endTime);
      if (end <= start)
        throw new CompetitionError(
          "INVALID_WINDOW",
          "Daily availability must end after it starts. Split overnight availability across dates.",
        );
      const slots: Omit<ScheduledGame, "id" | "matchId" | "game">[] = [];
      for (
        let time = start;
        time + options.duration <= end;
        time += options.duration + options.turnaround
      ) {
        const instant = zonedInstant(
          window.date,
          time,
          topology.rules.timezone,
        );
        for (const resource of options.resources)
          slots.push({
            resourceId: resource.id,
            date: window.date,
            time: clock(time),
            start: instant,
            end: instant + options.duration * 60000,
          });
      }
      return slots;
    })
    .sort(
      (a, b) => a.start - b.start || a.resourceId.localeCompare(b.resourceId),
    );
}
function bookingReach(booking: Booking): Reachability {
  return new Map(booking.teamIds.map((id) => [id, [{}]]));
}
function conflictsFor(
  game: ScheduledGame,
  games: ScheduledGame[],
  topology: Topology,
  options: ScheduleOptions,
  paths: ReturnType<typeof reachability>,
): Conflict[] {
  const conflicts: Conflict[] = [];
  const path = paths.get(game.matchId)!;
  for (const other of games) {
    if (game.id === other.id) continue;
    if (
      resourcesOverlap(game.resourceId, other.resourceId, options.resources) &&
      overlap(game, other, options.turnaround)
    )
      conflicts.push({
        code: "FIELD_CONFLICT",
        message: "A playing surface is already occupied.",
        matchIds: [game.id, other.id],
        resourceId: game.resourceId,
      });
    const shared = canShareTeam(path, paths.get(other.matchId)!);
    if (
      shared &&
      overlap(
        game,
        other,
        Math.max(
          options.rest,
          venueKey(options.resources.find((r) => r.id === game.resourceId)!) !==
            venueKey(options.resources.find((r) => r.id === other.resourceId)!)
            ? options.travel || 0
            : 0,
        ),
      )
    )
      conflicts.push({
        code: "TEAM_CONFLICT",
        message: "A possible participant is playing or resting.",
        matchIds: [game.id, other.id],
        teamId: shared,
      });
  }
  for (const booking of options.bookings || []) {
    if (
      (resourcesOverlap(
        game.resourceId,
        booking.resourceId,
        options.resources,
      ) ||
        booking.conflictsWith?.includes(game.resourceId)) &&
      overlap(
        game,
        booking,
        Math.max(options.turnaround, booking.turnaround || 0),
      )
    )
      conflicts.push({
        code: "EXTERNAL_FIELD_CONFLICT",
        message: "This surface has an existing booking.",
        matchIds: [game.id, booking.id],
        resourceId: game.resourceId,
      });
    const shared = canShareTeam(path, bookingReach(booking));
    if (
      shared &&
      overlap(
        game,
        booking,
        Math.max(
          options.rest,
          booking.rest || 0,
          booking.venueKey &&
            booking.venueKey !==
              venueKey(options.resources.find((r) => r.id === game.resourceId)!)
            ? Math.max(options.travel || 0, booking.travel || 0)
            : 0,
        ),
      )
    )
      conflicts.push({
        code: "EXTERNAL_TEAM_CONFLICT",
        message: "This team has another booking or required rest.",
        matchIds: [game.id, booking.id],
        teamId: shared,
      });
  }
  const sameDay = [
    ...games.filter((g) => g.id !== game.id && g.date === game.date),
    game,
  ];
  for (const id of path.keys()) {
    const appearances = sameDay
      .map((g) => paths.get(g.matchId)!.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p);
    if (
      appearances.length > options.maxGamesPerDay &&
      maximumAppearances(appearances, options.maxGamesPerDay) >
        options.maxGamesPerDay
    )
      conflicts.push({
        code: "DAILY_LIMIT",
        message: "A possible participant exceeds the daily game limit.",
        matchIds: [game.id],
        teamId: id,
      });
  }
  return conflicts;
}
export function validateCompetitionSchedule(
  topology: Topology,
  games: ScheduledGame[],
  options: ScheduleOptions,
): Conflict[] {
  validateOptions(options);
  const conflicts: Conflict[] = [];
  const paths = reachability(topology);
  const seen = new Set<string>();
  for (const match of topology.matches)
    for (let game = 1; game <= match.bestOf; game++)
      if (!games.some((g) => g.matchId === match.id && g.game === game))
        conflicts.push({
          code: "MISSING_GAME",
          message: `Missing game ${game} of ${match.id}.`,
          matchIds: [match.id],
        });
  for (const game of games) {
    const match = topology.matches.find((m) => m.id === game.matchId);
    if (
      !match ||
      !Number.isInteger(game.game) ||
      game.game < 1 ||
      game.game > match.bestOf ||
      seen.has(`${game.matchId}:${game.game}`) ||
      games.filter((g) => g.id === game.id).length !== 1
    ) {
      conflicts.push({
        code: "INVALID_GAME",
        message: "Unknown or duplicate scheduled game.",
        matchIds: [game.id],
      });
      continue;
    }
    seen.add(`${game.matchId}:${game.game}`);
    const window = options.windows.find((w) => w.date === game.date);
    if (
      !window ||
      !options.resources.some((r) => r.id === game.resourceId) ||
      game.start !==
        zonedInstant(game.date, minutes(game.time), topology.rules.timezone) ||
      game.end !== game.start + options.duration * 60000 ||
      game.start <
        zonedInstant(
          window.date,
          minutes(window.startTime),
          topology.rules.timezone,
        ) ||
      game.end >
        zonedInstant(
          window.date,
          minutes(window.endTime),
          topology.rules.timezone,
        )
    )
      conflicts.push({
        code: "OUTSIDE_AVAILABILITY",
        message: "The match does not fit its configured availability.",
        matchIds: [game.id],
      });
    const feeders = dependencies(topology, game.matchId);
    const prior = games.filter(
      (g) =>
        feeders.includes(g.matchId) ||
        (g.matchId === game.matchId && g.game < game.game),
    );
    if (prior.some((g) => game.start < g.end + options.rest * 60000))
      conflicts.push({
        code: "DEPENDENCY_TIME",
        message:
          "A match starts before its prerequisite and rest are complete.",
        matchIds: [game.id],
      });
    conflicts.push(
      ...conflictsFor(
        game,
        games.filter((g) => paths.has(g.matchId)),
        topology,
        options,
        paths,
      ),
    );
  }
  return conflicts;
}
export function scheduleCompetition(
  topology: Topology,
  options: ScheduleOptions,
): ScheduledGame[] {
  validateOptions(options);
  const slots = allSlots(topology, options);
  const paths = reachability(topology);
  const ordered: typeof topology.matches = [],
    seen = new Set<string>();
  function visit(id: string) {
    if (seen.has(id)) return;
    seen.add(id);
    dependencies(topology, id).forEach(visit);
    ordered.push(topology.matches.find((m) => m.id === id)!);
  }
  topology.matches.forEach((m) => visit(m.id));
  const tasks = ordered.flatMap((m) =>
    Array.from({ length: m.bestOf }, (_, i) => ({
      id: `${m.id}_g${i + 1}`,
      matchId: m.id,
      game: i + 1,
    })),
  );
  if (tasks.length > slots.length)
    throw new CompetitionError(
      "INSUFFICIENT_CAPACITY",
      `${tasks.length} games require more than the ${slots.length} available field/time slots.`,
    );
  const maximumPerTeam = options.windows.reduce(
    (sum, w) =>
      sum +
      Math.min(
        options.maxGamesPerDay,
        Math.floor(
          (minutes(w.endTime) - minutes(w.startTime) + options.rest) /
            (options.duration + options.rest),
        ),
      ),
    0,
  );
  for (const team of topology.teams) {
    const appearances = tasks
      .map((task) => paths.get(task.matchId)!.get(team.id))
      .filter((value): value is NonNullable<typeof value> => !!value);
    if (maximumAppearances(appearances, maximumPerTeam) > maximumPerTeam)
      throw new CompetitionError(
        "INSUFFICIENT_CAPACITY",
        `${team.name} could require more than ${maximumPerTeam} games allowed by the selected days, rest, and daily limit. Add days or revise the limit.`,
      );
  }
  let attempts = 0;
  const games: ScheduledGame[] = [];
  function assign(index: number): boolean {
    if (index === tasks.length) return true;
    const task = tasks[index],
      feeders = dependencies(topology, task.matchId);
    const earliest = Math.max(
      0,
      ...games
        .filter(
          (g) => feeders.includes(g.matchId) || g.matchId === task.matchId,
        )
        .map((g) => g.end + options.rest * 60000),
    );
    for (const slot of slots) {
      if (slot.start < earliest) continue;
      if (++attempts > (options.searchLimit ?? 200_000))
        throw new CompetitionError(
          "SEARCH_LIMIT",
          "No valid schedule was found within the search limit. Add availability or adjust constraints; no games were published.",
        );
      const game = { ...task, ...slot };
      if (conflictsFor(game, games, topology, options, paths).length) continue;
      games.push(game);
      if (assign(index + 1)) return true;
      games.pop();
    }
    return false;
  }
  if (!assign(0))
    throw new CompetitionError(
      "INSUFFICIENT_CAPACITY",
      "No complete schedule fits these fields, times, rest periods, and daily limits.",
    );
  const conflicts = validateCompetitionSchedule(topology, games, options);
  if (conflicts.length)
    throw new CompetitionError(
      "INVALID_SCHEDULE",
      "Schedule validation failed.",
      conflicts,
    );
  return games;
}

export function validateActiveReservations(
  topology: Topology,
  games: ScheduledGame[],
  options: ScheduleOptions,
): Conflict[] {
  const paths = reachability(topology);
  return games.flatMap((game) =>
    conflictsFor(game, games, topology, options, paths),
  );
}
