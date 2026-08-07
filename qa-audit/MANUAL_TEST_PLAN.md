# Manual Test Plan

Run only in an isolated Preview with test credentials; do not use production customer data or live charges.

## Accounts and roles

Create superadmin, owner A, owner B, staff A, parent A, player A, parent/player B, league creator, school admin, anonymous/demo, and public spectator accounts. Create separate Team A/Team B, leagues, tournaments, and schools.

## Mandatory flows

1. Auth: signup, verification, email/password reset, OAuth, logout, expired session, duplicate email, invite expiry/reuse, disabled/deleted accounts, protected deep link/API.
2. Isolation: change every team/league/tournament/school/player ID in UI, direct Firestore, and API requests. Expect deny/no disclosure for horizontal and vertical escalation.
3. Billing: each plan/cycle; checkout retry; portal; upgrade/downgrade; extra seats; failed payment; trial; cancel/restart; duplicate/out-of-order/invalid Stripe webhooks; refund/dispute/customer deletion.
4. Messaging: team broadcast, targeted broadcast, notification preference off, FCM permission/token refresh/multiple devices/logout, Resend templates/links/recipient isolation/unsubscribe.
5. Files: allowed/denied types, renamed MIME, oversize, private/public asset reads, deleted assets, cross-team path manipulation, upload quotas.
6. Recruiting: after SEC-001 remediation, anonymously verify only whitelisted public fields and assets; no player/guardian IDs, DOB, contacts, invites, evaluations, or arbitrary child collections.
7. UX/a11y: Chrome/Safari/Firefox/Edge plus mobile Safari/Android Chrome at 320, 375, 390, 768, 1024, 1440, 1920 px; keyboard-only dialogs/menus, screen reader labels, focus, contrast, long values, slow/offline network, refresh/back/deep links.

## Acceptance evidence

Record account role, tenant, route/API request, expected result, actual result, screenshot/log correlation ID, and tester/date. Treat any unauthorized read/write, payment entitlement mismatch, raw error, duplicated delivery, or permanent loading state as a release blocker.
