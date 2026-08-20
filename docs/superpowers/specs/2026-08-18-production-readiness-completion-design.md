# Production Readiness Completion Design

**Date:** 2026-08-18

**Status:** Approved for implementation planning

## Objective

Convert the current audit branch into a release candidate that is safe to promote from isolated staging. Close every launch-critical defect and configuration gap that is under repository or staging-provider control, rerun the complete release gate, deploy the exact passing commit, and update the audit ledger with evidence that distinguishes passed checks from user-gated delivery or device checks.

## Current State

- Branch `agent/complete-audit-fixes` is deployed to isolated Firebase App Hosting staging.
- The release gate and staging deployment passed at commit `48cfbe23`.
- Staging health returns HTTP 200 and revision `studio-build-2026-08-18-002`.
- A staging-only, email-verified Super Admin identity exists with a signed `superadmin` claim and matching Firestore profile.
- Desktop Super Admin navigation, account lookup, user directory, beta applications, bug reports, newsletters, Sports Hub, and links/embeds load without console warnings or errors.
- All configured Stripe prices exist, are active, use CAD recurring billing, and are test-mode prices.
- The configured Resend domain is verified, and the staging Resend webhook is enabled.
- The worktree contains an unfinished, passing billing-label change that correctly identifies paid demos as demo plans instead of free accounts.

## Confirmed Remaining Defects

### Mobile Super Admin layout

At a 390-by-844 viewport, the Bug Reports header keeps its title, status summary, and refresh control on one row. The refresh control extends beyond the visible content area. The Newsletter section selector also keeps three controls on one row; the Subscribers control extends past the viewport.

The responsive repair will:

- stack or wrap the Bug Reports heading and controls at narrow widths;
- keep the fixed/open summary readable without crowding the heading;
- make every Newsletter section control fully visible and operable at 390 pixels without relying on clipped overflow;
- preserve the current desktop layout and visual hierarchy.

### Duplicate Stripe webhook endpoints

Staging contains two enabled standard webhook endpoints and two enabled Connect webhook endpoints for the same staging URLs. The later pair aligns with the current webhook secret provisioning. The older pair can produce failed signature verification, duplicate provider deliveries, and retry noise.

The provider cleanup will keep the current staging standard and Connect endpoints and disable the two older duplicates only after the current endpoints pass signed delivery verification. No production endpoint will be changed.

### Billing demo status label

The billing page currently treats a paid demo without a Stripe customer link as `Free tier`. The existing worktree change introduces a pure status-label helper and focused tests so demo plans display `Demo plan`, while cancellation and live-renewal labels retain their precedence.

## Implementation Design

### Responsive administration surfaces

The fix stays within the existing administration components. `src/app/admin/page.tsx` will use a narrow-first stacked Bug Reports header and promote to the current horizontal alignment at the small breakpoint. `src/components/admin/newsletter-manager.tsx` will allow its section selector to wrap or use a narrow grid so all three controls remain inside the container.

Source regression tests will assert the responsive class contract. Browser verification will test all seven Super Admin sections at 390-by-844 and at the default desktop viewport. Success requires each section heading and primary controls to remain visible, document width to equal viewport width, and no console warning or error to appear.

### Billing status behavior

`src/lib/billing-plan-status.ts` remains a small pure function consumed by the billing page. Precedence is cancellation, Stripe-linked renewal, demo plan, then free tier. `tests/billing-plan-status.test.mjs` remains the behavior-level regression suite. The implementation will be accepted only after the focused test and related billing/security tests pass.

### Staging provider certification

Provider testing uses only `the-squad-v2-staging`, Stripe test mode, the verified staging Resend configuration, and synthetic staging data. Secret values are never recorded in logs or audit documents.

The certification sequence is:

1. Verify required secret names and value formats without printing values.
2. Verify Stripe prices, webhook URLs, modes, and endpoint status through read-only provider APIs.
3. Verify the current standard and Connect endpoints receive signed test deliveries and reject invalid signatures.
4. Exercise checkout creation, return/cancel behavior, duplicate-event idempotency, failed-payment handling, cancellation state, and seat synchronization using Stripe test fixtures.
5. Verify the staging Resend domain and webhook configuration through read-only provider APIs.
6. Send at most one clearly identified staging test email only after action-time user confirmation.
7. Request browser notification permission and send at most one staging push only after action-time user confirmation.
8. Disable only the two superseded staging Stripe endpoints after action-time user confirmation and successful current-endpoint verification.

Provider actions must not use live-mode Stripe data, production Firebase data, real customer records, production mailing lists, or production push tokens.

### Release evidence and deployment

The complete local release gate is:

- focused regression tests for each repair;
- `npm run typecheck`;
- `npm run lint`;
- `npm test`;
- `npm run test:rules`;
- `npm run build`;
- `npm --prefix functions run build`;
- root and Functions production dependency audits at high severity;
- `git diff --check`.

The exact commit that passes these gates will be pushed to `agent/complete-audit-fixes` and deployed through the protected `Deploy staging` workflow. Post-deployment verification will confirm the health revision, anonymous public/protected route behavior, authenticated Super Admin persistence, responsive administration surfaces, billing demo labeling, and provider callback health.

## Data and Safety Boundaries

- Preserve unrelated and pre-existing worktree changes.
- Use synthetic staging identities and records only.
- Do not mutate production Firebase, Vercel, Stripe, Resend, or FCM state.
- Do not send email, push notifications, financial transactions, or provider mutations without action-time user confirmation.
- Do not record passwords, tokens, API keys, webhook secrets, or full provider payloads.
- Use confirmation dialogs and API protections as implemented; do not bypass browser safety barriers.
- Treat any unavailable inbox, device, provider permission, or durable identity as a recorded user-gated certification item rather than a passed check.

## Audit and Documentation Output

`qa-audit/MASTER_APPLICATION_AUDIT_2026-08-16.md` will become the current evidence ledger. It will record:

- the Super Admin staging identity and browser coverage without credentials;
- desktop and mobile results for each administration section;
- root causes and fixes for the mobile layout and billing label defects;
- sanitized Stripe and Resend configuration results;
- provider workflow results, including confirmation-gated checks not executed;
- exact local and CI gate totals;
- staging deployment commit and health revision;
- the final unrestricted-production decision.

`qa-audit/RELEASE_CHECKLIST.md` will be synchronized with the evidence ledger so completed items, blocked items, and operator follow-ups cannot contradict the master audit.

## Acceptance Criteria

- The paid demo billing status does not claim to be the free tier.
- Every Super Admin section loads at desktop and 390-by-844 without clipped primary controls, horizontal document overflow, console warnings, or console errors.
- Super Admin direct access persists across refresh and non-Super Admin denial remains covered by policy tests.
- All staging Stripe prices are active test-mode prices and current webhook endpoints pass signed delivery checks.
- Superseded staging Stripe webhook endpoints are disabled only after successful current-endpoint verification and user confirmation.
- The verified Resend staging endpoint remains enabled; any delivery test is explicitly confirmed and recorded.
- The complete local release gate and GitHub release gate pass for the exact deployed commit.
- Staging health reports the deployed commit's revision after rollout.
- The master audit and release checklist agree on the final production decision and contain no unsupported pass claim.
