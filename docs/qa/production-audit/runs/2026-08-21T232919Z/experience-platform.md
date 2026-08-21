# Responsive, Cross-Browser, and Platform Evidence

PASS evidence in Chromium:

- Homepage has no horizontal document overflow at 320×844, 390×844, 768×1024, 1024×768, or 1440×900.
- Login and signup render at 390×844 with named controls and basic keyboard focus.
- `/schedule-app` renders the signed-out Install/Sync and To-Do surfaces at 390×844.
- `/manifest.json` is valid, standalone, includes a start URL and icons.
- `sw.js` registers and contains the schedule-app cache path.

BLOCKED:

- Firefox and WebKit executables are unavailable.
- Authenticated role layouts, real touch hardware, PWA install/update/offline/logout cache proof, and local sync require missing accounts/devices.
- The Time Out launcher has no reachable UI in the tested application surface.

Console errors: 0. Unexpected network failures: 0.

Artifacts: `output/playwright/2026-08-21T232919Z/experience-platform/`.

