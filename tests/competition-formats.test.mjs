import test from "node:test";
import assert from "node:assert/strict";
import { buildTopology } from "../src/lib/competition/topology.ts";
import {
  resolveCompetition,
  recordCompetitionResult,
} from "../src/lib/competition/results.ts";
import { pairSwissRound } from "../src/lib/competition/swiss.ts";
import {
  scheduleCompetition,
  validateCompetitionSchedule,
  zonedInstant,
} from "../src/lib/competition/schedule.ts";
const teams = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `t${i + 1}`,
    name: `Team ${i + 1}`,
  }));
const rules = (format) => ({
  version: 2,
  format,
  timezone: "America/Edmonton",
});
for (const n of [2, 3, 4, 5, 6, 7, 8, 13, 16, 31, 32, 63, 64]) {
  for (const format of [
    "single_elimination",
    "double_elimination",
    "consolation",
    "placement",
  ])
    test(`${format}: ${n} teams progresses to completion`, () => {
      const topology = buildTopology(teams(n), rules(format));
      let results = [];
      for (let i = 0; i < topology.matches.length + 1; i++) {
        const { states } = resolveCompetition(topology, results);
        const next = topology.matches.find((m) => {
          const s = states.get(m.id);
          return !s.complete && !s.inactive && s.teamIds.every(Boolean);
        });
        if (!next) break;
        results = recordCompetitionResult(topology, results, {
          matchId: next.id,
          game: 1,
          score1: 1,
          score2: 2,
        });
      }
      const { states } = resolveCompetition(topology, results);
      assert.ok([...states.values()].every((s) => s.complete || s.inactive));
      if (format === "single_elimination") assert.equal(results.length, n - 1);
      if (format === "double_elimination") {
        const losses = new Map();
        for (const s of states.values())
          if (s.loser) losses.set(s.loser, (losses.get(s.loser) || 0) + 1);
        assert.equal([...losses.values()].filter((l) => l === 2).length, n - 1);
        assert.ok([...losses.values()].every((l) => l <= 2));
      }
      if (format === "placement") {
        const placed = new Map();
        for (const m of topology.matches.filter((m) => m.placement)) {
          const s = states.get(m.id);
          placed.set(m.placement[0], s.winner);
          placed.set(m.placement[1], s.loser);
        }
        // Every match has a resolved winner; singleton classification leaves require terminal-source rank metadata.
        assert.equal(
          new Set([...states.values()].flatMap((s) => s.teamIds)).size,
          n,
        );
      }
    });
}
test("round robin cycles have exact pair multiplicity", () => {
  for (const n of [3, 4, 7, 8])
    for (const cycles of [1, 2]) {
      const topology = buildTopology(
        teams(n),
        rules(cycles === 1 ? "round_robin" : "double_round_robin"),
      );
      const counts = new Map();
      for (const m of topology.matches) {
        const key = m.sources
          .map((s) => s.teamId)
          .sort()
          .join(":");
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      assert.equal(counts.size, (n * (n - 1)) / 2);
      assert.ok([...counts.values()].every((v) => v === cycles));
    }
});
test("schedule validates independently and rejects overlapping edits", () => {
  const topology = buildTopology(teams(6), rules("double_elimination"));
  const options = {
    resources: [
      { id: "f1", name: "Field 1" },
      { id: "f2", name: "Field 2" },
    ],
    windows: [{ date: "2026-09-22", startTime: "08:00", endTime: "22:00" }],
    duration: 30,
    rest: 10,
    turnaround: 10,
    maxGamesPerDay: 20,
  };
  const schedule = scheduleCompetition(topology, options);
  assert.deepEqual(
    validateCompetitionSchedule(topology, schedule, options),
    [],
  );
  const bad = schedule.map((g) => ({ ...g }));
  Object.assign(bad[1], {
    start: bad[0].start,
    end: bad[0].end,
    time: bad[0].time,
    resourceId: bad[0].resourceId,
  });
  assert.ok(
    validateCompetitionSchedule(topology, bad, options).some(
      (c) => c.code === "FIELD_CONFLICT",
    ),
  );
});
test("DST missing and ambiguous local times fail closed", () => {
  assert.throws(
    () => zonedInstant("2026-03-08", 150, "America/Edmonton"),
    (e) => e.code === "DST_TIME",
  );
  assert.throws(
    // Use a recorded transition: Alberta no longer falls back after spring 2026.
    // IANA tzdb northamerica: Edmonton used Canada rules through November 2025.
    () => zonedInstant("2025-11-02", 90, "America/Edmonton"),
    (e) => e.code === "DST_TIME",
  );
});
test("Swiss no-repeat matching and fair byes survive every available round", () => {
  for (const n of [5, 6, 8]) {
    let records = [];
    for (let round = 1; round <= Math.min(n - 1, 4); round++) {
      const pairs = pairSwissRound(teams(n), records, round);
      assert.equal(
        new Set(pairs.flatMap((p) => [p.team1, p.team2].filter(Boolean))).size,
        n,
      );
      records.push(
        ...pairs.map((p) => ({
          ...p,
          round,
          points1: 3,
          points2: 0,
          final: true,
        })),
      );
    }
  }
});

test("every placement rank is resolved exactly once for odd and even rosters", () => {
  for (const n of [3, 5, 6, 9, 13, 16]) {
    const topology = buildTopology(teams(n), rules("placement"));
    let results = [];
    for (const match of topology.matches)
      results = recordCompetitionResult(topology, results, {
        matchId: match.id,
        game: 1,
        score1: 4,
        score2: 1,
      });
    const ranks = resolveCompetition(topology, results).placements;
    assert.deepEqual(
      Object.keys(ranks)
        .map(Number)
        .sort((a, b) => a - b),
      Array.from({ length: n }, (_, i) => i + 1),
    );
    assert.equal(new Set(Object.values(ranks)).size, n);
  }
});
test("pool qualification is held until reviewed and each tier produces its own champion", () => {
  for (const format of [
    "pool_play",
    "pool_play_knockout",
    "pool_double_elimination",
    "tiered_playoffs",
  ]) {
    const topology = buildTopology(teams(8), {
      ...rules(format),
      poolCount: 2,
      advancePerPool: 2,
      tiers: [
        { name: "Gold", size: 4 },
        { name: "Silver", size: 4 },
      ],
    });
    let results = [];
    for (const match of topology.matches.filter((m) => m.pool))
      results = recordCompetitionResult(topology, results, {
        matchId: match.id,
        game: 1,
        score1: 2,
        score2: 1,
      });
    let state = resolveCompetition(topology, results);
    assert.ok(
      topology.matches
        .filter((m) => !m.pool)
        .every((m) => state.states.get(m.id).teamIds.includes(null)),
    );
    const approvals = Object.fromEntries(
      Object.entries(state.standings).map(([group, rows]) => [
        group,
        rows.map((r) => r.teamId),
      ]),
    );
    for (const match of topology.matches.filter((m) => !m.pool)) {
      state = resolveCompetition(topology, results, approvals);
      if (state.states.get(match.id).inactive) continue;
      results = recordCompetitionResult(
        topology,
        results,
        { matchId: match.id, game: 1, score1: 1, score2: 2 },
        approvals,
      );
    }
    assert.ok(
      [
        ...resolveCompetition(topology, results, approvals).states.values(),
      ].every((s) => s.complete || s.inactive),
    );
  }
});
test("series requires preceding games, advances only at majority, and rejects excess games", () => {
  const topology = buildTopology(teams(4), {
    ...rules("single_elimination"),
    seriesLength: 3,
  });
  const first = topology.matches[0],
    next = topology.matches.at(-1);
  let results = [];
  assert.throws(
    () =>
      recordCompetitionResult(topology, results, {
        matchId: first.id,
        game: 2,
        score1: 1,
        score2: 0,
      }),
    (e) => e.code === "SERIES_ORDER",
  );
  results = recordCompetitionResult(topology, results, {
    matchId: first.id,
    game: 1,
    score1: 1,
    score2: 0,
  });
  assert.equal(
    resolveCompetition(topology, results).states.get(first.id).complete,
    false,
  );
  assert.ok(
    resolveCompetition(topology, results)
      .states.get(next.id)
      .teamIds.includes(null),
  );
  results = recordCompetitionResult(topology, results, {
    matchId: first.id,
    game: 2,
    score1: 1,
    score2: 0,
  });
  assert.equal(
    resolveCompetition(topology, results).states.get(first.id).complete,
    true,
  );
  assert.throws(
    () =>
      recordCompetitionResult(topology, results, {
        matchId: first.id,
        game: 3,
        score1: 1,
        score2: 0,
      }),
    (e) => e.code === "MATCH_UNAVAILABLE",
  );
});
test("custom advancement rejects unknown feeders, cycles, and reused winners", () => {
  const t = teams(4);
  const team = (id) => ({ kind: "team", teamId: id }),
    win = (id) => ({ kind: "winner", matchId: id });
  const make = (customMatches) =>
    buildTopology(t, { ...rules("custom"), customMatches });
  assert.throws(
    () =>
      make([
        {
          id: "a",
          stage: "Main",
          round: 1,
          sources: [team("t1"), win("missing")],
        },
      ]),
    (e) => e.code === "UNKNOWN_FEEDER",
  );
  assert.throws(
    () =>
      make([
        { id: "a", stage: "Main", round: 1, sources: [win("b"), team("t1")] },
        { id: "b", stage: "Main", round: 2, sources: [win("a"), team("t2")] },
      ]),
    (e) => e.code === "ADVANCEMENT_CYCLE",
  );
  assert.throws(
    () =>
      make([
        { id: "a", stage: "Main", round: 1, sources: [team("t1"), team("t2")] },
        { id: "b", stage: "Main", round: 2, sources: [win("a"), team("t3")] },
        { id: "c", stage: "Main", round: 2, sources: [win("a"), team("t4")] },
      ]),
    (e) => e.code === "DUPLICATE_ADVANCEMENT",
  );
});
test("resource subdivisions and existing team rest block placement", () => {
  const topology = buildTopology(teams(2), rules("single_elimination"));
  const options = {
    resources: [{ id: "half", name: "Half field", conflictsWith: ["whole"] }],
    windows: [{ date: "2026-09-22", startTime: "08:00", endTime: "09:00" }],
    duration: 30,
    rest: 10,
    turnaround: 0,
    maxGamesPerDay: 2,
    bookings: [
      {
        id: "existing",
        resourceId: "whole",
        teamIds: [],
        start: zonedInstant("2026-09-22", 480, "America/Edmonton"),
        end: zonedInstant("2026-09-22", 540, "America/Edmonton"),
      },
    ],
  };
  assert.throws(
    () => scheduleCompetition(topology, options),
    (e) => e.code === "INSUFFICIENT_CAPACITY",
  );
  const blocked = {
    ...options,
    bookings: [
      {
        ...options.bookings[0],
        resourceId: "other",
        teamIds: ["t1"],
        end: zonedInstant("2026-09-22", 525, "America/Edmonton"),
        rest: 30,
      },
    ],
  };
  assert.throws(
    () => scheduleCompetition(topology, blocked),
    (e) => e.code === "INSUFFICIENT_CAPACITY",
  );
});

test("Swiss preview requires all prior results and only publishes reviewed pairings", async () => {
  const { createCompetition } = await import(
    "../src/lib/competition/document.ts"
  );
  const { mutateCompetition } = await import(
    "../src/lib/competition/mutations.ts"
  );
  let doc = createCompetition({
    title: "Swiss test",
    teams: teams(5),
    rules: { ...rules("swiss"), swissRounds: 3 },
    options: {
      resources: [{ id: "f", name: "Field" }],
      windows: [{ date: "2026-10-10", startTime: "08:00", endTime: "22:00" }],
      duration: 20,
      rest: 10,
      turnaround: 0,
      maxGamesPerDay: 4,
    },
  });
  doc = mutateCompetition(doc, "generate", {});
  doc = mutateCompetition(doc, "publish", {});
  for (let round = 1; round <= 3; round++) {
    assert.throws(() => mutateCompetition(doc, "swiss-preview", {}));
    for (const match of doc.topology.matches.filter((m) => m.round === round))
      doc = mutateCompetition(doc, "score", {
        result: { matchId: match.id, game: 1, score1: 2, score2: 1 },
      });
    if (round < 3) {
      doc = mutateCompetition(doc, "swiss-preview", {});
      assert.ok(doc.swissPreview.length === 3);
      doc = mutateCompetition(doc, "swiss-publish", {});
      assert.equal(doc.swissRound, round + 1);
    }
  }
  assert.equal(doc.swissRecords.length, 9);
  assert.equal(
    new Set(doc.swissRecords.filter((r) => !r.team2).map((r) => r.team1)).size,
    3,
  );
});

test("all 13 formats generate complete schedules that pass independent validation", async () => {
  const { COMPETITION_FORMATS } = await import(
    "../src/lib/competition/types.ts"
  );
  for (const [format] of COMPETITION_FORMATS) {
    const topology = buildTopology(teams(format === "best_of_series" ? 2 : 4), {
      ...rules(format),
      poolCount: 2,
      advancePerPool: 1,
      tiers: [
        { name: "Gold", size: 2 },
        { name: "Silver", size: 2 },
      ],
      swissRounds: 3,
      seriesLength: format === "best_of_series" ? 3 : 1,
      customPools: [
        { name: "Group", teamIds: teams(4).map((t) => t.id), cycles: 1 },
      ],
      customMatches: [
        {
          id: "final",
          stage: "Final",
          round: 1,
          sources: [
            { kind: "rank", group: "Group", rank: 1 },
            { kind: "rank", group: "Group", rank: 2 },
          ],
        },
      ],
    });
    const options = {
      resources: [
        { id: "f1", name: "Field 1" },
        { id: "f2", name: "Field 2" },
      ],
      windows: [{ date: "2026-10-10", startTime: "08:00", endTime: "22:00" }],
      duration: 20,
      rest: 10,
      turnaround: 0,
      maxGamesPerDay: 20,
    };
    const schedule = scheduleCompetition(topology, options);
    assert.equal(
      schedule.length,
      topology.matches.reduce((n, m) => n + m.bestOf, 0),
      format,
    );
    assert.deepEqual(
      validateCompetitionSchedule(topology, schedule, options),
      [],
      format,
    );
  }
});
test("draft unplacement and bulk delay are atomic and preserve completed games", async () => {
  const { createCompetition } = await import(
    "../src/lib/competition/document.ts"
  );
  const { mutateCompetition } = await import(
    "../src/lib/competition/mutations.ts"
  );
  let doc = createCompetition({
    title: "Operations",
    teams: teams(4),
    rules: rules("single_elimination"),
    options: {
      resources: [{ id: "f", name: "Field" }],
      windows: [{ date: "2026-10-10", startTime: "08:00", endTime: "12:00" }],
      duration: 30,
      rest: 0,
      turnaround: 0,
      maxGamesPerDay: 4,
    },
  });
  doc = mutateCompetition(doc, "generate", {});
  const original = structuredClone(doc);
  const slot = doc.schedule[0];
  doc = mutateCompetition(doc, "unplace", { gameId: slot.id });
  assert.equal(doc.schedule.length, 2);
  assert.throws(() => mutateCompetition(doc, "publish", {}));
  doc = mutateCompetition(doc, "move", {
    gameId: slot.id,
    date: slot.date,
    time: slot.time,
    resourceId: slot.resourceId,
  });
  doc = mutateCompetition(doc, "publish", {});
  assert.throws(() => mutateCompetition(doc, "unplace", { gameId: slot.id }));
  assert.throws(() =>
    mutateCompetition(doc, "shift", {
      date: slot.date,
      from: "08:00",
      minutes: 240,
    }),
  );
  assert.equal(doc.schedule.find((g) => g.id === slot.id).start, slot.start);
  doc = mutateCompetition(doc, "score", {
    result: { matchId: slot.matchId, game: 1, score1: 1, score2: 0 },
  });
  doc = mutateCompetition(doc, "shift", {
    date: slot.date,
    from: "08:00",
    minutes: 30,
  });
  assert.equal(doc.schedule.find((g) => g.id === slot.id).start, slot.start);
  assert.ok(
    doc.schedule
      .filter((g) => g.id !== slot.id)
      .every(
        (g) =>
          g.start ===
          original.schedule.find((o) => o.id === g.id).start + 1800000,
      ),
  );
});
test("guided pool-to-custom series resolves approved ranks and rejects possible self-play", async () => {
  const { createCompetition } = await import(
    "../src/lib/competition/document.ts"
  );
  const { mutateCompetition } = await import(
    "../src/lib/competition/mutations.ts"
  );
  let doc = createCompetition({
    title: "Custom",
    teams: teams(4),
    rules: {
      ...rules("custom"),
      seriesLength: 3,
      customPools: [
        { name: "Group", teamIds: teams(4).map((t) => t.id), cycles: 1 },
      ],
      customMatches: [
        {
          id: "final",
          stage: "Final",
          round: 1,
          sources: [
            { kind: "rank", group: "Group", rank: 1 },
            { kind: "rank", group: "Group", rank: 2 },
          ],
        },
      ],
    },
    options: {
      resources: [{ id: "f", name: "Field" }],
      windows: [{ date: "2026-10-10", startTime: "08:00", endTime: "22:00" }],
      duration: 20,
      rest: 0,
      turnaround: 0,
      maxGamesPerDay: 10,
    },
  });
  doc = mutateCompetition(
    mutateCompetition(doc, "generate", {}),
    "publish",
    {},
  );
  for (const match of doc.topology.matches.filter((m) => m.pool))
    doc = mutateCompetition(doc, "score", {
      result: { matchId: match.id, game: 1, score1: 2, score2: 1 },
    });
  doc = mutateCompetition(doc, "seed-pools", {
    rankings: { Group: teams(4).map((t) => t.id) },
  });
  assert.equal(doc.topology.matches.find((m) => m.id === "final").bestOf, 3);
  for (let game = 1; game <= 2; game++)
    doc = mutateCompetition(doc, "score", {
      result: { matchId: "final", game, score1: 2, score2: 0 },
    });
  assert.equal(
    resolveCompetition(doc.topology, doc.results, doc.approvals).states.get(
      "final",
    ).winner,
    "t1",
  );
  assert.throws(() =>
    buildTopology(teams(4), {
      ...rules("custom"),
      customMatches: [
        {
          id: "a",
          stage: "A",
          round: 1,
          sources: [
            { kind: "team", teamId: "t1" },
            { kind: "team", teamId: "t2" },
          ],
        },
        {
          id: "b",
          stage: "B",
          round: 2,
          sources: [
            { kind: "winner", matchId: "a" },
            { kind: "team", teamId: "t1" },
          ],
        },
      ],
    }),
  );
});

test("offline snapshot escapes names and never marks unresolved participants as winners", async () => {
  const { createCompetition } = await import(
    "../src/lib/competition/document.ts"
  );
  const { snapshotHtml } = await import("../src/lib/competition/export.ts");
  const doc = createCompetition({
    title: "<script>alert(1)</script>",
    teams: teams(4),
    rules: rules("single_elimination"),
    options: {
      resources: [{ id: "f", name: "Field" }],
      windows: [{ date: "2026-10-10", startTime: "08:00", endTime: "18:00" }],
      duration: 30,
      rest: 15,
      turnaround: 0,
      maxGamesPerDay: 4,
    },
  });
  const html = snapshotHtml(doc);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("✓"));
  assert.equal((html.match(/<article>/g) || []).length, 3);
});
