# Store submission packet — 2026-11-03

Exact field values are in `apple.json` (existing English Canada locale) and `google-play.json` (existing English US locale). Each constrained field also has a plain-text file with no trailing newline. Run `node scripts/validate-store-copy.mjs` from the project root. `counts.json` records character and UTF-8 byte validation.

| Field | Apple | Google Play |
| --- | --- | --- |
| Name/title | The Squad: Team Management — 26/30 | The Squad: Team Management — 26/30 |
| Subtitle / short description | Schedules, Rosters & Team Chat — 30/30 | Team schedules, rosters, scores and chat for coaches, athletes and families. — 76/80 |
| Keywords | 100/100 UTF-8 bytes | No keyword field |
| Promotional text | 131/170 | Not applicable |
| Description | 1,266/4,000 | 1,350/4,000 |

Keep Apple's current Sports category. Productivity is an optional secondary-category recommendation, only if the editable category choices and product fit support it. Recommend Google Play Sports category and Sports tag if offered; do not select a game genre or unrelated fitness tracking tag. No extra locales or translations were invented.

Publishing dependencies:

- Apple app 6811742452: 1.0.2 Ready for Distribution; 1.0.3/build 7 Pending Developer Release, observed in App Store Connect. Version description and keywords are disabled in that state. Preserve the approved binary/release. Apply these version-dependent fields in the next editable version/review workflow; do not cancel the release just for copy. Promotional text has an Edit control and Apple permits updating it without a new version submission. No store fields were saved or releases triggered here.
- Google Play pro.thesquad.app: existing listing title is **The Squad**; en-US listing is active for testing, production inactive. Prepared title adds the descriptor. Changes to the listing can be saved for review without rebuilding the Android binary, but publishing remains subject to Play review and the current release track. Production access still requires the console's closed-test requirements (0 opted in at inspection; 12 testers continuously for 14 days required).
- Publish and verify the website's `/download` route and support email addition before using the new marketing URL. Existing `/how-to` and `/privacy` paths are retained. Do not add a public Play badge until public release and country availability are verified.
- Copy deliberately limits mobile feature claims to schedules, rosters, scores and conversations supported by native listing and shared-app evidence. It does not promise offline operation, identical web/native features, or a successful purchase/restore flow. Current mobile device QA is still necessary for new screenshots.

Screenshot sequence (both stores, actual app captures only):

| Order | Caption | Required view / evidence |
| --- | --- | --- |
| 1 | Your team at a glance | Current team home, seeded demo team, upcoming events |
| 2 | Know your next game or practice | Events/calendar with readable dates |
| 3 | Keep your roster together | Roster with fictional participants |
| 4 | Keep team conversations in one place | Current chat with fictional messages |
| 5 | Follow the season | Game results/scores supported by that build |
| 6 | Find the teams you belong to | Team selector and correct role, optional |

Google Play currently has six phone captures: `01-dashboard.png`, `02-events.png`, `03-roster.png`, `04-practice.png`, `05-playbook.png`, `06-games.png`, plus `feature-graphic-1024x500.jpg` and `app-icon-512.png`. Retain these in the console; the first three and game capture are candidates for reuse only after comparing against the current Android build. Practice and playbook views are lower priority than messaging for this sequence. A current chat capture and refreshed team-home capture are missing from the verified sequence. Do not relabel desktop guide screenshots as native captures.

The repository's `public/how-to/screenshots/` images are suitable for existing web help, not proof of current iOS/Android UI. No fabricated device screenshots were generated. Capture phone and supported tablet sizes with the current signed build, hide personal notifications, use fictional team data, and verify captions against each platform. Apple's existing screenshots should remain until these replacements pass review.

Feature graphic recommendation: preserve the grass/brand identity, use the headline **Your team. Your season.**, and a real current team-home crop. Export 1024×500 PNG/JPEG for Google Play. Keep text inside a generous safe margin, legible on small screens; no store badges, rankings, pricing promotions or fabricated endorsements. This is a brief, not a generated upload asset.
