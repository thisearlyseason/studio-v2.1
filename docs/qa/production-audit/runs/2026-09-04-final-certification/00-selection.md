# Final certification selection

- Source matrix snapshot: `docs/qa/production-audit/05-coverage-matrix.md` at `77da392b`.
- Certification implementation HEAD: `9575ffd3350acd6c61562525e987236f58c2d14a`.
- Starting staging revision: `studio-build-2026-09-04-012` (the existing hosted live-demo evidence revision, not a certification-pass claim).
- Production: read-only until separately authorized.

## Selected scope

`CERTIFICATION_SCENARIOS` contains the 81 rows that were `BLOCKED` in the
source snapshot, in matrix order. Runners must select work by its stable `id`.
The catalog preserves the matrix's role text and happy, negative, permission,
console, network, and responsive requirements verbatim.

## Exclusions

The six established `PASS` rows are excluded: Marketing/legal homepage
navigation/pricing/demos; Marketing/legal audience/sport/safety/how-to/legal;
Dashboard/shell active team switch; Dashboard/shell alerts/history/acknowledge;
Sports Hub resource/PDF/video/download; and Companion schedule todos/local
sync. The retired `Time Out` local game lifecycle row is `NOT APPLICABLE` and
is excluded. An excluded row is rerun only when an affected repair requires a
targeted regression.

## Cleanup ownership

- `local-batch` owns disposable emulator fixtures and local browser artifacts.
- `provider-batch` owns test-mode Stripe/Connect/Resend objects and staging QA
  mailbox records.
- `background-batch` owns isolated scheduler, function, and staging data.
- `physical-device-batch` owns staging-only subscriptions and device test
  records.

Each scenario has exactly one owner. That owner records cleanup or an explicit
cleanup failure in its batch evidence; no other batch may silently retain the
fixture.

## Partial-evidence rule

Partial evidence is retained as context but cannot promote a row to `PASS`.
Every selected row requires fresh evidence for its happy path, negative path,
permission boundary, persistence, console/network checks, and applicable
responsive or physical-device proof. Provider acceptance and emulation do not
substitute for required physical-device observations.
