# Account test matrix

Legend: **Pass** = automated evidence; **Blocked** = requires Preview/provider interaction; **Fail** = confirmed workflow mismatch.

| Synthetic identity | Role/state/plan | Expected access | Actual result | Result | Evidence / issue |
|---|---|---|---|---|---|
| `parent-a` | parent, verified, free, Team A | own profile/child, Team A family data only | Correctly scoped | Pass | Firestore guardian and tenant tests |
| `adult-player-a` | adult player, verified, free | own profile and active team only | Correctly scoped | Pass | team membership rules |
| `youth-a` | invited youth, verified by invite | linked player membership only | Linked member document resolves correctly | Pass | linked-youth emulator test |
| `coach-owner-a` | coach, active paid | owner operations and bounded creation | Team/league creation is now server-authorized and capped | Pass | account creation policy + direct-write denials |
| `assistant-a` | coach/member, staff position | normal coach operations in Team A, no billing/role promotion | Operational writes pass; billing, owner record, and promotion attempts fail | Pass | AQ-009 regression |
| `school-owner-a` | admin, school active | own school metadata and bounded squads | Owner field variants now work; delegated workflow needs Preview | Blocked | AQ-008; manual M-18 |
| `league-owner-a` | league creator, free | one league, own league only | direct creation bypass closed; isolation passes | Pass | league creation and query rules |
| `superadmin-a` | superadmin claim | administrator routes/APIs | Rules and APIs recognize claim; UI lifecycle not manually run | Blocked | manual M-25 |
| `outsider-b` | coach, verified, Team B | no Team A/League A/Club A data | Reads and writes denied | Pass | 24-test emulator suite |
| `unverified-a` | coach, unverified | verification page only | API, Firestore, Storage denied | Pass | auth and emulator tests |
| `suspended-a` | player, suspended | no private access | denied | Pass | emulator tests |
| `pending-delete-a` | parent, deletion pending | no private access | denied immediately | Pass | emulator + purge tests |
| `removed-a` | removed Team A member | no team/chat/notifications | denied | Pass | membership/chat tests |
| `demo-a` / `demo-b` | anonymous demo | own demo session only | cross-demo access denied | Pass | emulator test |
| `elite-active` | active elite, limit 8 | eight creation slots | policy returns 8 | Pass | account creation policy |
| `school-trial` | trialing school + 2 add-ons | seventeen slots | policy returns 17 | Pass | account creation policy |
| `elite-past-due` | past_due elite | free entitlement only | policy returns 1 | Pass | account creation policy |
| `email-password-new` | unverified signup | one account, then verify | code path sends verification and gates tenant work | Pass | static regression; provider link lifecycle blocked |
| `oauth-new` | Google | verified profile and correct role | not executed against isolated provider | Blocked | M-03 |
| `password-reset-a` | verified | generic, single-use provider reset | request behavior reviewed; token lifecycle not executed | Blocked | M-05 |
| `multi-org-a` | owner A, member B | switch without cache bleed | data rules scoped; browser history/tab behavior untested | Blocked | M-20 |

## Live audit Preview evidence

The isolated Firebase App Hosting audit Preview was exercised on July 26, 2026:

- Anonymous protected routes redirected to login while the public event-registration route remained accessible.
- Email/password signup created an unverified account, enforced the verification gate, then admitted the account after audit-only administrator verification.
- A forced verification-delivery failure retained neither the Authentication identity nor profile data.
- Login, secure session exchange, protected navigation, logout, and subsequent login succeeded.
- Coach onboarding created an adult squad; a second Starter-plan squad was rejected with a visible limit message.
- The Starter account saw the expected Coaches Corner upgrade gate rather than an identity-link error.
- Demo notification badge, inbox acknowledgement, clear state, and history used the same broadcast.
- Missing Stripe configuration failed safely with a generic checkout error and did not leave the application.
- Billing/navigation rendered at desktop, 820px tablet, and 390px mobile widths.
- Security headers were present on the hosted response.
- All disposable identities and squad data created by this run were deleted and verified absent.

## Execution order

1. Identity creation, normalization, duplicate submission, and verification.
2. Login, logout, reset, revocation, multi-device, suspended/deletion states.
3. Direct API/rules/storage authorization and role tampering.
4. Team, league, tournament, school, invitation, and multi-tenant workflows.
5. Subscription state and capacity transitions using Stripe test mode.
6. Notifications, email links, preferences, removed-user suppression.
7. Settings, ownership, deletion/cancellation, and final purge dry run.
8. Responsive navigation and dashboard checks in Vercel Preview.

## Automated totals

- Focused account tests: 42 passed, 0 failed.
- Firestore/Storage authorization tests: 26 passed, 0 failed.
- Full repository unit suite: 134 passed, 0 failed.
- Combined repository unit plus rules suite: 160 passed, 0 failed.
- Manual account scenarios remaining: 30 (see release checklist).
