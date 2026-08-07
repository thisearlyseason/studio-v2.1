# Subscription Test Matrix

Server source of truth: Stripe subscription items/statuses, `PLAN_PRICE_MAP`, `server-team-entitlements.ts`, and `reconcilePaidTeamSeats`. Browser profile fields cannot set paid state under `firestore.rules`.

| Plan | Included paid squads | Billing | Server enforcement reviewed | Automated evidence | Manual Stripe test required |
|---|---:|---|---|---|---|
| Free | 0 | n/a | Team rules reject browser `isPro`/paid plan requests; paid features use paid-seat checks. | Seat-policy tests pass | Yes |
| Team | 1 | monthly / annual | Canonical price map, server checkout/update/sync and seat allocation. | Checkout, seats, entitlement tests pass | Yes |
| Elite | 8 | monthly / annual | Same as Team; capacity reconciled server-side. | Seat-policy tests pass | Yes |
| League | 18 | monthly / annual | Same as Team; canonical price IDs. | Seat-policy tests pass | Yes |
| School | 15 | monthly / annual | Same as Team; capacity reconciled server-side. | Test asserts 15 seats | Yes |
| Extra team | additive, 0–50 | interval matched to base plan | Add-on checks ownership, active status, billing cycle, lock and idempotency. | Subscription mutation tests pass | Yes |
| Demo | fixture entitlement only | no billing | Billing routes reject demos where implemented. | Demo/seat tests pass | Yes |

| Billing state | Expected access | Code result | Test status |
|---|---|---|---|
| `active`, `trialing` | Entitled; seats allocated up to paid capacity | `isEntitledSubscriptionStatus` | Unit-tested |
| `past_due`, `unpaid`, `incomplete`, `paused` | Block new checkout/mutations; no trusted paid-seat grant without authoritative entitlement | Checkout blocks unresolved statuses; sync revokes when not entitled | Partially unit-tested; Stripe test needed |
| `canceled`/`cancelled`/inactive | No paid seats after sync/webhook | Reconciliation fails closed | Unit-tested |
| pending update | No immediate plan/seat advance | API returns 202 pending | Unit-tested code path; Stripe test needed |
| duplicate/out-of-order webhook | No duplicate entitlement mutation | Delivery lease/idempotency and authoritative subscription chooser | Unit-tested |

Manual test cases remaining: each plan/cycle, coupon/tax/proration, failed payment, refund/dispute, delayed/replayed/invalid webhook, customer deletion, cancellation at period end, reactivation, portal payment-method change, and browser/API/rules direct-bypass attempts.
