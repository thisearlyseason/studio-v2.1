# September 12 — approved navigation and plain-language pass

Base: `833241b5` in `agent/physical-notification-repairs`. Local changes only; no deployment or store submission in this pass.

## COMPLETED

- Added Explore Sports (`/sports`) to desktop and mobile landing navigation, preserving Sports Hub (`/sports-hub`). Updated the audience-page footer label.
- Tablet navigation uses the drawer; the drawer scrolls on short phones and dismisses after same-page links.
- Clearer Create Chat, Remove Athlete, and Manage Subscription labels. Existing handlers, permissions, billing routes, and removal operations are unchanged.
- Privacy instructions now describe the existing self-service deletion flow, including ownership/subscription prerequisites and recent sign-in. This is not a new deletion implementation or legal/store certification.

## FIXED AND VERIFIED

- Playwright first failed because Explore Sports was absent. After implementation, real navigation passed at 1440, 1280, 1024, 768, 390, and 320 pixels: directory, soccer landing page, separate resources page, non-overlapping navigation, drawer dismissal, and reachable login on short screens.
- Independent diff review identified unsupported seven-year retention wording. Corrected the touched roster warning and privacy page after checking the removal and account-purge implementations; no retention behavior was changed.
- Fresh automated suite: 1,501 passed, zero failed, eight existing opt-in skips. Focused tests rerun after the final prose correction.
- Type checking and production build passed. ESLint has zero errors and existing warnings; see current logs for counts.
- Screenshots: `output/playwright/sep12-navigation/mobile-menu.png` and `desktop-navigation.png`.
- Browser acceptance script: `scripts/qa/marketing-navigation.browser.js`, evaluated with the Playwright CLI against a running local app.

## REMAINING

- Native companion implementation/design review: separate store distribution, website Stripe preserved, no in-app purchases or purchase links, native authentication/push/file handling, report/block/moderation, public deletion destination, and deletion-policy alignment. No native package was added.
- Signed-in labels were source-reviewed and covered by existing automated checks; signed-in destructive workflows were not repeated for copy-only edits.
- No change to the existing physical-device certification rows.

## BLOCKED

- Store approval cannot be claimed from a web build. Signing/provider setup, native-device acceptance, privacy/retention decisions, and store review remain separate requirements.

## DEFER UNTIL AFTER THIS PASS

- Broader typography/card/table redesign requires a separate scoped design; this pass did not redesign working dashboards.
- Local development navigation emitted Elfsight chatbot styled-components errors and a transient RSC 404. The built-page spot check had no console errors, but chatbot behavior was not comprehensively certified.
