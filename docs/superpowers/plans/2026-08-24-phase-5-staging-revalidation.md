# Phase 5 Staging Revalidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the merged Phase 3/4 audit result to the existing isolated staging project, collect fresh public and operational evidence, and replace the obsolete “no staging environment” blocker with an exact inventory of the identity, tenant, provider, device, and destructive-test dependencies that still prevent full execution.

**Architecture:** Use the existing protected GitHub staging workflow as the only deployment boundary. The exact locally verified commit must pass the GitHub release gate before rollout; browser and HTTP checks then run only against the documented staging App Hosting origin. This phase performs no email delivery, push, Stripe transaction, provider mutation, destructive fixture action, or production action.

**Tech Stack:** Next.js 15, TypeScript, Node test runner, Firebase App Hosting/Auth/Firestore/Storage/Functions, GitHub Actions, Playwright CLI with installed system Chrome, Markdown audit records.

**Spec:** `docs/qa/production-audit/06-test-account-requirements.md`, `docs/qa/production-audit/09-phase4-independent-verification.md`, `docs/superpowers/specs/2026-08-18-production-readiness-completion-design.md`

## Global Constraints

- Use Firebase project `the-squad-v2-staging` and App Hosting backend `studio` only.
- Do not access or mutate production Firebase, Vercel, Stripe, Resend, FCM, customer data, or production deployment state.
- Do not print or retain passwords, API keys, webhook secrets, tokens, cookies, action links, full provider payloads, or real personal information.
- Record secret and variable availability by name/status only; never record values.
- Do not send email, request notification permission, send push notifications, create Stripe transactions, mutate provider endpoints, or run destructive account/data cleanup in this phase.
- Use only anonymous/visitor flows and synthetic public inputs unless an authorized opaque identity reference is explicitly supplied later.
- A matrix row becomes `PASS` only when every named happy, negative, permission, console, network, persistence, and responsive check is freshly evidenced. Partial staging evidence narrows a blocker but does not promote the row.
- Preserve the release posture `NOT READY` while any required contract remains blocked.
- Retain sanitized PNG screenshots and Markdown summaries only; remove raw traces, network/console logs, browser profiles, cookies, response bodies, downloads, and temporary configuration.
- Stop immediately if the workflow target, backend repository link, project ID, or health origin differs from the documented isolated staging resources.

---

### Task 1: Establish the Exact Phase 5 Baseline and Deployment Preconditions

**Files:**

- Create: `docs/qa/production-audit/runs/2026-08-24-phase5-staging/00-environment.md`

**Interfaces:**

- Consumes: merged Phase 3/4 commit `0b92545f76b5482b4a37aa36dfbd2c95876770a5`, `.firebaserc`, `.github/workflows/ci.yml`, `.github/workflows/deploy-staging.yml`, and non-secret GitHub/Firebase metadata.
- Produces: a committed Phase 5 baseline with exact SHA, branch, project/backend identity, repository-link check, configuration-name availability, recent deployment history, and local gate result.

- [ ] **Step 1: Verify isolation and record the starting point**

Run:

```bash
git status --porcelain -uall
git branch --show-current
git rev-parse HEAD
git rev-parse --git-dir
git rev-parse --git-common-dir
```

Expected: clean branch `agent/phase5-staging-readiness` at `0b92545f76b5482b4a37aa36dfbd2c95876770a5` in a linked worktree.

- [ ] **Step 2: Reconfirm staging metadata without secret values**

Run:

```bash
gh api repos/thisearlyseason/studio-v2.1/environments/staging/secrets --jq '.secrets[].name'
gh api repos/thisearlyseason/studio-v2.1/environments/staging/variables --jq '.variables[].name'
npx firebase apphosting:backends:list --project the-squad-v2-staging --json
gh run list --repo thisearlyseason/studio-v2.1 --workflow deploy-staging.yml --limit 10 --json databaseId,status,conclusion,createdAt,headSha,url
```

Accept only the secret names `GCP_SERVICE_ACCOUNT` and `GCP_WORKLOAD_IDENTITY_PROVIDER`; variable names `STAGING_FIREBASE_PROJECT_ID`, `STAGING_APPHOSTING_BACKEND_ID`, and `STAGING_APP_URL`; backend `studio`; repository link ending in `thisearlyseason-studio-v2-1`; and origin `https://studio--the-squad-v2-staging.us-east4.hosted.app`.

