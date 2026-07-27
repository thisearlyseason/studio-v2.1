import { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { google } from "googleapis";
import {
  USER_ARRAY_TARGETS,
  USER_DOCUMENT_TARGETS,
  USER_MAP_TARGETS,
} from "./account-deletion";
import {
  buildUpcomingEventMessage,
  candidateDateKeys,
  normalizeEventKind,
  shouldSendSameDayReminder,
} from "./event-reminders";

admin.initializeApp();
const db = admin.firestore();

/**
 * League documents cache the user IDs entitled to read them. This field is
 * maintained by trusted server code, never by the browser. It includes the
 * organizer and all user-backed memberships of each enrolled team.
 */
async function syncLeagueMemberUsers(leagueId: string): Promise<void> {
  const leagueRef = db.collection("leagues").doc(leagueId);
  const leagueSnap = await leagueRef.get();
  if (!leagueSnap.exists) return;

  const league = leagueSnap.data() || {};
  const userIds = new Set<string>();
  if (typeof league.creatorId === "string" && league.creatorId) userIds.add(league.creatorId);

  const teamIds = Array.isArray(league.memberTeamIds) ? league.memberTeamIds : [];
  await Promise.all(teamIds
    .filter((teamId: unknown): teamId is string =>
      typeof teamId === "string" && !teamId.startsWith("manual_") && !teamId.startsWith("recruit_"))
    .map(async (teamId) => {
      const members = await db.collection("teams").doc(teamId).collection("members").get();
      members.forEach((member) => {
        const userId = member.data().userId;
        if (typeof userId === "string" && userId) userIds.add(userId);
      });
    }));

  const next = [...userIds].sort();
  const current = Array.isArray(league.memberUserIds)
    ? league.memberUserIds.filter((userId: unknown): userId is string => typeof userId === "string").sort()
    : [];
  if (next.length === current.length && next.every((userId, index) => userId === current[index])) return;

  await leagueRef.update({ memberUserIds: next });
}

async function syncLeaguesForTeam(teamId: string): Promise<void> {
  const leagues = await db.collection("leagues")
    .where("memberTeamIds", "array-contains", teamId)
    .get();
  await Promise.all(leagues.docs.map((league) => syncLeagueMemberUsers(league.id)));
}

/** Publishes only spectator-safe league fields; private league records stay private. */
async function syncPublicLeagueView(leagueId: string): Promise<void> {
  const leagueSnap = await db.collection("leagues").doc(leagueId).get();
  const publicRef = db.collection("publicLeagueViews").doc(leagueId);
  if (!leagueSnap.exists) {
    await publicRef.delete();
    return;
  }

  const league = leagueSnap.data() || {};
  const teams = Object.fromEntries(Object.entries(league.teams || {}).map(([teamId, team]: [string, any]) => [teamId, {
    teamName: team.teamName || "",
    teamLogoUrl: team.teamLogoUrl || "",
    wins: Number(team.wins || 0),
    losses: Number(team.losses || 0),
    ties: Number(team.ties || 0),
    points: Number(team.points || 0),
  }]));
  const schedule = Array.isArray(league.schedule) ? league.schedule.map((game: any) => ({
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

export const onLeagueCreated = onDocumentCreated("leagues/{leagueId}", async (event) => {
  await Promise.all([
    syncLeagueMemberUsers(event.params.leagueId),
    syncPublicLeagueView(event.params.leagueId),
  ]);
});

export const onLeagueAccessChanged = onDocumentUpdated("leagues/{leagueId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  await syncPublicLeagueView(event.params.leagueId);
  if (before.creatorId !== after.creatorId || JSON.stringify(before.memberTeamIds || []) !== JSON.stringify(after.memberTeamIds || [])) {
    await syncLeagueMemberUsers(event.params.leagueId);
  }
});

export const onLeagueDeleted = onDocumentDeleted("leagues/{leagueId}", async (event) => {
  await db.collection("publicLeagueViews").doc(event.params.leagueId).delete();
});

export const onTeamMemberCreated = onDocumentCreated("teams/{teamId}/members/{memberId}", async (event) => {
  await syncLeaguesForTeam(event.params.teamId);
});

export const onTeamMemberDeleted = onDocumentDeleted("teams/{teamId}/members/{memberId}", async (event) => {
  await syncLeaguesForTeam(event.params.teamId);
});

/**
 * Redeems a league invite code for the signed-in user. The client never reads
 * the league collection to validate codes and cannot grant itself access.
 */
export const redeemLeagueInvite = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in before joining a league.");
  }
  const provider = request.auth.token.firebase?.sign_in_provider;
  if (provider === "anonymous") {
    throw new HttpsError("permission-denied", "Use a registered account to join a league.");
  }
  if (
    request.auth.token.email_verified !== true &&
    request.auth.token.role !== "superadmin"
  ) {
    throw new HttpsError("permission-denied", "Verify your email before joining a league.");
  }

  const inviteCode = typeof request.data?.inviteCode === "string"
    ? request.data.inviteCode.trim().toUpperCase()
    : "";
  if (!/^[A-Z0-9_-]{3,64}$/.test(inviteCode)) {
    throw new HttpsError("invalid-argument", "Enter a valid league invite code.");
  }

  const match = await db.collection("leagues")
    .where("inviteCode", "==", inviteCode)
    .limit(1)
    .get();

  let leagueRef: admin.firestore.DocumentReference | undefined = match.docs[0]?.ref;
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
    throw new HttpsError("not-found", "That league invite code is not valid.");
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
 * Helper to get Google OAuth2 Client for a specific user.
 * Fetches stored tokens from Firestore and handles refreshing if necessary.
 */
async function getOAuth2Client(userId: string) {
  // Store tokens in a subcollection that is NOT accessible by the user via security rules
  const tokenDoc = await db.collection("users").doc(userId).collection("tokens").doc("google").get();
  
  if (!tokenDoc.exists) {
    return null;
  }

  const { credentials } = tokenDoc.data()!;
  
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

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
function formatGoogleEvent(event: any, teamName: string) {
  const summary = event.opponent ? `${teamName} vs ${event.opponent}` : event.title;
  
  // Format dates. Assuming ISO strings or Timestamps. 
  // If date and startTime are separate in the schema, we might need to merge them.
  // In the schema: date is "yyyy-MM-dd", startTime is "HH:mm"
  const startDateTime = new Date(`${event.date}T${event.startTime}:00`);
  
  // End time logic: Default to 1 hour if not specified
  let endDateTime;
  if (event.endDate && event.endTime) {
     endDateTime = new Date(`${event.endDate}T${event.endTime}:00`);
  } else if (event.endDate) {
     endDateTime = new Date(`${event.endDate}T${event.startTime}:00`);
     endDateTime.setHours(endDateTime.getHours() + 1);
  } else {
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
async function syncEventToUser(userId: string, eventId: string, eventData: any, teamName: string) {
  const syncId = `${eventId}_${userId}`;
  const syncRef = db.collection("calendarSync").doc(syncId);
  
  // Check if already synced to prevent duplicates
  const syncSnap = await syncRef.get();
  if (syncSnap.exists && syncSnap.data()?.googleEventId) {
    return;
  }

  const oauth2Client = await getOAuth2Client(userId);
  if (!oauth2Client) return;

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
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
  } catch (error) {
    console.error(`Failed to sync event ${eventId} to user ${userId}:`, error);
    await syncRef.set({
      eventId,
      userId,
      status: "failed",
      error: (error as Error).message,
      lastSynced: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
}

/**
 * TRIGGER 1: onEventCreate
 * Fired when a new event is created within a team's subcollection.
 * Identifies all team members and attempts to sync the event to their Google Calendars.
 */
export const onEventCreate = onDocumentCreated("teams/{teamId}/events/{eventId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
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
export const onEventUpdate = onDocumentUpdated("teams/{teamId}/events/{eventId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  
  if (!before || !after) return;

  // PERFORMANCE: Only sync if relevant fields change
  const hasChanged = 
    before.startTime !== after.startTime ||
    before.endTime !== after.endTime || // Schema may have endTime
    before.date !== after.date ||
    before.endDate !== after.endDate ||
    before.location !== after.location ||
    before.title !== after.title ||
    before.status !== after.status;

  if (!hasChanged) return;

  const teamId = event.params.teamId;
  const eventId = event.params.eventId;

  const teamDoc = await db.collection("teams").doc(teamId).get();
  const teamName = teamDoc.data()?.name || "Team";

  // 1. Query calendarSync to find all external records for this event
  const syncSnap = await db.collection("calendarSync").where("eventId", "==", eventId).get();
  
  // 2. Batch process updates to all connected user calendars
  await Promise.all(syncSnap.docs.map(async (doc) => {
    const syncData = doc.data();
    if (syncData.status !== "synced" || !syncData.googleEventId) return;

    const oauth2Client = await getOAuth2Client(syncData.userId);
    if (!oauth2Client) return;

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
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
    } catch (error) {
      console.error(`Failed to update event ${eventId} for user ${syncData.userId}:`, error);
      await doc.ref.update({
        status: "failed",
        error: (error as Error).message
      });
    }
  }));
});

/**
 * TRIGGER 3: onEventDelete
 * Fired when an event is deleted from Firestore.
 * Removes all associated Google Calendar events and deletes the sync tracking records.
 */
export const onEventDelete = onDocumentDeleted("teams/{teamId}/events/{eventId}", async (event) => {
  const eventId = event.params.eventId;

  // 1. Find all sync records across all users for this specific event
  const syncSnap = await db.collection("calendarSync").where("eventId", "==", eventId).get();

  await Promise.all(syncSnap.docs.map(async (snapshot) => {
    const syncData = snapshot.data();
    if (syncData.googleEventId) {
      const oauth2Client = await getOAuth2Client(syncData.userId);
      if (oauth2Client) {
        const calendar = google.calendar({ version: "v3", auth: oauth2Client });
        try {
          await calendar.events.delete({
            calendarId: "primary",
            eventId: syncData.googleEventId,
          });
        } catch (error) {
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
export const connectGoogleCalendar = onRequest({ cors: true }, async (req, res) => {
  // Verify Firebase ID token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).send('Unauthorized: Missing Firebase ID token.');
    return;
  }
  const idToken = authHeader.slice(7);

  let verifiedUid: string;
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    verifiedUid = decoded.uid;
  } catch {
    res.status(401).send('Unauthorized: Invalid or expired token.');
    return;
  }

  const { code, userId } = req.body;

  if (!code || !userId) {
    res.status(400).send('Missing code or userId');
    return;
  }

  // Ensure the caller can only link their own account
  if (verifiedUid !== userId) {
    res.status(403).send('Forbidden: You may only link your own account.');
    return;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    // Store tokens securely in server-only subcollection
    await db.collection('users').doc(userId).collection('tokens').doc('google').set({
      credentials: tokens,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update user profile to reflect connection
    await db.collection('users').doc(userId).update({
      googleConnected: true,
    });

    res.send({ status: 'success' });
  } catch (error) {
    console.error('OAuth Exchange failed:', error);
    res.status(500).send('Authentication failed');
  }
});

/**
 * TRIGGER 4: getCalendarFeed (HTTPS)
 * Dynamic ICS generator for calendar subscriptions.
 * Validates unguessable token and pulls real-time event status.
 */
export const getCalendarFeed = onRequest({ cors: true }, async (req, res) => {
  // Path format expected: /calendar/feed/{token}
  // If not using path params, can use query string ?token=...
  const token = req.query.token as string || req.path.split('/').pop();

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

    const { type, userId, teamId, teamIds } = feedSnap.data()!;
    let events: any[] = [];
    const teamNameMap: Record<string, string> = {};

    // 2. Aggregate Intelligence (Events) — filtered to last 3 months + next 12 months
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const oneYearAhead = new Date(now);
    oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);
    const dateFrom = threeMonthsAgo.toISOString().split('T')[0]; // 'YYYY-MM-DD'
    const dateTo = oneYearAhead.toISOString().split('T')[0];

    if (type === "team" && teamId) {
      const teamDoc = await db.collection("teams").doc(teamId).get();
      teamNameMap[teamId] = teamDoc.data()?.name || "Team";
      
      const snap = await db.collection("teams").doc(teamId).collection("events")
        .where("date", ">=", dateFrom).where("date", "<=", dateTo).get();
      events = snap.docs.map(doc => ({ ...doc.data(), id: doc.id, teamId }));
    } else if (type === "user" && userId) {
      const membersSnap = await db.collectionGroup("members").where("userId", "==", userId).get();
      const resolvedTeamIds = membersSnap.docs.map(doc => doc.data().teamId);
      
      if (resolvedTeamIds.length > 0) {
        const teamDocs = await Promise.all(resolvedTeamIds.map(tid => db.collection("teams").doc(tid).get()));
        teamDocs.forEach(td => { if(td.exists) teamNameMap[td.id] = td.data()?.name; });

        const eventPromises = resolvedTeamIds.map(tid => 
          db.collection("teams").doc(tid).collection("events")
            .where("date", ">=", dateFrom).where("date", "<=", dateTo).get()
        );
        const snaps = await Promise.all(eventPromises);
        events = snaps.flatMap((s, idx) => s.docs.map(doc => ({ ...doc.data(), id: doc.id, teamId: resolvedTeamIds[idx] })));
      }
    } else if (type === "multi" && teamIds && Array.isArray(teamIds)) {
      // Fetch names for all selected teams
      const teamDocs = await Promise.all(teamIds.map(tid => db.collection("teams").doc(tid).get()));
      teamDocs.forEach(td => { if(td.exists) teamNameMap[td.id] = td.data()?.name; });

      // Fetch events from all selected teams (date-filtered)
      const eventPromises = teamIds.map(tid => 
        db.collection("teams").doc(tid).collection("events")
          .where("date", ">=", dateFrom).where("date", "<=", dateTo).get()
      );
      const snaps = await Promise.all(eventPromises);
      events = snaps.flatMap((s, idx) => s.docs.map(doc => ({ ...doc.data(), id: doc.id, teamId: teamIds[idx] })));
    }

    // 3. Strategic Deduplication (Ensures shared games only appear once)
    const uniqueEvents = Array.from(new Map(events.map(e => [e.id, e])).values());

    // 4. Construct ICS Manifest
    const formatDate = (dateStr: string, timeStr: string) => {
      const d = new Date(`${dateStr}T${timeStr || '00:00'}:00`);
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const escapeText = (str: string = '') => str.replace(/[,;]/g, '\\$&').replace(/\n/g, '\\n');
    
    const icsLines = [
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

      icsLines.push(
        'BEGIN:VEVENT',
        `UID:${e.id}@thesquad.pro`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${escapeText(summaryPrefix + e.title)}`,
        `LOCATION:${escapeText(e.location)}`,
        `DESCRIPTION:Team: ${teamName}\\nType: ${e.eventType}\\nLeague: ${e.leagueName || 'N/A'}\\n\\n${escapeText(e.description)}`,
        'STATUS:CONFIRMED',
        'END:VEVENT'
      );
    });

    icsLines.push('END:VCALENDAR');

    // 5. Return Deployment Payload
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="family_feed.ics"');
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.send(icsLines.join('\r\n'));

  } catch (error) {
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
export const purgeExpiredDeletionRequests = onSchedule('every 15 minutes', async () => {
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

      const deletionRefs = new Map<string, admin.firestore.DocumentReference>();
      for (const target of USER_DOCUMENT_TARGETS) {
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
      const deletedPlayerIds = new Set<string>();
      ownedPlayerProfiles.docs.forEach((player) => {
        deletedPlayerIds.add(player.id);
      });
      for (const player of dependentPlayerProfiles.docs) {
        const linkedUserId = player.data().userId;
        if (typeof linkedUserId !== 'string' || !linkedUserId || linkedUserId === uid) {
          deletedPlayerIds.add(player.id);
        } else {
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
        memberships.docs.forEach((membership) =>
          deletionRefs.set(membership.ref.path, membership.ref));
      }

      for (const target of USER_ARRAY_TARGETS) {
        const source = target.scope === 'collection'
          ? db.collection(target.collection)
          : db.collectionGroup(target.collection);
        const snapshot = await source.where(target.field, 'array-contains', uid).get();
        await Promise.all(snapshot.docs.map((document) =>
          document.ref.update({
            [target.field]: admin.firestore.FieldValue.arrayRemove(uid),
          })));
      }

      for (const target of USER_MAP_TARGETS) {
        const userEntry = new admin.firestore.FieldPath(target.mapField, uid);
        const snapshot = await db.collectionGroup(target.collectionGroup)
          .where(userEntry, '!=', null)
          .get();
        await Promise.all(snapshot.docs.map(async (document) => {
          const entry = document.data()?.[target.mapField]?.[uid];
          if (target.restoreQuantityField && Number(entry?.quantity) > 0) {
            await document.ref.update(
              userEntry,
              admin.firestore.FieldValue.delete(),
              target.restoreQuantityField,
              admin.firestore.FieldValue.increment(Number(entry.quantity)),
            );
          } else {
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
        ...[...recursivePrefixes].map((playerId) =>
          bucket.deleteFiles({ prefix: `players/${playerId}/` })),
      ]);
      await Promise.all([...deletedPlayerIds].map((playerId) =>
        db.recursiveDelete(db.collection('players').doc(playerId))));

      const refs = [...deletionRefs.values()];
      for (let start = 0; start < refs.length; start += 450) {
        const batch = db.batch();
        refs.slice(start, start + 450).forEach((documentRef) => batch.delete(documentRef));
        await batch.commit();
      }

      if (user.exists) await db.recursiveDelete(user.ref);
      try {
        await admin.auth().deleteUser(uid);
      } catch (error: any) {
        if (error.code !== 'auth/user-not-found') throw error;
      }
      await request.ref.delete();
      purged += 1;
    } catch (error: any) {
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
export const cleanupAnonymousUsers = onSchedule('every 15 minutes', async (_event: any) => {
  const auth = admin.auth();
  const DEMO_LIFETIME_MS = 15 * 60 * 1000;
  const now = Date.now();
  let pageToken: string | undefined = undefined;
  let deletedCount = 0;

  try {
    do {
      const listUsersResult: any = await auth.listUsers(1000, pageToken);
      const usersToDelete: string[] = [];

      listUsersResult.users.forEach((userRecord: any) => {
        // Only target anonymous users (no providerData attached)
        if (userRecord.providerData.length === 0) {
          const creationTime = Date.parse(userRecord.metadata.creationTime);
          if (now - creationTime > DEMO_LIFETIME_MS) {
            usersToDelete.push(userRecord.uid);
          }
        }
      });

      if (usersToDelete.length > 0) {
        // Delete Auth accounts
        await auth.deleteUsers(usersToDelete);

        // Recursively delete all Firestore data for each user
        // This includes teams, events, members, and all subcollections
        await Promise.allSettled(
          usersToDelete.map(async (uid) => {
            try {
              // Delete user doc + all subcollections recursively
              await db.recursiveDelete(db.collection('users').doc(uid));

              // Delete all teams owned by this user
              const [ownedTeamsSnap, demoTeamsSnap] = await Promise.all([
                db.collection('teams').where('ownerUserId', '==', uid).get(),
                db.collection('teams').where('demoSessionOwnerId', '==', uid).get(),
              ]);
              const teams = new Map<string, admin.firestore.QueryDocumentSnapshot>();
              ownedTeamsSnap.docs.forEach((team) => teams.set(team.id, team));
              demoTeamsSnap.docs.forEach((team) => teams.set(team.id, team));
              
              await Promise.allSettled(
                [...teams.values()].map(teamDoc => db.recursiveDelete(teamDoc.ref))
              );
            } catch (err: any) {
              console.error(`[cleanup] Failed to delete data for uid ${uid}:`, err.message);
            }
          })
        );

        deletedCount += usersToDelete.length;
      }

      pageToken = listUsersResult.pageToken;
    } while (pageToken);

    console.log(`Swept ${deletedCount} stale anonymous accounts and their data.`);
  } catch (error) {
    console.error('Failed to execute cleanup routine:', error);
  }
});

/**
 * Sends one same-day reminder to player and parent accounts for each upcoming
 * team event. Delivery claims prevent overlapping scheduler runs from sending
 * the same reminder more than once.
 */
export const sendUpcomingEventReminders = onSchedule({
  schedule: 'every 15 minutes',
  timeoutSeconds: 540,
  memory: '512MiB',
}, async () => {
  const now = new Date();
  const eventSnaps = await db.collectionGroup("events")
    .where("date", "in", candidateDateKeys(now))
    .get();
  const teamCache = new Map<string, admin.firestore.DocumentSnapshot>();
  let sentCount = 0;

  for (const eventSnap of eventSnaps.docs) {
    const teamRef = eventSnap.ref.parent.parent;
    if (!teamRef) continue;
    const teamId = teamRef.id;
    let teamSnap = teamCache.get(teamId);
    if (!teamSnap) {
      teamSnap = await teamRef.get();
      teamCache.set(teamId, teamSnap);
    }
    if (!teamSnap.exists) continue;

    const eventData = eventSnap.data();
    const teamData = teamSnap.data() || {};
    const timeZone = typeof eventData.timeZone === "string"
      ? eventData.timeZone
      : (typeof teamData.timeZone === "string" ? teamData.timeZone : "America/Edmonton");
    if (!shouldSendSameDayReminder(eventData, now, timeZone)) continue;

    const members = await teamRef.collection("members").get();
    const userIds = [...new Set(members.docs
      .filter((member) => member.data().status !== "removed" && member.data().isDeleted !== true)
      .map((member) => member.data().userId)
      .filter((userId): userId is string => typeof userId === "string" && !!userId))];
    if (!userIds.length) continue;

    const users = await Promise.all(userIds.map((userId) => db.collection("users").doc(userId).get()));
    for (const userSnap of users) {
      if (!userSnap.exists) continue;
      const user = userSnap.data() || {};
      if (!["parent", "adult_player", "youth_player"].includes(user.role)) continue;
      if (user.notificationsEnabled === false || user.upcomingEventNotificationsEnabled === false) continue;
      const tokens = Array.isArray(user.fcmTokens)
        ? [...new Set(user.fcmTokens.filter((token: unknown): token is string =>
          typeof token === "string" && !!token))]
        : [];
      if (!tokens.length) continue;

      const deliveryRef = db.collection("eventReminderDeliveries")
        .doc(`${teamId}_${eventSnap.id}_${userSnap.id}`);
      const claimed = await db.runTransaction(async (transaction) => {
        const delivery = await transaction.get(deliveryRef);
        const data = delivery.data() || {};
        if (data.status === "sent") return false;
        const leaseExpiresAt = data.leaseExpiresAt?.toMillis?.() || 0;
        if (data.status === "processing" && leaseExpiresAt > Date.now()) return false;
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
      if (!claimed) continue;

      try {
        const result = await admin.messaging().sendEachForMulticast({
          tokens,
          notification: {
            title: `Upcoming ${normalizeEventKind(eventData).replace(/^./, (letter) => letter.toUpperCase())}`,
            body: buildUpcomingEventMessage(eventData),
          },
          webpush: {
            notification: {
              icon: "/favicon-192.png",
              badge: "/favicon-192.png",
            },
            fcmOptions: { link: "/calendar" },
          },
        });
        if (result.successCount < 1) throw new Error("No registered device accepted the reminder.");
        await deliveryRef.set({
          status: "sent",
          successCount: result.successCount,
          failureCount: result.failureCount,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          leaseExpiresAt: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        sentCount += 1;
      } catch (error) {
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
