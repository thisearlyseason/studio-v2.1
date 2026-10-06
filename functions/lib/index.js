"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendUpcomingEventReminders = exports.cleanupAnonymousUsers = exports.purgeExpiredDeletionRequests = exports.getCalendarFeed = exports.redeemLeagueInvite = exports.onTeamMemberDeleted = exports.onTeamMemberCreated = exports.onLeagueTenantDeleted = exports.onLeagueTenantEntitlementChanged = exports.onLeagueOwnerDeleted = exports.onLeagueOwnerEntitlementChanged = exports.onLeagueDeleted = exports.onLeagueAccessChanged = exports.onLeagueCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = __importStar(require("firebase-admin"));
const webpush = __importStar(require("web-push"));
const account_deletion_1 = require("./account-deletion");
const event_reminders_1 = require("./event-reminders");
const reminder_delivery_1 = require("./reminder-delivery");
const reminder_deep_link_1 = require("./reminder-deep-link");
const calendar_feed_1 = require("./calendar-feed");
const calendar_feed_public_boundary_1 = require("./calendar-feed-public-boundary");
const event_reminder_runner_1 = require("./event-reminder-runner");
const league_public_projection_1 = require("./league-public-projection");
admin.initializeApp();
const db = admin.firestore();
function reminderWebPushConfiguration() {
    const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim();
    const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
    if (!subject || !publicKey || !privateKey)
        return null;
    return { subject, publicKey, privateKey };
}
async function sendReminderWebPush(subscriptions, title, body, reminderUrl) {
    if (!subscriptions.length)
        return { successCount: 0, failureCount: 0 };
    if (process.env.AUDIT_OUTBOUND_PROVIDER_MODE === "block") {
        throw new Error("Notification outbound provider access is blocked for the isolated emulator audit.");
    }
    const configuration = reminderWebPushConfiguration();
    if (!configuration)
        return { successCount: 0, failureCount: subscriptions.length };
    webpush.setVapidDetails(configuration.subject, configuration.publicKey, configuration.privateKey);
    const payload = JSON.stringify({ webPush: { title, body, url: reminderUrl } });
    const results = await Promise.allSettled(subscriptions.map(subscription => webpush.sendNotification(subscription, payload, { TTL: 3_600, urgency: "high" })));
    return {
        successCount: results.filter(result => result.status === "fulfilled").length,
        failureCount: results.filter(result => result.status === "rejected").length,
    };
}
/**
 * League documents cache the user IDs entitled to read them. This field is
 * maintained by trusted server code, never by the browser. It includes the
 * organizer and all user-backed memberships of each enrolled team.
 */
