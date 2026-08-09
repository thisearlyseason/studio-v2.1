# Production Function Recovery

Use this runbook after restoring an active billing account to the production Firebase project.

1. Run the production infrastructure workflow. It deploys Functions, indexes, Firestore rules, and Storage rules, then invokes `getCalendarFeed` and verifies the deployed Firestore ruleset byte-for-byte.
2. Trigger `purgeExpiredDeletionRequests` and `cleanupAnonymousUsers` once from Cloud Scheduler. Both jobs select only overdue records and are safe to retry.
3. Run `node scripts/audit-production-recovery.mjs` with production Application Default Credentials. Exit code 2 means recovery work remains; the command is read-only.
4. Run `node scripts/cleanup-orphan-demo-data.mjs`, review the dry-run counts, then rerun with `--apply`. This removes only `isDemo` roots whose Auth owner no longer exists and is idempotent.
5. Run `node scripts/backfill-league-member-users.mjs --verbose`, review the dry-run counts, then rerun with `--apply`. The operation is idempotent.
6. Confirm `sendUpcomingEventReminders` resumes. Reminder documents use deterministic delivery keys, so retries do not duplicate a previously recorded delivery.
7. Re-run the recovery inventory until every count is zero, then confirm the hourly `Production Firebase health` workflow passes.

Do not invoke recovery cleanup while billing is disabled: partial provider failures make completion evidence unreliable.
