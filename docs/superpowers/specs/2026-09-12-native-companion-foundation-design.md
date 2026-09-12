# The Squad native companion — foundation design

Status: written design approved by the user's “proceed”; foundation implementation in progress. This document does not mean native packaging, signing, or store submission is complete.

## Approved product direction

The Apple and Android apps will allow free-account creation and existing-account login. Signup must never start a paid trial, request a card, or direct a new user to checkout. Existing users retain their legitimate server-verified subscription and team access. The website keeps its current plans and Stripe flows.

The Squad remains the primary app. Scheduler remains a secondary PWA, not a second store submission in this phase. Newsletter enrollment and notification permission remain optional and separate from account creation.

## Delivery approach

Use the existing Next.js/Firebase application in a separate store-specific web deployment, followed by a Capacitor native shell. A separate build/deployment boundary keeps the public website's purchasing experience unchanged and accommodates existing server-rendered routes. A static export of this Next.js application is not assumed to work.

The alternatives are a bare wrapper, which leaves purchasing, embedded authentication, and platform UX problems unresolved, or a native rewrite with store billing, which expands cost and replaces working behavior. The selected companion approach preserves the existing backend and adds native integration deliberately.

First implement and verify the store web foundation below. Native packaging/authentication/push, moderation, and deletion compliance are subsequent independent work packages. Do not ship the foundation as a supposedly store-ready wrapper.

## First work package: free signup and store boundaries

1. Introduce one explicit build distribution setting, `web` or `store`, shared by server and client policy helpers. The ordinary website stays `web`. Store release checks must reject a package targeting a web-mode deployment. Neither a query parameter, user-agent string, nor local storage is sufficient to identify a store distribution.
2. Reuse the existing signup validation, Firebase identity creation, branded email verification, profile write, youth protections, rollback, and pending team-join flow. Store mode removes paid-plan selection and chooses the existing free path. It must not manufacture staff authority, school entitlement, or a Pro team allocation.
3. Free coaches may use the existing free-team allowance. Parents and adult athletes retain existing join/link flows. A school or league role alone must not unlock paid organization creation; display a neutral explanation and permitted existing-account/team actions, not an upgrade prompt.
4. Validate post-verification and login return destinations against store-safe routes. A stale `squad_post_verify_path`, join link, or browser history entry must not send the app to pricing or checkout. Preserve valid join codes and parent/child linking destinations.
5. Remove purchase entry points in store mode: pricing, upgrades, paid trials, add-on checkout, registration payments, donation/purchase CTAs, and links to external purchasing pages. Server route guards must also refuse purchase-creation endpoints in the store deployment. Keep the ordinary website endpoints unchanged. Existing entitlements continue to be checked by the backend; distribution settings are not authorization.
6. Inventory all reachable navigation, paywalls, settings, resource footers, help links, and user-content links. Store navigation must not leak into the marketing site's purchasing routes. Direct URLs receive a neutral unavailable destination, not a redirect to web checkout. Required privacy, support, and deletion destinations must remain reachable without purchase links.

No Stripe subscription is canceled, migrated, granted, or downgraded by this work package. No SDK dependency or DNS/provider change is needed merely to test the store web foundation locally.

## Acceptance for the foundation

- Test both web and store modes with Playwright. Web signup/pricing/billing remain unchanged; store signup shows free registration only.
- Test each supported signup role, duplicate/invalid submissions, verification, valid and invalid team codes, and safe return navigation using isolated test accounts.
- Verify a new account receives no paid entitlement or subscription. Verify an existing legitimately paid account keeps permitted access.
- Attempt direct pricing, purchase endpoints, stale return paths, and external purchase navigation in store mode; all must fail closed without breaking login or logout.
- Exercise desktop, phone, keyboard, validation/error recovery, and network failures. Mocked UI responses do not certify hosted identity or email delivery.
- Run focused regressions, type checking, lint, automated tests, and a production build. Certify this foundation separately from native hardware behavior.

## Required later packages and release gates

- Native shell: safe areas, keyboard/back behavior, downloads/share sheet, app links, native Google authentication and an appropriate Apple login option; no embedded Google OAuth. Domain, bundle IDs, signing, and provider credentials must be configured before native verification.
- Notifications: native APNs/FCM registration, logout/account-switch cleanup, permission state, delivery, badges, and tap-through. Do not reuse PWA evidence as native proof.
- Moderation: reporting, blocking, filtering, moderation access and response workflow, with tenant isolation and youth protections. Define team-announcement versus direct-message blocking behavior before implementing it.
- Deletion/privacy: public deletion destination, in-app discovery, subscription/ownership prerequisites reviewed against store requirements, associated-data purge verification, accurate retention disclosures, and Apple-token revocation when applicable. The existing seven-day deletion implementation is not automatically certified for store submission.
- Store release: age/audience and SDK disclosures, reviewer accounts, TestFlight/Play testing, real iPhone/Android acceptance, and actual store review. No approval guarantee.

## Policy references

- [Apple review guidelines, including companion apps and user-generated content](https://developer.apple.com/app-store/review/guidelines/)
- [Apple account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Google Play payments and consumption-only apps](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en)
- [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
