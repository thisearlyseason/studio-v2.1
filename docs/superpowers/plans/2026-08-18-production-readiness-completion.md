# Production Readiness Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce and deploy a regression-verified staging release candidate that closes the remaining billing, mobile administration, provider-configuration, and audit-evidence gaps without touching production data.

**Architecture:** Keep product changes narrowly scoped to a pure billing-status helper and responsive class changes in the existing administration surfaces. Treat the master audit as the evidence ledger, require the complete local and GitHub release gates before rollout, and run provider certification only against isolated staging with action-time confirmation for deliveries, transactions, notification permissions, or endpoint mutations.

**Tech Stack:** Next.js 15, React 19, TypeScript, Node test runner, Firebase Auth/Firestore/Storage/Functions, Firebase App Hosting, GitHub Actions, Stripe test mode, Resend, Firebase Cloud Messaging.

**Spec:** `docs/superpowers/specs/2026-08-18-production-readiness-completion-design.md`

## Global Constraints

- Preserve unrelated and pre-existing worktree changes.
- Use Firebase project `the-squad-v2-staging` and its staging App Hosting URL only.
- Do not mutate production Firebase, Vercel, Stripe, Resend, or FCM state.
- Do not print or record passwords, API keys, webhook secrets, tokens, or full provider payloads.
- Do not send email, push notifications, test transactions, or provider mutations without action-time user confirmation.
- Do not deploy until focused regressions and the complete local release gate pass.
- Record unavailable inboxes, devices, credentials, or confirmation-gated checks as user-gated, not passed.

## File Structure

- `src/lib/billing-plan-status.ts`: pure customer-facing billing status precedence.
- `src/app/(dashboard)/dashboard/billing/page.tsx`: consumes the billing status helper.
- `tests/billing-plan-status.test.mjs`: focused behavior tests for demo, live, cancellation, and free labels.
- `src/app/admin/page.tsx`: responsive Bug Reports heading and controls.
- `src/components/admin/newsletter-manager.tsx`: responsive Newsletter section selector.
- `tests/preview-regressions.test.mjs`: source-level responsive contract regression.
- `qa-audit/MASTER_APPLICATION_AUDIT_2026-08-16.md`: current staging and release evidence ledger.
- `qa-audit/RELEASE_CHECKLIST.md`: synchronized operator-facing release checklist.

---

### Task 1: Complete the Billing Demo Status Repair

**Files:**
- Create: `src/lib/billing-plan-status.ts`
- Modify: `src/app/(dashboard)/dashboard/billing/page.tsx`
- Test: `tests/billing-plan-status.test.mjs`

**Interfaces:**
- Consumes: `{ isCancelling?: boolean; isStripeLinked?: boolean; isDemo?: boolean }`
- Produces: `getBillingPlanStatusLabel(input): string`

- [ ] **Step 1: Preserve and inspect the existing worktree regression**

The worktree already contains the test-first repair from the interrupted audit. Confirm the test contains these behavior assertions and do not overwrite unrelated billing-page work:

```js
test('paid demos are labelled as demo plans without pretending to be free', () => {
  assert.equal(getBillingPlanStatusLabel({ isDemo: true }), 'Demo plan');
});

test('live billing states retain their customer-facing status', () => {
  assert.equal(getBillingPlanStatusLabel({ isCancelling: true }), 'Cancellation Pending');
  assert.equal(getBillingPlanStatusLabel({ isStripeLinked: true }), 'Active - Renews automatically');
  assert.equal(getBillingPlanStatusLabel({}), 'Free tier');
});
```

- [ ] **Step 2: Verify the focused billing regression**

Run:

```bash
node --import tsx --test tests/billing-plan-status.test.mjs
```

Expected: 2 tests pass with no warnings or errors.

- [ ] **Step 3: Confirm the implementation keeps the required precedence**

`src/lib/billing-plan-status.ts` must remain equivalent to:

```ts
export function getBillingPlanStatusLabel(input: {
  isCancelling?: boolean;
  isStripeLinked?: boolean;
  isDemo?: boolean;
}): string {
  if (input.isCancelling) return 'Cancellation Pending';
  if (input.isStripeLinked) return 'Active - Renews automatically';
  if (input.isDemo) return 'Demo plan';
  return 'Free tier';
}
```

