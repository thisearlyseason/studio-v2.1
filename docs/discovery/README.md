# The Squad discovery implementation — 2026-11-03

Work is prepared locally on `codex/discovery-seo-aso-20261103` in the existing `modern-team-home-release` worktree, based on release commit `0184db5e`. No website deployment, store metadata save, app release, account change, payment, or tracking installation was performed.

The initially opened checkout had older application code and omitted 23 URLs present on production. Its pre-existing edits were preserved and this task's source changes were moved to the existing release worktree. This candidate keeps the live sport, score-sheet and policy routes. Do not publish the older checkout as this release.

## Product and evidence

- Brand: The Squad; canonical website: https://www.thesquad.pro. English interface and content; the inspected Apple locale is English (Canada), Google Play default is English (US). No additional translated locales or country-wide availability claims were added.
- Web: team rosters, events/calendar, team conversations, family access, practice resources, league/tournament workflows, scorekeeping and public spectator information; organizations can coordinate multiple team hubs. Role, membership and paid-plan entitlements control access. Evidence: `src/app/(dashboard)`, `src/lib/plan-catalog.ts`, `src/lib/pricing.ts`, and existing screenshot-based help content. This task did not repeat signed-in purchase or device tests.
- Audiences: coaches, athletes, families, school/club administrators and competition organizers. Existing `/for/*` pages explain audience-specific workflows. Existing `/sports/*` pages explain actual coordination and scorekeeping uses without claiming every sport has the same scoring engine.
- Apple: public app https://apps.apple.com/app/id6811742452; seller Tyler Ans, Sports category. App Store Connect inspection on November 3: 1.0.2 Ready for Distribution; 1.0.3/build 7 Pending Developer Release. Core mobile claims remain schedules, rosters, scores and conversations. Native subscriptions exist in review notes, but purchase/restore outcomes were not newly verified.
- Android: `pro.thesquad.app`, Play console app 4972641634682382132. Production inactive; closed testing published with 0 opted-in testers. Console requires 12 continuously opted-in testers for 14 days before applying. A test listing marked Live does not mean public production availability.
- Web plan capacities come from `PRICING_CONFIG` and the plan catalog: Pro Team 1 hub, Elite Teams 8, Elite League 18, Schools 15. Prices use the same live billing-display hook, freshness rules and public catalog endpoint as the release homepage, rather than its older static display amounts. A failed catalog request shows “Price unavailable,” never a guessed price. App store prices can differ. Account creation is free; plan access varies.

## Implemented changes

- A server metadata boundary around the existing interactive homepage; a visible descriptive H1 and plain-language product summary. Existing demos, forms and application behavior remain in the client component.
- Root metadata defaults to noindex; public discovery templates explicitly opt in. Removed the inherited homepage canonical and global SoftwareApplication/Offer claims from unrelated account and utility screens. Personal recruiting profiles and league share views are noindex, retaining existing access checks and share functionality.
- Public canonical URLs, social cards and representative structured data; homepage Organization, WebSite and web SoftwareApplication describe visible content without ratings, invented endorsements or unverifiable multi-platform parity. New pages have BreadcrumbList markup. Removed unverified social handles and keyword-stuffed root metadata.
- `/plans`: server-rendered public plan comparison and questions; `/download`: verified Apple link, Android browser/testing guidance, setup and platform limitations. Navigation links connect these to the homepage, sports and help. Support email is visible on `/how-to`.
- Existing policy, audience, sport, article, resource and template routes retained. Public page publication routes `/p/[slug]` use the www canonical and respect preview noindex; feature-disabled or missing records remain 404. No unpublished tenant records were enumerated or added to the sitemap.
- Playbook content renders in initial HTML; query-filter synchronization is isolated from the server-renderable library. PDF export preview titles no longer add a second page H1; PDF appearance is preserved.
- Sitemap adds only `/plans` and `/download` to the release's existing public catalog; no fabricated modification dates. `robots.txt` lets crawlers see utility noindex directives, while retaining the API block. Authentication is unchanged.
- Vercel previews, explicitly disabled indexing and hosted store distributions return noindex; Firebase staging declares `SITE_INDEXING=disabled`. No model-training opt-in or opt-out was changed. `/plans` is blocked by the existing native distribution routing policy so web billing comparison does not bypass store navigation controls.

