# SaaS tax mapping candidate

Owner approved preparation/testing of the electronic-download SaaS category pair
on October 27, 2026. Live Stripe mutations and production promotion require the
separate final approval in the existing launch conversation. Current web and iOS
sales, Android QA access, registrations, Connect and existing subscribers retain
their approved state.

The approved codes are personal `txcd_10103100` and commercial `txcd_10103101`,
verified against [Stripe's tax codes](https://docs.stripe.com/tax/tax-codes).
This is an owner-selected classification, not a Stripe ruling or a determination
that all jurisdictions require collection. Business use is the buyer's use;
neither that declaration nor a tax ID automatically establishes an exemption.

## Provider objects and configuration

Generate the exact proposed 10 Products and 20 Prices without provider calls:

```sh
node --import tsx scripts/qa/saas-tax-catalog.mjs --plan
```

Two tax-specific Products serve each existing offer (Pro Team, Elite Teams,
Elite League, Schools Plan and Extra Pro Teams). Each has the same existing USD
monthly/annual amounts and an exclusive-tax Price. They map to existing canonical
entitlements. No existing Product, Price, account preset or subscription is edited.
The account preset also affects unrelated products and must remain unchanged.

`SQUAD_STRIPE_SAAS_TAX_CATALOG` is server-only configuration containing IDs,
never credentials. Its shape is:

```json
{
  "revision": "squad-saas-electronic-v1",
  "livemode": false,
  "products": {
    "team:personal": {
      "productId": "<returned Product ID>",
      "monthlyPriceId": "<returned monthly Price ID>",
      "annualPriceId": "<returned annual Price ID>"
    }
  }
}
```

This abbreviated example is intentionally invalid: all ten keys are required:
`team`, `elite`, `league`, `school`, `extra_team`, each followed by `:personal`
and `:commercial`. Every Product and Price ID must be distinct, real and from
the authorized environment. Never deploy synthetic test IDs. Every actual Price
and expanded Product is checked for amount, currency, interval, tax behavior,
code, active state, environment, canonical offer, use, source and revision before
customer or checkout mutations. Missing/mismatched configuration fails closed.

The display endpoint verifies both use variants and keeps ten existing selection
aliases. The browser still shows one price per offer/interval. Both checkout
routes resolve those aliases on the server; clients cannot submit a tax-specific
variant to choose arbitrary treatment. Existing Price IDs remain recognized for
webhooks, sync and old subscriber operations. Classified subscriber plan/seat
changes retain the original use and do not revert to legacy tax mappings.

## Declaration and retries

The existing pricing page, billing page and paywall require a new buyer to choose
personal/recreational or commercial use, without a default. Account/team changes
clear the selection. An ambiguous buyer should clarify before purchasing; school
eligibility remains a separate declaration and never implies exemption.

Use, revision, canonical offer, interval and original declaration time are stored
on the Checkout/Subscription metadata. No global customer tax-use flag is set.
Idempotency includes the resolved Price, use and revision. Changed selections do
not expire an earlier classified Checkout: its exact terminal state must be
freshly verified. Lost replies recover the original attempt and timestamp. Any
untracked open Checkout stays fenced. Existing deletion behavior remains separate.

## Verification and remaining provider gate

Local tests use synthetic Stripe responses and real route/lock code. They are not
Stripe tax-calculation or paid-checkout evidence. The real-component browser
fixture is local only and stops before provider actions:

```sh
node tests/helpers/saas-tax-browser.mjs
```

The existing authenticated Squad browser session was recovered without copying
credentials. Exactly 10 Products and 20 Prices were created in The Squad V2.0
sandbox (`acct_1TJMnVGu1UxxOYbP`). Their actual creation responses were retained
and replayed through the application's validator: all 20 passed. These are real
sandbox object readbacks, not live objects or tax-calculation results.

That sandbox has a pre-existing Canada/Prince Edward Island head office. It
originally had no registrations. On October 28 the owner separately approved
one federal GST/HST standard test registration and one BC provincial PST test
registration. Both are active and `livemode:false`; a fresh list contains exactly
those two registrations. Eleven sandbox calculations are retained in the external
candidate evidence, including both use categories for Alberta, Ontario, and BC,
before/after BC PST registration, and US noncollection controls. BC returned
USD19.99 + USD1.00 GST + USD1.40 PST = USD22.39, both taxes `standard_rated`.
New York `not_collecting` is not a taxability or nexus determination. These tests
do not authorize or establish any live provincial registration.

The owner's named Current Test Sept 2026 sandbox
(`acct_1UEhjrK8LIvBrTTZ`) was also inspected without mutations: its tax settings
are pending, head office is null, and registrations are empty. No second catalog
was created there; do not mix IDs from different sandbox accounts. Neither head
office nor any live registration has been changed.

The connected Stripe connector inventory still contains only TryOutFlow. The
existing audit preview intentionally blocks Stripe outbound traffic; keep that
safeguard. Protected application-to-provider preview verification remains a release
gate. Do not copy credentials, use another product's sandbox, create an account,
broaden access or use live Workbench writes to complete them. Web preflight now
rejects an absent/incomplete catalog or a test/live mismatch; store preflight
keeps its existing contract without requiring a web tax catalog.

Once the authorized non-live catalog exists, verify it from an already authorized
server runtime without retrieving/copying keys:

```sh
node --import tsx scripts/qa/saas-tax-catalog.mjs --verify
node --import tsx scripts/qa/saas-tax-catalog.mjs --calculate <approved-synthetic-address-fixture.json>
```

The calculation command refuses live catalogs and requires explicit synthetic CA
and US address fixtures. It creates sandbox Tax Calculations only, never Checkout,
payment or subscription objects. Report taxability reasons, especially
`not_collecting`; a zero amount alone is not proof of correctness. Do not add
registrations or change classification to manufacture nonzero tax. No actual
calculation pass is claimed from this script unless its actual results are retained.
The completed Workbench calculations above are separate provider evidence.

## Dedicated protected preview, October 28

`vercel.saas-tax-preview.json` is an explicit alternative deployment configuration;
the existing production guard, production preflight, default `vercel.json`, native
hosts, and original immutable audit preview remain unchanged. It has no cron jobs
and adds a no-index header. Vercel Authentication must stay on and its anonymous
protection must be checked before testing. No public exceptions or bypass links.

The existing `codex/qa-production-audit` branch is an ancestor of the candidate.
After fresh gates pass it can be advanced by fast-forward only to reuse its
existing encrypted audit Firebase binding; no credential export or wider scope.
Do not force-push or remove its history. The owner must privately save the existing
Squad sandbox `sk_test_` key in a new `STRIPE_SECRET_KEY` entry limited to this
branch. Leave the generic Production/Preview/native entry unchanged. No key is
retrieved by the agent, and no new key or sandbox is authorized.

Only the new immutable test deployment receives `SQUAD_SAAS_TAX_PREVIEW=true`
and `AUDIT_OUTBOUND_PROVIDER_MODE=saas-tax-sandbox`. The old `block` mode takes
precedence and always continues blocking Stripe. Build and runtime checks require
the Preview target, the exact QA branch, audit Firebase identity and client config,
a test Stripe key and complete non-live catalog. They reject native/Managed
Payments flags, emulator endpoints, live webhook secrets, Resend credentials and
cron secrets. Email and push providers remain blocked. The build also retrieves
and verifies all 20 actual provider Prices before compiling; no provider writes.

Use deployment-specific blank overrides for inherited Resend/webhook credentials;
do not edit or expose their stored values. Use the saved non-secret sandbox catalog
and explicit automatic-tax/false native flags at build and runtime. The builder
sets the application's origin from Vercel's unique deployment URL. Keep the
snapshot unpromoted; no web/native alias, production job or store binary changes.
No purchase, trial, Checkout or new QA identity is approved by this configuration.
An existing isolated QA account must be verified before authenticated testing;
never assume the production plus-address QA identity exists in this backend.

Before release: all four hosted gates, affected local/emulator/browser tests,
shared store build and its eight purchase-route guards, exact provider object
readback/calculations, protected preview and final production authorization.
Do not promote a candidate with missing catalog IDs or unfinished provider QA.

## Rollback

Before a new paid subscriber exists, hold new sales and inspect exact pending
Checkout state before returning the new-checkout resolver to the prior catalog.
After a new paid subscriber exists, retain this candidate's new-ID recognition
and configuration. Use a reviewed forward sales pause, preserving renewals,
entitlements, webhook/receipt sync and restore. Never use an old release that
cannot recognize newly issued Prices, and never delete customer objects as rollback.
