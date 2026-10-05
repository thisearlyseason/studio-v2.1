import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { GUIDE_CHAPTERS } from "../src/lib/how-to/content.ts";
import { GUIDE_ROLES } from "../src/lib/how-to/types.ts";
import { getGuideChapters } from "../src/lib/how-to/navigation.ts";
const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "src/lib/how-to/screenshots.json"), "utf8"),
);

test("every guide step has a unique address, instructions, result, and a published screenshot", () => {
  const ids = new Set();
  for (const chapter of GUIDE_CHAPTERS) {
    assert(!ids.has(chapter.id), `Duplicate chapter ${chapter.id}`);
    ids.add(chapter.id);
    assert(chapter.steps.length > 0);
    assert(chapter.before && chapter.access && chapter.roles.length);
    for (const step of chapter.steps) {
      assert(!ids.has(step.id), `Duplicate anchor ${step.id}`);
      ids.add(step.id);
      assert(step.instruction && step.result && step.focus);
      assert(manifest[step.image], `Missing screenshot for ${step.id}`);
    }
  }
  for (const [id, metadata] of Object.entries(manifest)) {
    const bytes = fs.readFileSync(
      path.join(root, `public/how-to/screenshots/${id}.webp`),
    );
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      metadata.sha256,
    );
    assert(metadata.width > 0 && metadata.height > 0);
  }
});

test("all user types have a complete route through the guide and valid role assignments", () => {
  const roles = GUIDE_ROLES.map((role) => role.id);
  for (const role of roles) assert(getGuideChapters(role).length > 0, role);
  for (const chapter of GUIDE_CHAPTERS) {
    for (const role of [
      ...chapter.roles,
      ...chapter.steps.flatMap((step) => step.roles || []),
    ])
      assert(roles.includes(role), role);
  }
  assert.equal(getGuideChapters("youth")[0].id, "youth-access");
  assert.equal(getGuideChapters("parent")[2].id, "family-start");
  assert.equal(getGuideChapters("official")[0].id, "officials");
});

test("member filters hide staff actions while retaining relevant shared instructions", () => {
  const stepIds = (role) =>
    getGuideChapters(role).flatMap((chapter) =>
      chapter.steps.map((step) => step.id),
    );
  for (const role of ["parent", "player", "youth"]) {
    assert(!stepIds(role).includes("chat-new"));
    assert(!stepIds(role).includes("film-required"));
    assert(stepIds(role).includes("chat-message"));
  }
  assert(stepIds("coach").includes("chat-new"));
});

test("search intersects role and feature filters and can produce an empty result", () => {
  assert(
    getGuideChapters("parent", "Schedule & attendance", "RSVP").length > 0,
  );
  assert.equal(
    getGuideChapters("parent", "Leagues", "Season Architect").length,
    0,
  );
  assert.equal(getGuideChapters("all", "all", "zzzzunfindable").length, 0);
  const allSteps = GUIDE_CHAPTERS.reduce(
    (sum, chapter) => sum + chapter.steps.length,
    0,
  );
  assert.equal(
    getGuideChapters("all").reduce(
      (sum, chapter) => sum + chapter.steps.length,
      0,
    ),
    allSteps,
  );
});