The billing page must call the helper with `{ isCancelling, isStripeLinked, isDemo }` instead of deriving the label inline.

- [ ] **Step 4: Run related billing and security regressions**

Run:

```bash
node --import tsx --test tests/billing-plan-status.test.mjs tests/security-helpers.test.mjs tests/production-concerns.test.mjs
```

Expected: all selected tests pass.

---

### Task 2: Repair Mobile Super Admin Layouts Test-First

**Files:**
- Modify: `tests/preview-regressions.test.mjs`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/components/admin/newsletter-manager.tsx`

**Interfaces:**
- Consumes: existing Super Admin `activeTab` and Newsletter `section` state.
- Produces: fully visible Bug Reports controls and Newsletter section buttons at 390 pixels while preserving desktop behavior.

- [ ] **Step 1: Add a failing responsive source-contract test**

Append this focused test to `tests/preview-regressions.test.mjs`:

```js
test('mobile Super Admin headers and newsletter sections stay inside the viewport', async () => {
  const [admin, newsletter] = await Promise.all([
    readSource('../src/app/admin/page.tsx'),
    readSource('../src/components/admin/newsletter-manager.tsx'),
  ]);

  assert.match(
    admin,
    /activeTab === 'bugs'[\s\S]*?flex flex-col sm:flex-row sm:items-center justify-between gap-4/,
  );
  assert.match(
    admin,
    /activeTab === 'bugs'[\s\S]*?flex flex-wrap items-center gap-3/,
  );
  assert.match(
    newsletter,
    /grid w-full grid-cols-1 sm:grid-cols-3 lg:w-auto/,
  );
});
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```bash
node --import tsx --test --test-name-pattern "mobile Super Admin" tests/preview-regressions.test.mjs
```

Expected: FAIL because the Bug Reports header is a single non-wrapping row and the Newsletter selector is a single flex row.

- [ ] **Step 3: Implement the narrow-first Bug Reports header**

In `src/app/admin/page.tsx`, change the Bug Reports header structure to:

```tsx
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
  <div>
    <h1 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Bug Reports</h1>
    <p className="text-gray-400 dark:text-white/30 text-xs font-bold uppercase tracking-widest">Global user feedback and issues</p>
  </div>
  <div className="flex flex-wrap items-center gap-3">
    {/* existing fixed/open summary and Refresh button */}
  </div>
</div>
```

Retain all existing click handlers, counts, colors, and button labels.

- [ ] **Step 4: Implement the responsive Newsletter section selector**

In `src/components/admin/newsletter-manager.tsx`, replace the selector wrapper class with:

```tsx
<div className="grid w-full grid-cols-1 sm:grid-cols-3 lg:w-auto gap-2 rounded-2xl bg-gray-100 dark:bg-white/5 p-1.5">
```

Add `w-full sm:w-auto` to each of the Compose, New Subscriber, and Subscribers buttons so the controls fill their narrow grid cells and retain natural width at larger breakpoints.

- [ ] **Step 5: Verify the focused responsive regression passes**

Run:

