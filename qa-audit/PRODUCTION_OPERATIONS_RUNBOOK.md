# Production Operations Runbook

## Release ownership and approvals

- The application owner is responsible for approving production promotion, rollback, provider changes, and incident closure.
- Operational notifications are routed to the designated owner channel. The channel must be verified before production promotion.
- Staging is always deployed and certified before production. A staging approval never authorizes a production deployment or provider mutation.
- Deploy only an immutable commit that passed the GitHub release gate and the protected staging workflow.

## Pre-deploy gate

1. Confirm the exact candidate SHA and a successful release-gate run for that SHA.
2. Confirm the protected staging workflow deployed the same SHA and `/api/health` returns HTTP 200 with `status=ok`.
3. Confirm typecheck, lint, application tests, Firebase rules tests, Next build, Functions build, and both production dependency audits pass.
4. Confirm authenticated role smoke tests, anonymous protected-route redirects, responsive checks, and the Stripe, Resend, and FCM staging evidence in `RELEASE_CHECKLIST.md`.
5. Confirm production secrets, project IDs, domains, provider modes, webhook destinations, backup schedule, notification channel, and alert policies point only to production resources.
6. Record the current production application revision, Functions deployment, rules release, and database backup before promotion.

## Monitoring and incident response

- Availability: alert when `/api/health` fails its status/body contract for two minutes across a majority of uptime-check locations.
- Runtime: alert on `ERROR` logs from App Hosting/Cloud Run and Firebase Functions, rate-limited to avoid notification storms.
- Provider smoke: inspect Stripe, Resend, webhook-ledger, App Hosting, and Functions errors during and after every controlled provider test.
- Severity 1: authentication unavailable, cross-tenant exposure, destructive data behavior, or widespread billing failure. Stop promotion, preserve logs, revoke affected credentials if needed, and roll back.
- Severity 2: a major workflow or provider integration is degraded without evidence of data exposure. Pause promotion, isolate the failing component, and roll back if mitigation is not immediate.
- Severity 3: isolated or cosmetic defects. Record, prioritize, and ship through the normal release gate.
- Do not paste secret values, session tokens, provider signing secrets, or FCM registration tokens into tickets, logs, or audit documents.

## Rollback

1. Stop additional promotion and provider mutations.
2. Redeploy the last known-good immutable application commit through the protected workflow. For the current staging candidate, the immediate known-good predecessor is revision `studio-build-2026-08-18-003` from commit `d1e4a11d0a242a7dda57c571500c59b110910a9a`.
3. Redeploy Functions and Firestore/Storage rules from that same commit so application and backend policy remain aligned.
4. Do not delete Firestore indexes during an incident. Additive index deployment can remain in place unless a reviewed reversal specifically requires otherwise.
5. This candidate contains no data migration. If a future release changes stored data, its release record must include a tested forward repair and reversal procedure before approval.
6. Re-run health, anonymous redirect, authenticated role, provider-signature, and critical workflow smoke tests after rollback.

## Backup and restore

- Staging uses a daily Firestore backup schedule with seven-day retention.
- Production must have an independently verified backup schedule and retention decision before live promotion; staging backups are never a substitute for production backups.
- Before a data-changing production release, verify that a recent backup exists and record its resource identifier in the release record.
- Restore into an isolated recovery database/project first. Validate document counts, tenant boundaries, rules compatibility, and critical reads before considering any production cutover.
- Never overwrite the active production database as the first restore test.

## Post-deploy verification

1. Verify `/api/health`, the deployed revision, anonymous redirects, and authenticated access.
2. Exercise the primary dashboards at desktop and mobile widths without horizontal overflow.
3. Verify billing entitlements and provider modes without creating an unapproved charge, email, or push.
4. Inspect application, Functions, Stripe, Resend, and webhook-ledger errors for at least the release observation window defined by the owner.
5. Record the exact SHA, workflow run, revision, smoke evidence, monitoring state, and rollback target in `RELEASE_CHECKLIST.md`.
