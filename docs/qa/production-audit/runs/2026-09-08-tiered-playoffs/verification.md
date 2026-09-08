# Tiered Playoffs phased workflow verification

Candidate commit: `b55e58de`

## Verified behavior

- Tiered Playoffs can be saved as a zero-team draft without fields, daily windows, or playoff divisions.
- Non-Tiered formats retain their existing roster and scheduling requirements.
- Preliminary schedule deployment accepts a divisionless Tiered configuration and rejects playoff-phase games.
- Playoff division configuration is unavailable until every preliminary result is complete and undisputed.
- Automatic and custom division definitions are validated, versioned, and saved through the existing organizer authority boundary.
- Existing tournament formats and records are not migrated or rewritten.
- The organizer state exposes the phased progression from enrollment through preliminary setup, playoff setup, seeding, publication, and completion.

## Automated verification

- `npm test`: 1,424 tests; 1,416 passed, 8 skipped, 0 failed.
- `npm run test:rules`: 66 passed, 0 failed.
- `npm run typecheck`: passed.
- `npm run lint -- --quiet`: passed.
- `npm run build`: passed.
- `npm --prefix functions run build`: passed.
- Focused Tiered command tests after the final edge-case repair: 9 passed, 0 failed.

## Playwright verification

- `final-cert-t5-260908-220808-c307`: schedule generation, pools/brackets, referee assignment/conflicts, cross-team denial, persistence, console/network checks, desktop 1440x900, mobile 390x844, and cleanup were observed successfully.
- `final-cert-t5-260908-221008-d554`: score submission, disputes, corrected standings, replay/negative cases, outsider denial, persistence, console/network checks, desktop 1440x900, mobile 390x844, and cleanup were observed successfully.
- Narrow Tiered UI observation: a Squad Pro organizer opened the Tournament System Architect, advanced with zero teams, selected `TIERED PLAYOFFS`, observed the deferred-division explanation, and reached an enabled `CREATE TOURNAMENT DRAFT` action. At 390x844 the architect had `scrollWidth === clientWidth` (380px), so no horizontal overflow was present.
- The Tiered UI observation intentionally stopped before submitting the draft; server-side create/configure behavior is covered by the focused lifecycle and Tiered command tests.

## Harness note

The combined `tournaments-create-configure-replicate-archive` browser batch reached its harness-level 60-second ceiling after its lifecycle cases and UI observations. Its isolated cleanup completed with zero retained audit records. This timeout is recorded as a harness limitation and is not used as application PASS evidence; the successful split runs above are the authoritative Playwright evidence for the affected schedule and scoring surfaces.

## Release gate

The candidate is eligible for review and deployment after repository checks pass. Production readiness for this change requires the live health endpoint to report the exact merged revision and a focused live organizer/public smoke check to pass.
