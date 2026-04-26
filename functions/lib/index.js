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
exports.cleanupAnonymousUsers = exports.getCalendarFeed = exports.connectGoogleCalendar = exports.onEventDelete = exports.onEventUpdate = exports.onEventCreate = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const googleapis_1 = require("googleapis");
admin.initializeApp();
const db = admin.firestore();
/**
 * Helper to get Google OAuth2 Client for a specific user.
 * Fetches stored tokens from Firestore and handles refreshing if necessary.
 */
async function getOAuth2Client(userId) {
    // Store tokens in a subcollection that is NOT accessible by the user via security rules
    const tokenDoc = await db.collection("users").doc(userId).collection("tokens").doc("google").get();
    if (!tokenDoc.exists) {
        return null;
    }
    const { credentials } = tokenDoc.data();
    const oauth2Client = new googleapis_1.google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
    oauth2Client.setCredentials(credentials);
    // Set up token refresh handling
    oauth2Client.on('tokens', (tokens) => {
        if (tokens.refresh_token) {
            // Store new refresh token
            db.collection("users").doc(userId).collection("tokens").doc("google").update({
                "credentials.refresh_token": tokens.refresh_token,
                "updatedAt": admin.firestore.FieldValue.serverTimestamp()
            });
        }
        // Always store new access token and expiry
        db.collection("users").doc(userId).collection("tokens").doc("google").update({
            "credentials.access_token": tokens.access_token,
            "credentials.expiry_date": tokens.expiry_date,
            "updatedAt": admin.firestore.FieldValue.serverTimestamp()
        });
    });
    return oauth2Client;
}
/**
 * Formats a TeamEvent for Google Calendar.
 */
function formatGoogleEvent(event, teamName) {
    const summary = event.opponent ? `${teamName} vs ${event.opponent}` : event.title;
    // Format dates. Assuming ISO strings or Timestamps. 
    // If date and startTime are separate in the schema, we might need to merge them.
    // In the schema: date is "yyyy-MM-dd", startTime is "HH:mm"
    const startDateTime = new Date(`${event.date}T${event.startTime}:00`);
    // End time logic: Default to 1 hour if not specified
    let endDateTime;
    if (event.endDate && event.endTime) {
        endDateTime = new Date(`${event.endDate}T${event.endTime}:00`);
    }
    else if (event.endDate) {
        endDateTime = new Date(`${event.endDate}T${event.startTime}:00`);
        endDateTime.setHours(endDateTime.getHours() + 1);
    }
    else {
        endDateTime = new Date(startDateTime);
        endDateTime.setHours(endDateTime.getHours() + 1);
    }
    return {
        summary: summary,
        location: event.location,
        description: `League: ${event.leagueName || 'N/A'}\nVenue: ${event.location || 'N/A'}\n\n${event.description || ''}`,
        start: {
            dateTime: startDateTime.toISOString(),
            timeZone: 'UTC', // Ideally use user's timezone if available
        },
        end: {
            dateTime: endDateTime.toISOString(),
            timeZone: 'UTC',
        },
        reminders: {
            useDefault: true,
        },
    };
}
/**
 * Sync logic for a single user.
 */
