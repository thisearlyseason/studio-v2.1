# Primary-source citations

Finding: `a_external_sources` (was **0.6/4**, Partial). Source audit: `37c76590-4133-408d-8abd-11aa2f80b9b1` (`geo-audit@v5`). Reviewed November 16, 2026.

## Scope and implementation

Read the live article bodies at all 18 supplied URLs before editing: all returned HTTP 200 and had no external article-body links. Confirmed Next.js 15.5.28 and the shared article route in this repository.

Added a `Sources and further reading` section to 238 repository-owned Sports Hub articles through `src/lib/sports-hub-article-sources.ts`. Each slug has a deliberate topic assignment, with at least two distinct external source organizations/domains. References use the source owner's official guidance, documentation, or an original research paper, with notes explaining the source's scope. The existing renderer emits normal server-rendered HTTPS anchors, not client-only widgets or nofollow links.

The three articles that already cite independent primary sources remain unchanged: `how-to-run-a-youth-sports-camp`, `how-to-start-a-youth-sports-nonprofit`, and `youth-sports-team-name-ideas`. The public CMS article endpoint returned zero additional articles at review time. New catalog articles need an editorial source assignment; the coverage test catches missing citations rather than guessing references from a title at runtime.

Existing prose, titles, authors, dates, hero, pricing and other SEO settings were preserved. A comparison against the original catalog verified citation-only additions and identical metadata for every article.

## Link verification

Fetched all reference destinations with HTTP GET and/or the web reader and verified the expected document/title. Several publishers reject command-line clients with HTTP 403; the web reader resolved their actual source pages. Replaced an obsolete FTC URL that returned 404 and a Health Canada redirect page with the current source URLs. Canonical Google Drive documentation is used instead of its older redirect. Source notes distinguish official training descriptions from full paid courses, examples from other sports from applicable rules, and small original studies from universal recommendations.

## Existing claims needing a separate editorial review

The added references do not establish every assertion already in these articles. In particular:

- `mental-performance-youth-athletes`: the existing “50–90% of performance” statistic has no identified supporting primary study.
- `technology-in-sports-management`: the existing “15–25 hours” and “50–70%” savings claims have no identified underlying dataset.
- `referee-training-programs`: the existing “over 40%” referee-loss statement needs a dated U.S. Soccer dataset; the article's example certification levels are not federation certification.
- `tournament-scheduling-guide`: eight four-team round-robin pools imply 48 pool games plus 15 bracket games, not the existing 24 plus 15 calculation. That unrelated arithmetic was left unchanged under this finding's narrow scope.

No quotes, datasets, endorsements or study results were invented to fill these gaps.

## Verification

The catalog coverage test in `tests/sports-hub-article-sources.test.mjs` checks two external domains per article, valid/unique slug assignments and crawlable descriptive HTTPS anchors. Existing rich-text tests, targeted lint and TypeScript checks also apply.

On any of the 18 supplied pages, scroll to **Sources and further reading** at the end of the article, before the tags. Follow each source link and confirm that it opens the named official document or original paper. View page source and search for the source URL to confirm the links are present in served HTML. Then re-run the same audit; the original comparison score remains 0.6/4 until it is rerun.
