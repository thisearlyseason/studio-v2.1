# Pre-Launch QA Checklist - 2026-08-10

Status legend: `[ ]` not tested, `[~]` partial, `[x]` passed, `[!]` failed, `[FIXED]` repaired and retested, `[B]` blocked.

## Release gates

- [x] TypeScript: `npm run typecheck`
- [x] Unit/integration suite: 328/328
- [x] Firestore rules suite: 34/34
- [x] Next production build: 561 generated pages
- [x] Functions TypeScript build
- [x] Root and Functions production dependency audit: 0 vulnerabilities
- [~] ESLint exits 0, but reports 1,877 warnings
- [x] `git diff --check`

## Authentication and authorization

- [x] Anonymous protected-route redirect
- [x] Demo login/seed: Squad Pro, Parent, Player, School, League Creator
- [x] Fifteen-minute demo expiry and sign-in redirect
- [x] School admin direct `/admin` denial
- [x] League-only direct `/facilities` denial
- [FIXED] Parent/player direct `/coaches-corner` no longer enters the global error boundary; both redirect to their allowed hub
- [x] Authorized Squad Pro staff still load Coaches Corner after the fix
- [~] Cross-organization ID tampering covered by rules/API tests; exhaustive UI mutation attempts not completed
- [B] Real invitation acceptance, verified-email, password-reset, and multi-tab logout require durable QA mailboxes/accounts

## Scheduling

- [x] Open schedule and activity dialog
- [x] Required-field validation on empty activity
- [x] Create game and confirm it in the schedule
- [x] Refresh persistence
- [x] Edit game and confirm changed values
- [FIXED] Activity form description and icon-button accessible names
- [FIXED] Duplicate close controls no longer overlap/intercept clicks
- [x] Event detail close/delete controls have accessible names
- [~] Practice/meeting, recurring, conflict, cancellation, timezone, and notification variants not all exercised through the UI

## Parent and athlete isolation

- [x] Parent demo has two distinct children: Junior Guest/Strikers and Alex Guest/Lakers
- [x] Separate schedules and waiver assignments appear per child
- [x] Two teams and family balance `$365` displayed
- [x] Signed Junior's Annual Liability Waiver
- [x] Pending count changed 6 to 5; signed count changed 0 to 1
- [x] Alex's three waivers remained unsigned after Junior's signature
- [~] Child-specific forms, payments, drills, notifications, volunteer, and fundraising mutation paths not all completed
- [B] Payment completion/refund/receipt blocked without payment-provider test credentials

## Role surfaces

- [x] Squad Pro staff dashboard and Coaches Corner load
- [x] Parent Family Hub with two children
- [x] Player dashboard and staff-route denial
- [x] School demo seeds five squads and institution context
- [FIXED] Free League Creator demo can create one interactive league without weakening ordinary anonymous-account restrictions
- [FIXED] League Creator role can edit owned league identity/slug and access team, player, and schedule-management controls without an active team
- [x] League create and edit values persist after refresh; special characters and division values remain intact
- [x] Free demo quota excludes the seeded showcase, permits one created league, then renders `League Limit Reached`
- [FIXED] League create/edit and tournament create dialogs expose descriptions and accessible icon/remove-button names
- [~] School second-admin invitation UI discovered; no email invitation sent
- [~] Remaining league lifecycle and tournament surfaces have automated algorithm coverage but incomplete UI certification
- [FIXED] Tournament wizard blocks zero-squad deployment with an explicit Phase 2 prerequisite message
- [ ] Scout persona end-to-end UI workflow
- [ ] Volunteer persona end-to-end UI workflow

## Responsive and observability

- [x] Parent Family Hub at 390x844: no document-level horizontal overflow
- [x] Player dashboard at 768x1024: no document-level horizontal overflow
- [x] Priority-alert modal fits and remains actionable at both sizes
- [x] Clean responsive screenshots captured after dismissing the alert
- [x] Console checked on repaired scheduling, parent waiver, player denial, and staff access paths
- [x] League create returned 201 with zero console errors/warnings; one intentional second-create request returned the expected 409 before the UI quota state was repaired
- [~] One recoverable Firestore transport retry observed during the larger audit
- [~] Demo expiry cleanup produced one `/api/demo/exit` 403 before successful local session deletion

## Major incomplete UI certification

- [B] Real Stripe payment, refund, partial payment, tax, and receipt flows: provider test credentials unavailable
- [B] Real email and push delivery: provider credentials/devices unavailable
- [~] Join/leave/invite/decline team lifecycle
- [~] Athlete create/edit/remove and multi-team lifecycle
- [~] Volunteer capacity/completion/notification lifecycle
- [~] Fundraiser publish/donate/cancel lifecycle
- [FIXED] Fundraising campaign creation now requires a deadline and positive goal before deployment; malformed no-deadline campaign no longer crashes the page
- [~] Scout portal publish/search/share/archive lifecycle
- [~] League forms, waivers, finances, and public/private portals
- [~] Tournament wizard Phase 1-4 navigation and required-field checks pass; zero-squad deployment is blocked with explicit guidance; populated deployment and all-format advancement remain open
- [~] Score edit/reset and bracket propagation through the UI
- [~] Community multi-user post/comment/reaction lifecycle
- [~] Chat multi-user ordering/read state/attachments
- [~] Drill/playbook/practice-plan create/edit/reorder/assign lifecycle
- [~] Facility/field create/edit/conflict/assignment lifecycle
- [x] Squad Pro facilities browser smoke: enroll facility, add field, rename field, and confirm scheduled-resource deletion returns a conflict with linked records
- [~] General form builder and submission lifecycle

Conclusion: **PASS WITH ISSUES** for the exercised release gates and smoke paths. The application is **not fully launch-certified** until the major partial/blocked workflows above receive UI/provider validation.
