import { z } from "zod";
import { surfaceLabel } from "./venues";
import type { TournamentGame } from "@/components/providers/team-provider";
import { buildTopology } from "./topology";
import { resolveCompetition, type RankingApproval } from "./results";
import {
  validateAvailability,
  type ScheduleOptions,
  type ScheduledGame,
} from "./schedule";
import {
  CompetitionError,
  type CompetitionRules,
  type Result,
  type Source,
  type Topology,
} from "./types";
import type { SwissRecord, SwissPairing } from "./swiss";
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const source = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("team"), teamId: identifier }),
  z.object({ kind: z.literal("winner"), matchId: identifier }),
  z.object({ kind: z.literal("loser"), matchId: identifier }),
  z.object({
    kind: z.literal("rank"),
    group: z.string().min(1).max(100),
    rank: z.number().int().positive(),
  }),
]);
const series = z.union([
  z.literal(1),
  z.literal(3),
  z.literal(5),
  z.literal(7),
]);
export const competitionSetupSchema = z.object({
  title: z.string().trim().min(1).max(200),
  registrationFirst: z.boolean().optional(),
  teams: z
    .array(
      z.object({ id: identifier, name: z.string().trim().min(1).max(100) }),
    )
    .min(0)
    .max(64),
  rules: z.object({
    version: z.literal(2),
    format: z.enum([
      "single_elimination",
      "double_elimination",
      "round_robin",
      "double_round_robin",
      "pool_play",
      "pool_play_knockout",
      "pool_double_elimination",
      "tiered_playoffs",
      "consolation",
      "placement",
      "swiss",
      "best_of_series",
      "custom",
    ]),
    timezone: z.string().min(1).max(100),
    poolCount: z.number().int().min(2).max(32).optional(),
    advancePerPool: z.number().int().min(1).max(32).optional(),
    seriesLength: series.optional(),
    seriesByRound: z.record(series).optional(),
    customPools: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          teamIds: z.array(identifier).min(2).max(64),
          cycles: z.union([z.literal(1), z.literal(2)]),
        }),
      )
      .max(32)
      .optional(),
    tiers: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          size: z.number().int().min(2).max(64),
        }),
      )
      .max(32)
      .optional(),
    swissRounds: z.number().int().min(1).max(63).optional(),
    points: z
      .object({
        win: z.number().min(0).max(100),
        draw: z.number().min(0).max(100),
        loss: z.number().min(0).max(100),
      })
      .optional(),
    customMatches: z
      .array(
        z.object({
          id: identifier,
          stage: z.string().min(1).max(80),
          round: z.number().int().positive(),
          sources: z.tuple([source, source]),
          label: z.string().max(100).optional(),
          bestOf: series.optional(),
        }),
      )
      .max(200)
      .optional(),
  }),
  options: z.object({
    resources: z
      .array(
        z.object({
          id: z.string().min(1).max(200),
          name: z.string().min(1).max(100),
          venueId: z.string().max(200).optional(),
          venueName: z.string().trim().max(100).optional(),
          surfaceName: z.string().trim().max(100).optional(),
          address: z.string().trim().max(300).optional(),
          conflictsWith: z
            .array(z.string().min(1).max(200))
            .max(100)
            .optional(),
        }),
      )
      .min(1)
      .max(64),
    windows: z
      .array(
        z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          startTime: z.string(),
          endTime: z.string(),
        }),
      )
      .min(1)
      .max(90),
    duration: z.number().int().min(1).max(720),
    travel: z.number().int().min(0).max(720).optional(),
    rest: z.number().int().min(0).max(720),
    turnaround: z.number().int().min(0).max(720),
    maxGamesPerDay: z.number().int().min(1).max(100),
  }),
});
export type CompetitionSetup = z.infer<typeof competitionSetupSchema>;
export type CompetitionDocument = {
  officialAssignments?: Record<string, {refereeId: string; refereeName: string}>;
  version: 2;
  phase?: "registration" | "competition";
  finalsCreated?: boolean;
  revision: number;
  title: string;
  topology: Topology;
  options: ScheduleOptions;
  schedule: ScheduledGame[];
  results: Result[];
  approvals: RankingApproval;
  status: "draft" | "published";
  updatedAt: string;
  layout?: Record<string, { x: number; y: number }>;
  swissRecords?: SwissRecord[];
  swissPreview?: SwissPairing[];
  swissRound?: number;
};
export function createCompetition(raw: unknown): CompetitionDocument {
  const setup = competitionSetupSchema.parse(raw);
  if(new Set(setup.teams.map(team=>team.id)).size!==setup.teams.length)throw new CompetitionError("DUPLICATE_TEAM", "Each team must have a unique identity.");
  if (
    new Set(setup.teams.map((t) => t.name.trim().toLowerCase())).size !==
    setup.teams.length
  )
    throw new CompetitionError(
      "DUPLICATE_NAME",
      "Each team needs a distinct display name.",
    );
  if (
    new Set(setup.options.resources.map((r) => r.name.trim().toLowerCase()))
      .size !== setup.options.resources.length
  )
    throw new CompetitionError(
      "DUPLICATE_NAME",
      "Each playing surface needs a distinct display name.",
    );
  setup.options.windows.sort((a, b) => a.date.localeCompare(b.date));
  const topology: Topology = setup.registrationFirst
    ? { version: 2, teams: setup.teams, rules: setup.rules as CompetitionRules, matches: [], groups: {} }
    : buildTopology(setup.teams, setup.rules as CompetitionRules);
  validateAvailability(topology, setup.options);
  return {
    version: 2,
    phase: setup.registrationFirst ? "registration" : "competition",
    revision: 0,
    title: setup.title,
    topology,
    options: setup.options,
    schedule: [],
    results: [],
    approvals: {},
    status: "draft",
    updatedAt: new Date().toISOString(),
    ...(setup.rules.format === "swiss"
      ? { swissRecords: [], swissRound: 1 }
      : {}),
  };
}
export function sourceLabel(source: Source, topology: Topology): string {
  if (source.kind === "team")
    return (
      topology.teams.find((t) => t.id === source.teamId)?.name || "Unknown team"
    );
  if (source.kind === "rank") return `${source.group} · Seed ${source.rank}`;
  return `${source.kind === "winner" ? "Winner" : "Loser"} of Match ${topology.matches.findIndex((m) => m.id === source.matchId) + 1}`;
}
export function tournamentGames(
  document: CompetitionDocument,
): TournamentGame[] {
  const { states } = resolveCompetition(
    document.topology,
    document.results,
    document.approvals,
  );
  return document.schedule.map((slot) => {
    const match = document.topology.matches.find((m) => m.id === slot.matchId)!;
    const state = states.get(match.id)!;
    const score = document.results.find(
      (r) => r.matchId === match.id && r.game === slot.game,
    );
    const name = (i: 0 | 1) =>
      document.topology.teams.find((t) => t.id === state.teamIds[i])?.name ||
      sourceLabel(match.sources[i], document.topology);
    const wonAt = document.results.filter((r) => r.matchId === match.id).length;
    return {
      id: slot.id,
      team1: name(0),
      team2: name(1),
      team1Id: state.teamIds[0] || "tbd",
      team2Id: state.teamIds[1] || "tbd",
      score1: score?.score1 || 0,
      score2: score?.score2 || 0,
      isCompleted: !!score,
      winnerId: score ? (score.winner === 1 || (!score.winner && score.score1 > score.score2) ? state.teamIds[0] : score.winner === 2 || score.score2 > score.score1 ? state.teamIds[1] : null) : null,
      updatedAt: document.updatedAt,
      date: slot.date,
      time: slot.time,
      resourceId: slot.resourceId,
      location: surfaceLabel(
        document.options.resources.find((r) => r.id === slot.resourceId)!,
      ),
      round: `${!match.pool && match.round === Math.max(...document.topology.matches.filter(m => m.stage === match.stage).map(m => m.round)) && document.topology.matches.filter(m => m.stage === match.stage && m.round === match.round).length === 1 ? `${match.stage} · Final` : match.label}${match.bestOf > 1 ? ` · Game ${slot.game}` : ""}`,
      stage: match.stage,
      isNotRequired: (!score && state.complete) || !!(match.resetOf && state.inactive && states.get(match.resetOf)?.complete),
      isConditional:
        state.inactive || (!score && state.complete && slot.game > wonAt),
      scheduledStartMs: slot.start,
      gameDurationMinutes: document.options.duration,
    };
  });
}
export function activeReservations(
  document: CompetitionDocument,
): ScheduledGame[] {
  const { states } = resolveCompetition(
    document.topology,
    document.results,
    document.approvals,
  );
  return document.schedule.filter((slot) => {
    const state = states.get(slot.matchId)!;
    const match = document.topology.matches.find((m) => m.id === slot.matchId)!;
    if (match.resetOf) {
      const final = states.get(match.resetOf)!;
      if (final.complete && state.inactive) return false;
    }
    return (
      !state.complete ||
      document.results.some(
        (r) => r.matchId === slot.matchId && r.game === slot.game,
      )
    );
  });
}
