# Test Account Requirements

**Phase:** Discovery and planning only\
**Security rule:** Never place passwords, tokens, cookies, API keys, webhook secrets, service-account JSON, action links, or real personal information in this repository.

## Environment requirements

Use an isolated QA Firebase project and Stripe test mode. Local emulators are preferred for rules, destructive, and concurrency tests; a hosted staging environment is required for real browser sessions, provider callbacks, service workers, FCM, email links, and multi-device behavior. Production remains read-only unless later authorization names the exact action.

Accounts should use synthetic names and approved QA mailboxes. Credentials belong in the team's secret manager or local untracked environment, not Markdown, screenshots, traces, shell history, or test source.

## Required identity set

| Alias | Role/state | Tenant/data setup | Special requirement | Primary coverage |
|---|---|---|---|---|
| `qa-coach-owner-a` | verified `coach`, free | Owns Team A; no second team | Durable mailbox | Auth, first team, owner boundaries |
| `qa-coach-owner-b` | verified `coach`, free | Owns Team B with distinct records | Separate mailbox | Cross-tenant isolation |
| `qa-pro-owner` | verified `coach`, active `team` | Pro Team with all modules/data | Stripe test customer | Pro features, billing, Connect |
| `qa-elite-owner` | verified `coach`/institution authority, active `elite` | Club with at least three squads and remaining capacity | Stripe test customer | Club, squad seats, switching |
| `qa-school-owner` | verified `admin`, active `school` | School with squads/facilities/global waiver | Stripe test customer | School hub and authority |
| `qa-school-delegate` | verified `admin` | Delegated admin of school; not owner | Invite/revocation lifecycle | Delegated boundaries |
| `qa-league-owner-a` | verified `league_creator`, active `league` | Own League A with teams/divisions/games/forms | Stripe test customer | League lifecycle |
| `qa-league-owner-b` | verified `league_creator` | Own League B only | Separate mailbox | League isolation |
| `qa-team-assistant` | verified `coach`, team-local staff | Assistant in Team A; owns no team | Staff position fixture | Operational versus owner boundaries |
| `qa-team-member` | verified ordinary member | Member in Team A; no staff position | Durable identity | Member-only access |
| `qa-parent-a` | verified `parent` | Two linked children in Team A and Team C | Durable mailbox | Family aggregation, waivers, payments |
| `qa-parent-b` | verified `parent` | Separate household/Team B | Separate mailbox | Guardian/sibling isolation |
| `qa-adult-player-a` | verified `adult_player` | Own player profile, Team A membership | Player media/profile data | Self-service scope |
| `qa-adult-player-b` | verified `adult_player` | Own player profile, Team B membership | Separate mailbox | Player isolation |
| `qa-youth-invite` | no account initially | Existing child/player linked to `qa-parent-a` | Dedicated mailbox that receives invite | Invite activation |
| `qa-youth-active` | verified `youth_player` | Linked existing player/member | Separate already-activated account | Youth access matrix |
| `qa-superadmin` | verified account plus trusted `superadmin` custom claim | No customer data; synthetic admin fixtures | Claim set/revoked by authorized operator | Platform administration |
| `qa-fake-superadmin` | verified ordinary account | Profile attempts `role=superadmin`; no trusted claim | Isolated only | Claim-versus-profile denial |
| `qa-unverified` | unverified registered role | Partial/new profile only | Mailbox retained for verification | Verification gate |
| `qa-suspended` | verified then suspended | Former Team A membership | Admin-controlled fixture | Token/session/data denial |
| `qa-removed-member` | verified, membership removed | Historical Team A content and cached league access | Do not delete until revocation tests complete | Removed-user denial |
| `qa-pending-delete` | verified then deletion pending | Non-owner with removable player/storage data | Disposable/destructive fixture | Immediate denial and purge |
| `qa-owner-delete-blocked` | verified owner | Owns disposable team/league | Disposable/destructive fixture | Orphan-prevention block |
| `qa-multi-org` | verified coach/member | Owns Team A, member of Team B, linked to one league | Durable account | Switching/cache boundaries |
| `qa-public-submitter` | no account | Synthetic contact/registration/donation/volunteer data | Unique email/phone per scenario | Public portal validation |
| `qa-demo-a`, `qa-demo-b` | two anonymous sessions | Independently seeded same persona | Separate browser contexts | Demo isolation and cleanup |

## Subscription-state fixtures

Use separate disposable owners or Stripe test clocks where state transitions would otherwise conflict:

