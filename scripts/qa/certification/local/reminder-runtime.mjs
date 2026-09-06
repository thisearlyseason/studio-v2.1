import path from 'node:path';
import {require as tsRequire} from 'tsx/cjs/api';

// Use the same tracked TypeScript core as the Function and focused tests.
// A prior functions build (or stale/untracked functions/lib file) is not input.
export async function loadReminderSchedulerCore(repositoryRoot = process.cwd()) {
  const source = path.resolve(repositoryRoot, 'functions/src/event-reminder-runner.ts');
  const runtime = tsRequire(source, import.meta.url);
  return runtime.runUpcomingEventReminderCore;
}

export const REMINDER_ELIGIBLE_ASSERTION_PATTERNS = Object.freeze([
  /^Reminder scheduler core sends one same-day eligible FCM and Web Push delivery$/,
  ...['qa-parent-a', 'qa-adult-player-a', 'qa-youth-active'].flatMap(alias => [
    new RegExp(`^Reminder scheduler writes one same-day PA/AP/YP delivery ledger for ${alias}$`),
    new RegExp(`^Reminder scheduler eligible FCM target for ${alias}$`),
    new RegExp(`^Reminder scheduler eligible Web Push target for ${alias}$`),
  ]),
]);
