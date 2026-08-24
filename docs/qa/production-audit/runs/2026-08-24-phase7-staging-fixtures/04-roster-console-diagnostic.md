# Phase 7 Roster Console Diagnostic

Status: `COMPLETE — PRIOR FIXTURE NOISE CORRECTED; CLEAN CANONICAL ROSTER ROWS`

This targeted fresh hosted lifecycle investigated the seven error-level console entries previously recorded for `P7-S04-MEMBER-ROSTER-M/D`. It did not patch product or fixture source and did not inspect or retain credential values.

## Safety and lifecycle

| Gate | Sanitized result |
| --- | --- |
| Window | `2026-08-24T18:26:01Z`–`2026-08-24T18:35:33Z` |
| Starting revision | `8366f884a47a4074b8d252e0dece045dd5144f58` |
| Private workspace | Brand-new external directory `0700`; raw subdirectory `0700`; EXIT cleanup guardian armed |
| Read-only preflight | Exact `the-squad-v2-staging`; canonical origin; `safe=true`; 9 aliases; 2 teams |
| Seeded inspect | Auth `9`; Firestore `40`; manifest `seeded`; problems `0` |
| Browser contexts | 2 canonical fresh contexts, both closed; system Chrome; listeners armed on `about:blank` before the first staging navigation |
| Pre-clean inspect | Auth `9`; Firestore `40`; problems `0` |
| Cleanup | Deleted Auth `9`; Firestore `40`; retained `0` |
| Independent absence | Adapter independently resolved exact staging; checked `9/40`; `authPresent=0`; `firestorePresent=0` |
| Credentials/raw workspace | Validated credential helper removed the file; raw and private workspace absent |

## Sanitized per-context evidence

The console ledger was deduplicated by phase, signature, source category, and source origin. Request failures were deduplicated by phase, method, resource type, source category/origin, and failure reason. No request path, query, token, cookie, email, person name, or raw console payload is retained.

| ID | Alias | Viewport | Final UI | Console signature | Correlated request | Page errors | HTTP >=400 | Overflow | Result |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
| P7-RD-M | qa-team-member | 390x844 | `/roster`; Roster visible; no error boundary | `Failed to load resource: net::ERR_NAME_NOT_RESOLVED` ×8; category `fixture-avatar-origin`; origin `https://example.test` | `GET`; resource `image`; matching fixture origin/category; `net::ERR_NAME_NOT_RESOLVED` ×8 | 0 | 0 | 0 | PASS / classified |
| P7-RD-D | qa-team-member | 1440x900 | `/roster`; Roster visible; no error boundary | `Failed to load resource: net::ERR_NAME_NOT_RESOLVED` ×8; category `fixture-avatar-origin`; origin `https://example.test` | `GET`; resource `image`; matching fixture origin/category; `net::ERR_NAME_NOT_RESOLVED` ×8 | 0 | 0 | 0 | PASS / classified |

Both active-baseline contexts recorded exactly eight failed fixture-avatar requests because the fresh seed has eight active Team A member documents. The original canonical rows recorded seven after the guarded removed-member transition removed one member from the visible roster. This gives one failing avatar request per visible canonical member in both states and explains the exact prior count.

Navigation also cancelled a small number of `fetch` requests with `net::ERR_ABORTED` at same-origin and Firebase-provider origins. Those signals had no error-level console signature, no HTTP error response, no page error, and no final-state failure; they are classified separately as navigation/subscription cancellation and are not associated with the avatar finding.

## Root-cause classification

The fixture definition at the time of this diagnostic assigned canonical member avatars beneath `https://example.test/avatars/...`. Browser evidence showed the only error signature was DNS resolution failure from exactly that origin, every correlated failed request was an image `GET`, and the count followed the number of visible fixture members. The roster remained usable because the avatar component displayed its fallback after the image failed; the failed image element was no longer present in the settled DOM, and no page error or error boundary occurred.

Classification: `QA fixture-induced browser resource failure`. It is not an application exception, not an expected handled authorization denial, and not a product defect. `BUG-009` remains retired; no new `BUG-###` is warranted.

## Controlled-comparison decision

No hosted avatar rewrite was attempted. The guarded lifecycle CLI supports only `preflight`, `seed`, `inspect`, `cleanup`, and the two approved negative transitions; it exposes no reversible exact document-update command. Using the lower-level adapter directly would bypass the lifecycle's supported guard and manifest workflow, so the optional same-origin-avatar comparison was not safe within this task. The count correlation, origin-specific console signature, image request type, DNS failure reason, and intact UI provide a specific diagnosis without unsupported mutation.

## Final corrected-fixture rerun

Fixture correction `1ac09e272425adde9ce4e72863c4d6244d196620` replaced the diagnostic-only avatar origin with same-origin `/icon.png`. A new exact-staging lifecycle reran the two canonical roster rows.

| Gate | Sanitized result |
| --- | --- |
| Window | `2026-08-24T18:44:20Z`–`2026-08-24T18:51:52Z` |
| Preflight | Exact staging project and origin; `safe=true`; 9 aliases; 2 teams |
| Seed/inspect | Auth `9`; Firestore `40`; problems `0` |
| Browser | 2 canonical fresh system-Chrome contexts plus 1 self-rejected mobile harness probe; listeners armed on `about:blank`; all contexts closed |
| Cleanup | Pre-clean healthy `9/40`; deleted `9/40`; retained `0`; post-inspect expected cleaned absence |
| Independent absence | Exact staging re-resolution; `authPresent=0`; `firestorePresent=0` across `9/40` checks |
| Temporary artifacts | Validated credential removal; external workspace and raw artifacts absent |

| Canonical ID | Viewport | Final UI | Image/network evidence | Errors/failures | Overflow | Result |
| --- | --- | --- | --- | --- | ---: | --- |
| P7-S04-MEMBER-ROSTER-M | 390x844 | `/roster`; Roster visible; eight intact icon elements; no boundary | same-origin `GET /icon.png` image response `200`; `example.test` requests `0` | console `0`; page `0`; HTTP >=400 `0`; same-origin request failures `0` | 0 | PASS |
| P7-S04-MEMBER-ROSTER-D | 1440x900 | `/roster`; Roster visible; eight intact icon elements; no boundary | same-origin `GET /icon.png` image response `200`; `example.test` requests `0` | console `0`; page `0`; HTTP >=400 `0`; same-origin request failures `0` | 0 | PASS |

Each context observed one Firebase-provider subscription fetch cancelled with `net::ERR_ABORTED`; neither produced a console/page error, HTTP error, same-origin failure, broken image, or visible-state mismatch. The canonical roster rows are therefore clean. The prior errors remain classified as corrected fixture noise, `BUG-009` remains retired, and no new product finding is warranted.

One initial mobile probe used a direct full navigation from the dashboard and was self-rejected when that harness action cancelled two already-prefetched same-origin routes. It was closed and did not replace the canonical row. The fresh canonical mobile context used the current snapshot's actual `Profile` → `/roster` link and recorded same-origin request failures `0`; desktop likewise used the snapshot's `Roster` link.