```bash
node --import tsx --test --test-name-pattern "mobile Super Admin" tests/preview-regressions.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Run the complete preview regression file**

Run:

```bash
node --import tsx --test tests/preview-regressions.test.mjs
```

Expected: all preview regressions pass.

- [ ] **Step 7: Commit the product repairs**

```bash
git add src/lib/billing-plan-status.ts tests/billing-plan-status.test.mjs 'src/app/(dashboard)/dashboard/billing/page.tsx' src/app/admin/page.tsx src/components/admin/newsletter-manager.tsx tests/preview-regressions.test.mjs
git commit -m "fix: close final staging UI regressions"
```

---

### Task 3: Run the Complete Local Release Gate

**Files:**
- Verify only; modify a source or test file only when a reproduced gate failure identifies the cause.

**Interfaces:**
- Consumes: the committed release candidate.
- Produces: a clean local gate with exact totals recorded for the audit ledger.

- [ ] **Step 1: Run type checking**

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: exit code 0. Record the warning count exactly; do not claim the warning backlog is eliminated.

- [ ] **Step 3: Run the full app suite**

Run: `npm test`

Expected: every test passes with zero failures.

- [ ] **Step 4: Run Firebase rules tests**

Run: `npm run test:rules`

Expected: Firestore and Storage emulator tests pass with zero failures.

- [ ] **Step 5: Build the web application and Functions**

Run:

```bash
npm run build
npm --prefix functions run build
```

Expected: both builds exit 0.

- [ ] **Step 6: Run production dependency audits**

Run:

```bash
npm audit --omit=dev --audit-level=high
npm --prefix functions audit --omit=dev --audit-level=high
```

Expected: neither audit reports a high or critical vulnerability.

- [ ] **Step 7: Check repository integrity**

Run:

```bash
git diff --check
git status --short --branch
```

Expected: no whitespace errors and no unexplained source changes.

If any gate fails, use `superpowers:systematic-debugging`, add or correct a focused failing test, repair the root cause, and rerun the failed gate plus its related suite before continuing.

---

### Task 4: Publish and Deploy the Exact Passing Commit to Staging

**Files:**
- No source files unless CI exposes a reproducible repository defect.

**Interfaces:**
- Consumes: the exact local commit that passed Task 3.
- Produces: a successful GitHub release gate and isolated staging rollout for the same commit.

- [ ] **Step 1: Record and push the release-candidate commit**

Run:

```bash
git rev-parse HEAD
git push origin agent/complete-audit-fixes
```

Expected: the remote branch advances to the recorded SHA.

- [ ] **Step 2: Wait for the GitHub release gate**

Run:

```bash
gh run list --branch agent/complete-audit-fixes --workflow ci.yml --limit 2
```

Open the newest run with `gh run watch <run-id> --exit-status`.

Expected: App checks, Functions build, Firebase rules, and Dependency audit all succeed for the recorded SHA.

- [ ] **Step 3: Trigger the protected staging workflow**

Run:

```bash
gh workflow run deploy-staging.yml --ref agent/complete-audit-fixes
```

Then identify the new run with:

```bash
gh run list --branch agent/complete-audit-fixes --workflow deploy-staging.yml --limit 1
```

Watch it with `gh run watch <run-id> --exit-status`. If the protected environment requests approval, stop and ask the user to approve that specific staging run.

- [ ] **Step 4: Verify deployed health and protected-route behavior**

Run:

```bash
curl --fail --silent --show-error --max-time 20 https://studio--the-squad-v2-staging.us-east4.hosted.app/api/health
curl --silent --show-error --max-time 20 -o /dev/null -w '%{http_code} %{redirect_url}\n' https://studio--the-squad-v2-staging.us-east4.hosted.app/dashboard
```

Expected: health returns `status: ok` with a new revision, and anonymous `/dashboard` returns a login redirect with a preserved `returnTo` value.

---

### Task 5: Run Post-Deployment Browser and Provider Certification

**Files:**
- Modify only the audit documents after evidence is complete.

**Interfaces:**
- Consumes: deployed staging release candidate, staging-only Super Admin identity, Stripe test configuration, Resend staging configuration.
- Produces: desktop/mobile evidence, provider configuration evidence, signed callback evidence, and an explicit list of confirmation-gated checks.

- [ ] **Step 1: Reauthenticate the staging Super Admin and verify session persistence**

Open `/login`, authenticate with the staging-only Super Admin account, confirm routing to `/admin`, reload once, and confirm the signed-in identity and administration navigation remain present. Never record the password.

- [ ] **Step 2: Verify all Super Admin sections at desktop width**

Open Accounts, Users Directory, Beta Apps, Bug Reports, Newsletters, Sports Hub, and Links & Embeds. Confirm the expected heading loads and collect console warnings/errors after the sweep.

Expected: all seven sections render with no global error state and no console warning or error.

- [ ] **Step 3: Verify all Super Admin sections at 390-by-844**

Set the in-app browser viewport to 390-by-844 and repeat the seven-section sweep. For each section, evaluate:

```js
({
  innerWidth: window.innerWidth,
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth,
})
```

Expected: `scrollWidth === clientWidth === innerWidth`, the Bug Reports Refresh button is fully visible, and all three Newsletter section buttons are fully visible. Reset the viewport afterward.

- [ ] **Step 4: Verify the deployed billing demo label**

Sign out of the staging Super Admin session, launch Squad Pro Demo, open Billing, and confirm the status reads `Demo plan` rather than `Free tier`. Restore a clean signed-out state after the check.

- [ ] **Step 5: Re-run sanitized provider configuration checks**

Verify without printing values that all required staging secret names exist, `STRIPE_SECRET_KEY` is test-mode, price identifiers resolve to active CAD recurring prices, the verified Resend domain is active, and the current staging webhook URLs are enabled.

- [ ] **Step 6: Verify callback rejection and current signed delivery**

Send unsigned or incorrectly signed fixture requests to the staging Stripe and Resend callback endpoints and require HTTP 400 or 401. Use a Stripe test-mode event or confirmed test checkout to prove the current standard endpoint accepts a provider-signed delivery. Use a Connect test event only if the provider account has an isolated staging Connect fixture.

- [ ] **Step 7: Request confirmation for side-effecting provider tests**

Immediately before each action, ask the user to confirm the exact staging action and destination:

- a Stripe test-mode checkout/failure/cancellation sequence;
- one staging test email to the specified inbox;
- one browser notification permission prompt and staging push;
- disabling the older duplicate standard and Connect Stripe webhook endpoints.

Do not group an unavailable device or inbox into a passed result.

- [ ] **Step 8: Disable only superseded staging Stripe endpoints after confirmation**

Re-list endpoint IDs and creation times. Preserve the enabled standard endpoint created at `2026-08-17T16:59:28Z` and Connect endpoint created at `2026-08-17T17:00:54Z`. Disable the older staging standard endpoint created at `2026-08-17T11:44:31Z` and older Connect endpoint created at `2026-08-17T11:43:40Z`. Re-list endpoints and confirm exactly one enabled endpoint remains for each staging URL.

---

### Task 6: Synchronize the Audit Ledger and Final Release Decision

**Files:**
- Modify: `qa-audit/MASTER_APPLICATION_AUDIT_2026-08-16.md`
- Modify: `qa-audit/RELEASE_CHECKLIST.md`

**Interfaces:**
- Consumes: exact local/CI totals, deployed SHA and revision, browser evidence, provider evidence, and user-gated results.
- Produces: one internally consistent release decision with no unsupported pass claims.

- [ ] **Step 1: Update the master audit**

Record:

- the staging Super Admin claim and browser coverage without credentials;
- the two mobile layout root causes, fixes, and desktop/mobile retest results;
- the billing demo-label root cause, fix, and staging retest;
- sanitized Stripe price, webhook, Resend domain, and Resend webhook results;
- duplicate Stripe endpoint cleanup results or the exact confirmation blocker;
- provider delivery results or exact user-gated reasons;
- complete local and GitHub gate totals;
- deployed SHA, workflow run, health revision, and test timestamp;
- the final production decision.

- [ ] **Step 2: Synchronize the release checklist**

Mark an item complete only when the master audit contains matching evidence. Replace stale deployment references with the current staging release-candidate evidence while retaining production rollback and monitoring requirements.

- [ ] **Step 3: Run documentation consistency checks**

Run:

```bash
rg -n "not ready|approved|BLOCKED|OPEN|user-gated|release blocker" qa-audit/MASTER_APPLICATION_AUDIT_2026-08-16.md qa-audit/RELEASE_CHECKLIST.md
git diff --check
```

Read every match and resolve contradictions. User-gated delivery/device evidence may remain open, but it must not be described as passed elsewhere.

- [ ] **Step 4: Commit the evidence ledger**

```bash
git add qa-audit/MASTER_APPLICATION_AUDIT_2026-08-16.md qa-audit/RELEASE_CHECKLIST.md
git commit -m "docs: certify staging release readiness"
git push origin agent/complete-audit-fixes
```

- [ ] **Step 5: Verify the documentation-only commit did not change runtime output**

Run:

```bash
git diff HEAD^ -- src tests functions firestore.rules storage.rules package.json package-lock.json
git diff --check
```

Expected: the final evidence commit contains no runtime, policy, dependency, or test changes and has no whitespace errors.

