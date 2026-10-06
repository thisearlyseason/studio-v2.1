import { createCompetition } from "./document";
import { mutateCompetition } from "./mutations";
import { resolveCompetition } from "./results";
import { COMPETITION_FORMATS, type CompetitionFormat } from "./types";

/** Fictional fixtures run through exactly the same generation/scoring code as real events. */
export function createDemoCompetition(
  format: CompetitionFormat = "pool_play_knockout",
  options: {
    namespace?: string;
    teamName?: string;
    hostTeamId?: string;
    count?: number;
    now?: Date;
  } = {},
) {
  const namespace = options.namespace || "preview",
    count = format === "best_of_series" ? 2 : options.count || 8;
  const names = [
    options.teamName || "Falcons",
    "Wolves",
    "Ravens",
    "Hawks",
    "Thunder",
    "Lions",
    "Eagles",
    "Bears",
  ];
  const teams = Array.from({ length: count }, (_, i) => ({
    id:
      i === 0 && options.hostTeamId
        ? options.hostTeamId
        : `${namespace}_entrant_${i + 1}`,
    name: names[i] || `Team ${i + 1}`,
  }));
  const date = new Date(options.now || new Date());
  date.setUTCDate(date.getUTCDate() + 14);
  let doc = createCompetition({
    title: `Demo · ${COMPETITION_FORMATS.find(([id]) => id === format)![1]}`,
    teams,
    rules: {
      version: 2,
      format,
      timezone: "America/Edmonton",
      poolCount: 2,
      advancePerPool: 2,
      seriesLength: format === "best_of_series" ? 3 : 1,
      swissRounds: 3,
      tiers:
        count === 8
          ? [
              { name: "Gold", size: 4 },
              { name: "Silver", size: 2 },
              { name: "Bronze", size: 2 },
            ]
          : [
              { name: "Gold", size: 2 },
              { name: "Silver", size: 2 },
            ],
      customPools: [
        {
          name: "Qualifying group",
          teamIds: teams.map((t) => t.id),
          cycles: 1,
        },
      ],
      customMatches: [
        {
          id: "custom_final",
          stage: "Championship",
          round: 1,
          sources: [
            { kind: "rank", group: "Qualifying group", rank: 1 },
            { kind: "rank", group: "Qualifying group", rank: 2 },
          ],
        },
      ],
    },
    options: {
      resources: [
        {
          id: `${namespace}_demo_court_1`,
          name: "North Arena — Court 1",
          venueId: `${namespace}_north`,
          venueName: "North Arena",
          surfaceName: "Court 1",
        },
        {
          id: `${namespace}_demo_court_2`,
          name: "South Sports Center — Court 1",
          venueId: `${namespace}_south`,
          venueName: "South Sports Center",
          surfaceName: "Court 1",
        },
      ],
      windows: Array.from({ length: 2 }, (_, i) => ({
        date: new Date(+date + i * 86400000).toISOString().slice(0, 10),
        startTime: "08:00",
        endTime: "22:00",
      })),
      duration: 30,
      rest: 10,
      travel: 30,
      turnaround: 5,
      maxGamesPerDay: 16,
    },
  });
  doc = mutateCompetition(
    mutateCompetition(doc, "generate", {}),
    "publish",
    {},
  );
  // Populate standings and a played match while leaving plenty of score-entry interactions.
  const first = doc.topology.matches.find((m) =>
    resolveCompetition(doc.topology, doc.results, doc.approvals)
      .states.get(m.id)!
      .teamIds.every(Boolean),
  )!;
  doc = mutateCompetition(doc, "score", {
    result: { matchId: first.id, game: 1, score1: 3, score2: 1 },
  });
  doc.layout = Object.fromEntries(
    doc.options.resources.map((r, i) => [r.id, { x: 8 + i * 40, y: 15 }]),
  );
  return doc;
}
