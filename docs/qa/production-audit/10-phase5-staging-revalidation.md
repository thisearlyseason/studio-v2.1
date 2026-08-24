# Phase 5 Staging Revalidation

**Run:** `2026-08-24-phase5-staging`\
**Application baseline:** `0b92545f76b5482b4a37aa36dfbd2c95876770a5`\
**Phase 5 execution base:** `99801735c24c83cf0ad4074d7ce998642d442f06`\
**Exact deployed SHA:** `658d3ca89f3cabf6c55800400aa17bc72229c1af`\
**Environment:** isolated hosted staging only\
**Release decision:** `NOT READY`

## Decision

The exact Phase 5 revision passed the release gate, protected staging deployment, target-ownership check, and health check. The anonymous/public two-viewport sweep and protected-route boundaries otherwise passed, but `/how-to` reproducibly reported one same-origin media request failure for `/faq/how-to-create-a-game.mp4`, type `media`, reason `net::ERR_ABORTED`. That observation violates the matrix row's explicit no-failed-assets contract and is recorded as `BUG-004`, P3 LOW, `CONFIRMED UNRESOLVED`.

The current matrix therefore has 1 `PASS`, 1 `FAIL`, and 86 `BLOCKED` rows. Hosted deployment evidence narrows prior environment blockers but does not supply the durable identities, populated cross-tenant data, provider sandboxes, devices, controlled assets, destructive authorization, or complete operational proof required by those rows. Release remains **`NOT READY`**.

## Coverage reconciliation

| Status | Current Phase 5 | Historical Phase 4 | Phase 5 change |
|---|---:|---:|---|
| PASS | 1 | 2 | The audience/sport/safety/how-to/legal row no longer satisfies its complete contract. |
| FAIL | 1 | 0 | Row 3 is linked to `BUG-004`. |
| BLOCKED | 86 | 86 | Exact key set is unchanged; hosted-environment reasons were narrowed where supported. |
| NOT RUN | 0 | 0 | No ambiguous rows remain. |
| NOT APPLICABLE | 0 | 0 | No complete row was excluded. |
| Total | 88 | 88 | Reconciled one-to-one. |

Completed functional-row coverage is `(PASS + FAIL) / total = 2 / 88 = 2.3%`. The 86-row blocker map contains 86 unique current matrix keys and excludes the sole `PASS` row 1 and sole `FAIL` row 3. Complete mapping and reasons are retained in `runs/2026-08-24-phase5-staging/coverage-reconciliation.md`.

## Deployment and operational result

| Evidence | Result |
|---|---|
| Release gate | PASS — run `32721982132`, exact deployed SHA, all four recorded jobs successful. |
| Protected staging rollout | PASS — run `32722312601`, exact deployed SHA, protected approval supplied by an authorized reviewer, complete workflow conclusion `success`. |
| Staging target ownership | PASS for the authorized project/backend scope. |
| Staging health | PASS — sanitized health fields reported the expected healthy service. |
| Anonymous protected routes | PASS — `/dashboard` and `/admin` ended at same-origin `/login` with `Sign In` and no protected shell. |
| Rules drift | BLOCKED — no independent desired-versus-deployed drift comparison was retained. |
| Backup/restore | BLOCKED — no authorized execution or restoration evidence was supplied. |
| Rollback drill | BLOCKED — no approved rollback target, authorization, execution, or evidence was supplied. |
| Least privilege | BLOCKED — successful workflow identity and target ownership do not establish the complete least-privilege contract. |

Operations row 88 remains `BLOCKED`: deployment and health are only part of its named contract and do not substitute for drift, backup/restore, rollback, and least-privilege evidence.

## Browser result

The Phase 5 sweep used fresh named system-Chrome sessions at 390×844 and 1440×900 on the exact deployed staging SHA.

| Scope | Result |
|---|---|
| Marketing, audience, sports, safety, legal | Positive routes returned HTTP 200, rendered primary headings, and had zero overflow at both viewports. |
| Expected invalid routes | Returned HTTP 404 with the expected 404 heading and no application exception. |
| Homepage interactions | Pricing anchor and public seven-role demo selector worked at both viewports; no demo identity was invoked. |
| Sports Hub | Browse/search, template navigation, PDF handled-failure/retry, and labelled HTTPS provider-frame document checks passed within the stated non-playback boundary. |
| Anonymous boundaries | `/dashboard` and `/admin` reached `/login` without protected content. |
| `/how-to` | `FAIL` for the complete matrix contract: final page/video state was healthy, but one same-origin media request reported `net::ERR_ABORTED` in the full sweep and fresh isolated replay. |