async function syncLeagueMemberUsers(leagueId) {
    const leagueRef = db.collection("leagues").doc(leagueId);
    const leagueSnap = await leagueRef.get();
    if (!leagueSnap.exists)
        return;
    const league = leagueSnap.data() || {};
    const userIds = new Set();
    if (typeof league.creatorId === "string" && league.creatorId)
        userIds.add(league.creatorId);
    const teamIds = Array.isArray(league.memberTeamIds) ? league.memberTeamIds : [];
    await Promise.all(teamIds
        .filter((teamId) => typeof teamId === "string" && !teamId.startsWith("manual_") && !teamId.startsWith("recruit_"))
        .map(async (teamId) => {
        const members = await db.collection("teams").doc(teamId).collection("members").get();
        members.forEach((member) => {
            const userId = member.data().userId;
            if (typeof userId === "string" && userId)
                userIds.add(userId);
        });
    }));
    const next = [...userIds].sort();
    const current = Array.isArray(league.memberUserIds)
        ? league.memberUserIds.filter((userId) => typeof userId === "string").sort()
        : [];
    if (next.length === current.length && next.every((userId, index) => userId === current[index]))
        return;
    await leagueRef.update({ memberUserIds: next });
}
async function syncLeaguesForTeam(teamId) {
    const leagues = await db.collection("leagues")
        .where("memberTeamIds", "array-contains", teamId)
        .get();
    await Promise.all(leagues.docs.map((league) => syncLeagueMemberUsers(league.id)));
}
const leagueProjectionStore = {
    runTransaction: operation => db.runTransaction(async (transaction) => operation({
        read: async (collection, id) => {
            const snapshot = await transaction.get(db.collection(collection).doc(id));
            return {
                exists: snapshot.exists,
                data: snapshot.data() || {},
                version: snapshot.updateTime?.toMillis() || 0,
            };
        },
        write: async (collection, id, data) => { transaction.set(db.collection(collection).doc(id), data); },
        delete: async (collection, id) => { transaction.delete(db.collection(collection).doc(id)); },
    })),
};
/** Publishes only the shared spectator DTO and converges retries transactionally. */
async function syncPublicLeagueView(leagueId, expectedVersion) {
    return (0, league_public_projection_1.syncPublicLeagueView)(leagueId, expectedVersion, leagueProjectionStore);
}
function eventVersion(snapshot) {
    return snapshot?.updateTime?.toMillis();
}
function leaguePage(field, value) {
    return async (cursor) => {
        let query = db.collection("leagues")
            .where(field, "==", value)
            .orderBy(admin.firestore.FieldPath.documentId())
            .limit(100);
        if (cursor)
            query = query.startAfter(cursor);
        const snapshot = await query.get();
        return {
            ids: snapshot.docs.map(document => document.id),
            nextCursor: snapshot.size === 100 ? snapshot.docs[snapshot.docs.length - 1]?.id : undefined,
        };
    };
}
async function syncLeaguePages(loaders, expectedVersion) {
    for (const loadPage of loaders) {
        await (0, league_public_projection_1.syncPublicLeagueViewPages)(loadPage, expectedVersion, syncPublicLeagueView);
    }
}
exports.onLeagueCreated = (0, firestore_1.onDocumentCreated)("leagues/{leagueId}", async (event) => {
    await Promise.all([
        syncLeagueMemberUsers(event.params.leagueId),
        syncPublicLeagueView(event.params.leagueId, eventVersion(event.data)),
    ]);
});
exports.onLeagueAccessChanged = (0, firestore_1.onDocumentUpdated)("leagues/{leagueId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after)
        return;
    await syncPublicLeagueView(event.params.leagueId, eventVersion(event.data?.after));
    if (before.creatorId !== after.creatorId || JSON.stringify(before.memberTeamIds || []) !== JSON.stringify(after.memberTeamIds || [])) {
        await syncLeagueMemberUsers(event.params.leagueId);
    }
});
exports.onLeagueDeleted = (0, firestore_1.onDocumentDeleted)("leagues/{leagueId}", async (event) => {
    await syncPublicLeagueView(event.params.leagueId, eventVersion(event.data));
});
exports.onLeagueOwnerEntitlementChanged = (0, firestore_1.onDocumentUpdated)("users/{userId}", async (event) => {
    await syncLeaguePages([
        leaguePage("billingOwnerUserId", event.params.userId),
        leaguePage("creatorId", event.params.userId),
    ], eventVersion(event.data?.after));
});
exports.onLeagueOwnerDeleted = (0, firestore_1.onDocumentDeleted)("users/{userId}", async (event) => {
    await syncLeaguePages([
        leaguePage("billingOwnerUserId", event.params.userId),
        leaguePage("creatorId", event.params.userId),
    ], eventVersion(event.data));
});
exports.onLeagueTenantEntitlementChanged = (0, firestore_1.onDocumentUpdated)("teams/{teamId}", async (event) => {
    await syncLeaguePages([leaguePage("tenantId", event.params.teamId)], eventVersion(event.data?.after));
});
exports.onLeagueTenantDeleted = (0, firestore_1.onDocumentDeleted)("teams/{teamId}", async (event) => {
    await syncLeaguePages([leaguePage("tenantId", event.params.teamId)], eventVersion(event.data));
});
exports.onTeamMemberCreated = (0, firestore_1.onDocumentCreated)("teams/{teamId}/members/{memberId}", async (event) => {
    await syncLeaguesForTeam(event.params.teamId);
});
exports.onTeamMemberDeleted = (0, firestore_1.onDocumentDeleted)("teams/{teamId}/members/{memberId}", async (event) => {
    await syncLeaguesForTeam(event.params.teamId);
});
/**
 * Redeems a league invite code for the signed-in user. The client never reads
 * the league collection to validate codes and cannot grant itself access.
 */
