# Sports production release — 2026-09-13

Release candidate based on the current production revision f3f44d12c6415430070b2bd816f7eb4d79f59f5a. The earlier local preview used an older checkout; its patch was integrated onto production to preserve current application behavior.

- 26 sport landing pages and matching printable templates, including the 22 preview sports and the four existing hockey, slo-pitch, field-lacrosse, and box-lacrosse routes.
- All sport cards and heroes use the same photography series. Four retained routes reuse related equipment photography; aliases are recorded in the asset manifest.
- Existing editorial copy, footer, newsletter, original PDF packs, scoring guides, and store pricing restrictions are preserved.
- Both the hero CTA and resource fallback reach the matching scoresheet.
- Local full suite: 1,520 passed, 8 skipped, zero failures. Typecheck passed; lint passed with existing warnings. Production dependency audit: zero vulnerabilities.
- Read-only integration review: no remaining actionable findings.

Earlier preview evidence remains in the separate sport-expansion and scoresheet-coverage reports and does not represent the newer production baseline. Hosted checks will be recorded after release.
