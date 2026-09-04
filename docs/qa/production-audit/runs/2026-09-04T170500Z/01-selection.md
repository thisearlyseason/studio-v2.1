# Final Production Testing — Remaining-Only Selection

Source of truth: `docs/qa/production-audit/05-coverage-matrix.md` at baseline commit `fcb6e91d`.

## Baseline status

- Total rows: 88
- PASS: 6
- FAIL: 0
- BLOCKED: 81
- NOT APPLICABLE: 1

## Excluded established PASS rows

These rows already have clear supported PASS evidence and will not be broadly repeated:

1. Marketing/legal — homepage navigation, pricing, demos
2. Marketing/legal — audience/sport/safety/how-to/legal
3. Dashboard/shell — active team switch
4. Dashboard/shell — alerts/history/acknowledge
5. Sports Hub — resource/PDF/video/download
6. Companion — schedule todos/local sync

The schedule companion receives one focused regression because its offline shell shares the root service worker changed after that PASS. Authentication and permission-critical paths may also be repeated only as focused final regression gates.

Time Out remains **NOT APPLICABLE** because the product was intentionally retired and must not be restored.

## Selected emulator/browser batches

The following incomplete rows have meaningful work that can be exercised safely with the current synthetic identities and loopback data. A row remains BLOCKED unless every required positive, negative, permission, persistence, responsive, and integration dimension is proven.

### Identity, lifecycle, and route policy

- Authentication: email/password login; logout/revocation/multi-tab; password reset
- Account lifecycle: disable/delete/cancel/purge
- Signup/onboarding: role signup, youth invitation, missing-profile onboarding
- Demo: seed/use/exit/expiry cleanup
- Dashboard/shell: role landing and route policy

### Teams, organizations, people, and family

- Teams: create/capacity, join code, settings/branding, module visibility, reset/delete/quota
- Organization: overview, squad allocation, waivers/documents/admins
- Roster: lifecycle, search/filter/sort/export, parent/player self views
- Attendance and recruiting
- Family: children/invites/team cards, schedule/waivers/payments, youth login

### Scheduling, content, and communication

- Events, RSVP, calendar, ICS, reminders
- Practice plans, drill/playbook, film/upload/watch
- Feed, chat, polls
- Email/newsletter safe validation paths
- Push negative preferences and targeting where browser/emulator support exists
- Files/media, waivers/signatures, forms, safety, and games

### Competition, commerce, public, and administration

- Leagues and tournaments: lifecycle, configuration, schedules, registration, scoring, public projections
- Billing/Stripe Connect/payments using validation and authorization paths only
- Fundraising, donations, volunteers, facilities, and equipment
- Remaining Sports Hub preference/admin/RSS behavior
- Public portals and embeds
- Administration access, account controls, plans, and admin modules
- PWA/offline cache/privacy negative paths
- Background and operations paths where observable locally

## Irreducible or provider-dependent dimensions

These remain BLOCKED unless existing approved test accounts, provider dashboards, physical devices, or deploy controls make them directly provable during this run:

- Complete Stripe test checkout, subscription mutation, portal, Connect onboarding, and signed standard/Connect webhook lifecycle
- Complete Resend delivery-event lifecycle and durable mailbox delivery for every email type
- Physical iPhone/iPad install, update, offline, notification receipt, and tap-through
- Android denied-permission, stale-subscription, opt-out, logout/user-switch, reinstall/update, and broader targeting cases that require fresh physical-device actions
- FCM reminder scheduler receipt on a real device
- Full multi-format league/tournament scheduling and external scorekeeper/referee workflows without deterministic fixtures
- Production rollback drill, scheduled-job execution, and provider-console-only operational proof

## Evidence rule

Automated source assertions or a partial browser path may strengthen a row but do not convert it to PASS. Every row retains one terminal result: PASS, FAIL, BLOCKED, or NOT APPLICABLE.

## Completion disposition

All safe deterministic batches made possible by the supplied loopback identities were executed. Six defects were discovered, repaired test-first, and retested in real Chrome. Provider/device/deployment-dependent dimensions remain explicitly BLOCKED; none was inferred from local automation. The strict row totals therefore remain 6 PASS, 0 FAIL, 81 BLOCKED, and 1 NOT APPLICABLE. See `02-browser-and-fix-evidence.md` and `03-final-verification.md`.
