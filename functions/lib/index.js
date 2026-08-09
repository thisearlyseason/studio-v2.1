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
exports.sendUpcomingEventReminders = exports.cleanupAnonymousUsers = exports.purgeExpiredDeletionRequests = exports.getCalendarFeed = exports.redeemLeagueInvite = exports.onTeamMemberDeleted = exports.onTeamMemberCreated = exports.onLeagueDeleted = exports.onLeagueAccessChanged = exports.onLeagueCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = __importStar(require("firebase-admin"));
const account_deletion_1 = require("./account-deletion");
const event_reminders_1 = require("./event-reminders");
const calendar_feed_1 = require("./calendar-feed");
admin.initializeApp();
const db = admin.firestore();
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
/** Publishes only spectator-safe league fields; private league records stay private. */
async function syncPublicLeagueView(leagueId) {
    const leagueSnap = await db.collection("leagues").doc(leagueId).get();
    const publicRef = db.collection("publicLeagueViews").doc(leagueId);
    if (!leagueSnap.exists) {
        await publicRef.delete();
        return;
    }
    const league = leagueSnap.data() || {};
    const teams = Object.fromEntries(Object.entries(league.teams || {}).map(([teamId, team]) => [teamId, {
            teamName: team.teamName || "",
            teamLogoUrl: team.teamLogoUrl || "",
            wins: Number(team.wins || 0),
            losses: Number(team.losses || 0),
            ties: Number(team.ties || 0),
            points: Number(team.points || 0),
        }]));
    const schedule = Array.isArray(league.schedule) ? league.schedule.map((game) => ({
        id: game.id || "",
        team1: game.team1 || "",
        team1Id: game.team1Id || "",
        team2: game.team2 || "",
        team2Id: game.team2Id || "",
        date: game.date || "",
        time: game.time || "",
        location: game.location || "",
        status: game.status || "scheduled",
        isCompleted: Boolean(game.isCompleted),
        score1: Number(game.score1 || 0),
        score2: Number(game.score2 || 0),
    })) : [];
    await publicRef.set({
        id: leagueId,
        name: league.name || "",
        sport: league.sport || "",
        divisionTitle: league.divisionTitle || "",
        teams,
        schedule,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}
exports.onLeagueCreated = (0, firestore_1.onDocumentCreated)("leagues/{leagueId}", async (event) => {
    await Promise.all([
        syncLeagueMemberUsers(event.params.leagueId),
        syncPublicLeagueView(event.params.leagueId),
    ]);
});
exports.onLeagueAccessChanged = (0, firestore_1.onDocumentUpdated)("leagues/{leagueId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after)
        return;
    await syncPublicLeagueView(event.params.leagueId);
    if (before.creatorId !== after.creatorId || JSON.stringify(before.memberTeamIds || []) !== JSON.stringify(after.memberTeamIds || [])) {
        await syncLeagueMemberUsers(event.params.leagueId);
    }
});
exports.onLeagueDeleted = (0, firestore_1.onDocumentDeleted)("leagues/{leagueId}", async (event) => {
    await db.collection("publicLeagueViews").doc(event.params.leagueId).delete();
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
        res.status(400).send("Command Invalid: Mission Critical Token Missing.");
        return;
    }
    try {
        // 1. Validate Token Integrity
        const feedSnap = await db.collection("calendarFeeds").doc(token).get();
        if (!feedSnap.exists ||
            feedSnap.data()?.active !== true ||
            feedSnap.data()?.serverIssued !== true) {
            res.status(403).send("Tactical Error: Feed Token Denied or Decommissioned.");
            return;
        }
        const { type, userId, teamId, teamIds } = feedSnap.data();
        if (typeof userId !== "string" || !userId) {
            res.status(403).send("Tactical Error: Feed Owner Invalid.");
            return;
        }
        let resolvedTeamIds = [];
        if (type === "team") {
            if (typeof teamId !== "string" || !(await hasCurrentCalendarTeamAccess(teamId, userId))) {
                res.status(403).send("Tactical Error: Squad Access Revoked.");
                return;
            }
            resolvedTeamIds = [teamId];
        }
        else if (type === "multi") {
            if (!Array.isArray(teamIds) ||
                teamIds.length < 1 ||
                teamIds.length > 25 ||
                teamIds.some(value => typeof value !== "string")) {
                res.status(403).send("Tactical Error: Feed Scope Invalid.");
                return;
            }
            const access = await Promise.all(teamIds.map(id => hasCurrentCalendarTeamAccess(id, userId)));
            if (access.some(allowed => !allowed)) {
                res.status(403).send("Tactical Error: Squad Access Revoked.");
                return;
            }
            resolvedTeamIds = teamIds;
        }
        else if (type === "user") {
            resolvedTeamIds = await getCurrentCalendarTeamIds(userId);
        }
        else {
            res.status(403).send("Tactical Error: Feed Type Invalid.");
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
        const calendar = (0, calendar_feed_1.buildCalendarFeed)(uniqueEvents, teamMap, calendarName);
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
    let purged = 0;
    for (const request of requests.docs) {
        const uid = request.id;
        try {
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
                const snapshot = await db.collectionGroup(target.collectionGroup)
                    .where(userEntry, '!=', null)
                    .get();
                await Promise.all(snapshot.docs.map(async (document) => {
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
 * Sends one same-day reminder to player and parent accounts for each upcoming
 * team event. Delivery claims prevent overlapping scheduler runs from sending
 * the same reminder more than once.
 */
exports.sendUpcomingEventReminders = (0, scheduler_1.onSchedule)({
    schedule: 'every 15 minutes',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '512MiB',
}, async () => {
    const now = new Date();
    const eventSnaps = await db.collectionGroup("events")
        .where("date", "in", (0, event_reminders_1.candidateDateKeys)(now))
        .get();
    const teamCache = new Map();
    let sentCount = 0;
    for (const eventSnap of eventSnaps.docs) {
        const teamRef = eventSnap.ref.parent.parent;
        if (!teamRef)
            continue;
        const teamId = teamRef.id;
        let teamSnap = teamCache.get(teamId);
        if (!teamSnap) {
            teamSnap = await teamRef.get();
            teamCache.set(teamId, teamSnap);
        }
        if (!teamSnap.exists)
            continue;
        const eventData = eventSnap.data();
        const teamData = teamSnap.data() || {};
        const timeZone = typeof eventData.timeZone === "string"
            ? eventData.timeZone
            : (typeof teamData.timeZone === "string" ? teamData.timeZone : "America/Edmonton");
        if (!(0, event_reminders_1.shouldSendSameDayReminder)(eventData, now, timeZone))
            continue;
        const members = await teamRef.collection("members").get();
        const userIds = [...new Set(members.docs
                .filter((member) => member.data().status !== "removed" && member.data().isDeleted !== true)
                .map((member) => member.data().userId)
                .filter((userId) => typeof userId === "string" && !!userId))];
        if (!userIds.length)
            continue;
        const users = await Promise.all(userIds.map((userId) => db.collection("users").doc(userId).get()));
        for (const userSnap of users) {
            if (!userSnap.exists)
                continue;
            const user = userSnap.data() || {};
            if (!["parent", "adult_player", "youth_player"].includes(user.role))
                continue;
            if (user.notificationsEnabled === false || user.upcomingEventNotificationsEnabled === false)
                continue;
            const tokens = Array.isArray(user.fcmTokens)
                ? [...new Set(user.fcmTokens.filter((token) => typeof token === "string" && !!token))]
                : [];
            if (!tokens.length)
                continue;
            const deliveryRef = db.collection("eventReminderDeliveries")
                .doc(`${teamId}_${eventSnap.id}_${userSnap.id}`);
            const claimed = await db.runTransaction(async (transaction) => {
                const delivery = await transaction.get(deliveryRef);
                const data = delivery.data() || {};
                if (data.status === "sent")
                    return false;
                const leaseExpiresAt = data.leaseExpiresAt?.toMillis?.() || 0;
                if (data.status === "processing" && leaseExpiresAt > Date.now())
                    return false;
                transaction.set(deliveryRef, {
                    teamId,
                    eventId: eventSnap.id,
                    userId: userSnap.id,
                    status: "processing",
                    attempts: Number(data.attempts || 0) + 1,
                    leaseExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + (5 * 60 * 1000)),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                return true;
            });
            if (!claimed)
                continue;
            try {
                const result = await admin.messaging().sendEachForMulticast({
                    tokens,
                    notification: {
                        title: `Upcoming ${(0, event_reminders_1.normalizeEventKind)(eventData).replace(/^./, (letter) => letter.toUpperCase())}`,
                        body: (0, event_reminders_1.buildUpcomingEventMessage)(eventData),
                    },
                    webpush: {
                        notification: {
                            icon: "/favicon-192.png",
                            badge: "/favicon-192.png",
                        },
                        fcmOptions: { link: "/calendar" },
                    },
                });
                if (result.successCount < 1)
                    throw new Error("No registered device accepted the reminder.");
                await deliveryRef.set({
                    status: "sent",
                    successCount: result.successCount,
                    failureCount: result.failureCount,
                    sentAt: admin.firestore.FieldValue.serverTimestamp(),
                    leaseExpiresAt: admin.firestore.FieldValue.delete(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                sentCount += 1;
            }
            catch (error) {
                await deliveryRef.set({
                    status: "failed",
                    error: error instanceof Error ? error.message : "Reminder delivery failed.",
                    leaseExpiresAt: admin.firestore.FieldValue.delete(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
        }
    }
    console.log(`[event-reminders] Sent ${sentCount} same-day player/parent reminder(s).`);
});
//# sourceMappingURL=index.js.map