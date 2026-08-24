# Phase 6 BUG-004 Root-Cause Closure

**Application baseline:** `21db91d08ed47f443c9476f683e585a5867157a8`\
**Environment:** isolated hosted staging and local read-only asset inspection\
**Release decision:** `NOT READY`

## Outcome

Phase 6 closed `BUG-004` as a false-positive audit classification. Chrome's `net::ERR_ABORTED` event was an intentional consequence of `preload="metadata"`: staging had already returned a valid HTTP 206 range response and the video had reached a healthy, playable state before Chrome ended the remaining stream.

The controlled preload comparison, MP4 atom offsets, HTTP range evidence, and fresh two-viewport playback replay are recorded in `runs/2026-08-24-phase6-bug004/root-cause.md`.

No product change was made. Retaining `preload="metadata"` avoids forcing a 1.4 MB download for visitors who do not play the walkthrough.

## Coverage reconciliation

| Status | Phase 6 current | Phase 5 historical | Change |
|---|---:|---:|---|
| PASS | 2 | 1 | Row 3 restored after root-cause proof and fresh playback verification. |
| FAIL | 0 | 1 | BUG-004 closed as a false-positive audit classification. |
| BLOCKED | 86 | 86 | Fixture-dependent rows are unchanged. |
| NOT RUN | 0 | 0 | Unchanged. |
| NOT APPLICABLE | 0 | 0 | Unchanged. |
| Total | 88 | 88 | Reconciled one-to-one. |

## Defect reconciliation

| Severity | Fixed and verified | Closed false positive | Confirmed unresolved |
|---|---:|---:|---:|
| P2 MEDIUM | 2 | 0 | 0 |
| P3 LOW | 1 | 1 | 0 |
| Total | 3 | 1 | 0 |

`BUG-001`, `BUG-002`, and `BUG-003` remain fixed and verified. `BUG-004` remains in the ledger for traceability but is not an unresolved product defect.

## Current release posture

Release remains **`NOT READY`**. Closing BUG-004 removes the only failed row, but it does not supply the durable identities, populated cross-tenant datasets, provider sandboxes, devices, controlled assets, destructive authorization, rules-drift evidence, backup/restore proof, rollback drill, or least-privilege evidence required by the 86 blocked rows.

No production system was accessed or changed. No staging deployment was needed because Phase 6 changed only audit evidence and classification; the verified application runtime is unchanged.