exports.redeemLeagueInvite = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Sign in before joining a league.");
    }
    const provider = request.auth.token.firebase?.sign_in_provider;
    if (provider === "anonymous") {
        throw new https_1.HttpsError("permission-denied", "Use a registered account to join a league.");
    }
    if (request.auth.token.email_verified !== true &&
        request.auth.token.role !== "superadmin") {
        throw new https_1.HttpsError("permission-denied", "Verify your email before joining a league.");
    }
    const inviteCode = typeof request.data?.inviteCode === "string"
        ? request.data.inviteCode.trim().toUpperCase()
        : "";
    if (!/^[A-Z0-9_-]{3,64}$/.test(inviteCode)) {
        throw new https_1.HttpsError("invalid-argument", "Enter a valid league invite code.");
    }
    const match = await db.collection("leagues")
        .where("inviteCode", "==", inviteCode)
        .limit(1)
        .get();
    let leagueRef = match.docs[0]?.ref;
    if (!leagueRef) {
        // Backward-compatible organizer/member links may use a league document ID.
        // They do not grant new access to someone who has not redeemed an invite.
        const directRef = db.collection("leagues").doc(inviteCode);
        const direct = await directRef.get();
        const existingMembers = Array.isArray(direct.data()?.memberUserIds) ? direct.data()?.memberUserIds : [];
        if (direct.exists && (direct.data()?.creatorId === request.auth.uid || existingMembers.includes(request.auth.uid))) {
            leagueRef = directRef;
        }
    }
    if (!leagueRef) {
        throw new https_1.HttpsError("not-found", "That league invite code is not valid.");
    }
    await leagueRef.update({
        memberUserIds: admin.firestore.FieldValue.arrayUnion(request.auth.uid),
        lastInviteRedeemedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await leagueRef.collection("accessRedemptions").doc(request.auth.uid).set({
        userId: request.auth.uid,
        redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { leagueId: leagueRef.id };
});
/**
 * Dynamic ICS generator for calendar subscriptions.
 * Validates unguessable token and pulls real-time event status.
 */
function isActiveCalendarMembership(data) {
    return data.status !== "removed" && data.isDeleted !== true;
}
async function hasCurrentCalendarTeamAccess(teamId, userId) {
    const teamRef = db.collection("teams").doc(teamId);
    const members = teamRef.collection("members");
    const [team, direct, linked, child] = await Promise.all([
        teamRef.get(),
        members.doc(userId).get(),
        members.where("userId", "==", userId).limit(10).get(),
        members.where("parentId", "==", userId).limit(10).get(),
    ]);
    if (!team.exists)
        return false;
    if (team.data()?.ownerUserId === userId)
        return true;
    return ((direct.exists && isActiveCalendarMembership(direct.data() || {})) ||
        linked.docs.some(member => isActiveCalendarMembership(member.data())) ||
        child.docs.some(member => isActiveCalendarMembership(member.data())));
}
async function getCurrentCalendarTeamIds(userId) {
    const [linked, children, owned] = await Promise.all([
        db.collectionGroup("members").where("userId", "==", userId).get(),
        db.collectionGroup("members").where("parentId", "==", userId).get(),
        db.collection("teams").where("ownerUserId", "==", userId).get(),
    ]);
    const teamIds = new Set(owned.docs.map(team => team.id));
    for (const membership of [...linked.docs, ...children.docs]) {
        const path = membership.ref.path.split("/");
        const teamId = path.length === 4 && path[0] === "teams" && path[2] === "members"
            ? path[1]
            : null;
        if (teamId && isActiveCalendarMembership(membership.data()))
            teamIds.add(teamId);
    }
    return [...teamIds];
}
exports.getCalendarFeed = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    // Path format expected: /calendar/feed/{token}
    // If not using path params, can use query string ?token=...
    const queryToken = req.query.token;
    const pathToken = req.path.split('/').filter(Boolean).pop();
    const token = typeof queryToken === "string" ? queryToken : pathToken;
    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
        const failure = (0, calendar_feed_public_boundary_1.publicCalendarFeedFailure)("malformed");
        res.status(failure.status).send(failure.body);
        return;
    }
    try {
        // 1. Validate Token Integrity
        const feedSnap = await db.collection("calendarFeeds").doc(token).get();
        if (!feedSnap.exists ||
            feedSnap.data()?.active !== true ||
            feedSnap.data()?.serverIssued !== true) {
            const failure = (0, calendar_feed_public_boundary_1.publicCalendarFeedFailure)("inactive");
            res.status(failure.status).send(failure.body);
            return;
        }
        const { type, userId, teamId, teamIds } = feedSnap.data();
        if (typeof userId !== "string" || !userId) {
            const failure = (0, calendar_feed_public_boundary_1.publicCalendarFeedFailure)("invalid-scope");
            res.status(failure.status).send(failure.body);
            return;
        }
        let resolvedTeamIds = [];
        if (type === "team") {
            if (typeof teamId !== "string" || !(await hasCurrentCalendarTeamAccess(teamId, userId))) {
                const failure = (0, calendar_feed_public_boundary_1.publicCalendarFeedFailure)("unauthorized");
                res.status(failure.status).send(failure.body);
                return;
            }
            resolvedTeamIds = [teamId];
        }
        else if (type === "multi") {
            if (!Array.isArray(teamIds) ||
                teamIds.length < 1 ||
                teamIds.length > 25 ||
                teamIds.some(value => typeof value !== "string")) {
                const failure = (0, calendar_feed_public_boundary_1.publicCalendarFeedFailure)("invalid-scope");
                res.status(failure.status).send(failure.body);
                return;
            }
            const access = await Promise.all(teamIds.map(id => hasCurrentCalendarTeamAccess(id, userId)));
            if (access.some(allowed => !allowed)) {
                const failure = (0, calendar_feed_public_boundary_1.publicCalendarFeedFailure)("unauthorized");
                res.status(failure.status).send(failure.body);
                return;
            }
            resolvedTeamIds = teamIds;
        }
        else if (type === "user") {
            resolvedTeamIds = await getCurrentCalendarTeamIds(userId);
        }
        else {
            const failure = (0, calendar_feed_public_boundary_1.publicCalendarFeedFailure)("invalid-scope");
            res.status(failure.status).send(failure.body);
            return;
        }
        let events = [];
        const teamMap = {};
        // 2. Aggregate Intelligence (Events) — filtered to last 3 months + next 12 months
        const now = new Date();
        const threeMonthsAgo = new Date(now);
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        const oneYearAhead = new Date(now);
        oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);
        const dateFrom = threeMonthsAgo.toISOString().split('T')[0]; // 'YYYY-MM-DD'
        const dateTo = oneYearAhead.toISOString().split('T')[0];
        if (type === "team") {
            const resolvedTeamId = resolvedTeamIds[0];
            const teamDoc = await db.collection("teams").doc(resolvedTeamId).get();
            teamMap[resolvedTeamId] = {
                name: teamDoc.data()?.name || "Team",
                timeZone: teamDoc.data()?.timeZone,
            };
            const snap = await db.collection("teams").doc(resolvedTeamId).collection("events")
                .where("date", ">=", dateFrom).where("date", "<=", dateTo).get();
            events = snap.docs.map(doc => ({ ...doc.data(), id: doc.id, teamId: resolvedTeamId }));
        }
        else if (type === "user") {
            if (resolvedTeamIds.length > 0) {
                const teamDocs = await Promise.all(resolvedTeamIds.map(tid => db.collection("teams").doc(tid).get()));
                teamDocs.forEach(td => {
                    if (td.exists)
                        teamMap[td.id] = {
                            name: td.data()?.name || "Team",
                            timeZone: td.data()?.timeZone,
                        };
                });
                const eventPromises = resolvedTeamIds.map(tid => db.collection("teams").doc(tid).collection("events")
                    .where("date", ">=", dateFrom).where("date", "<=", dateTo).get());
                const snaps = await Promise.all(eventPromises);
                events = snaps.flatMap((s, idx) => s.docs.map(doc => ({ ...doc.data(), id: doc.id, teamId: resolvedTeamIds[idx] })));
            }
        }
        else if (type === "multi") {
            // Fetch names for all selected teams
            const teamDocs = await Promise.all(resolvedTeamIds.map(tid => db.collection("teams").doc(tid).get()));
            teamDocs.forEach(td => {
                if (td.exists)
                    teamMap[td.id] = {
                        name: td.data()?.name || "Team",
                        timeZone: td.data()?.timeZone,
                    };
            });
            // Fetch events from all selected teams (date-filtered)
            const eventPromises = resolvedTeamIds.map(tid => db.collection("teams").doc(tid).collection("events")
                .where("date", ">=", dateFrom).where("date", "<=", dateTo).get());
            const snaps = await Promise.all(eventPromises);
            events = snaps.flatMap((s, idx) => s.docs.map(doc => ({ ...doc.data(), id: doc.id, teamId: resolvedTeamIds[idx] })));
        }
        // 3. Strategic Deduplication (Ensures shared games only appear once)
        const uniqueEvents = Array.from(new Map(events.map(event => [`${event.teamId}:${event.id}`, event])).values());
        const calendarName = type === "multi"
            ? "Squad Family Schedule"
            : (type === "team" ? teamMap[resolvedTeamIds[0]]?.name : "Master Schedule") || "Master Schedule";
        const calendar = (0, calendar_feed_1.buildCalendarFeed)(uniqueEvents.map(event => (0, calendar_feed_public_boundary_1.redactCalendarFeedPublicResponse)(event)), teamMap, calendarName)
            // Defense in depth for values introduced by calendar serialization itself.
            .replace(/\b[a-f0-9]{64}\b/gi, "[redacted]");
        // 5. Return Deployment Payload
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="family_feed.ics"');
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        res.send(calendar);
    }
    catch (error) {
        console.error("Failed to generate ICS feed:", error);
        res.status(500).send("Strategic Failure during feed generation.");
    }
});
/**
 * Removes live accounts whose seven-day deletion period has elapsed. The
 * request is stored separately from the profile so retries remain possible if
 * Auth deletion temporarily fails. Organization owners are intentionally
 * skipped: deleting them would orphan teams or leagues.
 */
