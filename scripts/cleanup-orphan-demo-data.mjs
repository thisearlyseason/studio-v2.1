/**
 * Removes demo-owned root documents whose Firebase Auth owner no longer
 * exists. Defaults to dry-run; pass --apply after reviewing the inventory.
 */
import admin from 'firebase-admin';

const apply = process.argv.includes('--apply');

if (!admin.apps.length) {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  admin.initializeApp(encoded
    ? { credential: admin.credential.cert(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))) }
    : undefined);
}

const db = admin.firestore();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function withQuotaRetry(operation, attempt = 0) {
  try {
    return await operation();
  } catch (error) {
    const retryable = error?.code === 8 || error?.code === 10 || error?.code === 14;
    if (!retryable || attempt >= 9) throw error;
    const delay = Math.min(500 * (2 ** attempt), 20_000) + Math.floor(Math.random() * 250);
    await sleep(delay);
    return withQuotaRetry(operation, attempt + 1);
  }
}

async function listAuthUserIds() {
  const userIds = new Set();
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    page.users.forEach(user => userIds.add(user.uid));
    pageToken = page.pageToken;
  } while (pageToken);
  return userIds;
}

const authUserIds = await listAuthUserIds();
const [leagues, teams, players, facilities, users] = await Promise.all([
  withQuotaRetry(() => db.collection('leagues').where('isDemo', '==', true).get()),
  withQuotaRetry(() => db.collection('teams').where('isDemo', '==', true).get()),
  withQuotaRetry(() => db.collection('players').where('isDemo', '==', true).get()),
  withQuotaRetry(() => db.collection('facilities').where('isDemo', '==', true).get()),
  withQuotaRetry(() => db.collection('users').where('isDemo', '==', true).get()),
]);

const orphaned = {
  teams: teams.docs.filter(document => {
    const data = document.data();
    const ownerId = data.demoSessionOwnerId || data.ownerUserId;
    return typeof ownerId === 'string' && !authUserIds.has(ownerId);
  }),
  players: players.docs.filter(document => {
    const ownerId = document.data().demoOwnerUserId;
    return typeof ownerId === 'string' && !authUserIds.has(ownerId);
  }),
  facilities: facilities.docs.filter(document => {
    const ownerId = document.data().clubId;
    return typeof ownerId === 'string' && !authUserIds.has(ownerId);
  }),
  leagues: leagues.docs.filter(document => {
    const ownerId = document.data().creatorId;
    return typeof ownerId === 'string' && !authUserIds.has(ownerId);
  }),
  users: users.docs.filter(document => !authUserIds.has(document.id)),
};

const counts = Object.fromEntries(Object.entries(orphaned).map(([name, documents]) => [name, documents.length]));
const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...counts, total }, null, 2));

if (!apply) {
  if (total) process.exitCode = 2;
} else {
  let deleted = 0;
  const failures = [];
  const DELETE_CONCURRENCY = 6;
  for (const [collectionName, documents] of Object.entries(orphaned)) {
    // Rotate writers between root collections so a very large recursive purge
    // cannot carry stale BulkWriter state into the next collection.
    const writer = db.bulkWriter({
      throttling: { initialOpsPerSecond: 20, maxOpsPerSecond: 100 },
    });
    writer.onWriteError(error =>
      error.failedAttempts < 10 && [8, 10, 14].includes(error.code));
    for (let start = 0; start < documents.length; start += DELETE_CONCURRENCY) {
      const batch = documents.slice(start, start + DELETE_CONCURRENCY);
      await Promise.all(batch.map(async document => {
        try {
          await withQuotaRetry(() => db.recursiveDelete(document.ref, writer));
          if (collectionName === 'leagues') {
            await writer.delete(db.collection('publicLeagueViews').doc(document.id));
          }
          deleted += 1;
        } catch (error) {
          failures.push(`${document.ref.path}: ${error?.message || error}`);
        }
      }));
      if (deleted % 50 < batch.length || deleted === total) {
        console.log(`Deleted ${deleted} of ${total} orphan demo roots.`);
      }
    }
    await writer.close();
  }

  if (failures.length) {
    console.error(`Failed to delete ${failures.length} orphan demo roots:`);
    failures.slice(0, 20).forEach(failure => console.error(failure));
    process.exitCode = 2;
  } else {
    console.log(`Deleted all ${deleted} orphan demo roots.`);
  }
}
