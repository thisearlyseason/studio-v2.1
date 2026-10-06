"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runUpcomingEventReminderCore = runUpcomingEventReminderCore;
const event_reminders_1 = require("./event-reminders");
const reminder_delivery_1 = require("./reminder-delivery");
/**
 * The scheduled Function delegates to this core.  Keeping all time, storage,
 * lease, and delivery edges injected makes the exact production behavior safe
 * to exercise against the emulator without a provider or device send.
 */
async function runUpcomingEventReminderCore(runner) {
    let sentCount = 0;
    let failedCount = 0;
    let claimedCount = 0;
    const candidates = await runner.listEvents();
    for (const candidate of candidates) {
        const team = await runner.getTeam(candidate.teamId);
        if (!team || !(0, event_reminders_1.shouldSendSameDayReminder)(candidate.event, runner.now, typeof team.timeZone === 'string' ? team.timeZone : undefined))
            continue;
        const memberIds = [...new Set((await runner.listMembers(candidate.teamId))
                .filter(member => member.status !== 'removed' && member.isDeleted !== true && typeof member.userId === 'string' && member.userId.length > 0)
                .map(member => member.userId))];
        for (const userId of memberIds) {
            const user = await runner.getUser(userId);
            if (!user)
                continue;
            const targets = (0, reminder_delivery_1.selectReminderDeliveryTargets)(user);
            if (targets.fcmTokens.length === 0 && targets.webPushSubscriptions.length === 0)
                continue;
            const entry = { teamId: candidate.teamId, eventId: candidate.eventId, userId };
            if (!await runner.claim(entry))
                continue;
            claimedCount += 1;
            try {
                const kind = (0, event_reminders_1.normalizeEventKind)(candidate.event);
                const outcome = await runner.deliver({
                    entry,
                    event: candidate.event,
                    targets,
                    title: `Upcoming ${kind.replace(/^./, letter => letter.toUpperCase())}`,
                    body: (0, event_reminders_1.buildUpcomingEventMessage)(candidate.event),
                });
                if (outcome.successCount < 1)
                    throw new Error('No registered device accepted the reminder.');
                await runner.markSent({ ...entry, successCount: outcome.successCount, failureCount: outcome.failureCount });
                runner.diagnostic?.({ type: 'sent', teamId: entry.teamId, eventId: entry.eventId, targetCount: outcome.successCount + outcome.failureCount, failureCount: outcome.failureCount });
                sentCount += 1;
            }
            catch (error) {
                const diagnostic = error instanceof Error ? error.message : 'Reminder delivery failed.';
                await runner.markFailed({ ...entry, diagnostic });
                runner.diagnostic?.({ type: 'failed', teamId: entry.teamId, eventId: entry.eventId, targetCount: targets.fcmTokens.length + targets.webPushSubscriptions.length, failureCount: 1 });
                failedCount += 1;
            }
        }
    }
    return { sentCount, failedCount, claimedCount };
}
//# sourceMappingURL=event-reminder-runner.js.map