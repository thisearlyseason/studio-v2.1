# Sports landing pages — September 12

Local implementation; not deployed. No production accounts, subscriptions, or newsletter subscribers were changed.

## COMPLETED

- 20 sport pages: six new hockey, slo-pitch, softball, volleyball, field-lacrosse, and box-lacrosse routes; individually written headlines, descriptions, workflows, and FAQs across the collection.
- Six original SVG illustrations. Existing photography and all PDF files preserved. Social metadata uses supported raster images rather than SVG previews.
- Shared Squad footer and existing newsletter signup on all 20 pages and Explore Sports. Explicit newsletter consent; accessible success/error announcements.
- Scoresheets featured beside relevant sport content. All 13 matching sports link the correct portrait/landscape pair and existing scoring guide. Unmatched sports link to the library without claiming a dedicated pack.
- Existing website plan-review link preserved. No authorization or billing changes.

## FIXED AND VERIFIED

- Red browser test reproduced missing footer before implementation.
- 42 rendered page/viewport checks passed: 21 routes at desktop 1440px and phone 390px. Footer, newsletter, scoresheet section, and horizontal-fit checks passed.
- All 26 PDF links responded with PDF content; actual portrait and landscape browser downloads succeeded on the hockey page. Scoring-guide and directory navigation passed.
- Newsletter UI invalid input, provider failure, retry, and success passed using explicitly simulated provider responses. No live newsletter email was sent. Built API rejected invalid email with HTTP 400.
- Final automated suite: 1,501 passed, zero failed, eight existing skips. Type checking passed. ESLint: zero errors, 1,901 existing warnings. Production build passed.
- Built-site smoke passed for hockey, softball, and Explore Sports, with zero page errors and zero console errors in that smoke session.
- Independent code review found no blocking issues. Expanded PDF checks to every matching sport after review.
- Development-only test diagnostics: hidden duplicated streamed HTML affected a raw DOM link count; acceptance now measures visible links. A screenshot applied caret styling before hydration, producing a development warning; the fresh built-site check passed without that warning. No application suppression was added.

Evidence: `output/playwright/sep12-sports/` contains browser, built-smoke, console, test, typecheck, lint, build logs, and desktop/mobile screenshots. Reusable browser check: `scripts/qa/sport-pages.browser.js`.

## REMAINING / BLOCKED

- Deploy the local web changes when authorized; then smoke the production alias.
- Fresh successful hosted newsletter persistence and delivery were not repeated. UI simulation is not provider-delivery certification.
- Native companion foundation design is written in `docs/superpowers/specs/2026-09-12-native-companion-foundation-design.md`, committed as `93b3ad1c`, awaiting written-design review. Free-only native signup is specified, not yet implemented.
- Native packaging, moderation, deletion-policy alignment, provider configuration, store submissions, and physical native-device certification remain separate work packages. Prior PWA device results do not certify native apps.

## DEFER UNTIL AFTER THIS PASS

- No further dashboard redesign or unrelated audit reruns.
