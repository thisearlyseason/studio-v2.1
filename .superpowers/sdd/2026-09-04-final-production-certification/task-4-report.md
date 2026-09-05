# Task 4 Report: Tenant and Family Certification Batch

## Result

Task 4 now has a separate `tenants` module in the shared local-certification
runner, exact ownership of the 16 frozen scenarios, consumer-valid tenant
fixtures, strict case evidence, exact browser-session ownership, dynamic
resource cleanup, and three locally repaired product defects.

The immutable local run `final-cert-t4-260905-132028-6969` used candidate
commit `c8235cf6d976695db2b68fac56c47194411fd272`, exited zero, selected all 16
scenarios in the required execution order, emitted 19 case records, had zero
failed cases and zero run errors, and completed shared cleanup with 290 measured
deletions, zero restorations, and zero retained audit records.

This is not complete tenant certification. Thirteen scenarios emitted no
journey cases. `teams-join-by-code` and
`recruiting-public-scout-projection` emitted seven narrow local cases each;
`family-enable-youth-login` emitted five. That leaves 93 of the 112 declared
dimension cases unobserved, in addition to material subflows not represented by
the narrow emitted cases. Every scenario outcome and every owned coverage row
therefore remains `BLOCKED_PRECONDITION`; no row was promoted to PASS.

Production was neither queried nor changed. No staging mutation, provider
delivery, Stripe operation, or real mailbox send occurred.

## Exact Scenario Outcomes

| Scenario | Local case records | Exact local evidence | Required work still open |
|---|---:|---|---|
| `teams-create-and-capacity` | 0/7 | none | All create/capacity/quota/race/authority/browser cases and staging |
| `teams-join-by-code` | 7/7 narrow | Active and modified-code preview, anonymous direct-read denial, digest-bound preview session, minimal response, public page at both viewports, console and 5xx checks | Authenticated membership creation, derived position, reuse, concurrent consumption, escalation attempts, persistence after reload, inactive-preview runtime, and staging |
| `teams-profile-branding-settings` | 0/7 | none | CRUD, validation, owner/staff boundary, Storage lifecycle, browser, and staging |
| `teams-module-visibility` | 0/7 | none | All eight toggles, direct denial, non-staff boundary, persistence/browser, and staging |
| `teams-seasonal-reset-delete-quota-resolution` | 0/7 | none | Category-scoped reset, safe sacrificial deletion, conflicts, quota, browser, and staging |
| `organization-club-school-overview` | 0/7 | none | Club/school empty/partial/stale aggregates, isolation, browser, and staging |
| `organization-create-allocate-remove-squads` | 0/7 | none | Allocation lifecycle, final-seat race, delegate/outsider boundaries, browser, and staging |
| `organization-global-waivers-documents-admins` | 0/7 | none | Deploy/sign/revoke/admin lifecycle, partial retry, isolation, browser, and staging |
| `roster-member-add-edit-remove-reinstate` | 0/7 | none | Complete lifecycle, projection integrity, staff/owner/tenant boundaries, browser, and staging |
| `roster-search-filter-sort-export` | 0/7 | none | Actual controls, structured export/privacy, download evidence, browser, and staging |
| `roster-parent-player-self-views` | 0/7 | none | Parent A/C, Parent B, adult/youth self, stale-link/substitution/cache cases, browser, and staging |
| `recruiting-private-profile-crud` | 0/7 | none | Profile/metrics/stats/evaluation/contact/video CRUD, invalid media, isolation, browser, and staging |
| `recruiting-public-scout-projection` | 7/7 narrow | Active/hidden canonical state, private-contact denial, allowlisted payload, public page at both viewports, console and 5xx checks | Visible active-hidden-active toggle/cache lifecycle, malformed/oversized ID matrix, unsafe/private media matrix, and staging |
| `family-children-invites-team-cards` | 0/7 | none | Card and child/link lifecycle, stale/duplicate/missing states, isolation, browser, and staging |
| `family-schedule-waivers-payments` | 0/7 | none | Two-child schedules, signing lifecycle, payment reconciliation/privacy, browser, and staging |
| `family-enable-youth-login` | 5/7 narrow | Guardian invite creation, cross-guardian and modified-token denial, direct-Firestore denial, child/guardian binding, canonical/compatibility route equivalence | Existing-child Auth activation, reuse/revocation/duplicate-Auth/session isolation, console, responsive, approved mailbox delivery, and staging |

The tracked sanitized summary is
`docs/qa/production-audit/runs/2026-09-04-final-certification/03-tenants.md`.
The ignored machine result is
`output/playwright/2026-09-04-final-certification/task-4/final-cert-t4-260905-132028-6969/results.json`.

## Runner and Fixture Work

- Added the immutable 16-ID tenant assignment without changing identity
  selection semantics. One shared child process now serves selected batches;
  tenant logic remains in `local/batches/tenants.mjs`.
- Added strict tenant case fields for actor and target aliases, operation,
  network/console/responsive associations, contained artifacts, and cleanup
  references. Missing cases remain blocked and cannot become PASS from fixture
  readiness.
- Added exact browser response allowlists, session-scoped closure, stable path
  waits, responsive observations, and sanitized download summaries. The browser
  adapter rejects cross-origin navigation and closes only sessions it owns.
