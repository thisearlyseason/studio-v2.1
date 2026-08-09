/** Read-only inventory for recovery after scheduled Functions have been unavailable. */
import admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const now = Date.now();
const anonymousCutoff = now - 15 * 60 * 1000;

const overdueDeletionRequests = await db.collection('accountDeletionRequests')
  .where('purgeAt', '<=', admin.firestore.Timestamp.fromMillis(now))
  .get();

let anonymousUsers = 0;
let staleAnonymousUsers = 0;
const authUserIds = new Set();
let pageToken;
do {
  const page = await admin.auth().listUsers(1000, pageToken);
  for (const user of page.users) {
    authUserIds.add(user.uid);
    if (user.providerData.length > 0) continue;
    anonymousUsers += 1;
    const createdAt = Date.parse(user.metadata.creationTime);
    if (Number.isFinite(createdAt) && createdAt <= anonymousCutoff) staleAnonymousUsers += 1;
  }
  pageToken = page.pageToken;
} while (pageToken);

const [leagues, projections, demoTeams, demoPlayers, demoFacilities, demoUsers] = await Promise.all([
  db.collection('leagues').get(),
  db.collection('publicLeagueViews').get(),
  db.collection('teams').where('isDemo', '==', true).get(),
  db.collection('players').where('isDemo', '==', true).get(),
  db.collection('facilities').where('isDemo', '==', true).get(),
  db.collection('users').where('isDemo', '==', true).get(),
]);
const leagueIds = new Set(leagues.docs.map(document => document.id));
const projectionIds = new Set(projections.docs.map(document => document.id));
const missingProjections = [...leagueIds].filter(id => !projectionIds.has(id));
const staleProjections = [...projectionIds].filter(id => !leagueIds.has(id));
const missingMemberCaches = leagues.docs.filter(document => !Array.isArray(document.data().memberUserIds));
const orphanedDemoLeagues = leagues.docs.filter(document => {
  const data = document.data();
  return data.isDemo === true && typeof data.creatorId === 'string' && !authUserIds.has(data.creatorId);
});
const orphanedDemoTeams = demoTeams.docs.filter(document => {
  const data = document.data();
  const ownerId = data.demoSessionOwnerId || data.ownerUserId;
  return typeof ownerId === 'string' && !authUserIds.has(ownerId);
});
const orphanedDemoPlayers = demoPlayers.docs.filter(document => {
  const ownerId = document.data().demoOwnerUserId;
  return typeof ownerId === 'string' && !authUserIds.has(ownerId);
});
const orphanedDemoFacilities = demoFacilities.docs.filter(document => {
  const ownerId = document.data().clubId;
  return typeof ownerId === 'string' && !authUserIds.has(ownerId);
});
const orphanedDemoUsers = demoUsers.docs.filter(document => !authUserIds.has(document.id));

console.log(JSON.stringify({
  overdueDeletionRequests: overdueDeletionRequests.size,
  anonymousUsers,
  staleAnonymousUsers,
  leagues: leagues.size,
  missingPublicLeagueViews: missingProjections.length,
  stalePublicLeagueViews: staleProjections.length,
  leaguesMissingMemberUserIds: missingMemberCaches.length,
  orphanedDemoLeagues: orphanedDemoLeagues.length,
  orphanedDemoTeams: orphanedDemoTeams.length,
  orphanedDemoPlayers: orphanedDemoPlayers.length,
  orphanedDemoFacilities: orphanedDemoFacilities.length,
  orphanedDemoUsers: orphanedDemoUsers.length,
}, null, 2));

if (overdueDeletionRequests.size || staleAnonymousUsers || missingProjections.length || staleProjections.length || missingMemberCaches.length || orphanedDemoLeagues.length || orphanedDemoTeams.length || orphanedDemoPlayers.length || orphanedDemoFacilities.length || orphanedDemoUsers.length) {
  process.exitCode = 2;
}
