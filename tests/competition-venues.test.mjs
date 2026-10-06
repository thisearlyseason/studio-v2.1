import test from "node:test";
import assert from "node:assert/strict";
import {
  createCompetition,
  tournamentGames,
} from "../src/lib/competition/document.ts";
import { mutateCompetition } from "../src/lib/competition/mutations.ts";
import {
  competitionVenues,
  surfaceLabel,
} from "../src/lib/competition/venues.ts";
import {
  validateCompetitionSchedule,
  zonedInstant,
} from "../src/lib/competition/schedule.ts";
import { sharedBookingConflicts } from "../src/lib/competition/booking-conflicts.ts";
import { snapshotHtml } from "../src/lib/competition/export.ts";
const setup = () => ({
  title: "Multi-venue Cup",
  teams: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ],
  rules: { version: 2, format: "round_robin", timezone: "America/Edmonton" },
  options: {
    resources: [
      {
        id: "north:Court 1",
        name: "North — Court 1",
        venueId: "north",
        venueName: "North Arena",
        surfaceName: "Court 1",
        address: "100 North Road",
      },
      {
        id: "south:Court 1",
        name: "South — Court 1",
        venueId: "south",
        venueName: "South Arena",
        surfaceName: "Court 1",
        address: "200 South Road",
      },
    ],
    windows: [{ date: "2026-10-01", startTime: "08:00", endTime: "18:00" }],
    duration: 30,
    rest: 10,
    travel: 60,
    turnaround: 0,
    maxGamesPerDay: 4,
  },
});
test("venue metadata and canonical surface IDs survive setup, scheduling, editing and export", () => {
  let doc = createCompetition(setup());
  doc = mutateCompetition(doc, "generate", {});
  const original = doc.options.resources;
  assert.deepEqual(
    competitionVenues(original).map((v) => v.name),
    ["North Arena", "South Arena"],
  );
  assert.equal(surfaceLabel(original[1]), "South Arena — Court 1");
  assert.ok(
    tournamentGames(doc).every((g) => g.location.includes("Arena — Court 1")),
  );
  assert.ok(snapshotHtml(doc).includes("200 South Road"));
  doc = mutateCompetition(doc, "configure", {
    setup: {
      title: doc.title,
      teams: doc.topology.teams,
      rules: doc.topology.rules,
      options: doc.options,
    },
  });
  assert.deepEqual(doc.options.resources, original);
  assert.equal(doc.options.travel, 60);
});
test("changing venues enforces the configured transition gap in addition to team occupancy", () => {
  const doc = createCompetition(setup());
  const make = (i, time, resourceId) => {
    const start = zonedInstant("2026-10-01", time, doc.topology.rules.timezone);
    return {
      id: `${doc.topology.matches[i].id}_g1`,
      matchId: doc.topology.matches[i].id,
      game: 1,
      date: "2026-10-01",
      time: `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`,
      start,
      end: start + 1800000,
      resourceId,
    };
  };
  const first = make(0, 480, "north:Court 1"),
    second = make(1, 520, "south:Court 1");
  assert.ok(
    validateCompetitionSchedule(
      doc.topology,
      [first, second],
      doc.options,
    ).some((e) => e.code === "TEAM_CONFLICT"),
  );
  assert.ok(
    !validateCompetitionSchedule(
      doc.topology,
      [first, { ...second, resourceId: "north:Court 1" }],
      doc.options,
    ).some((e) => e.code === "TEAM_CONFLICT"),
  );
  const later = make(1, 570, "south:Court 1");
  assert.ok(
    !validateCompetitionSchedule(
      doc.topology,
      [first, later],
      doc.options,
    ).some((e) => e.code === "TEAM_CONFLICT"),
  );
  const external = {
    id: "other-event",
    teamIds: ["a", "b", "c"],
    resourceId: "third:Court 1",
    venueKey: "third",
    start: first.start,
    end: first.end,
    travel: 60,
  };
  assert.ok(
    validateCompetitionSchedule(doc.topology, [second], {
      ...doc.options,
      bookings: [external],
    }).some((e) => e.code === "EXTERNAL_TEAM_CONFLICT"),
  );
});
test("same-named courts at separate venues stay separate while shared IDs still conflict", () => {
  const base = {
    date: "2026-10-01",
    startMinute: 480,
    endMinute: 510,
    teamIds: ["a"],
    resourceId: "north:Court 1",
    venueKey: "north",
    travelMinutes: 60,
  };
  assert.deepEqual(
    sharedBookingConflicts(base, {
      ...base,
      teamIds: ["b"],
      resourceId: "south:Court 1",
      venueKey: "south",
    }),
    { team: false, resource: false },
  );
  assert.equal(
    sharedBookingConflicts(base, { ...base, teamIds: ["b"] }).resource,
    true,
  );
  assert.equal(
    sharedBookingConflicts(base, {
      ...base,
      startMinute: 520,
      endMinute: 550,
      resourceId: "south:Court 1",
      venueKey: "south",
    }).team,
    true,
  );
});
