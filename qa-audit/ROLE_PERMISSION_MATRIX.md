# Role and Permission Matrix

Roles are derived from `UserRole`, Firebase custom claims, team membership position checks, and Firestore rules. Team ownership is the primary mutation authority; UI role labels alone are not authorization.

| Actor | Read tenant data | Manage squad | Billing | League/tournament | Athlete/family data | Admin/global |
|---|---|---|---|---|---|---|
| Superadmin (verified custom claim) | All allowed data | All | Admin controls | All | All | Yes |
| Team owner | Own team/member data | Create/update/delete own team and memberships | Own subscription; Stripe Connect where authorized | Own records / membership-scoped | Own team scope | No |
| Coach / Assistant Coach / Manager / Staff / Squad Leader / Athletic Director | Team-member scope | UI staff access; rules generally reserve writes to owner | No unless owner/explicit server check | Membership-scoped | Coach access when primary-team ownership is established | No |
| Parent / guardian | Own user, own child, team-member scope | No | Read household payments; no subscription mutation for others | Member scope | Own child and family scope | No |
| Adult/youth player | Own user, team-member scope | No | No | Member scope | Own player scope | No |
| League creator | Created/member leagues | No team ownership by default | Own billing only | Creator manages league | Member/creator scope | No |
| School administrator | Team-owner or institution-authority dependent | Managed school squads | Authorized institution scope | Managed scope | Managed scope | No |
| Demo/anonymous | Isolated demo session only | Demo owner only | No live billing | Fixture scope | Fixture scope | No |
| Public spectator | Only server-produced public league views/public endpoints | No | No | Read one public projection | No private player data (required remediation) | No |

Verification notes: API routes use Firebase Admin token verification where authenticated; Firestore rules are the direct-client boundary. The critical public recruiting exception currently violates the final row and is tracked as SEC-001.