exports.purgeExpiredDeletionRequests = (0, scheduler_1.onSchedule)({
    schedule: 'every 15 minutes',
    region: 'us-central1',
}, async () => {
    const now = admin.firestore.Timestamp.now();
    const requests = await db.collection('accountDeletionRequests')
        .where('purgeAt', '<=', now)
        .limit(100)
        .get();
    if (requests.empty) {
        console.log('[account-deletion] No expired account deletion requests.');
        return;
    }
    const requestedUids = new Set(requests.docs.map(request => request.id));
    const userMapScan = await (0, account_deletion_1.loadUserMapDocumentsByUid)(account_deletion_1.USER_MAP_TARGETS, requestedUids, async (target, cursor) => {
        let query = db.collectionGroup(target.collectionGroup)
            .orderBy(admin.firestore.FieldPath.documentId())
            .limit(500);
        if (cursor)
            query = query.startAfter(cursor);
        const snapshot = await query.get();
        return {
            documents: snapshot.docs,
            nextCursor: snapshot.size === 500 ? snapshot.docs[snapshot.docs.length - 1] : undefined,
        };
    });
    let purged = 0;
    for (const request of requests.docs) {
        const uid = request.id;
        try {
            if (userMapScan.failedTargets.length > 0) {
                throw new Error(`dynamic-map scan failed for ${userMapScan.failedTargets.join(', ')}`);
            }
            const [user, ownedTeams, ownedLeagues] = await Promise.all([
                db.collection('users').doc(uid).get(),
                db.collection('teams').where('ownerUserId', '==', uid).limit(1).get(),
                db.collection('leagues').where('creatorId', '==', uid).limit(1).get(),
            ]);
            if (!ownedTeams.empty || !ownedLeagues.empty) {
                await Promise.all([
                    request.ref.update({ status: 'blocked', blockedAt: admin.firestore.FieldValue.serverTimestamp() }),
                    user.ref.set({ deletionStatus: 'blocked' }, { merge: true }),
                ]);
                console.error(`[account-deletion] Skipped ${uid}: account still owns an organization.`);
                continue;
            }
            const deletionRefs = new Map();
            for (const target of account_deletion_1.USER_DOCUMENT_TARGETS) {
                const source = target.scope === 'collection'
                    ? db.collection(target.collection)
                    : db.collectionGroup(target.collection);
                const snapshot = await source.where(target.field, '==', uid).get();
                snapshot.docs.forEach((document) => deletionRefs.set(document.ref.path, document.ref));
            }
            const [ownedPlayerProfiles, dependentPlayerProfiles] = await Promise.all([
                db.collection('players').where('userId', '==', uid).get(),
                db.collection('players').where('parentId', '==', uid).get(),
            ]);
            const deletedPlayerIds = new Set();
            ownedPlayerProfiles.docs.forEach((player) => {
                deletedPlayerIds.add(player.id);
            });
            for (const player of dependentPlayerProfiles.docs) {
                const linkedUserId = player.data().userId;
                if (typeof linkedUserId !== 'string' || !linkedUserId || linkedUserId === uid) {
                    deletedPlayerIds.add(player.id);
                }
                else {
                    await player.ref.update({
                        parentId: admin.firestore.FieldValue.delete(),
                        parentEmail: admin.firestore.FieldValue.delete(),
                        guardianEmail: admin.firestore.FieldValue.delete(),
                    });
                }
            }
            for (const playerId of deletedPlayerIds) {
                const memberships = await db.collectionGroup('members')
                    .where('playerId', '==', playerId)
                    .get();
                memberships.docs.forEach((membership) => deletionRefs.set(membership.ref.path, membership.ref));
            }
            for (const target of account_deletion_1.USER_ARRAY_TARGETS) {
                const source = target.scope === 'collection'
                    ? db.collection(target.collection)
                    : db.collectionGroup(target.collection);
                const snapshot = await source.where(target.field, 'array-contains', uid).get();
                await Promise.all(snapshot.docs.map((document) => document.ref.update({
                    [target.field]: admin.firestore.FieldValue.arrayRemove(uid),
                })));
            }
            for (const target of account_deletion_1.USER_MAP_TARGETS) {
                const userEntry = new admin.firestore.FieldPath(target.mapField, uid);
                const matchingDocuments = userMapScan.documentsByTarget
                    .get(`${target.collectionGroup}:${target.mapField}`)
                    ?.get(uid) || [];
                await Promise.all(matchingDocuments.map(async (document) => {
                    const entry = document.data()?.[target.mapField]?.[uid];
                    if (target.restoreQuantityField && Number(entry?.quantity) > 0) {
                        await document.ref.update(userEntry, admin.firestore.FieldValue.delete(), target.restoreQuantityField, admin.firestore.FieldValue.increment(Number(entry.quantity)));
                    }
                    else {
                        await document.ref.update(userEntry, admin.firestore.FieldValue.delete());
                    }
                }));
            }
            const recursivePrefixes = new Set([
                ...deletedPlayerIds,
            ]);
            const bucket = admin.storage().bucket();
            await Promise.all([
                bucket.file(`users/${uid}/avatar.jpg`).delete({ ignoreNotFound: true }),
                ...[...recursivePrefixes].map((playerId) => bucket.deleteFiles({ prefix: `players/${playerId}/` })),
            ]);
            await Promise.all([...deletedPlayerIds].map((playerId) => db.recursiveDelete(db.collection('players').doc(playerId))));
            const refs = [...deletionRefs.values()];
            for (let start = 0; start < refs.length; start += 450) {
                const batch = db.batch();
                refs.slice(start, start + 450).forEach((documentRef) => batch.delete(documentRef));
                await batch.commit();
            }
            // Block preferences are private account data outside the users tree.
            await db.recursiveDelete(db.collection('userSafety').doc(uid));
            if (user.exists)
                await db.recursiveDelete(user.ref);
            try {
                await admin.auth().deleteUser(uid);
            }
            catch (error) {
                if (error.code !== 'auth/user-not-found')
                    throw error;
            }
            await request.ref.delete();
            purged += 1;
        }
        catch (error) {
            console.error(`[account-deletion] Failed to purge ${uid}:`, error.message);
        }
    }
    console.log(`[account-deletion] Purged ${purged} expired account deletion request(s).`);
});
/**
 * TRIGGER 5: cleanupAnonymousUsers (Scheduled)
 * Sweeps anonymous demo accounts after 15 minutes. Live accounts are never
 * handled here; they follow the separate seven-day deletion-request lifecycle.
 */
