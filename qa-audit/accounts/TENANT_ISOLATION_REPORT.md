# Tenant isolation report

## Automated result

No cross-account or cross-organization access succeeded in the emulator matrix.

| Boundary | Attempt | Result |
|---|---|---|
| User profile | outsider reads another `/users/{uid}` | Denied |
| Team | outsider reads Team A | Denied |
| Removed membership | removed member reads Team A/chat | Denied |
| Linked youth | invited youth reads own team | Allowed |
| Chat | member uses another team context or impersonates author | Denied |
| Alerts | player reads coach alert; wrong target reads targeted alert | Denied |
| League | outsider reads/query-discovers League A | Denied |
| Club | outsider reads owner subscription metadata | Denied |
| Facility | outsider reads operational venue data | Denied |
| Subscription | outsider reads another subscription | Denied |
| Player/contact | outsider reads private recruiting or guardian contact | Denied |
| Storage | outsider/unverified/suspended reads private media | Denied |
| Demo | anonymous session B reads session A demo team | Denied |
| Legacy invites | ordinary user reads global recipient email | Denied |
| Admin/newsletter/contact data | ordinary account reads operational admin collections | Denied |

Cross-account access failures: 0 successful breaches.
Cross-organization access failures: 0 successful breaches.

## Controls validated

- APIs cryptographically verify Firebase tokens with revocation checking.
- Firestore and Storage require verified identity and active account state.
- Team resolution checks the exact requested team and active membership.
- User-controlled join roles are ignored.
- League reads require creator or cached member UID.
- Alert target and audience are enforced in rules as well as UI.
- Compatibility catch-all rules explicitly exclude sensitive team subcollections.
- Demo ownership is bound to the anonymous session.

## Remaining manual isolation work

Vercel Preview must test organization/team switching, back/forward cache, refresh, simultaneous tabs, uploaded media URLs, search indexes, exports/reports, notification deep links, deleted organization/team behavior, and two-device stale sessions. These require realistic browser and provider state and were not represented as automated passes.

## Isolation-adjacent fixes

Delegated staff operations now work without permitting role promotion, owner modification, or billing changes. Protected direct URLs are rejected by revocation-checked server sessions before the application shell renders.
