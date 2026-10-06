import type { CompetitionDocument } from "./document";
import { resolveCompetition, type Standing } from "./results";
import { buildTopology } from "./topology";
import { CompetitionError, type Topology } from "./types";
import {
  scheduleCompetition,
  validateCompetitionSchedule,
  type Booking,
  type Window,
} from "./schedule";
export function compareStandings(a: Standing, b: Standing) {
  return (
    b.points - a.points ||
    b.won - a.won ||
    a.lost - b.lost ||
    b.drawn - a.drawn ||
    b.for - b.against - (a.for - a.against) ||
    b.for - a.for ||
    a.against - b.against
  );
}
export function playoffSeeds(doc: CompetitionDocument, qualifiers: number | "all") {
  if (
    doc.topology.rules.format === "swiss" &&
    (doc.swissRound || 1) <
      (doc.topology.rules.swissRounds ||
        Math.ceil(Math.log2(doc.topology.teams.length)))
  )
    throw new CompetitionError(
      "SWISS_INCOMPLETE",
      "Complete every Swiss round before creating playoffs.",
    );
  const { standings, states } = resolveCompetition(
    doc.topology,
    doc.results,
    doc.approvals,
  );
  const groups = Object.entries(standings).filter(
    ([group]) => !group.startsWith("Swiss Round "),
  );
  if (!groups.length)
    throw new CompetitionError(
      "NO_STANDINGS",
      "This tournament has no preliminary standings.",
    );
  const prelim = doc.topology.matches.filter((match) => !!match.pool);
  if (!prelim.length || prelim.some((match) => !states.get(match.id)?.complete))
    throw new CompetitionError(
      "POOL_INCOMPLETE",
      "Finish every preliminary game before creating playoffs.",
    );
  if (
    qualifiers !== "all" && (!Number.isInteger(qualifiers) ||
    qualifiers < 1 ||
    groups.some(([, rows]) => qualifiers > rows.length))
  )
    throw new CompetitionError(
      "QUALIFIERS",
      "Choose a qualifier count that fits every pool.",
    );
  return groups
    .flatMap(([, rows]) => qualifiers === "all" ? rows : rows.slice(0, qualifiers))
    .sort(compareStandings);
}
export function createPlayoffs(
  current: CompetitionDocument,
  payload: Record<string, unknown>,
  bookings: Booking[],
) {
  if (current.status !== "published" || current.finalsCreated)
    throw new CompetitionError(
      "PLAYOFFS_LOCKED",
      "Playoffs can be created once, after preliminary play is published and completed.",
    );
  if (
    current.results.some(
      (result) =>
        !current.topology.matches.find((match) => match.id === result.matchId)
          ?.pool,
    )
  )
    throw new CompetitionError(
      "PLAYOFFS_STARTED",
      "Existing playoff results lock the playoff structure.",
    );
  const qualifiers = payload.qualifiers === "all" ? "all" : Number(payload.qualifiers),
    count = Number(payload.brackets),
    rows = playoffSeeds(current, qualifiers);
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 3 ||
    rows.length < count * 2
  )
    throw new CompetitionError(
      "BRACKET_COUNT",
      "Each playoff bracket needs at least two qualifying teams.",
    );
  const confirmed = payload.confirmedTeamIds;
  if (
    !Array.isArray(confirmed) ||
    JSON.stringify(confirmed) !== JSON.stringify(rows.map((row) => row.teamId))
  )
    throw new CompetitionError(
      "CONFIRM_SEEDS",
      "Review and confirm the current playoff seed order.",
    );
  const doc = structuredClone(current),
    prelimIds = new Set(
      doc.topology.matches
        .filter((match) => !!match.pool)
        .map((match) => match.id),
    );
  doc.topology.matches = doc.topology.matches.filter((match) =>
    prelimIds.has(match.id),
  );
  doc.schedule = doc.schedule.filter((slot) => prelimIds.has(slot.matchId));
  const finals: Topology = {
    version: 2,
    teams: doc.topology.teams,
    rules: doc.topology.rules,
    groups: {},
    matches: [],
    placements: {},
  };
  let offset = 0;
  for (let i = 0; i < count; i++) {
    const size =
        Math.floor(rows.length / count) + (i < rows.length % count ? 1 : 0),
      tier = count === 1 ? "Championship" : ["Gold", "Silver", "Bronze"][i];
    const teams = rows
      .slice(offset, offset + size)
      .map((row) => doc.topology.teams.find((team) => team.id === row.teamId)!);
    offset += size;
    const bracket = buildTopology(teams, {
      version: 2,
      format:
        doc.topology.rules.format === "pool_double_elimination"
          ? "double_elimination"
          : "single_elimination",
      timezone: doc.topology.rules.timezone,
      seriesLength: doc.topology.rules.seriesLength || 1,
    });
    const prefix = `finals_${i}_`;
    const final = bracket.matches.at(-1)!;
    finals.placements![offset - size + 1] = {
      kind: "winner",
      matchId: prefix + final.id,
    };
    finals.placements![offset - size + 2] = {
      kind: "loser",
      matchId: prefix + final.id,
    };
    for (const [rank, source] of Object.entries(bracket.placements || {}))
      finals.placements![Number(rank) + offset - size] =
        source.kind === "winner" || source.kind === "loser"
          ? { ...source, matchId: prefix + source.matchId }
          : source;
    finals.matches.push(
      ...bracket.matches.map((match) => ({
        ...match,
        id: prefix + match.id,
        stage: match.stage === "Championship" ? tier : `${tier} · ${match.stage}`,
        label: `${tier} · ${match.label}`,
        sources: match.sources.map((source) =>
          source.kind === "winner" || source.kind === "loser"
            ? { ...source, matchId: prefix + source.matchId }
            : source,
        ) as typeof match.sources,
        ...(match.resetOf ? { resetOf: prefix + match.resetOf } : {}),
        ...(match.dependsOn
          ? { dependsOn: match.dependsOn.map((id) => prefix + id) }
          : {}),
      })),
    );
  }
  const window = payload.window as Window;
  if (
    !window ||
    typeof window.date !== "string" ||
    typeof window.startTime !== "string" ||
    typeof window.endTime !== "string"
  )
    throw new CompetitionError(
      "PLAYOFF_TIME",
      "Choose the playoff date and available hours.",
    );
  const scheduled = scheduleCompetition(finals, {
    ...doc.options,
    windows: [window],
    bookings: [
      ...bookings,
      ...doc.schedule.map((slot) => ({
        id: slot.id,
        resourceId: slot.resourceId,
        teamIds: doc.topology.teams.map((team) => team.id),
        start: slot.start,
        end: slot.end,
        rest: doc.options.rest,
        turnaround: doc.options.turnaround,
        travel: doc.options.travel || 0,
      })),
    ],
  });
  const latestPreliminary = Math.max(...doc.schedule.map((slot) => slot.end));
  if (
    scheduled.some(
      (slot) => slot.start < latestPreliminary + doc.options.rest * 60000,
    )
  )
    throw new CompetitionError(
      "PLAYOFF_TIME",
      "Playoffs must start after the last preliminary game and required rest.",
    );
  const existing = doc.options.windows.find((row) => row.date === window.date);
  doc.options.windows = [
    ...doc.options.windows.filter((row) => row.date !== window.date),
    existing
      ? {
          date: window.date,
          startTime:
            existing.startTime < window.startTime
              ? existing.startTime
              : window.startTime,
          endTime:
            existing.endTime > window.endTime
              ? existing.endTime
              : window.endTime,
        }
      : window,
  ].sort((a, b) => a.date.localeCompare(b.date));
  doc.topology.matches.push(...finals.matches);
  doc.schedule.push(...scheduled);
  doc.finalsCreated = true;
  doc.topology.placements = finals.placements;
  const conflicts = validateCompetitionSchedule(doc.topology, doc.schedule, {
    ...doc.options,
    bookings,
  });
  if (conflicts.length)
    throw new CompetitionError(
      "PLAYOFF_CONFLICT",
      "Playoffs do not fit these dates, courts and rest limits. Choose more available time.",
      conflicts,
    );
  return doc;
}
