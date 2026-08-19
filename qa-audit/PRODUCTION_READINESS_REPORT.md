# The Squad Pro — Production Readiness Audit

Audit date: 2026-08-08
Audit branch: `agent/fix-login-spinner`
Scope: repository review, automated gates, isolated-Firebase browser/API testing, and read-only production metadata checks. No production data, charges, emails, push messages, or deployments were initiated.

## Executive summary

**Overall release status: LIVE AND POST-DEPLOYMENT VERIFIED.** The application code passed the complete release gate, both runtime dependency audits are clear, and the isolated browser/API certification covered all seven demo personas and the supported feature surface without completing payment. Confirmed defects were repaired and regression-tested. Production infrastructure and the Vercel web release are now deployed and smoke-tested.

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
| High | REL-002 | Required production environment values require provider-backed verification. | Variable names/scopes verified in Vercel; deployed build and live runtime verified without exposing values |
| High | REL-003 | Production Firebase had retired Google Calendar functions and index-contract drift. | Fixed; workflow `31265002674` deployed and verified the complete production contract |
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

## Operational follow-up

1. Complete the full Stripe test-mode checkout/update/add-on/cancel/failure/webhook matrix in isolated staging. Signed-event delivery alone is insufficient for production promotion.
2. Monitor Vercel, Firebase, Stripe, Resend, and Function error telemetry after launch and retain the rollback deployment record.
3. Keep the protected production environment identity and deployment workflow under review.

## Release decision

Production promotion is not approved by this audit. The recorded automated, isolated-browser, infrastructure, and provider-delivery evidence supports a conditional staging pass, but the full Stripe test-mode lifecycle matrix must be completed and signed off before a separate explicit production-promotion decision.
