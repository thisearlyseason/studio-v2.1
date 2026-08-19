# The Squad Pro — Production Readiness Audit

Audit date: 2026-08-19
Audit branch: `agent/complete-audit-fixes`
Scope: repository review, automated gates, isolated-Firebase browser/API testing, Stripe/Resend/FCM test-provider certification, and read-only production metadata checks. Authorized staging test-mode charges/refunds, email, and push were exercised; no production data mutation, production-mode charge/email/push, or production deployment was initiated.

## Executive summary

**Overall release status: STAGING RELEASE-CANDIDATE PASS; PRODUCTION UNCHANGED.** Candidate code `92444e28d9590177adb4587749a36a0b6aa27bb7` passed the complete release gate, both runtime dependency audits, independent review, isolated browser/API certification, and the offered Stripe test-mode lifecycle matrix. Protected staging deploy `32276696681` produced healthy revision `studio-build-2026-08-19-003`. Production promotion remains a separately authorized operation with action-time configuration, rollback, and smoke checks.

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

1. At an explicitly authorized production promotion, verify production provider mode/IDs and environment values, record the rollback target, deploy through the protected workflow, and run the documented smoke/health checks.
2. Monitor Vercel, Firebase, Stripe, Resend, and Function error telemetry after launch and retain the rollback deployment record.
3. Continue non-blocking hardening for lint warnings, broader durable multi-user/device coverage, and accessibility depth.

## Release decision

The staging candidate satisfies the defined production-readiness gates, including the full currently offered Stripe lifecycle matrix documented in `SUBSCRIPTION_TEST_MATRIX.md`. This is not authorization to deploy production: production remains unchanged until the user separately approves the protected promotion workflow and its action-time checks.
