# SEO audit completion record

Source: https://app.heycatch.ai/audit/hck_pk_APvOG4sebjLfK6k-1DXlNpFKJICaSF8m/seo

The public report was last checked November 15, 2026 and scores 76/100. Read all 15 open findings and their complete instructions before implementation. It has no separate Quick wins / Do this quarter / Bigger bets action plan. Exact original scores are preserved in `seo-audit-baseline-2026-11-15.json`; scores below are not a claim about a rerun.

## Findings

| Code | Was | Implementation |
| --- | --- | --- |
| a_external_sources | 0.6/4 | Retained primary-source citations in every remaining guide; corrected the previously flagged game count and removed unsupported performance/time-saving/referee-loss statistics. |
| a_ai_slop | 1.0/3 | Retired the title-swap generator, materialized distinct parent drafts, removed repeated parent boilerplate, consolidated duplicate subjects, added worked examples and 12 existing product screenshots labelled demo data. The shared newsletter is no longer an article subheading or snippet text. |
| c_thin | 0.2/2 | Consolidated 179 URLs into 62 fuller guides; 104 were title-swap generated pages and 75 were overlapping editorial pieces. Specific material from the latter remains in anchored sections. Added relevant operational examples instead of generic word-count padding. |
| c_title | 0.9/2 | Reviewed concise article search-title phrases, bounded rendered suffixes, unique page metadata, corrected duplicate legal-page branding and overlong site titles. CMS publishing has an explicit search-title field and length check; overlong values are flagged rather than silently cut. |
| a_author_schema | 0.0/3 | Article JSON-LD points to real contributor pages. The four owner-confirmed named reviewers use Person; editorial teams use Organization. Individual profile URLs remain empty until supplied. |
| t_sitemap_fresh | 0.0/2 | Sitemap uses the published catalog and public CMS records, omits retired article URLs, includes contributor pages and records actual editorial/CMS modification dates. Added a public IndexNow ownership file, authenticated notification on CMS publish and a post-deployment submission command. |
| a_author_page | 0.0/2 | Seven contributor pages provide factual review-topic bios and credited article lists, linked from each article. No years, qualifications or external profiles were invented. |
| c_question_headings | 0.1/2 | Query-specific opening questions and direct answers, plus practical question-shaped headings in revised parent guides and worked examples. |
| c_image_dimensions | 0.1/1 | Measured committed assets and added intrinsic width/height to audience and sport images while retaining positioned cropping. Product screenshots declare their real dimensions. |
| g_definition | 1.2/2 | Plain opening definitions in revised articles, the audited organizer/school pages and relevant Sports Hub index pages. Existing correct definition openings were retained. |
| c_meta_description | 1.6/2 | Article and site descriptions use 110–160 characters, with specific edits where a short excerpt was insufficient. Passing descriptions are preserved. |
| g_self_contained | 2.7/3 | Named volunteer and sports-administration processes explicitly in the two flagged guides; technology evaluation uses a defined pilot rather than unsubstantiated savings. |
| g_sentence_length | 1.7/2 | Split index-page introductions and used short claim/answer sentences in revised guide openings and examples. |
| a_sameas | 0.0/2 | Added the two owner-supplied company profiles: Facebook and Instagram. A third company-owned profile is still needed. |
| c_image_format | 0.1/1 | Lossless WebP brand assets and optimized image delivery, replacing the PNG/unoptimized assets on the audited audience pages. |

## Editorial consolidation

`src/lib/sports-hub-article-redirects.ts` is the complete reviewed redirect/merge map. Every destination is an existing published guide; there are no redirect loops or chains. Merged substantive pieces link to their retained section using a stable fragment. Article lists, related links, counts and the sitemap use the 62-guide catalog. One generated entry had overwritten the specific parent anxiety guide; the specific draft is restored.

The homepage hero and pricing copy were not edited. Existing full-score findings were not used as a work list. Shared image/metadata fixes apply consistently where those components render.

## Honest modification dates

November 16, 2026 is this actual editorial release date, including new article byline links and site metadata/brand asset changes. It is committed as a content revision, not computed from a build or request clock. Future CMS records use their stored `updatedAt` or publication timestamp. CMS publication revalidates the sitemap and article path before sending IndexNow a notification.

After deployment: `node --import tsx scripts/seo/notify-indexnow.mjs` verifies the public key and submits the current sitemap URLs in one POST. HTTP 200/202 acknowledges receipt, not guaranteed indexing.

## Items requiring the owner or reviewers

- Supply each reviewer’s actual professional profile URL and any verified career/qualification details to expand the bios. No individual `sameAs` links were guessed.
- Supply a third company-owned profile. The owner confirmed only https://www.facebook.com/thesquadpro and https://www.instagram.com/thesquadpro.
- Have the named reviewers sign off on the revised material. The audit explicitly asks for a real human edit of 10–20 pieces. Agent edits and hypothetical examples are not represented as human sign-off or customer evidence. Suggested first batch: the 11 parent guides, tournament scheduling, volunteer program, digital registration, team travel, sports nutrition, recovery science, youth development, referee training and post-season evaluation.
- Real measured program results can replace the hypothetical examples later. No customer data, outcomes, testimonials or endorsements were invented.

## Verification

Targeted regression, source-citation, metadata, redirect and IndexNow-payload tests cover the catalog. Browser checks cover contributor pages, retained-section redirects and audience image loading/layout. Rendered HTML checks verify all 62 article titles, descriptions, primary-source links and actual visible-text word counts. Production checks are performed after the release gate and deployment; the report itself must be rerun to obtain new scores.