async function syncEventToUser(userId, eventId, eventData, teamName) {
    const syncId = `${eventId}_${userId}`;
    const syncRef = db.collection("calendarSync").doc(syncId);
    // Check if already synced to prevent duplicates
    const syncSnap = await syncRef.get();
    if (syncSnap.exists && syncSnap.data()?.googleEventId) {
        return;
    }
    const oauth2Client = await getOAuth2Client(userId);
    if (!oauth2Client)
        return;
    const calendar = googleapis_1.google.calendar({ version: "v3", auth: oauth2Client });
    const gEvent = formatGoogleEvent(eventData, teamName);
    try {
        const response = await calendar.events.insert({
            calendarId: "primary",
            requestBody: gEvent,
        });
        await syncRef.set({
            eventId,
            userId,
            googleEventId: response.data.id,
            calendarId: "primary",
            status: "synced",
            lastSynced: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    catch (error) {
        console.error(`Failed to sync event ${eventId} to user ${userId}:`, error);
        await syncRef.set({
            eventId,
            userId,
            status: "failed",
            error: error.message,
            lastSynced: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }
}
/**
 * TRIGGER 1: onEventCreate
 * Fired when a new event is created within a team's subcollection.
 * Identifies all team members and attempts to sync the event to their Google Calendars.
 */
exports.onEventCreate = (0, firestore_1.onDocumentCreated)("teams/{teamId}/events/{eventId}", async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const eventData = snap.data();
    const teamId = event.params.teamId;
    const eventId = event.params.eventId;
    // 1. Get team name for the calendar entry (e.g., "Thunder vs Rockets")
    const teamDoc = await db.collection("teams").doc(teamId).get();
    const teamName = teamDoc.data()?.name || "Team";
    // 2. Identify all relevant users (all members with a linked userId)
    const membersSnap = await db.collection("teams").doc(teamId).collection("members").get();
    const userIds = membersSnap.docs
        .map(doc => doc.data().userId)
        .filter(id => !!id);
    // 3. Sync to each user who has Google connected
    // syncEventToUser handles idempotency via the calendarSync collection checks
    await Promise.all(userIds.map(uid => syncEventToUser(uid, eventId, eventData, teamName)));
});
/**
 * TRIGGER 2: onEventUpdate
 * Fired when an event document is modified.
 * Only triggers a Google Calendar update if meaningful fields (time, place, status) change.
 */
exports.onEventUpdate = (0, firestore_1.onDocumentUpdated)("teams/{teamId}/events/{eventId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after)
        return;
    // PERFORMANCE: Only sync if relevant fields change
    const hasChanged = before.startTime !== after.startTime ||
        before.endTime !== after.endTime || // Schema may have endTime
        before.date !== after.date ||
        before.endDate !== after.endDate ||
        before.location !== after.location ||
        before.title !== after.title ||
        before.status !== after.status;
    if (!hasChanged)
        return;
    const teamId = event.params.teamId;
    const eventId = event.params.eventId;
    const teamDoc = await db.collection("teams").doc(teamId).get();
    const teamName = teamDoc.data()?.name || "Team";
    // 1. Query calendarSync to find all external records for this event
    const syncSnap = await db.collection("calendarSync").where("eventId", "==", eventId).get();
    // 2. Batch process updates to all connected user calendars
    await Promise.all(syncSnap.docs.map(async (doc) => {
        const syncData = doc.data();
        if (syncData.status !== "synced" || !syncData.googleEventId)
            return;
        const oauth2Client = await getOAuth2Client(syncData.userId);
        if (!oauth2Client)
            return;
        const calendar = googleapis_1.google.calendar({ version: "v3", auth: oauth2Client });
        const gEvent = formatGoogleEvent(after, teamName);
        try {
            await calendar.events.update({
                calendarId: "primary",
                eventId: syncData.googleEventId,
                requestBody: gEvent,
            });
            await doc.ref.update({
                lastSynced: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        catch (error) {
            console.error(`Failed to update event ${eventId} for user ${syncData.userId}:`, error);
            await doc.ref.update({
                status: "failed",
                error: error.message
            });
        }
    }));
});
/**
 * TRIGGER 3: onEventDelete
 * Fired when an event is deleted from Firestore.
 * Removes all associated Google Calendar events and deletes the sync tracking records.
 */
exports.onEventDelete = (0, firestore_1.onDocumentDeleted)("teams/{teamId}/events/{eventId}", async (event) => {
    const eventId = event.params.eventId;
    // 1. Find all sync records across all users for this specific event
    const syncSnap = await db.collection("calendarSync").where("eventId", "==", eventId).get();
    await Promise.all(syncSnap.docs.map(async (snapshot) => {
        const syncData = snapshot.data();
        if (syncData.googleEventId) {
            const oauth2Client = await getOAuth2Client(syncData.userId);
            if (oauth2Client) {
                const calendar = googleapis_1.google.calendar({ version: "v3", auth: oauth2Client });
                try {
                    await calendar.events.delete({
                        calendarId: "primary",
                        eventId: syncData.googleEventId,
                    });
                }
                catch (error) {
                    // If event already deleted from Google, we log and proceed to cleanup sync record
                    console.warn(`Could not delete Google event ${syncData.googleEventId} (maybe already gone).`);
                }
            }
        }
        // 2. Clean up our tracking collection
        await snapshot.ref.delete();
    }));
});
/**
 * UTILITY: connectGoogleCalendar (HTTPS)
 * Exchanges a code for tokens and saves them securely in Firestore.
 * This is the endpoint the frontend would call after doing the Google Redirect flow.
 */
const https_1 = require("firebase-functions/v2/https");
exports.connectGoogleCalendar = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    const { code, userId } = req.body;
    if (!code || !userId) {
        res.status(400).send("Missing code or userId");
        return;
    }
    const oauth2Client = new googleapis_1.google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
    try {
        const { tokens } = await oauth2Client.getToken(code);
        // 1. Store tokens securely (backend only)
        await db.collection("users").doc(userId).collection("tokens").doc("google").set({
            credentials: tokens,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        // 2. Update user profile to reflect connection
        await db.collection("users").doc(userId).update({
            googleConnected: true,
            googleEmail: tokens.id_token ? "verified-email" : "connected" // In real use, decode id_token to get email
        });
        res.send({ status: "success" });
    }
    catch (error) {
        console.error("OAuth Exchange failed:", error);
        res.status(500).send("Authentication failed");
    }
});
/**
 * TRIGGER 4: getCalendarFeed (HTTPS)
 * Dynamic ICS generator for calendar subscriptions.
 * Validates unguessable token and pulls real-time event status.
 */
exports.getCalendarFeed = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    // Path format expected: /calendar/feed/{token}
    // If not using path params, can use query string ?token=...
    const token = req.query.token || req.path.split('/').pop();
    if (!token) {
        res.status(400).send("Command Invalid: Mission Critical Token Missing.");
        return;
    }
    try {
        // 1. Validate Token Integrity
        const feedSnap = await db.collection("calendarFeeds").doc(token).get();
        if (!feedSnap.exists || !feedSnap.data()?.active) {
            res.status(403).send("Tactical Error: Feed Token Denied or Decommissioned.");
            return;
        }
        const { type, userId, teamId, teamIds } = feedSnap.data();
        let events = [];
        const teamNameMap = {};
        // 2. Aggregate Intelligence (Events)
        if (type === "team" && teamId) {
            const teamDoc = await db.collection("teams").doc(teamId).get();
            teamNameMap[teamId] = teamDoc.data()?.name || "Team";
            const snap = await db.collection("teams").doc(teamId).collection("events").get();
            events = snap.docs.map(doc => ({ ...doc.data(), id: doc.id, teamId }));
        }
        else if (type === "user" && userId) {
            const membersSnap = await db.collectionGroup("members").where("userId", "==", userId).get();
            const resolvedTeamIds = membersSnap.docs.map(doc => doc.data().teamId);
            if (resolvedTeamIds.length > 0) {
                const teamDocs = await Promise.all(resolvedTeamIds.map(tid => db.collection("teams").doc(tid).get()));
                teamDocs.forEach(td => { if (td.exists)
                    teamNameMap[td.id] = td.data()?.name; });
                const eventPromises = resolvedTeamIds.map(tid => db.collection("teams").doc(tid).collection("events").get());
                const snaps = await Promise.all(eventPromises);
                events = snaps.flatMap((s, idx) => s.docs.map(doc => ({ ...doc.data(), id: doc.id, teamId: resolvedTeamIds[idx] })));
            }
        }
        else if (type === "multi" && teamIds && Array.isArray(teamIds)) {
            // Fetch names for all selected teams
            const teamDocs = await Promise.all(teamIds.map(tid => db.collection("teams").doc(tid).get()));
            teamDocs.forEach(td => { if (td.exists)
                teamNameMap[td.id] = td.data()?.name; });
            // Fetch events from all selected teams
            const eventPromises = teamIds.map(tid => db.collection("teams").doc(tid).collection("events").get());
            const snaps = await Promise.all(eventPromises);
            events = snaps.flatMap((s, idx) => s.docs.map(doc => ({ ...doc.data(), id: doc.id, teamId: teamIds[idx] })));
        }
        // 3. Strategic Deduplication (Ensures shared games only appear once)
        const uniqueEvents = Array.from(new Map(events.map(e => [e.id, e])).values());
        // 4. Construct ICS Manifest
        const formatDate = (dateStr, timeStr) => {
            const d = new Date(`${dateStr}T${timeStr || '00:00'}:00`);
            return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        };
        const escapeText = (str = '') => str.replace(/[,;]/g, '\\$&').replace(/\n/g, '\\n');
        let icsLines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//The Squad//Family Scheduler//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            `X-WR-CALNAME:${type === 'multi' ? 'Squad Family Schedule' : teamNameMap[teamId || ''] || 'Master Schedule'}`,
            'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
            'X-PUBLISHED-TTL:PT15M'
        ];
        uniqueEvents.forEach(e => {
            const start = formatDate(e.date, e.startTime);
            const endDate = e.endDate || e.date;
            const endTime = e.endTime || (e.startTime ? `${parseInt(e.startTime.split(':')[0]) + 1}:${e.startTime.split(':')[1]}` : '01:00');
            const end = formatDate(endDate, endTime);
            const teamName = teamNameMap[e.teamId] || 'Team';
            const summaryPrefix = type === 'multi' || type === 'user' ? `[${teamName}] ` : '';
            icsLines.push('BEGIN:VEVENT', `UID:${e.id}@thesquad.pro`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`, `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${escapeText(summaryPrefix + e.title)}`, `LOCATION:${escapeText(e.location)}`, `DESCRIPTION:Team: ${teamName}\\nType: ${e.eventType}\\nLeague: ${e.leagueName || 'N/A'}\\n\\n${escapeText(e.description)}`, 'STATUS:CONFIRMED', 'END:VEVENT');
        });
        icsLines.push('END:VCALENDAR');
        // 5. Return Deployment Payload
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="family_feed.ics"');
        res.setHeader('Cache-Control', 'public, max-age=900');
        res.send(icsLines.join('\r\n'));
    }
    catch (error) {
        console.error("Failed to generate ICS feed:", error);
        res.status(500).send("Strategic Failure during feed generation.");
    }
});
/**
 * TRIGGER 5: cleanupAnonymousUsers (Scheduled)
 * Automatically sweeps and deletes anonymous Firebase accounts that are older than 24 hours,
 * preventing database bloat from demo users.
 */
const scheduler_1 = require("firebase-functions/v2/scheduler");
exports.cleanupAnonymousUsers = (0, scheduler_1.onSchedule)("every 24 hours", async (event) => {
    const auth = admin.auth();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
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
                    if (now - creationTime > ONE_DAY_MS) {
                        usersToDelete.push(userRecord.uid);
                    }
                }
            });
            if (usersToDelete.length > 0) {
                await auth.deleteUsers(usersToDelete);
                // Optional: Also wipe associated demo data in Firestore to save database storage.
                const batch = db.batch();
                usersToDelete.forEach((uid) => {
                    batch.delete(db.collection("users").doc(uid));
                });
                await batch.commit();
                deletedCount += usersToDelete.length;
            }
            pageToken = listUsersResult.pageToken;
        } while (pageToken);
        console.log(`Successfully swept ${deletedCount} stale anonymous demo accounts.`);
    }
    catch (error) {
        console.error("Failed to execute cleanup routine:", error);
    }
});
//# sourceMappingURL=index.js.map