| Fixture | Required state | Expected entitlement |
|---|---|---|
| `billing-free` | no active paid subscription | `free`, one team |
| `billing-trialing` | trialing paid plan | Selected paid plan/capacity |
| `billing-active-monthly` | active monthly | Exact selected plan/capacity |
| `billing-active-annual` | active annual | Exact selected plan/capacity |
| `billing-past-due` | failed invoice / `past_due` | Falls back to non-entitled behavior per policy |
| `billing-canceled` | canceled/deleted subscription | Free entitlement after reconciliation |
| `billing-addon` | eligible base plan plus extra-team quantity | Base capacity plus exact add-on quantity |
| `billing-customer-deleted` | test customer deleted after prior subscription | Entitlement revoked; checkout recovery creates distinct valid customer |

## Tenant fixtures

Team A and Team B must use clearly different names, members, events, chats, files, waivers, payments, facilities, fundraisers, volunteer opportunities, and player data so leakage is obvious. Add Team C under the same parent household to test legitimate cross-team aggregation.

Required related records:

- one adult and one youth player per primary team;
- distinct guardian, contact, medical, evaluation, recruiting, and payment values;
- active and removed memberships;
- staff and ordinary member positions;
- published/unpublished events, forms, waivers, campaigns, opportunities, recruiting profiles, leagues, and tournaments;
- past/current/future and cross-midnight/DST events;
- active/cancelled/completed games with at least one downstream bracket dependency;
- facilities with overlapping field bookings;
- allowed, oversized, MIME-spoofed, deleted, public, and private media fixtures.

## Provider and device fixtures

| Provider/device | Requirement | Safety constraint |
|---|---|---|
| Firebase Auth | Isolated project with email/password, anonymous, and claim administration | Never use production identities |
| Stripe | Test prices for all four paid products, both intervals, extra-team add-ons, test clocks/cards | Confirm `livemode=false`; no real card data |
| Stripe Connect | Disposable test connected account | No real bank account, transfer, or payout |
| Resend | Approved QA domain/mailboxes or non-delivery safe sink; signed webhook endpoint | No customer recipients; redact action URLs |
| FCM | Desktop Chrome profile and at least one mobile-capable browser/device | Synthetic messages only; remove tokens after test |
| RSS | Controlled valid, malformed, duplicate, slow, redirecting, and unsafe-host fixtures | No fetches to private network targets |
| Calendar | Disposable client or raw HTTP fetch for ICS | Tokens treated as secrets and not committed |

## Existing safe references

Historical documentation references synthetic identities such as `parent-a`, `adult-player-a`, `coach-owner-a`, `assistant-a`, `school-owner-a`, `league-owner-a`, `superadmin-a`, `outsider-b`, and anonymous demos. These are labels, not guaranteed live accounts. Phase 2 must resolve whether corresponding isolated accounts still exist before use.

Historical release notes also state that a claim-controlled staging superadmin and approved provider test configuration existed. Credentials and secret values are intentionally absent. Their availability must be confirmed through the authorized secret/account owner; do not reconstruct or print them from local environment files.

## Account lifecycle and cleanup

1. Record each alias, UID suffix or opaque reference, role, tenant, state, creation time, and owner in a secure external test-account ledger.
2. Never include full tokens, session cookies, passwords, invite/action URLs, or webhook signatures in evidence.
3. Use unique identities where tenant isolation, concurrency, role revocation, deletion, or provider state depends on history.
4. Revoke sessions and device tokens after access-control scenarios.
5. Remove disposable Auth, Firestore, Storage, Stripe test, Connect test, and email fixtures after evidence is captured.
6. Preserve only audit records required to demonstrate deletion/financial retention; label them synthetic.
7. If an account points at production or contains real data, stop and replace it with an isolated fixture.

## Current blockers to Phase 2

Phase 2 is blocked wherever the following have not been supplied or confirmed:

- isolated hosted Firebase environment aligned with the web deployment;
- durable QA mailboxes for verification, reset, youth invite, and delegated-admin flows;
- trusted but disposable superadmin claim management;
- Stripe test products/prices, test customers, and permission to exercise test webhooks;
- Stripe Connect test account;
- approved Resend safe recipients and webhook configuration;
- real FCM-capable browser/device;
- destructive-test authorization in an isolated project;
- two fully populated synthetic tenants and cleanup ownership.

Local source, unit tests, rules emulators, and non-provider browser checks can begin without all external fixtures, but affected rows must remain BLOCKED until their named dependency exists.
