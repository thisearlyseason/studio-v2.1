# Phase 4 public PASS-row refresh

**Tester alias:** `phase4-final-verifier`
**Original replay finalized:** `2026-08-24T03:57:34Z`
**Original application revision:** `597b6aac`
**Original browser:** already-installed system Chrome, fresh extension-disabled profiles
**Original environment:** local development with synthetic public Firebase configuration and isolated local emulators

**Asset-boundary closure tester:** `phase4-asset-boundary-closer`
**Closure evidence finalized:** `2026-08-24T04:47:36Z`
**Closure tested checkout:** `1053f1d7c22c90f71ac23fa9ffbcc12537a72d81` (latest code-changing revision `597b6aac`)
**Closure browser/viewport:** already-installed system Chrome at 390×844
**Closure environment:** local development with a synthetic Firebase web configuration and local Auth/Firestore/Storage emulators; no production SaaS or external provider accessed

## Result

The original replay supplied useful happy-path evidence for three public rows. This closure cycle found that only rows 1 and 3 have complete named-contract evidence and remain `PASS`. Row 75 is demoted to `BLOCKED` because the unsafe-URL rejection and private-asset crossover cases require controlled fixtures that were not available. The forced download failure/recovery case was safely replayed and passed, but partial evidence cannot support `PASS`. Only the six original sanitized screenshots remain; raw CLI snapshots, console/network logs, browser profiles, downloaded files, cookies, storage state, request URLs, identifiers, headers, and bodies were removed.

## Row 1 — Homepage navigation, pricing, and demos: PASS

- `/`, `/beta`, and `/refer-a-coach` returned 200, rendered a primary heading, stayed within the viewport, and exposed no authenticated or private content.
- Homepage navigation targets were present. The pricing anchor was reached, and switching to annual billing visibly changed the pricing presentation.
- The demo selector opened with all seven expected choices. Launching the Squad Pro happy path completed through successful seed and session responses and reached the authenticated demo dashboard using synthetic local data only.
- A separate fresh-profile negative replay aborted one image and delayed thirteen stylesheet/script/image requests by 250 ms each. The primary heading and demo action remained visible, no 5xx response appeared, and the page retained zero horizontal overflow. The one console error caused by the intentional image abort was scoped to this fault-injection check and was not counted as an unexpected application error.
- Representative responsive checks passed at 390×844 and 1440×900 with no horizontal overflow.

## Row 3 — Audience, sport, safety, how-to, and legal: PASS

- All six audience routes returned 200: parents, coaches, leagues, tournaments, schools, and municipalities.
- All fourteen sport routes returned 200: soccer, basketball, baseball, rugby, football, cornhole, gymnastics, pickleball, tennis, golf, swimming, esports, ultimate frisbee, and disc golf.
- `/safety`, `/how-to`, `/privacy`, and `/terms` returned 200.
- Invalid audience and sport slugs returned the expected 404 responses without exposing private data.
- Representative audience and sport pages passed at 390×844 and 1440×900 with no horizontal overflow.

## Row 75 — Sports Hub resource, PDF, video, and download: BLOCKED

- `/sports-hub/resources`, `/sports-hub/playbook`, and `/sports-hub/templates` returned 200.
- A valid article, standard resource, video resource, and template returned 200; invalid article, resource, and template slugs returned the expected 404 responses.
- The PDF action emitted a browser download with the expected category-PDF filename shape.
- The video resource rendered a labelled iframe with positive dimensions and an HTTPS public-provider document in the original replay. This establishes frame/document presence only, not playback usability.
- Template copy and print controls were visible, and the template tabs were present.
- Representative resource and video pages passed at 390×844 and 1440×900 with no horizontal overflow.

### Asset-boundary closure assessment

| Named case | Closure result | Evidence / exact dependency |
|---|---|---|
| Unsafe URL rejection | BLOCKED | The source-backed catalog contains public HTTPS provider URLs only. No controlled unsafe-URL Sports Hub resource or authorized admin fixture was available, so rejection could not be exercised without changing production behavior or inventing unsupported evidence. No product defect is claimed. |
| Forced download failure/recovery | PASS | Tester `phase4-asset-boundary-closer` used the wrapper at `/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh` with system Chrome at 390×844 against local checkout `1053f1d7`. After a fresh snapshot, reversible page-scoped fault injection made `HTMLCanvasElement.prototype.toDataURL` throw the synthetic marker `synthetic-pdf-export-failure`. Clicking `View Resource` recorded the expected handled PDF-error branch, 0 download events, 0 request failures, and an enabled `View Resource` idle state. Restoring the original primitive and retrying produced 1 browser download event with `TheSquad-Season-Kickoff-Operations-Plan.pdf`, 0 request failures, and the enabled idle state. The downloaded file and all raw CLI output were deleted. |
| Private-asset crossover denial | BLOCKED | No authorized public/private cross-tenant asset-and-identity pair exists in the fixture inventory. The static anonymous catalog has no private asset with which to prove denial. No product defect is claimed. |

Reproducible local procedure: start `npm run dev` with a synthetic `NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG` and `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`; use the Playwright CLI wrapper to open `/sports-hub/resources/expanded-season-kickoff-plan` with `--browser chrome`; resize to 390×844; snapshot; install the page-scoped `toDataURL` failure; click the snapshotted `View Resource` control; verify the handled marker and enabled idle label; restore the primitive; retry and observe the expected download filename; then close the browser and delete the download, CLI snapshots, profile, and logs.

## Original replay browser health

- Application-origin console errors: 0.
- Page errors: 0.
- Request failures: 0.
- Unexpected HTTP statuses: 0.
- Expected invalid-route responses: five 404s, all scoped to the named negative cases.
- External embed observation: two provider-origin console entries were isolated from the application result. The retained screenshot shows a black iframe surface and a red `N` / `1 Issue` badge at the lower left. The badge is the Next.js development-tools issue indicator outside the iframe, not a provider playback indicator. The original DOM/network observation established a labelled positive-size iframe, an HTTPS provider document, and no provider request failure; it did not establish that playback started or was usable. The screenshot is retained as a sanitized layout artifact only and is not playback evidence.

## Retained screenshots

- `output/playwright/2026-08-23-phase4-c3177f29/public-pass-refresh/marketing-home-390.png`
- `output/playwright/2026-08-23-phase4-c3177f29/public-pass-refresh/marketing-pricing-1440.png`
- `output/playwright/2026-08-23-phase4-c3177f29/public-pass-refresh/audience-parents-390.png`
- `output/playwright/2026-08-23-phase4-c3177f29/public-pass-refresh/sport-soccer-1440.png`
- `output/playwright/2026-08-23-phase4-c3177f29/public-pass-refresh/sports-hub-resource-390.png`
- `output/playwright/2026-08-23-phase4-c3177f29/public-pass-refresh/sports-hub-video-1440.png`

## Status rule

Rows 1 and 3 retain complete fresh evidence. Row 75 does not: two named boundary cases remain fixture-blocked despite the successful forced download failure/recovery replay. The reconciled matrix is therefore 2 `PASS`, 0 `FAIL`, 86 `BLOCKED`, 0 `NOT RUN`, and 0 `NOT APPLICABLE`.
