import test from "node:test";
import assert from "node:assert/strict";
import { starterTournamentAllowed } from "../src/lib/competition/plan-access.ts";
import { COMPETITION_FORMATS } from "../src/lib/competition/types.ts";
test("Starter permits exactly single elimination out of all 13 formats", () => {
  for (const [format] of COMPETITION_FORMATS)
    assert.equal(
      starterTournamentAllowed({ format }),
      format === "single_elimination",
      format,
    );
});
test("Starter cannot disguise a best-of series as single elimination", () => {
  assert.equal(
    starterTournamentAllowed({ format: "single_elimination", seriesLength: 3 }),
    false,
  );
  assert.equal(
    starterTournamentAllowed({
      format: "single_elimination",
      seriesByRound: { "Championship:1": 3 },
    }),
    false,
  );
  assert.equal(starterTournamentAllowed(undefined), false);
});
