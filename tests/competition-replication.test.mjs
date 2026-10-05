import test from "node:test";
import assert from "node:assert/strict";
import { createDemoCompetition } from "../src/lib/competition/demo.ts";
import { replicateCompetition } from "../src/lib/competition/replication.ts";
import { COMPETITION_FORMATS } from "../src/lib/competition/types.ts";
for (const [format] of COMPETITION_FORMATS)
  test(`clone ${format} keeps rules and venues without results or registered identities`, () => {
    const source = createDemoCompetition(format);
    const next = replicateCompetition(source, "Next Cup", "clone");
    assert.equal(next.title, "Next Cup");
    assert.equal(next.status, "draft");
    assert.deepEqual(next.schedule, []);
    assert.deepEqual(next.results, []);
    assert.deepEqual(next.options, source.options);
    assert.equal(next.topology.rules.format, format);
    assert.ok(
      next.topology.teams.every(
        (t) =>
          !source.topology.teams.some((s) => s.id === t.id) &&
          t.name.startsWith("Team "),
      ),
    );
    assert.ok(
      (next.topology.rules.customPools || []).every((p) =>
        p.teamIds.every((id) => next.topology.teams.some((t) => t.id === id)),
      ),
    );
  });
