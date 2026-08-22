# Phase 3 Root-Cause Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair and independently verify BUG-001 and BUG-002 without changing unrelated SaaS behavior.

**Architecture:** Keep both fixes at their confirmed UI root causes. Event deletion gains a controlled confirmation boundary around the existing authorized mutation; the Sports Hub header reuses its existing compact search route until the desktop layout has enough width. Preserve all APIs, data models, dependencies, and unrelated UI behavior.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Radix AlertDialog, Node test runner, Playwright CLI.

**Spec:** `docs/qa/production-audit/07-defect-ledger.md`

## Global Constraints

- Starting audit commit: `cc9a3c7ca91c3ee2c2e3f257d3c642ba6a950327`.
- Phase 3 implementation base after preserving Phase 1/2 evidence: `2d491d1f`.
- Do not merge, push, deploy, or claim the application is production ready.
- Do not change APIs, persistence, authorization, data models, dependencies, or provider configuration.
- Use the smallest correct change and preserve current architecture and conventions.
- Every production-code change requires a focused failing test first and proof of the expected RED result.
- A fix is not verified until its focused test, related tests, original Playwright reproduction, console check, and network check have fresh evidence.
- P0, P1, and P3 have no confirmed ledger entries; only BUG-001 and BUG-002 are in scope.

---

### Task 1: BUG-001 — Require explicit event-deletion confirmation

**Confirmed root cause:** `EventDetailDialog.tsx` binds the destructive icon directly to `onDelete(event.id)`. Browser reproduction showed the first click immediately issuing `POST /api/teams/events/action` with HTTP 200 and removing the event. The server authorization boundary is working; the missing UI confirmation is the defect. Existing team, league, billing, file, and payment destructive flows use `AlertDialog`.

**Files:**
- Modify: `src/app/(dashboard)/events/EventDetailDialog.tsx`
- Modify: `tests/preview-regressions.test.mjs`

**Interfaces:**
- Consumes: existing `onDelete(eventId: string): void` prop and `event.title`/`event.id`.
- Produces: a controlled `AlertDialog` where Cancel performs no mutation and `Confirm Deletion` invokes the unchanged `onDelete(event.id)` once.

- [ ] **Step 1: Add the focused regression test**

Append a test named `event deletion requires an explicit event-named confirmation before mutation` to `tests/preview-regressions.test.mjs`. Read `EventDetailDialog.tsx` with the existing `readSource` helper and assert all of these structural behavior boundaries:

```js
test('event deletion requires an explicit event-named confirmation before mutation', async () => {
  const source = await readSource('../src/app/(dashboard)/events/EventDetailDialog.tsx');

  assert.match(source, /useState\(false\)/);
  assert.match(source, /<AlertDialog open=\{isDeleteConfirmationOpen\}/);
  assert.match(source, /Delete Activity\?/);
  assert.match(source, /\{event\.title\}/);
  assert.match(source, /<AlertDialogCancel[^>]*>Cancel<\/AlertDialogCancel>/);
  assert.match(source, /<AlertDialogAction[\s\S]{0,300}onDelete\(event\.id\)[\s\S]{0,300}Confirm Deletion/);
  assert.doesNotMatch(source, /aria-label=\{`Delete \$\{event\.title\}`\}[\s\S]{0,240}onClick=\{\(\) => onDelete\(event\.id\)\}/);
});
```

This catches the mutation that reintroduces the bug: moving `onDelete` back onto the first-click icon or removing the explicit named confirmation/cancel boundary.

- [ ] **Step 2: Run the focused test and prove RED**

Run:

```bash
node --import tsx --test --test-name-pattern="event deletion requires" tests/preview-regressions.test.mjs
```

Expected: FAIL because the current component has no controlled `AlertDialog` and directly calls `onDelete` from the icon.

- [ ] **Step 3: Implement the minimal confirmation boundary**

In `EventDetailDialog.tsx`:

