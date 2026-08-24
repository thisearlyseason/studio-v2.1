# Phase 3 Fix Verification — Sanitized Evidence

**Run:** `2026-08-21T232919Z`\
**Scope:** BUG-001 and BUG-002 post-fix and follow-up verification only. Request entries below retain only the application method, path, status, and count.

## BUG-001 — Event deletion confirmation

| Check | Sanitized result |
|---|---|
| Viewport and flow | Chromium desktop; opened deletion for `Conditioning Lab`, selected Cancel, reloaded, then selected Confirm Deletion and reloaded. The confirmed action closed the alert dialog. |
| Request observation | Opening the confirmation: `POST /api/teams/events/action`, 0 requests. Confirming deletion: `POST /api/teams/events/action`, HTTP 200, 1 request. |
| Console | 0 application errors; 0 warnings. |
| Regression | Node regression passed 1/1; rendered event-confirmation regression passed 1/1, including one callback per open cycle and reset after reopening. |
| Screenshot | `output/playwright/phase3-post-fix/bug-001/bug-001-post-fix.png` |

Cancel preserved the event after reload; the confirmed deletion removed it after reload.

## BUG-002 — Sports Hub responsive search

| Check | Sanitized result |
|---|---|
| Viewport and flow | Chromium at 390×844 and 768×1024: one labelled compact search anchor, full input hidden, 0 nested header buttons, zero overflow, and keyboard activation. At 1024×768 and 1440×900: compact link hidden, full input visible at 349.27 px and 384 px, 0 nested header buttons, zero overflow, and full-search submission. |
| Request observation | Compact-search navigation: `GET /sports-hub/search`, HTTP 200, 1 successful navigation. Full-search submission: `GET /sports-hub/search`, HTTP 200, 1 successful navigation. Unexpected failed requests: 0. |
| Console | 0 application errors; 1 unrelated development-only LCP warning at 768×1024. |
| Regression | Node regression passed 1/1; rendered Sports Hub header regression passed 1/1. |
| Screenshots | `output/playwright/phase3-post-fix/follow-up/sports-hub-390.png`, `sports-hub-768.png`, `sports-hub-1024.png`, and `sports-hub-1440.png` |

## Final follow-up gates

- `npm test`: 387/387 Node tests and 2/2 rendered tests passed.
- `npm run typecheck`, `npm run lint` (0 errors; 1,865 baseline warnings), `npm run test:rules` (38/38), and `npm run build` (564 static pages) passed.
- `npm --prefix functions run build` passed after `29be933e` pinned dev-only jsdom to `24.1.3`, restoring Functions-compatible dependency resolution without changing Functions configuration or production dependencies.
- Follow-up commits: `4391b0a6`, `40baede7`, `17580a1d`, `1fc7095f`, `43927c64`, and `29be933e`.

Raw network traces were removed after final review. This file and the listed screenshots are the retained Phase 3 verification evidence; Phase 4 remains responsible for independent verification of the BLOCKED coverage.
