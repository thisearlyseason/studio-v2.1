# Phase 4 public PASS-row refresh

**Tester alias:** `phase4-final-verifier`
**Evidence finalized:** `2026-08-24T03:57:34Z`
**Application revision:** `597b6aac`
**Browser:** already-installed system Chrome, fresh extension-disabled profiles
**Environment:** local development with synthetic public Firebase configuration and isolated local emulators

## Result

All three existing public `PASS` rows were freshly replayed in full and remain `PASS`. The replay retained only the six named screenshots below; raw CLI snapshots, console/network logs, browser profiles, downloaded files, cookies, storage state, request URLs, identifiers, headers, and bodies were removed.

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

## Row 75 — Sports Hub resource, PDF, video, and download: PASS

- `/sports-hub/resources`, `/sports-hub/playbook`, and `/sports-hub/templates` returned 200.
- A valid article, standard resource, video resource, and template returned 200; invalid article, resource, and template slugs returned the expected 404 responses.
- The PDF action emitted a browser download with the expected category-PDF filename shape.
- The video resource rendered a visible labelled iframe with positive dimensions and an HTTPS public-provider document. No unavailable/playback state, request failure, or application error was observed.
- Template copy and print controls were visible, and the template tabs were present.
- Representative resource and video pages passed at 390×844 and 1440×900 with no horizontal overflow.

## Browser health

- Application-origin console errors: 0.
- Page errors: 0.
- Request failures: 0.
- Unexpected HTTP statuses: 0.
- Expected invalid-route responses: five 404s, all scoped to the named negative cases.
- External embed observation: two provider-origin console entries were isolated from the application result. Neither described an unavailable/playback condition, and the provider frame remained visible and usable; they are retained here as a limitation rather than reclassified as application errors.

## Retained screenshots

- `output/playwright/2026-08-23-phase4-c3177f29/public-pass-refresh/marketing-home-390.png`
- `output/playwright/2026-08-23-phase4-c3177f29/public-pass-refresh/marketing-pricing-1440.png`
- `output/playwright/2026-08-23-phase4-c3177f29/public-pass-refresh/audience-parents-390.png`
- `output/playwright/2026-08-23-phase4-c3177f29/public-pass-refresh/sport-soccer-1440.png`
- `output/playwright/2026-08-23-phase4-c3177f29/public-pass-refresh/sports-hub-resource-390.png`
- `output/playwright/2026-08-23-phase4-c3177f29/public-pass-refresh/sports-hub-video-1440.png`

## Status rule

Every applicable happy, negative, public-boundary, console, network, asset/download, and responsive contract named for these three rows completed successfully. The matrix therefore remains 3 `PASS`, 0 `FAIL`, 85 `BLOCKED`, 0 `NOT RUN`, and 0 `NOT APPLICABLE`.
