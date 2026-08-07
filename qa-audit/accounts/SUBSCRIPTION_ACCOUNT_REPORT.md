# Subscription account report

## Authoritative model

Paid entitlement requires both a paid plan (`team`, `elite`, `league`, or `school`) and a trusted status of `active` or `trialing`. Browser writes cannot change subscription, Stripe, plan, capacity, or paid-team fields. Webhooks/sync endpoints and server seat reconciliation remain authoritative.

| Billing state | Paid features/seats | Creation capacity result | Automated result |
|---|---|---|---|
| free/missing | No | 1 | Pass |
| active monthly | Yes | trusted `team_limit` + add-ons | Pass policy; Stripe Preview pending |
| active annual | Yes | trusted `team_limit` + add-ons | Pass policy; Stripe Preview pending |
| trialing | Yes | trusted `team_limit` + add-ons | Pass |
| past_due | No | 1 | Pass |
| unpaid | No | 1 | Pass |
| incomplete | No | 1 | Pass |
| incomplete_expired | No | 1 | Reviewed policy |
| paused | No | 1 | Pass |
| canceled/cancelled | No | 1 | Pass |
| inactive/missing record | No | 1 | Pass |

## Role-by-plan result

All ordinary global roles consume the same account-owner entitlement when they own an organization. Membership in somebody else’s paid team does not grant control of that owner’s subscription.

| Role | free | team | elite | league | school | Billing authority |
|---|---|---|---|---|---|---|
| parent | Conditional feature access | Conditional | Conditional | Conditional | Conditional | own account only |
| adult player | Conditional | Conditional | Conditional | Conditional | Conditional | own account only |
| youth player | invitation access; no organization billing | N/A | N/A | N/A | N/A | denied |
| coach | 1 team | 1 paid team | 8 | 18 | 15 | own account/team only |
| institutional admin | 1 hub | 1 | 8 | 18 | 15 | own hub only |
| league creator | 1 league | 1 | up to trusted account limit | up to trusted account limit | up to trusted account limit | own account only |
| superadmin | administrative override | override | override | override | override | privileged and claim-controlled |

The table reports capacity code, not a promise that every feature is intended for every plan. Feature-by-feature paid navigation still needs Preview verification.

## Fixed subscription bypass

Team and league creation previously relied on browser counts. Creation is now server-mediated, count and entitlement are read in one Firestore transaction, non-entitled states collapse to one slot, and direct Firestore creation is denied. This closes modified-payload and direct-request bypasses.

## Remaining external verification

- Supported tournaments are team-scoped events; legacy root tournament creation is closed. Starter versus paid tournament features still need visual Preview confirmation.
- Stripe checkout, upgrade, downgrade, cancellation-at-period-end, payment failure, missing/deleted customer, duplicate subscription, and webhook ordering must be exercised in Stripe test mode.
- The UI’s plan-specific navigation and every feature gate need responsive Preview verification.
- Existing real users with unverified Firebase email state require an intentional rollout/migration plan before deploying verification enforcement.
