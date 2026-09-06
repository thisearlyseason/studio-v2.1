import {
  buildUpcomingEventMessage,
  normalizeEventKind,
  shouldSendSameDayReminder,
  type ReminderEvent,
} from './event-reminders';
import { selectReminderDeliveryTargets } from './reminder-delivery';

export type ReminderCandidate = { teamId: string; eventId: string; event: ReminderEvent };
export type ReminderMember = { userId?: unknown; status?: unknown; isDeleted?: unknown };
export type ReminderLedgerEntry = {
  teamId: string; eventId: string; userId: string; successCount?: number; failureCount?: number; diagnostic?: string;
};

export type ReminderRunner = {
  now: Date;
  listEvents(): Promise<ReminderCandidate[]>;
  getTeam(teamId: string): Promise<{ timeZone?: unknown } | null>;
  listMembers(teamId: string): Promise<ReminderMember[]>;
  getUser(userId: string): Promise<Record<string, unknown> | null>;
  claim(entry: Pick<ReminderLedgerEntry, 'teamId' | 'eventId' | 'userId'>): Promise<boolean>;
  markSent(entry: Required<Pick<ReminderLedgerEntry, 'teamId' | 'eventId' | 'userId' | 'successCount' | 'failureCount'>>): Promise<void>;
  markFailed(entry: Required<Pick<ReminderLedgerEntry, 'teamId' | 'eventId' | 'userId' | 'diagnostic'>>): Promise<void>;
  deliver(input: { entry: Pick<ReminderLedgerEntry, 'teamId' | 'eventId' | 'userId'>; event: ReminderEvent; targets: ReturnType<typeof selectReminderDeliveryTargets>; title: string; body: string }): Promise<{ successCount: number; failureCount: number }>;
  /** Deliberately excludes device addresses, user IDs, and message bodies. */
  diagnostic?(event: { type: 'sent' | 'failed'; teamId: string; eventId: string; targetCount: number; failureCount: number }): void;
};

/**
 * The scheduled Function delegates to this core.  Keeping all time, storage,
 * lease, and delivery edges injected makes the exact production behavior safe
 * to exercise against the emulator without a provider or device send.
 */
export async function runUpcomingEventReminderCore(runner: ReminderRunner): Promise<{ sentCount: number; failedCount: number; claimedCount: number }> {
  let sentCount = 0;
  let failedCount = 0;
  let claimedCount = 0;
  const candidates = await runner.listEvents();
  for (const candidate of candidates) {
    const team = await runner.getTeam(candidate.teamId);
    if (!team || !shouldSendSameDayReminder(candidate.event, runner.now, typeof team.timeZone === 'string' ? team.timeZone : undefined)) continue;
    const memberIds = [...new Set((await runner.listMembers(candidate.teamId))
      .filter(member => member.status !== 'removed' && member.isDeleted !== true && typeof member.userId === 'string' && member.userId.length > 0)
      .map(member => member.userId as string))];
    for (const userId of memberIds) {
      const user = await runner.getUser(userId);
      if (!user) continue;
      const targets = selectReminderDeliveryTargets(user);
      if (targets.fcmTokens.length === 0 && targets.webPushSubscriptions.length === 0) continue;
      const entry = { teamId: candidate.teamId, eventId: candidate.eventId, userId };
      if (!await runner.claim(entry)) continue;
      claimedCount += 1;
      try {
        const kind = normalizeEventKind(candidate.event);
        const outcome = await runner.deliver({
          entry,
          event: candidate.event,
          targets,
          title: `Upcoming ${kind.replace(/^./, letter => letter.toUpperCase())}`,
          body: buildUpcomingEventMessage(candidate.event),
        });
        if (outcome.successCount < 1) throw new Error('No registered device accepted the reminder.');
        await runner.markSent({ ...entry, successCount: outcome.successCount, failureCount: outcome.failureCount });
        runner.diagnostic?.({ type: 'sent', teamId: entry.teamId, eventId: entry.eventId, targetCount: outcome.successCount + outcome.failureCount, failureCount: outcome.failureCount });
        sentCount += 1;
      } catch (error) {
        const diagnostic = error instanceof Error ? error.message : 'Reminder delivery failed.';
        await runner.markFailed({ ...entry, diagnostic });
        runner.diagnostic?.({ type: 'failed', teamId: entry.teamId, eventId: entry.eventId, targetCount: targets.fcmTokens.length + targets.webPushSubscriptions.length, failureCount: 1 });
        failedCount += 1;
      }
    }
  }
  return { sentCount, failedCount, claimedCount };
}
