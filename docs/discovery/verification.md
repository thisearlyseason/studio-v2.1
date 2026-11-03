# Verification — 2026-11-03

Candidate: existing `modern-team-home-release` worktree, branch `codex/discovery-seo-aso-20261103`. Node 24.22.1, Next.js 15.5.28. No publication performed.

| Check | Result |
| --- | --- |
| Production build | Passed; 667 static pages generated. Includes TypeScript and ESLint checks, with existing warnings. |
| Full application suite | 2,490 tests: 2,426 passed, 64 skipped, 0 failed. |
| Focused final pricing/discovery checks | 10/10 passed after switching the new price table to the existing live-catalog hook. |
| Rendered discovery routes | 493/493 HTTP 200; self-canonical HTTPS www URLs; indexable; title/description/OG metadata; one H1; valid JSON-LD wherever present. |
| Sitemap parity | Retains the production baseline's 491 URLs and adds `/plans`, `/download`. No duplicate URLs or titles. |
| Internal linked URLs | No HTTP error responses among the internal destinations linked from the 493 pages. This does not certify every external provider URL or fragment anchor. |
| Utility/account indexing | Login/signup, beta, pricing, Sports Hub search/preferences are noindex; dashboard redirects to login. Invalid sport, audience, template and arbitrary route return 404. |
| Preview/staging/store indexing | Isolated environment tests confirm empty sitemap and noindex public metadata; response header configured in Next.js; staging config declares disabled indexing. No staging deployment or signed native runtime test claimed. |
| Store copy | Apple 26/30 name, 30/30 subtitle, 100/100 UTF-8 keyword bytes, 131/170 promo, 1,266/4,000 description. Play 26/30 title, 76/80 short description, 1,350/4,000 full description. Exact-field files match JSON. |
| Native route policy | New `/plans` route is covered by existing store-distribution blocked-path checks. No bundle ID, signing or native binary change. |
| Source whitespace | `git diff --check` passed. |
| Dependency audit | **Failed release threshold:** 42 reported advisories (11 high, 31 moderate) in the unchanged lockfile; no critical. See `dependency-audit-summary.json`. No automatic major/downgrade fix applied. |

Browser checks used the local production build, not the live site. Download page checked at 1530px desktop and 390×844 mobile; homepage checked on desktop and mobile; plans, Playbook, hockey landing, parents landing, article, score-sheet resource and template checked at 390px. Each checked mobile page had document scroll width equal to 390px. New text, headings, navigation and layout were readable. The Playbook `?type=score-sheet` view rendered 13 resource links and kept the base-page canonical. Existing hero animation and optional-chat prompt remain.

The new plans table renders names/capacities initially and refreshes amounts using `useBillingDisplayPrices`, the same hook as the homepage. The local build has no production Stripe credentials, so it honestly displays “Price unavailable” after a failed catalog request. A separate read-only production catalog request returned USD prices: 19.99/199, 119/1,119, 279/2,790, 175/1,750 for the four base plans; the exact response summary is in `live-price-baseline.json`. This verifies the public catalog, not checkout or purchase behavior.

First-load build sizes are recorded in `check-results.txt`. These are bundle measurements, not Lighthouse scores, field Core Web Vitals, cold-load device timings or demonstrated ranking gains. No speculative performance score is reported. No dependencies were added to application manifests.

`route-verification.csv` contains every tested public route; `route-verification-summary.json` records the latest local audit and utility results. `production-baseline.json` is separately identified live evidence. Existing native screenshot archives were preserved; current signed-device screenshot capture, universal/app-link verification and complete release CI are not claimed.

Publishing dependencies:

1. Resolve or formally disposition the existing high-severity dependency findings and pass the repository's complete release gate before promotion. Infrastructure/Firebase emulator verification was not rerun for this metadata/content-only task; 64 suite cases were skipped under the local test environment.
2. Obtain explicit approval for the website/store publication under the established release preference. Do not deploy the older dirty checkout; use this prepared release-based branch.
3. Apple 1.0.3 is pending developer release. Locked version metadata must use an editable version/review workflow; no approved release was cancelled or released here. Publish `/download` before changing store marketing URLs.
4. Google Play production is inactive; 0 closed-test opt-ins were observed. Meet the console's 12-testers/14-continuous-days requirement and obtain production access before a public Play badge.
5. Search Console denied the signed-in account access to the domain property. An owner must provide property access or complete verification; no ownership/access change was attempted.
6. Native link activation needs the authoritative latest native source and signing associations, followed by device checks. Current native screenshots for the proposed sequence remain a separate capture dependency.

Storage: reused the existing release worktree; no repository copy or new worktree. Its required dependency installation was necessary because its locked framework versions differ from the original checkout. Build caches temporarily took the disposable footprint above 2 GB; generated caches are removed after verification, preserving source, final reports, existing release archives and the useful dependency installation.