The focused `/how-to` replay returned HTTP 200 with heading `Operational Manual.`, zero overflow, zero application-origin console errors, zero page errors, zero same-origin HTTP responses of 400 or higher, and video state `readyState=4`, `networkState=1`, `errorCode=0`. These healthy observations are retained as limitations on impact; they do not override the row's strict zero-failed-request requirement.

## Defect accounting

Counts below are confirmed defects, not blocked coverage rows.

| Severity | Total confirmed | Fixed and verified | Confirmed unresolved |
|---|---:|---:|---:|
| P0 CRITICAL | 0 | 0 | 0 |
| P1 HIGH | 0 | 0 | 0 |
| P2 MEDIUM | 2 | 2 | 0 |
| P3 LOW | 2 | 1 | 1 |
| Total | 4 | 3 | 1 |

- `BUG-001` and `BUG-002` remain fixed and independently verified; their full matrix rows remain fixture-blocked.
- `BUG-003` remains fixed and verified local-QA/testability evidence and has no functional-matrix row.
- `BUG-004` is confirmed unresolved and maps to current matrix row 3.

## Fixture reassessment

The following references became `AVAILABLE` for their recorded scope: hosted staging origin, staging project/backend ownership, GitHub deployment identity, exact deployed revision, staging health, anonymous protected-route boundary, and system Chrome for the completed public replay.

All durable registered identities, billing-state owners, populated Team A/Team B/Team C and other cross-tenant records, claim-controlled administration, provider sandboxes, FCM device registrations, controlled RSS/embed/unsafe-private asset fixtures, and destructive lifecycle authorization remain `NOT AUTHORIZED`. Historical account labels and historical anonymous demos remain `UNAVAILABLE`. The exact classification is in `runs/2026-08-24-phase5-staging/03-fixture-reassessment.md`.

## Review findings

| Review stage | Finding and disposition |
|---|---|
| Task 1 baseline review | Clean; committed application/execution baselines, non-secret staging metadata, and local gate evidence were accepted. |
| Task 2 initial review | 2 Important findings and 2 deferred Minor findings. The provider-rendered PNG exceeded the sanitized boundary, and the `/how-to` failure contradicted a PASS request-health claim. |
| Task 2 fix round | Both Important findings were addressed: the provider PNG was removed, retained artifacts were reduced to four first-party PNGs, and the clean focused replay preserved the media abort as a non-PASS concern for Task 3. |
| Deferred Task 2 minors | Exact invalid paths are summarized by category only, and the ignored implementer report retains its initial status before the continuation section. These are final-review inputs and do not change the committed staging evidence or Phase 5 decision. |
| Task 3 reconciliation | Self-review verifies the single failed row, stable defect linkage, unchanged 86-key blocker map, severity totals, evidence boundaries, and `NOT READY` decision. |

## Retained artifacts and cleanup

Four sanitized first-party PNGs are retained:

- `output/playwright/2026-08-24-phase5-staging/home-demo-selector-390.png`
- `output/playwright/2026-08-24-phase5-staging/sports-hub-search-390.png`
- `output/playwright/2026-08-24-phase5-staging/template-practice-builder-1440.png`
- `output/playwright/2026-08-24-phase5-staging/anonymous-dashboard-boundary-390.png`

All four were visually reviewed and contain no recognizable people, personal data, credentials, tokens, cookies, action links, or provider-rendered content. The provider-rendered PNG was removed during Task 2 review. Named browser sessions were closed; raw snapshots, console/session files, the generated PDF, `.playwright-cli`, response bodies, traces, videos, network exports, persistent profiles, and temporary configuration were removed or not retained.

The durable Phase 5 evidence set is `00-environment.md`, `01-deployment.md`, `02-public-smoke.md`, `03-fixture-reassessment.md`, `coverage-reconciliation.md`, this report, the updated matrix/ledger, and the four sanitized PNGs.

## Limitations

- Staging evidence is not production evidence; no production target, account, data, or provider was accessed or changed.
- No durable registered identity, cross-tenant authorization matrix, provider callback, notification, payment, physical-device, or destructive lifecycle was exercised.
- The provider iframe check proves only label, dimensions, HTTPS host/document presence, and application-origin health; it is not provider-playback evidence.
- The `/how-to` evidence proves a repeatable browser request-failure signal but does not establish root cause. No response body or raw network trace was retained.
- A passing release gate, deployment, build, and health check cannot replace the 86 incomplete functional contracts.

## Next safe release step

Investigate and resolve `BUG-004` on isolated staging, then replay the complete row 3 contract. Separately, fixture owners should supply authorized opaque references—not credentials—for the durable identity matrix, populated cross-tenant datasets, controlled unsafe/private assets and embedding origins, provider sandboxes, FCM-capable devices, and disposable destructive/rollback authorization. Execute every remaining blocked contract and resolve any confirmed findings before reassessing release readiness.

Until those conditions are met, the release decision is **`NOT READY`**.
