# Modern workspace production candidate

Preserves live deployment revision f2a295f5, including its Squad Pages, navigation feedback, scoped snapshot and schedule-companion fixes. Adds optional personal Modern appearance across authenticated pages, a persistent Dashboard link, role-filtered Team tools, responsive cards and bottom clearance, School Hub/Club Hub labels, event availability, and trusted cover processing. Classic remains the default.

Preserves current production alert-history API, module visibility, demo lifecycle, account and subscription logic. No billing or payment changes. Firestore preference fields and trusted-cover boundary require the candidate rules.

Local checks: TypeScript passed, lint passed with existing warnings, production build passed, isolated rules: 72 passed and 7 skipped. Combined current-live suite: 2,197 passed, 57 skipped, zero failures. Navigation assertions follow the shared hook, and existing file-URL test harnesses now support paths containing spaces.

The prior 9001 preview remains available. This release candidate uses a separate 9002 preview with synthetic emulator accounts. No production user changes are made for validation.