- [ ] **Step 3: Run the complete local gate**

Run:

```bash
npm run verify
```

Expected: typecheck, lint, Node tests, rendered component tests, rules tests, Next.js build, and Functions build all exit 0. Record exact test totals and the existing lint warning count without claiming the warning backlog is cleared.

- [ ] **Step 4: Write the baseline record**

Create `00-environment.md` with tester alias, UTC timestamp, exact SHA and branch, staging project/backend/origin, repository-link result, configuration-name availability only, recent staging workflow result summary, complete local-gate totals, and the explicit prohibition on production/provider/destructive actions.

- [ ] **Step 5: Verify and commit the baseline**

Run:

```bash
git diff --check
git add docs/qa/production-audit/runs/2026-08-24-phase5-staging/00-environment.md
git commit -m "qa: establish Phase 5 staging baseline"
```

Expected: one documentation-only baseline commit.

---

### Task 2: Deploy the Exact Passing Commit and Run Safe Staging Smoke Checks

**Files:**

- Create: `docs/qa/production-audit/runs/2026-08-24-phase5-staging/01-deployment.md`
- Create: `docs/qa/production-audit/runs/2026-08-24-phase5-staging/02-public-smoke.md`
- Retain sanitized screenshots only under: `output/playwright/2026-08-24-phase5-staging/`

**Interfaces:**

- Consumes: Task 1 committed SHA and the protected GitHub workflows.
- Produces: exact release-gate/deployment run IDs, deployed staging health, anonymous protected-route behavior, public responsive/browser health evidence, and sanitized artifacts.

- [ ] **Step 1: Push the Phase 5 branch and wait for its release gate**

Run:

```bash
phase5_sha="$(git rev-parse HEAD)"
git push -u origin agent/phase5-staging-readiness
release_run="$(gh run list --repo thisearlyseason/studio-v2.1 --branch agent/phase5-staging-readiness --workflow ci.yml --limit 1 --json databaseId,headSha --jq '.[0] | select(.headSha == "'"$phase5_sha"'") | .databaseId')"
test -n "$release_run"
gh run watch "$release_run" --repo thisearlyseason/studio-v2.1 --exit-status
```

Expected: App checks, Functions build, Firebase rules, and Dependency audit all pass for `phase5_sha`.

- [ ] **Step 2: Trigger and watch the protected staging rollout**

Run:

```bash
gh workflow run deploy-staging.yml --repo thisearlyseason/studio-v2.1 --ref agent/phase5-staging-readiness
deploy_run="$(gh run list --repo thisearlyseason/studio-v2.1 --branch agent/phase5-staging-readiness --workflow deploy-staging.yml --limit 1 --json databaseId,headSha --jq '.[0] | select(.headSha == "'"$phase5_sha"'") | .databaseId')"
test -n "$deploy_run"
gh run watch "$deploy_run" --repo thisearlyseason/studio-v2.1 --exit-status
```

If GitHub requests protected-environment approval, pause and ask the user to approve that exact run. Expected: target ownership, indexes, Functions, rules, App Hosting rollout, and health steps all pass.

- [ ] **Step 3: Verify deployed health and anonymous protection**

Run:

```bash
curl --fail --silent --show-error --max-time 20 https://studio--the-squad-v2-staging.us-east4.hosted.app/api/health
curl --silent --show-error --max-time 20 -o /dev/null -w '%{http_code} %{redirect_url}\n' https://studio--the-squad-v2-staging.us-east4.hosted.app/dashboard
```

Expected: health JSON reports `status=ok` and `service=the-squad-web`; anonymous dashboard access redirects to login without exposing protected content.

- [ ] **Step 4: Run the staging public browser sweep**

Read `/Users/tylerans/.codex/skills/playwright/SKILL.md` before execution. With the bundled wrapper and installed system Chrome, verify at 390×844 and 1440×900:

- homepage navigation/pricing/demo entry;
- audience/sport/safety/how-to/legal routes and representative invalid 404s;
- Sports Hub browse/search, representative resource/PDF retry, templates, and labelled provider frame;
- no horizontal document overflow;
- no application console errors or failed same-origin requests;
- anonymous attempts to `/dashboard` and `/admin` do not expose protected content.

