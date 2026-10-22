"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildReminderDeepLink = buildReminderDeepLink;
/** Builds an encoded, tenant-scoped route for a scheduled event reminder. */
function buildReminderDeepLink(entry) {
    const params = new URLSearchParams({
        teamId: entry.teamId,
        eventId: entry.eventId,
    });
    return `/calendar?${params.toString()}`;
}
//# sourceMappingURL=reminder-deep-link.js.map