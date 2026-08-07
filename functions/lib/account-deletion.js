"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_MAP_TARGETS = exports.USER_ARRAY_TARGETS = exports.USER_DOCUMENT_TARGETS = void 0;
/**
 * Application records owned by an account and safe to remove after the
 * seven-day retention period. Payment, subscription, Stripe webhook, and
 * donation audit records are intentionally excluded and must follow the
 * business's financial-record retention policy.
 */
exports.USER_DOCUMENT_TARGETS = [
    { scope: "collection", collection: "calendarFeeds", field: "userId" },
    { scope: "collection", collection: "calendarSync", field: "userId" },
    { scope: "collection", collection: "alerts", field: "createdBy" },
    { scope: "collection", collection: "bug_reports", field: "userId" },
    { scope: "collection", collection: "notificationDeviceTokens", field: "userId" },
    { scope: "collection", collection: "invites", field: "createdBy" },
    { scope: "collection", collection: "invites", field: "parentId" },
    { scope: "collectionGroup", collection: "members", field: "userId" },
    { scope: "collectionGroup", collection: "messages", field: "authorId" },
    { scope: "collectionGroup", collection: "signatures", field: "userId" },
    { scope: "collectionGroup", collection: "accessRedemptions", field: "userId" },
    { scope: "collectionGroup", collection: "teamMemberships", field: "userId" },
];
/** Remove the deleted UID from organization access caches and chat rosters. */
exports.USER_ARRAY_TARGETS = [
    { scope: "collection", collection: "leagues", field: "memberUserIds" },
    { scope: "collection", collection: "tournaments", field: "memberUserIds" },
    { scope: "collectionGroup", collection: "groupChats", field: "memberIds" },
];
/** Remove embedded personal participation data stored under a UID map key. */
exports.USER_MAP_TARGETS = [
    { collectionGroup: "volunteers", mapField: "signups" },
    { collectionGroup: "fundraising", mapField: "finances" },
    {
        collectionGroup: "equipment",
        mapField: "assignments",
        restoreQuantityField: "availableQuantity",
    },
    { collectionGroup: "events", mapField: "userRsvps" },
    { collectionGroup: "drills", mapField: "watchedBy" },
];
//# sourceMappingURL=account-deletion.js.map