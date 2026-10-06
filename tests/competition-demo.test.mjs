import test from "node:test";
import assert from "node:assert/strict";
import { createDemoCompetition } from "../src/lib/competition/demo.ts";
import { COMPETITION_FORMATS } from "../src/lib/competition/types.ts";
import { validateCompetitionSchedule } from "../src/lib/competition/schedule.ts";
for (const [format] of COMPETITION_FORMATS)
  test(`demo ${format} is populated and conflict-free`, () => {
    const doc = createDemoCompetition(format, {
      now: new Date("2026-10-01T12:00:00Z"),
    });
    assert.equal(doc.topology.rules.format, format);
    assert.equal(doc.status, "published");
    assert.equal(doc.results.length, 1);
    assert.ok(doc.schedule.length);
    assert.deepEqual(
      validateCompetitionSchedule(doc.topology, doc.schedule, doc.options),
      [],
    );
  });
