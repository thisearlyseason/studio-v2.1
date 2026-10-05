import test from "node:test";
import assert from "node:assert/strict";
import { buildPlayingWindows } from "../src/lib/competition/setup-windows.ts";
test("daily picker dates stay consecutive across daylight saving and include both endpoints", () => {
  const rows = buildPlayingWindows(
    "2026-10-31",
    "2026-11-02",
    "09:00",
    "17:00",
  );
  assert.deepEqual(
    rows.map((r) => r.date),
    ["2026-10-31", "2026-11-01", "2026-11-02"],
  );
  assert.ok(rows.every((r) => r.startTime === "09:00"));
});
test("invalid or excessive ranges produce no schedulable days", () => {
  for (const [a, b] of [
    ["", ""],
    ["2026-02-30", "2026-03-01"],
    ["2026-11-02", "2026-10-31"],
    ["2026-01-01", "2026-12-31"],
  ])
    assert.deepEqual(buildPlayingWindows(a, b, "09:00", "17:00"), []);
});