exports.cleanupAnonymousUsers = (0, scheduler_1.onSchedule)({
    schedule: 'every 15 minutes',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '512MiB',
}, async () => {
    const auth = admin.auth();
    const DEMO_LIFETIME_MS = 15 * 60 * 1000;
    const now = Date.now();
    let pageToken = undefined;
    let deletedCount = 0;
    try {
        do {
            const listUsersResult = await auth.listUsers(1000, pageToken);
            const usersToDelete = [];
            listUsersResult.users.forEach((userRecord) => {
                // Only target anonymous users (no providerData attached)
                if (userRecord.providerData.length === 0) {
                    const creationTime = Date.parse(userRecord.metadata.creationTime);
                    if (now - creationTime > DEMO_LIFETIME_MS) {
                        usersToDelete.push(userRecord.uid);
                    }
                }
            });
            if (usersToDelete.length > 0) {
                // Keep the Auth identity until its data is gone. A failed Firestore
                // operation then remains discoverable and can be retried next run.
                for (const uid of usersToDelete) {
                    try {
                        const [ownedTeamsSnap, demoTeamsSnap, leaguesSnap, playersSnap, facilitiesSnap] = await Promise.all([
                            db.collection('teams').where('ownerUserId', '==', uid).get(),
                            db.collection('teams').where('demoSessionOwnerId', '==', uid).get(),
                            db.collection('leagues').where('creatorId', '==', uid).get(),
                            db.collection('players').where('demoOwnerUserId', '==', uid).get(),
                            db.collection('facilities').where('clubId', '==', uid).get(),
                        ]);
                        const teams = new Map();
                        ownedTeamsSnap.docs.forEach((team) => teams.set(team.id, team));
                        demoTeamsSnap.docs.forEach((team) => teams.set(team.id, team));
                        for (const team of teams.values()) {
                            if (team.data().isDemo === true || team.data().demoSessionOwnerId === uid) {
                                await db.recursiveDelete(team.ref);
                            }
                        }
                        for (const league of leaguesSnap.docs) {
                            if (league.data().isDemo !== true)
                                continue;
                            await db.recursiveDelete(league.ref);
                            await db.collection('publicLeagueViews').doc(league.id).delete();
                        }
                        for (const player of playersSnap.docs) {
                            if (player.data().isDemo === true)
                                await db.recursiveDelete(player.ref);
                        }
                        for (const facility of facilitiesSnap.docs) {
                            if (facility.data().isDemo === true)
                                await db.recursiveDelete(facility.ref);
                        }
                        await db.recursiveDelete(db.collection('userSafety').doc(uid));
                        await db.recursiveDelete(db.collection('users').doc(uid));
                        try {
                            await auth.deleteUser(uid);
                        }
                        catch (error) {
                            if (error.code !== 'auth/user-not-found')
                                throw error;
                        }
                        deletedCount += 1;
                    }
                    catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        console.error(`[cleanup] Failed to delete data for uid ${uid}:`, message);
                    }
                }
            }
            pageToken = listUsersResult.pageToken;
        } while (pageToken);
        console.log(`Swept ${deletedCount} stale anonymous accounts and their data.`);
    }
    catch (error) {
        console.error('Failed to execute cleanup routine:', error);
    }
});
/**
 * Sends one same-day reminder to opted-in active members for each upcoming
 * team event. Delivery claims prevent overlapping scheduler runs from sending
 * the same reminder more than once.
 */
