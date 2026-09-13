# Sport pages, photography, and printable scoresheets

Implemented locally in `studio-v2.1`. No production deployment was performed.

## Delivered

- All 22 sports use a cohesive photographic equipment-and-venue series. Each sport card and its landing-page hero use the same asset, focal position, and alt text.
- Eight new sport pages: volleyball, ice hockey, softball, lacrosse, cricket, badminton, table tennis, and handball. Each has distinct program copy, operational details, FAQs, and metadata.
- The `/sports` directory and sitemap include every new sport.
- Eight printable scoresheets are linked from the sport pages and the Sports Hub template library. The library includes a Scoresheets filter.
- Each sheet has two pages, sport-specific match/innings records, and detailed logs. These are blank templates for printing or saving through the browser print dialog.

## Photography assets and prompts

The built-in `image_gen` tool generated all 22 images using the soccer photograph as the visual reference for the remaining series. Optimized 1600 × 900 WebP assets are saved in `public/images/sports/photography/` (about 2.1 MB total). The exact reference prompt, shared series prompt, and individual subject prompts are saved in [sports-photography.json](../assets/sports-photography.json).

The original image collection remains in place; sport landing pages reference the new photography directory.

## Verification

- `npm test`: 441 tests passed, zero failures.
- `npm run typecheck`: passed.
- ESLint for changed TypeScript, TSX, and test files: passed.
- `npm run build`: passed on the final implementation, including the print-spacing correction.
- Browser audit against a local production server: all 22 sport pages loaded with matching card/hero image sources and decoded images; all eight scoresheet links, reloads, print handlers, and template-filter entries passed. No page errors.
- Responsive checks at 390 px and 768 px on the sports index, volleyball page, ice hockey page, cricket scoresheet, and template library: no horizontal document overflow. Scoresheet tables scroll within their container on narrow screens.
- All eight scoresheets exported through Chromium in both A4 and Letter formats: 16 PDFs, each exactly two pages, both footers present. Rendered and visually inspected all 16 Letter pages, including dense cricket, lacrosse, and handball records.
- Independent code review identified duplicate React column keys in the cricket table. Fixed with index-and-label keys. No other actionable review findings.
- `git diff --check`: passed.

Evidence is saved under `output/playwright/sport-expansion/`: `browser-results.json`, `pdf-results.json`, build/test/lint logs, desktop/mobile screenshots, PDFs, and the print contact sheet.

The pre-existing edit to `src/components/TournamentBracket.tsx` was preserved and not modified by this task.