Retain only a minimal sanitized PNG set that materially supports responsive or protected-boundary claims. Do not claim provider playback from an iframe screenshot.

- [ ] **Step 5: Record deployment and smoke evidence**

Write exact tester alias, UTC timestamps, source SHA, release/deploy run IDs and URLs, deployed health result, browser/version/viewports, routes, DOM/console/network outcomes, retained artifacts, and cleanup in `01-deployment.md` and `02-public-smoke.md`.

- [ ] **Step 6: Clean and commit the evidence**

Remove raw Playwright profiles, snapshots, traces, console/network files, downloads, response bodies, and temporary configuration. Then run:

```bash
find output/playwright/2026-08-24-phase5-staging -type f ! -name '*.png' -print
git diff --check
git add docs/qa/production-audit/runs/2026-08-24-phase5-staging output/playwright/2026-08-24-phase5-staging
git commit -m "qa: verify merged audit build on staging"
```

Expected: the artifact scan prints nothing and the evidence commit contains only Markdown plus sanitized PNGs.

---

### Task 3: Reassess All Blockers and Publish the Phase 5 Decision

**Files:**

- Create: `docs/qa/production-audit/runs/2026-08-24-phase5-staging/03-fixture-reassessment.md`
- Create: `docs/qa/production-audit/runs/2026-08-24-phase5-staging/coverage-reconciliation.md`
- Create: `docs/qa/production-audit/10-phase5-staging-revalidation.md`
- Modify only if a complete row changes status: `docs/qa/production-audit/05-coverage-matrix.md`
- Modify only for a reproduced product defect: `docs/qa/production-audit/07-defect-ledger.md`

**Interfaces:**

- Consumes: Phase 4 blocker map, Phase 5 staging metadata, workflow evidence, public browser evidence, and current authorized fixture inventory.
- Produces: an exact 88-row status reconciliation, narrowed blocker reasons, any newly confirmed defects, and the next safe fixture/provisioning request.

- [ ] **Step 1: Reassess fixture availability without credential discovery**

Classify each identity, tenant, provider, device, and destructive fixture as `AVAILABLE`, `NOT AUTHORIZED`, or `UNAVAILABLE`. Hosted staging, GitHub deployment identity, backend ownership, and health may become available. Historical account labels or provider claims remain unavailable unless an authorized opaque reference is explicitly supplied; do not reconstruct them from environment files or provider data.

- [ ] **Step 2: Reconcile every matrix row**

For all 88 rows, compare the named contract to the new staging evidence. Preserve `PASS` only where the entire contract remains evidenced; preserve `BLOCKED` where any named identity/data/provider/device/authorization dependency remains. Use `FAIL` and create a stable bug ID only for an observed product mismatch. Verify unique row keys and one-to-one mapping for every blocked row.

- [ ] **Step 3: Publish the Phase 5 report**

`10-phase5-staging-revalidation.md` must include exact current totals, historical Phase 4 totals, deployed SHA/run IDs, browser and operational results, confirmed defect counts by severity, review findings, retained artifacts, cleanup, limitations, and a `NOT READY` release decision unless all required contracts are complete.

- [ ] **Step 4: Run consistency and hygiene gates**

Run:

```bash
rg -n "PASS|FAIL|BLOCKED|NOT RUN|NOT APPLICABLE|NOT READY" docs/qa/production-audit/05-coverage-matrix.md docs/qa/production-audit/10-phase5-staging-revalidation.md docs/qa/production-audit/runs/2026-08-24-phase5-staging
rg -n "password|authorization:|bearer |api[_ -]?key|secret[=:]|cookie[=:]|token[=:]" docs/qa/production-audit/runs/2026-08-24-phase5-staging docs/qa/production-audit/10-phase5-staging-revalidation.md
git diff --check
npm run verify
```

Review every credential-pattern match without printing values; expected retained credential values: zero. Expected full gate: exit 0.

- [ ] **Step 5: Commit the reconciled decision**

Run:

```bash
git add docs/qa/production-audit/05-coverage-matrix.md docs/qa/production-audit/07-defect-ledger.md docs/qa/production-audit/10-phase5-staging-revalidation.md docs/qa/production-audit/runs/2026-08-24-phase5-staging
git commit -m "qa: publish Phase 5 staging revalidation"
```

Stage only files that changed. Expected: one internally consistent evidence commit and a clean worktree.