## Naming and search strategy

| Surface | Before | Recommended / implemented |
| --- | --- | --- |
| Website default | The Squad — Elite Sports Team Management Platform | The Squad: Sports Team Management |
| Apple name | The Squad: Team Management | Retain — 26/30 characters |
| Apple subtitle | Schedules, Rosters & Team Chat | Retain — 30/30 characters |
| Google Play title | The Squad | The Squad: Team Management — 26/30, prepared |

Three store-name options: **The Squad: Team Management** (26), **The Squad: Sports Teams** (23), **The Squad: Team Organizer** (25). The first retains the existing Apple identity and directly states the category; the second is shorter but less explicit about management; the third emphasizes organization but omits the sports context. All fit the documented 30-character limits. Exact-phrase searches found the current Apple listing for the first option; a separate “SquaD - Sports Team Management” listing by SQUAD Inc, Ltd demonstrates that similar names exist. The other phrase searches did not establish an exact competing listing. This is limited naming research, not legal clearance or a guarantee of store-name availability. No full rebrand, bundle ID, package ID, domain or signing changes are proposed.

Priority search intents are hypotheses grounded in product features, not keyword-volume research:

1. Brand + category: “The Squad app”, “The Squad team management”, “sports team management app” → homepage.
2. Buying decisions: “The Squad pricing”, “team management plans” → `/plans`; “The Squad iPhone app”, “The Squad Android” → `/download`.
3. Tasks: team scheduling, roster management, team chat, league/tournament organization → existing relevant audience pages and guides, with application sign-in links.
4. Sport-specific workflows → existing `/sports/[sport]`, retaining distinct explanations and genuine score-sheet resources.
5. Questions and help: invitations, family access, account setup and plan differences → `/how-to`, `/download`, `/plans`.
6. Informational resources → individual coaching articles, usable resources and templates. No new thin sport/city pages were generated.

`route-inventory.csv` lists each sitemap URL and every additional page-route pattern with intent, classification and indexing treatment. Search/filter/preferences, account, admin, payment, registration, volunteer/donation share links, embeds and temporary beta flows are excluded from discovery. The publication feature `/p/[slug]` is a distinct conditional public template, not a private account page; only explicitly published, enabled records may be indexed. Query variants of public libraries canonicalize to their base page. Unknown public slugs and arbitrary missing routes must return 404.

## Store handoff

See `store-copy/README.md`, the platform JSON files and the exact plain-text field files. They include final platform-specific descriptions, URLs, character/byte counts, category recommendations, screenshot order/captions, existing asset inventory and missing native captures. No new screenshot was represented as a real app capture. Existing native screenshot archives remain untouched in `release-preparation/store-campaign-2026-09-23/`.

Apple promotional text can be changed independently, but the current pending-release version locks description/keywords. Do not cancel or release 1.0.3 to make an SEO edit. Use the next editable version/review flow for locked fields. Google Play copy can be reviewed independently of a new binary, but public distribution remains blocked by its tester/production-access requirements. Publish the website before setting `/download` as a store marketing URL.

## Official references checked November 3, 2026