- Added guarded fixture overlays plus mutation-time Auth, Firestore, and Storage
  cleanup registration.
- Repaired the 14 catalog gaps: fresh creation actors; route-valid Team A/B/C
  codes; canonical recruiting profile, metrics, contact, stats, evaluations,
  videos, active and hidden states; parent-path payments; canonical youth-invite
  descriptor; Team C/guardian waiver member; global master/copy graph; correct
  Team C waiver owner; rich roster variants; and dynamic cleanup ownership.
- Capability tests resolve those records through the actual recruiting, Family,
  waiver, organization, join, Storage, and cleanup consumers. Fixture presence
  is not reported as application journey evidence.
- Preserved no-outbound audit behavior even when dotenv credentials exist. The
  public recruiting fixture no longer causes a browser request to a synthetic
  remote media host.

The six preflight source-contract gaps were rechecked against current source.
Task 3 had already repaired youth redemption membership projections, and the
current create route writes owner membership projections. This task repaired
the public recruiting source-of-truth split. Category-scoped reset/delete proof
and explicit roster filter/sort plus structured contact export still require
runtime reproduction and implementation; they remain blockers rather than
being described as fixed.

## Bugs Found and Fixed

- **BUG-032:** `/api/youth-invites` was an independently implemented legacy
  public invitation API with a different token, method, response, rate-limit,
  redemption, and tombstone contract from the Family Hub's canonical
  `/api/invites/youth`. The compatibility route now re-exports canonical `GET`,
  `POST`, and `PUT`. A bundled route regression and local API comparison pass.
- **BUG-033:** public recruiting used conflicting activation authorities. The
  API read canonical `recruitingProfile/profile.status`, metadata read the
  legacy player root flag, and the toggle wrote only that root flag. Metadata
  now uses `isProspectActivated` against the canonical profile and the provider
  atomically updates canonical status plus the compatibility projection.
- **BUG-034:** public join-code preview returned an inactive squad's identifier
  and name even though authenticated consumption rejected that squad. The GET
  route now applies `teamAcceptsRegistrations` and returns nondisclosing 404.

The exact final local journey observed the repaired canonical youth endpoint
equivalence and the canonical public recruiting status. BUG-034 has a red/green
route regression, while its inactive-state runtime case remains explicitly
unobserved. The full rows remain blocked as detailed above.

Audit-only repairs include route-valid fixture codes, serialization-safe
browser programs, case-insensitive visible-marker capture, run-contained
artifacts, sanitized sensitive values, and public-fixture media suppression.
These do not receive product bug IDs.

## Browser, Network, and Persistence Evidence

The exact immutable command was:

```text
PLAYWRIGHT_CLI=/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh npm run qa:certify-local -- --batch tenants --browser
```

Real Chrome opened the Team A squad registration preview and active public
recruiting page at 1440x900 and 390x844. Both showed their exact run-scoped
marker, stayed within the viewport, emitted zero console/page errors, and
returned no unexpected 5xx response. API/rules probes separately observed
unknown-code and hidden-profile 404s, private direct-read denial, public payload
allowlisting, invite guardian binding, and canonical/compatibility youth-route
agreement.

No screenshot was retained because these cases intentionally record only
sanitized JSON observations. The machine evidence contains no join/invite
token, cookie, email, private roster data, or query string.

## Cleanup

Shared cleanup event
`fixture-cleanup-final-cert-t4-260905-132028-6969` is `OBSERVED`: 290 measured
deletions, zero restorations, and zero retained audit records. It reconciled 26
exact Auth identities, 83 exact Firestore roots, eight exact Storage paths, the
dynamic join-session digest, and the dynamic youth invite. The child server,
Firebase emulators, exact Playwright sessions, and their process group closed in
`finally`.

That successful cleanup proves only the resources registered by this run. It
does not substitute for the unexecuted application mutations in the 13 empty
scenarios.

## Verification

- Focused Task 4, shared runner, fixture, application-policy, and regression
  tests: 244 passed, 0 failed.
- `npm run test:rules`: 41 passed, 0 failed on loopback Firestore and Storage
  emulators.
- `npm test`: 621 passed, 0 failed.
- `npm run typecheck`: exit 0.
- Focused ESLint command: 0 errors, one pre-existing warning in
  `local/batches/identity.mjs` for unused `hasExecutedCase`.
- `npm run build`: exit 0; optimized production build completed with existing
  repository lint, Tailwind ambiguity, and multi-lockfile warnings.
- Exact immutable browser batch: 16 selected scenarios, 19 observed case
  records, 93 missing case records, zero failures, zero run errors, cleanup
  290 deleted / 0 restored / 0 retained.
- `git diff --check`: run after final report/matrix/ledger reconciliation.

## Remaining Blockers

The local Task 4 execution contract is incomplete: 13 scenarios have no
application journey evidence, and the three partially exercised scenarios omit
the material lifecycle/race/authentication cases listed in the outcomes table.
Those missing cases must be implemented and rerun on a new immutable candidate
before Task 4 can be called locally complete.

After local completion, deploy that exact candidate to staging and use the
authorized shared staging companion with run-prefixed disposable records.
Youth login additionally requires an approved QA mailbox with a receipt
indicator. Production remains read-only. No coverage row is eligible for PASS
until local and exact-revision staging results, browser evidence, and exact
cleanup all reconcile.
