# Final Certification Fixture Record

**Run:** `2026-09-04-final-certification`
**Fixture run ID:** `final-cert-phase2`
**Base commit:** `0624dbc0643a39a72be1a6902a26ecc343374132`
**Environment exercised:** local Firebase Auth, Firestore, and Storage emulators on loopback
**Cleanup owner:** `fixture-batch` except anonymous demo sessions, which remain `local-batch`

This is a sanitized fixture ledger. It contains aliases and synthetic opaque
references only. It contains no passwords, tokens, cookies, action or invite
links, webhook signatures, provider payloads, or real personal data. The
fixture catalog and seeder refuse non-`demo-*` Firebase projects and non-loopback
Auth, Firestore, or Storage targets. Stripe and Connect entries are selectors
for later test-mode provisioning; this batch did not create provider objects.

## Identity ledger

| Alias | Role | State | Tenant/data aliases | Opaque UID suffix | Cleanup owner |
|---|---|---|---|---|---|
| `qa-coach-owner-a` | coach | active | qa-team-a | `…ach-owner-a` | fixture-batch |
| `qa-coach-owner-b` | coach | active | qa-team-b | `…ach-owner-b` | fixture-batch |
| `qa-pro-owner` | coach | active | qa-pro-team | `…qa-pro-owner` | fixture-batch |
| `qa-elite-owner` | coach | active | qa-elite-squad-1, qa-elite-squad-2, qa-elite-squad-3 | `…-elite-owner` | fixture-batch |
| `qa-school-owner` | admin | active | qa-school-squad-1, qa-school-squad-2, qa-school-squad-3 | `…school-owner` | fixture-batch |
| `qa-school-delegate` | admin | active | qa-school-squad-1 | `…ool-delegate` | fixture-batch |
| `qa-league-owner-a` | league_creator | active | qa-team-c; qa-league-a | `…gue-owner-a` | fixture-batch |
| `qa-league-owner-b` | league_creator | active | qa-league-b | `…gue-owner-b` | fixture-batch |
| `qa-team-assistant` | coach | active | qa-team-a | `…am-assistant` | fixture-batch |
| `qa-team-member` | adult_player | active | qa-team-a | `…a-team-member` | fixture-batch |
| `qa-parent-a` | parent | active | qa-team-a, qa-team-c | `…qa-parent-a` | fixture-batch |
| `qa-parent-b` | parent | active | qa-team-b | `…qa-parent-b` | fixture-batch |
| `qa-adult-player-a` | adult_player | active | qa-team-a | `…ult-player-a` | fixture-batch |
| `qa-adult-player-b` | adult_player | active | qa-team-b | `…ult-player-b` | fixture-batch |
| `qa-youth-invite` | youth_player | accountless | qa-team-c | n/a | fixture-batch |
| `qa-youth-active` | youth_player | active | qa-team-a | `…outh-active` | fixture-batch |
| `qa-superadmin` | superadmin | active | none | `…qa-superadmin` | fixture-batch |
| `qa-fake-superadmin` | superadmin profile only | active | none | `…e-superadmin` | fixture-batch |
| `qa-unverified` | coach | unverified | none | `…qa-unverified` | fixture-batch |
| `qa-suspended` | adult_player | suspended | qa-team-a | `…qa-suspended` | fixture-batch |
| `qa-removed-member` | adult_player | removed | none | `…moved-member` | fixture-batch |
| `qa-pending-delete` | adult_player | pending-delete | qa-team-a | `…nding-delete` | fixture-batch |
| `qa-owner-delete-blocked` | coach | active | qa-disposable-team; qa-disposable-league | `…lete-blocked` | fixture-batch |
| `qa-multi-org` | coach/member | active | qa-team-a, qa-team-b; qa-league-a | `…qa-multi-org` | fixture-batch |
| `qa-public-submitter` | visitor | accountless | none | n/a | fixture-batch |
| `qa-demo-a` | demo | anonymous | isolated demo workspace A | n/a | local-batch |
| `qa-demo-b` | demo | anonymous | isolated demo workspace B | n/a | local-batch |

Only `qa-superadmin` receives the trusted Auth claim. The
`qa-fake-superadmin` profile carries the same visible profile role without the
claim and remains denied. `qa-youth-invite`, `qa-public-submitter`, and both
demo aliases intentionally have no registered email/password Auth account.

## Tenant and data state

- Team A, Team B, and Team C use the visible markers `FALCON-A`, `BLUEBIRD-B`,
  and `GOLDEN-C`. The parent-A household links exactly Team A and Team C;
  parent B links only Team B.
- The catalog also includes a Pro team, three club squads, three school squads,
  one disposable owner-guard team, a club, a school with delegated authority,
  League A/B, and Tournament A/B.
- The immutable catalog owns 215 Firestore document descriptors across
  organization, roster, recruiting, family, schedule, practice, chat, file,
  compliance, competition, facility, equipment, public, and billing domains.
- Negative fixtures cover allowed, oversized, MIME-spoofed, deleted, public,
  and private files; past/current/future, cross-midnight, and both DST boundary
  times; and deterministic two-participant barriers for capacity, join, RSVP,
  poll, booking, and public-registration races.
- Billing selectors cover free, trialing, active monthly, active annual,
  past-due, canceled, add-on, and deleted-customer states. Every subscription,
  Stripe, and Connect descriptor has `livemode=false`; no live operation is
  present or permitted.

## Cleanup boundary

The `final-cert-phase2` catalog lists 73 exact recursive Firestore root paths,
23 exact Auth UIDs, and five run-prefixed Storage selectors. It contains no
wildcards or collection-wide delete instruction. Later provider cleanup must
select only records whose metadata includes
`fixture_run_id=final-cert-phase2` and `livemode=false`.

The seeder recursively deletes only those named roots before recreating the
same deterministic documents. It then records `auditFixtureMetadata` for the
run. The local emulator process itself is disposed by the audit runner; no
production or staging cleanup was required by this batch.

## Verification

`node --import tsx --test tests/final-certification-fixtures.test.mjs`
completed with 12 passes and 0 failures. The combined fixture/audit contract
command completed with 25 passes and 0 failures.

`npm run qa:audit-emulator` completed with exit code 0. All 20 active
registered aliases signed in and established an eligible server session; the
catalog records each declared landing route, and the optional `--browser` path
iterates every active alias against it. The suspended Auth user was rejected as disabled; the
unverified and pending-delete users were denied a browser session; the removed
member was denied former-team context; both owner directions were denied from
the other tenant; and the profile-only superadmin was denied the admin API.

The browser-enabled command completed its full route smoke with all 20 active
aliases at their cataloged destinations and the trusted/fake-admin and
parent/player direct-route boundaries intact. During the first browser run the
elite owner stayed on `/dashboard` because its user membership projection did
not carry the plan and owner fields consumed before the team document hydrates.
A failing regression now protects that projection contract; after the catalog
repair, the exact browser rerun placed the elite owner on `/club` and completed
the remaining aliases without a route mismatch.

These results establish local fixture readiness only. They do not promote any
coverage row, provision durable staging mailboxes, create Stripe/Connect/Resend
objects, or substitute for physical-device evidence.