1. Import `useState` from React.
2. Import `AlertDialog`, `AlertDialogAction`, `AlertDialogCancel`, `AlertDialogContent`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogHeader`, and `AlertDialogTitle` from `@/components/ui/alert-dialog`.
3. Add `const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);` inside `EventDetailDialog`.
4. Change the existing delete icon handler to `onClick={() => setIsDeleteConfirmationOpen(true)}`; preserve its label, tooltip, styling, visibility, and staff/admin gate.
5. Return the existing `Dialog` and the confirmation `AlertDialog` as siblings in a fragment so the modal layers do not nest their context.
6. Configure the confirmation with `open={isDeleteConfirmationOpen}` and `onOpenChange={setIsDeleteConfirmationOpen}`.
7. Use the title `Delete Activity?`, identify `event.title` in the description, state that deletion cannot be undone, provide `Cancel`, and make `Confirm Deletion` the only control calling `onDelete(event.id)`.

Use the existing destructive styles and `AlertDialog` conventions; do not change the API call or provider.

- [ ] **Step 4: Prove GREEN and run related checks**

Run:

```bash
node --import tsx --test --test-name-pattern="event deletion requires" tests/preview-regressions.test.mjs
npm run typecheck
npm test
```

Expected: the focused test passes, typecheck exits 0, and the full 386-test suite passes.

- [ ] **Step 5: Commit the task**

```bash
git add 'src/app/(dashboard)/events/EventDetailDialog.tsx' tests/preview-regressions.test.mjs
git commit -m "fix: confirm event deletion"
```

### Task 2: BUG-002 — Keep tablet Sports Hub search usable

**Confirmed root cause:** At 768 px, the `md` breakpoint simultaneously reveals the 144 px brand, Sports Hub identity, full search form, Back to App, and Get Started. The flex search absorbs the shortfall and measures 93.27 px, clipping its placeholder. At 1024 px the same search measures 349.27 px. Temporarily using the existing compact search link below `lg` removed the clipping and retained zero document overflow.

**Files:**
- Modify: `src/components/sports-hub/SportsHubClientLayout.tsx`
- Modify: `tests/public-production-readiness.test.mjs`

**Interfaces:**
- Consumes: existing full `SearchBar` and accessible `/sports-hub/search` icon link.
- Produces: compact accessible search at widths below `lg`; full header search at `lg` and above.

- [ ] **Step 1: Add the focused regression test**

Append this test to `tests/public-production-readiness.test.mjs`:

```js
test('Sports Hub keeps compact search through tablet widths', async () => {
  const layout = await source('../src/components/sports-hub/SportsHubClientLayout.tsx');

  assert.match(layout, /className="hidden lg:flex flex-1 max-w-sm"><SearchBar className="w-full"/);
  assert.match(layout, /href="\/sports-hub\/search" className="lg:hidden"/);
  assert.match(layout, /aria-label="Search Sports Hub"/);
  assert.doesNotMatch(layout, /hidden md:flex flex-1 max-w-sm/);
  assert.doesNotMatch(layout, /href="\/sports-hub\/search" className="md:hidden"/);
});
```

This catches the production change that reintroduces the tablet collision: exposing the full search and hiding the compact search at `md`.

- [ ] **Step 2: Run the focused test and prove RED**

Run:

```bash
node --import tsx --test --test-name-pattern="Sports Hub keeps compact search" tests/public-production-readiness.test.mjs
```

Expected: FAIL because both current search variants switch at `md`.

- [ ] **Step 3: Implement the smallest responsive fix**

In `SportsHubClientLayout.tsx`:

- Change the full search wrapper from `hidden md:flex flex-1 max-w-sm` to `hidden lg:flex flex-1 max-w-sm`.
- Change the compact `/sports-hub/search` link from `md:hidden` to `lg:hidden`.
- Do not alter the brand, actions, search route, `SearchBar`, header height, or other breakpoints.

- [ ] **Step 4: Prove GREEN and run related checks**

Run:

```bash
node --import tsx --test --test-name-pattern="Sports Hub keeps compact search" tests/public-production-readiness.test.mjs
npm run typecheck
npm test
```

Expected: the focused test passes, typecheck exits 0, and the full 387-test suite passes.

- [ ] **Step 5: Commit the task**

```bash
git add src/components/sports-hub/SportsHubClientLayout.tsx tests/public-production-readiness.test.mjs
git commit -m "fix: preserve Sports Hub tablet search"
```

### Task 3: Record fresh verification evidence

**Files:**
- Modify: `docs/qa/production-audit/05-coverage-matrix.md`
- Modify: `docs/qa/production-audit/07-defect-ledger.md`
- Create: `docs/qa/production-audit/08-fix-summary.md`

**Interfaces:**
- Consumes: reviewed fix commits, focused/full test output, original Playwright retests, console evidence, network evidence, and related-width/destructive-flow checks.
- Produces: traceable `FIXED AND VERIFIED` records without claiming production readiness.

- [ ] **Step 1: Rerun BUG-001 in Chromium**

Using the isolated Squad Pro demo, open an existing disposable event and verify:

1. First delete-icon click opens a dialog naming the event.
2. No `/api/teams/events/action` deletion request occurs before confirmation.
3. Cancel closes confirmation and leaves the event present after refresh.
4. Reopen, confirm deletion, observe exactly one successful deletion request, and verify disappearance after refresh.
5. Inspect console and related event view/edit behavior.

Save artifacts under `output/playwright/phase3-post-fix/bug-001/`.

- [ ] **Step 2: Rerun BUG-002 in Chromium**

At 390×844, 768×1024, 1024×768, and 1440×900 verify:

1. Compact search is visible and accessible below 1024 px.
2. Full search is visible at and above 1024 px and measures at least 300 px at 1024.
3. Search navigation/submission works.
4. `document.documentElement.scrollWidth === innerWidth`.
5. Console has no application errors and requests have no unexpected failures.

Save artifacts under `output/playwright/phase3-post-fix/bug-002/`.

- [ ] **Step 3: Update the defect ledger and coverage matrix**

For each bug record root cause, changed files, regression test name/command, fix description, browser result, console/network result, and related areas retested. Use `FIXED AND VERIFIED` only if every required fresh check above passed. Retain the BUG IDs in the coverage matrix; do not promote partially blocked rows to PASS beyond the evidence available.

- [ ] **Step 4: Create the Phase 3 fix summary**

Create `08-fix-summary.md` with bugs addressed, bugs verified fixed, bugs remaining, files modified, tests added, remaining blockers, task-review findings, and final-review findings. Explicitly state that Phase 4 will independently verify the result and that this report does not claim production readiness.

- [ ] **Step 5: Run documentation consistency checks and commit**

```bash
rg -n "OPEN|IN PROGRESS|FIXED AND VERIFIED|BLOCKED|DEFERRED" docs/qa/production-audit/07-defect-ledger.md
rg -n "BUG-001|BUG-002" docs/qa/production-audit/05-coverage-matrix.md docs/qa/production-audit/07-defect-ledger.md docs/qa/production-audit/08-fix-summary.md
git add docs/qa/production-audit/05-coverage-matrix.md docs/qa/production-audit/07-defect-ledger.md docs/qa/production-audit/08-fix-summary.md
git commit -m "qa: record Phase 3 fix verification"
```

Expected: both IDs remain traceable and documentation contains no production-readiness claim.

## Final verification and review

After all task reviews pass:

```bash
npm run typecheck
npm run lint
npm test
npm run test:rules
npm run build
npm --prefix functions run build
```

Then request a whole-diff review from base `2d491d1f` to HEAD using the defect ledger, this plan, all test evidence, and Playwright verification artifacts. Fix all Critical and Important findings through one reviewed fix wave before reporting Phase 3 results.
