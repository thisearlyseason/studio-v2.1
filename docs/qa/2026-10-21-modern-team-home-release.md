# Modern workspace production candidate

Based on production branch revision 5d0e1f23. Adds optional personal Modern appearance across authenticated pages, a persistent Dashboard link, role-filtered Team tools, responsive cards and bottom clearance, School Hub/Club Hub labels, event availability, and trusted cover processing. Classic remains the default.

Preserves current production alert-history API, module visibility, demo lifecycle, account and subscription logic. No billing or payment changes. Firestore preference fields and trusted-cover boundary require the candidate rules.

Local checks: TypeScript passed, lint passed with existing warnings, production build passed, isolated rules: 72 passed and 7 skipped. The full test suite is rerun after updating navigation assertions and correcting URL-to-filesystem conversion in existing tests for paths containing spaces.

The prior 9001 preview remains available. This release candidate uses a separate 9002 preview with synthetic emulator accounts. No production user changes are made for validation.
