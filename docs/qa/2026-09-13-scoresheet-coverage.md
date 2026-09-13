# Scoresheet coverage follow-up — 2026-09-13

The original 14 sports now have sport-specific printable scoresheets: soccer, basketball, baseball, rugby, football, cornhole, gymnastics, pickleball, tennis, golf, swimming, esports, ultimate frisbee, and disc golf. Together with the eight expansion sports, all 22 landing pages have a matching scoresheet link. The shared landing-page type requires a scoresheet slug, and coverage tests enforce catalog and route consistency.

## Verified locally

- 60 focused regression tests passed (`tests/preview-regressions.test.mjs` and `tests/sport-expansion.test.mjs`).
- Typecheck, changed-file ESLint, production build, and `git diff --check` passed.
- Browser audit against the production build at localhost:9001 visited all 22 sport pages, clicked each scoresheet link, reloaded each sheet, and checked its two-page content and print action.
- All 22 sheets appeared in the template library and sitemap.
- Twelve responsive checks at 390px and 768px covered pickleball and soccer landing pages, pickleball/golf/gymnastics sheets, and the template library; no page overflow was found.
- Exported 44 PDFs (all 22 sports on both A4 and Letter). Every PDF contained exactly two nonempty pages. Visually inspected rendered pages for all 14 added sports; no clipped tables or footer overflow found.
- No browser page errors or console errors were recorded.
- Read-only code review reported no actionable findings.
- Refreshed the user's existing pickleball preview and confirmed the new scoresheet callout and destination in the browser.

Evidence: `output/playwright/scoresheet-coverage/` contains the audit script, browser results, build log, mobile screenshot, exported PDFs, pagination results, and rendered contact sheets.

These checks apply to the local production build. No hosted deployment was performed. The unrelated existing TournamentBracket change was preserved.
