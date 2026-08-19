# Subscription Test Matrix

Sign-off date: 2026-08-19

Environment: isolated staging, Stripe test mode (`livemode=false`)

Deployed code: `92444e28d9590177adb4587749a36a0b6aa27bb7`, revision `studio-build-2026-08-19-003`

Server source of truth: Stripe subscription items/statuses, `PLAN_PRICE_MAP`, `server-team-entitlements.ts`, and `reconcilePaidTeamSeats`. Browser profile fields cannot grant paid state under `firestore.rules`.

## Plans and capacity

| Plan | Included paid squads | Billing | Staging result |
|---|---:|---|---|
| Free | 0 | n/a | PASS — reconciliation revoked paid state and returned zero capacity. |
| Team | 1 | monthly / annual | PASS — both cycles exercised against deployed APIs and reconciled to the canonical price/capacity. |
| Elite | 8 | monthly / annual | PASS — both cycles exercised and reconciled. |
| League | 18 | monthly / annual | PASS — both cycles exercised and reconciled. |
| School | 15 | monthly / annual | PASS — both cycles exercised and reconciled. |
| Extra team | additive, 0–50 | interval matched to base plan | PASS — add, remove, upper-bound quantity, interval preservation, and failed-payment pending update exercised. |
| Demo | fixture entitlement only | no billing | PASS — demo billing routes remain denied and demo entitlement/display are regression-covered. |

## Lifecycle and failure matrix

| Scenario | Expected result | Evidence/result |
|---|---|---|
| New-account Checkout and trial | Checkout is created server-side; a qualifying new account receives one five-day trial | PASS — disposable verified staging account completed Checkout; subscription was `trialing` with an exact five-day interval and Team capacity 1. |
| Promotion code | Checkout accepts an enabled promotion code without client authority over discounts | PASS — one-use 20% test promotion applied in hosted Checkout; resulting subscription retained the promotion/discount. Fixture removed afterward. |
| Tax | No automatic-tax behavior is offered by this checkout | N/A — `automatic_tax` is not enabled or represented as a product feature. Tax activation requires a separate product/configuration decision and validation. |
| Plan and billing-cycle changes | Stripe is authoritative and Firestore follows the effective provider response | PASS — Team, Elite, League, and School monthly/annual transitions exercised. |
| Proration/credit/positive invoice | Provider-calculated invoice outcome is respected | PASS — zero, credit, and positive-invoice transitions exercised in test mode. |
| Add-on add/remove | Quantity and interval remain canonical; capacity changes only after provider success | PASS — add/remove and 50-seat positive-invoice case exercised; final audit account has zero extras. |
| Failed payment / pending update | API returns pending without prematurely granting seats | PASS — decline-after-attachment payment method produced HTTP 202 and a failed invoice; Firestore stayed at prior capacity until payment succeeded. |
| Pending update recovery | Paid invoice applies the pending Stripe update and webhook reconciliation follows | PASS — pending update applied after test invoice payment; add-ons reconciled, then were removed. |
| Cancellation at period end | Access remains through the paid period and cancellation state is visible | PASS. |
| Reactivation / plan selection | Scheduled cancellation is cleared without using unsupported Stripe pending-update fields | PASS — deployed regression returned HTTP 200, `pending_update=null`, and `cancel_at_period_end=false`. |
| Customer Portal payment method | Portal can change the default method | PASS — hosted test portal changed the default between decline and success fixtures. |
| Refund | Provider accepts an isolated test-mode refund | PASS — full refund `re_3U60d2Gu1UxxOYbP0HkajHxq` completed. Refund is an operations event, not an entitlement event. |
| Dispute | Provider test fixture creates an actionable dispute | PASS — dispute `du_1U60fRGu1UxxOYbPAzLwFOHG` entered `needs_response`. Disputes are operations events, not entitlement events. |
| Invalid webhook signature | Reject before side effects | PASS — standard Stripe, Stripe Connect, and Resend callbacks returned HTTP 400. |
| Duplicate/replayed webhook | A completed event is acknowledged without duplicate mutation | PASS — signed replay returned HTTP 200 with `duplicate=true`; automated lease/idempotency coverage also passes. |
| Delayed/out-of-order webhook | Current authoritative subscription wins over stale event order | PASS — older signed event/reconciliation path exercised; authoritative chooser is regression-covered. |
| Customer deletion | Revoke entitlement, tolerate deleted Stripe customer, and permit recovery | PASS — deletion events `evt_1U6CcUGu1UxxOYbPgQLcAQXW` and `evt_1U6CcUGu1UxxOYbPjH5vjyMi` completed once; Firestore became free/zero-capacity. |
| Checkout after customer deletion | Create a new active customer with a replacement-scoped idempotency key | PASS — deployed API returned HTTP 200, created replacement customer `cus_V6PSIptVTkcg9r`, and returned a valid hosted Checkout session. The session was expired; the account was reconciled to free/inactive with no subscription. |
| Browser/API/rules bypass | Client cannot grant itself plans, seats, another tenant's target, or arbitrary prices | PASS — ownership, canonical price, body/rate-limit, checkout-lock, and Firestore rules regressions pass. |

## Final state

- The audit Super Admin is `free` / `inactive`, with zero paid seats, zero extras, no Stripe subscription, and one active test customer for future test-mode use.
- The recovery Checkout session is expired; no test subscription or charge remains on the audit account.
- The disposable trial user, customer, subscription, promotion code, coupon, Auth record, and Firestore document were removed after webhook reconciliation.
- Production Stripe data and production application infrastructure were not changed.

**Matrix verdict: PASS for the currently offered billing behavior.**