exports.sendUpcomingEventReminders = (0, scheduler_1.onSchedule)({
    schedule: 'every 15 minutes',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '512MiB',
    secrets: ['WEB_PUSH_VAPID_SUBJECT', 'NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY', 'WEB_PUSH_VAPID_PRIVATE_KEY'],
}, async () => {
    const now = new Date();
    const teamCache = new Map();
    const result = await (0, event_reminder_runner_1.runUpcomingEventReminderCore)({
        now,
        listEvents: async () => {
            const eventSnaps = await db.collectionGroup("events").where("date", "in", (0, event_reminders_1.candidateDateKeys)(now)).get();
            return eventSnaps.docs.flatMap(snapshot => {
                const teamRef = snapshot.ref.parent.parent;
                return teamRef ? [{ teamId: teamRef.id, eventId: snapshot.id, event: snapshot.data() }] : [];
            });
        },
        getTeam: async (teamId) => {
            let snapshot = teamCache.get(teamId);
            if (!snapshot) {
                snapshot = await db.collection("teams").doc(teamId).get();
                teamCache.set(teamId, snapshot);
            }
            return snapshot.exists ? snapshot.data() || {} : null;
        },
        listMembers: async (teamId) => (await db.collection("teams").doc(teamId).collection("members").get()).docs.map(item => item.data()),
        getUser: async (userId) => {
            const snapshot = await db.collection("users").doc(userId).get();
            return snapshot.exists ? snapshot.data() || {} : null;
        },
        claim: async (entry) => {
            const ref = db.collection("eventReminderDeliveries").doc(`${entry.teamId}_${entry.eventId}_${entry.userId}`);
            return db.runTransaction(async (transaction) => {
                const snapshot = await transaction.get(ref);
                const data = snapshot.data() || {};
                const leaseExpiresAt = data.leaseExpiresAt?.toMillis?.() || 0;
                if (!(0, reminder_delivery_1.canClaimReminderDelivery)({ status: data.status, leaseExpiresAt }, now.getTime()))
                    return false;
                transaction.set(ref, {
                    ...entry, status: "processing", attempts: Number(data.attempts || 0) + 1,
                    leaseExpiresAt: admin.firestore.Timestamp.fromMillis(now.getTime() + (5 * 60 * 1000)),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                return true;
            });
        },
        markSent: async (entry) => {
            await db.collection("eventReminderDeliveries").doc(`${entry.teamId}_${entry.eventId}_${entry.userId}`).set({
                status: "sent", successCount: entry.successCount, failureCount: entry.failureCount,
                sentAt: admin.firestore.FieldValue.serverTimestamp(), leaseExpiresAt: admin.firestore.FieldValue.delete(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        },
        markFailed: async (entry) => {
            await db.collection("eventReminderDeliveries").doc(`${entry.teamId}_${entry.eventId}_${entry.userId}`).set({
                status: "failed", error: entry.diagnostic, leaseExpiresAt: admin.firestore.FieldValue.delete(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        },
        deliver: async ({ entry, targets, title, body }) => {
            const reminderUrl = (0, reminder_deep_link_1.buildReminderDeepLink)(entry);
            const [fcm, webPush] = await Promise.all([
                targets.fcmTokens.length ? admin.messaging().sendEachForMulticast({
                    tokens: targets.fcmTokens, notification: { title, body },
                    webpush: { notification: { icon: "/favicon-192.png", badge: "/favicon-192.png" }, fcmOptions: { link: reminderUrl } },
                }) : Promise.resolve({ successCount: 0, failureCount: 0 }),
                sendReminderWebPush(targets.webPushSubscriptions, title, body, reminderUrl),
            ]);
            return { successCount: fcm.successCount + webPush.successCount, failureCount: fcm.failureCount + webPush.failureCount };
        },
    });
    console.log(`[event-reminders] Sent ${result.sentCount} same-day active-member reminder(s); ${result.failedCount} failed for retry.`);
});
//# sourceMappingURL=index.js.map