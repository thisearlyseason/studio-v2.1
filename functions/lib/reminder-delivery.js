"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectReminderDeliveryTargets = selectReminderDeliveryTargets;
exports.canClaimReminderDelivery = canClaimReminderDelivery;
function validFcmToken(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 4_096;
}
function validWebPushSubscription(value) {
    if (!value || typeof value !== 'object')
        return false;
    const candidate = value;
    if (typeof candidate.endpoint !== 'string' || candidate.endpoint.length === 0 || candidate.endpoint.length > 4_096)
        return false;
    try {
        const endpoint = new URL(candidate.endpoint);
        if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password)
            return false;
    }
    catch {
        return false;
    }
    return typeof candidate.keys?.p256dh === 'string' && candidate.keys.p256dh.length > 0 &&
        typeof candidate.keys?.auth === 'string' && candidate.keys.auth.length > 0;
}
/**
 * Select delivery transports after applying the schedule recipient policy.
 * The PWA stores standards Web Push subscriptions, while older installations
 * can still have FCM registrations; either transport is eligible.
 */
function selectReminderDeliveryTargets(profile) {
    if (!['parent', 'adult_player', 'youth_player'].includes(String(profile.role || '')) ||
        profile.notificationsEnabled === false || profile.upcomingEventNotificationsEnabled === false) {
        return { fcmTokens: [], webPushSubscriptions: [] };
    }
    const fcmTokens = Array.isArray(profile.fcmTokens)
        ? [...new Set(profile.fcmTokens.filter(validFcmToken))]
        : [];
    const subscriptions = Array.isArray(profile.webPushSubscriptions)
        ? profile.webPushSubscriptions.filter(validWebPushSubscription)
        : [];
    const seenEndpoints = new Set();
    const webPushSubscriptions = subscriptions.filter(subscription => {
        if (seenEndpoints.has(subscription.endpoint))
            return false;
        seenEndpoints.add(subscription.endpoint);
        return true;
    });
    return { fcmTokens, webPushSubscriptions };
}
/** A completed send is terminal; failed and expired leases can retry. */
function canClaimReminderDelivery(state, nowMs) {
    if (state.status === 'sent')
        return false;
    const leaseExpiresAt = typeof state.leaseExpiresAt === 'number' ? state.leaseExpiresAt : 0;
    return state.status !== 'processing' || leaseExpiresAt <= nowMs;
}
//# sourceMappingURL=reminder-delivery.js.map