- [Apple app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/): name and subtitle constraints; category and localized app identity.
- [Apple platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/): description 4,000 characters, promotional text 170, keywords 100 bytes; support URL must provide real contact information. The prepared English keyword string is exactly 100 UTF-8 bytes.
- [Apple product page guidance](https://developer.apple.com/app-store/product-page/): natural, relevant keywords and product presentation; promotional text is conversion copy, not a keyword-ranking field.
- [Google Play app setup](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en) and [listing practices](https://support.google.com/googleplay/android-developer/answer/13393723?hl=en): title 30, short description 80, full description 4,000; accurate, non-misleading metadata.
- [Google Play preview assets](https://support.google.com/googleplay/android-developer/answer/9866151): real app imagery, feature graphic and screenshot requirements. The current console confirms 1024×500 feature graphics and 2–8 phone screenshots.
- [Google noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing): crawlers must be able to fetch pages to see noindex; robots exclusions are not access control.
- [Google AI search guidance](https://developers.google.com/search/docs/appearance/ai-features): clear indexable content and ordinary search fundamentals; no special AI file required. No indexing, rich-result, citation or ranking promise is made.
- [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots): OAI-SearchBot and GPTBot serve separate search/training purposes. Existing wildcard permissions are retained. Requests using their user-agent strings are only HTTP probes, not proof of access from verified crawler IP ranges.
- [Next.js 15 metadata](https://nextjs.org/docs/15/app/api-reference/functions/generate-metadata): server metadata exports, inheritance and explicit page-level metadata.
- [Apple associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains) and [Android App Links verification](https://developer.android.com/training/app-links/verify-applinks): domain association and signed application identity are needed for native handoff.

## Native links and hosting dependencies

The inspected preserved Android release manifest contains only the launcher intent; inspected iOS entitlements contain Apple sign-in, without associated domains. Production returns 404 for both `/.well-known/assetlinks.json` and `/.well-known/apple-app-site-association`. These archived sources are not proof of the newest binary's link handling. No association files were fabricated using guessed signing fingerprints or team identifiers. Web URLs remain functional fallbacks. A native-link change needs the authoritative current native source, verified Apple team/application identity, Play app-signing SHA-256 certificate, narrow supported path list, navigation handlers, signed builds and device verification.

Production currently redirects HTTP apex → HTTPS apex (308) → www (307). Keep all new canonical/internal links on HTTPS www. Converting the hosting-level apex redirect to permanent and reducing the chain needs a scoped Vercel domain configuration change and verification; it is not falsely reported as fixed by local source edits. No domain changes were made.

Publication requires explicit authorization under the established project preference, passing the release workflow, and review of this concrete candidate. CI's full release gate (including infrastructure/rules checks and dependency audit) remains the promotion authority. This task does not authorize releasing the pending Apple binary or Android production.

## Measurement baseline and follow-up

`production-baseline.json` records the live HTTP baseline separately from local verification. On November 3 the live sitemap contained 491 URLs and the live homepage still used the old title. Homepage probes returned 200 for Googlebot, OAI-SearchBot and GPTBot user agents. Association files returned 404. These measurements predate publication of this task.

Apple Analytics overview displayed November 2 (UTC reporting), with a `dateSpec=d90` URL: 62 impressions, 3 product-page views, 1 first-time download, 1 redownload and 3.64% displayed daily-average conversion. Preserve the UI's displayed period/metric definitions; do not calculate a new conversion rate from those mixed totals. Usage, retention and purchase metrics showed Not Enough Data.

Google Play Grow users, Last 28 days: 1 device impression, 1 monthly active device, acquisitions/first opens unavailable. Store listings URL reported October 3–30: headline visitors 0, unique install clicks 0, CTR 0%; the default-listing row separately showed 1 visitor and 100% conversion. These differing scopes and tiny counts are not a meaningful performance comparison. Production was inactive and closed-test opt-ins were 0.

The signed-in Google Search Console session explicitly reported no access to the `sc-domain:thesquad.pro` property. No ownership verification or access change was attempted. No Bing Webmaster performance export or established web analytics measurement ID was available in the inspected sources. Do not invent an organic-search baseline. After approved publication:

1. Submit/refresh the sitemap in the verified Search Console property; inspect homepage, plans, download, one sport and one resource URL. Monitor canonical selection, excluded/private routes, indexing and mobile Core Web Vitals.
2. Export the prior 28 days of clicks, impressions, CTR and position by page/query, separating brand and non-brand queries. Record device/country and preserve the export date.
3. Compare 28-day windows after at least 4–6 weeks and adequate impressions; separate release effects, seasonality and marketing campaigns. Review store search impressions, product-page views, first downloads and platform-defined conversion by locale/source. Do not run experiments on negligible traffic.
4. With existing consent-aware analytics, measure public-page → signup start → completed account → team join/create, plus download-link clicks. Do not log player names, chats, emails, medical fields or payment details. Instrumentation and new tracking accounts were not added here.
5. Manually sample a fixed set of branded/category/task questions in search and answer engines; log date, engine, cited page and accuracy. Treat citations as observations, not a promised outcome.

See `verification.md` for the final measured checks and remaining failures.
