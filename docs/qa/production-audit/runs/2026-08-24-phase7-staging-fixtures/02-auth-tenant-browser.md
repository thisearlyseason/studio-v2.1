# Phase 7 Auth and Tenant Browser Evidence

- Browser result: `NOT RUN — EXACT STAGING PROJECT NOT PROVEN`
- Browser contexts opened: `0`
- Raw browser artifacts retained: `0`

The browser stage was contingent on an exit-0 read-only staging preflight followed by an exact seed and inspect. The repaired adapter reached the resolved-project guard, but Application Default Credentials resolved a non-staging identity. Opening authenticated contexts or attempting to use credentials after that mismatch would have bypassed the approved safety sequence. No browser scenario was started.

## Approved scenario disposition

| # | Approved scenario | Planned viewport(s) | Expected contract | Task 4 disposition |
| --- | --- | --- | --- | --- |
| 1 | Verified owner login, revocation-checked session, permitted landing | `390×844`, `1440×900` | Login and protected landing succeed | `NOT RUN` — no seeded owner identity |
| 2 | Unverified and suspended identities deny protected data | `390×844`, `1440×900` | Both fail closed | `NOT RUN` — neither positive baseline nor suspended transition existed |
| 3 | Logout and stale/revoked session reuse | `390×844`, `1440×900` | Logout clears access; stale/revoked reuse denied | `NOT RUN` — no authenticated session existed |
| 4 | Owner, assistant, and ordinary-member permitted routes/controls | `390×844`, `1440×900` | Existing role policy is honored | `NOT RUN` — no seeded role identities |
| 5 | Direct disallowed staff, institution, finance, and admin routes/APIs | `390×844`, `1440×900` where responsive | Server-side denial, not navigation hiding alone | `NOT RUN` — no seeded identities |
| 6 | Fake-superadmin profile-only role | `390×844`, `1440×900` | `/admin` and admin APIs deny access | `NOT RUN` — no fake-superadmin fixture |
| 7 | Changed Team A/Team B route, query, and API identifiers | `390×844`, `1440×900` where responsive | Cross-tenant reads/mutations denied | `NOT RUN` — no tenant fixtures |
| 8 | Multi-organization authorized switching | `390×844`, `1440×900` | Only authorized teams are selectable; prior-tenant listeners/navigation disappear | `NOT RUN` — no multi-org identity or teams |
| 9 | Removed-member post-removal access | `390×844`, `1440×900` | UI, direct API, and data access denied after removal and revocation | `NOT RUN` — no positive baseline or removal transition |

## Required evidence fields

For every scenario, final URL, visible outcome, applicable API status, same-origin request failures, application-console errors, page errors, horizontal overflow, and post-action Firestore state are `NOT AVAILABLE` because no context was opened. Reporting zeros for those signals would be misleading; only the context count and retained-artifact count are zero.

The Playwright prerequisite itself was confirmed read-only: `npx` was available, the bundled CLI reported version `0.1.18`, and `open --browser chrome` supports the system Chrome channel. No session, persistent profile, screenshot, trace, video, storage state, cookie, token, or credential value was created or retained.

## Coverage conclusion

No matrix row is promoted by either attempt. The four directly targeted rows remain `BLOCKED`. Passing local tests, the repaired harness crash, and a healthy anonymous `/api/health` response do not substitute for missing exact-project identity, hosted fixture, session, permission, responsive, network, console, and persistence evidence.
