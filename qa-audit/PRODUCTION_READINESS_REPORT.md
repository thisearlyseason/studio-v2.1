# The Squad Pro — Production Readiness Audit

Audit date: 2026-08-08
Audit branch: `agent/fix-login-spinner`
Scope: repository review, automated gates, isolated-Firebase browser/API testing, and read-only production metadata checks. No production data, charges, emails, push messages, or deployments were initiated.

## Executive summary

**Overall release status: RELEASE CANDIDATE VERIFIED; PRODUCTION PROMOTION PENDING.** The application code passes the complete local release gate, both runtime dependency audits are clear, and the isolated browser/API certification covers all seven demo personas and the supported feature surface without completing payment. Confirmed defects were repaired and regression-tested.

The currently deployed production revision is not this release candidate. Production Firebase still contains retired Google Calendar OAuth/event-sync functions and does not match the checked-in Firestore index contract. The guarded production infrastructure workflow must be run before the web release is promoted.

## Architecture summary

- Framework: Next.js 15.5.22, React 19, TypeScript; Vercel production and Firebase App Hosting staging.
- Identity and data: Firebase Authentication, Firestore security rules, Firebase Storage security rules, Firebase Admin SDK, Cloud Functions v2.
- Billing: Stripe subscriptions, Checkout, Customer Portal, Connect, idempotency/mutation locks, signed Stripe webhooks.
- Messaging: Resend email and signed Resend webhooks; Firebase Cloud Messaging.
- Other integrations: server-issued ICS calendar feeds and RSS/external URL fetching.
- Tenant types: teams/squads, leagues, tournaments, schools, clubs, households, public spectator projections, demos.
- Security controls observed: Admin SDK token verification for authenticated API routes, input-size guards, user/public rate limits, server-side plan and seat reconciliation, CSP/HSTS/security headers, restrictive Storage default deny.

## Findings

| Severity | ID | Finding | Status |
|---|---|---|---|
| Critical | SEC-001 | Public recruiting toggle granted unauthenticated reads of whole player documents and arbitrary subcollections. | Fixed on audit branch; anonymous player and child-document access now denied in emulator |
| High | REL-002 | Required production environment values require provider-backed verification. | Variable names/scopes verified in Vercel; sensitive values remain externally verifiable only |
| High | REL-003 | Production Firebase still runs retired Google Calendar functions and its index inventory differs from `firestore.indexes.json`. | Deployment workflow prepared and validated; production rollout pending |
| Medium | DEP-001 | Dependency audit originally reported high Next.js/sharp/fast-uri issues. | Fixed; both production audits report 0 vulnerabilities |
| Medium | AUTH-001 | Parent-owned child player documents may be created/deleted by the guardian but parent update access is not consistently present in the player rules. | Fixed on audit branch; regression coverage added |
| Medium | QA-001 | Lint completes with exit code 0 but reports warning debt, including React hook dependency and accessibility/performance warnings. | Unresolved quality debt |
| Low | OPS-001 | App Hosting had `maxInstances: 1`; this was a capacity/availability risk. | Fixed at 10 for staging; production uses Vercel fluid compute |

## Fixed findings

### DEP-001 — dependency remediation

- Root cause: `next` 15.5.20 and `sharp` 0.33.5 were within reported advisory ranges; transitive `fast-uri` was also flagged.
- Change: upgraded `next` to 15.5.22, `sharp` to 0.35.3, and pinned `sharp` 0.35.3 and `fast-uri` 4.1.1 through package overrides.
- Evidence: root and Functions production audits now report **0 vulnerabilities**. The complete `npm run verify` gate passes.
- The Google AI, Straico, and FFmpeg packages and provider routes were removed.

## Remaining promotion gates

1. Run `npm run verify:env` inside the protected production environment so sensitive values can be format-checked without disclosure.
2. Run `.github/workflows/deploy-production-infrastructure.yml` with the exact production project confirmation. Verify the retired calendar functions are absent and the complete checked-in index contract is enabled.
3. Promote the exact verified commit to Vercel and repeat production health, public-route, authentication, and calendar-feed smoke tests.
4. Complete provider-controlled Stripe webhook, Resend delivery, and FCM device checks. Payment completion remains outside this audit by instruction.

## Release decision

Do **not** label the current production deployment certified. Approve promotion only after the four gates above are recorded against the exact immutable release commit.
