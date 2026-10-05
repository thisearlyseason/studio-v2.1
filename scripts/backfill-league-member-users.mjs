/**
 * Backfills leagues/{leagueId}.memberUserIds from the organizer and existing
 * teams/{teamId}/members records, and repairs spectator-safe public views via
 * the canonical projection worker. Run through tsx with ADC or
 * FIREBASE_SERVICE_ACCOUNT_JSON. Defaults to dry-run; pass --apply only after
 * reviewing the reported changes.
 */
import admin from 'firebase-admin';
import { syncPublicLeagueView } from '../functions/src/league-public-projection.ts';

const apply = process.argv.includes('--apply');
const verbose = process.argv.includes('--verbose');

if (!admin.apps.length) {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  admin.initializeApp(encoded
    ? { credential: admin.credential.cert(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))) }
    : undefined);
}

const db = admin.firestore();
let membershipChanges = 0;
let publicViewWrites = 0;
let stalePublicViewDeletes = 0;

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function withQuotaRetry(operation, attempt = 0) {
  try {
    return await operation();
  } catch (error) {
    const retryable = error?.code === 8 || error?.code === 10 || error?.code === 14;
    if (!retryable || attempt >= 7) throw error;
    const delay = Math.min(500 * (2 ** attempt), 15_000) + Math.floor(Math.random() * 250);
    await sleep(delay);
    return withQuotaRetry(operation, attempt + 1);
  }
}

const leagues = await withQuotaRetry(() => db.collection('leagues').get());

const projectionStore = {
  runTransaction: operation => db.runTransaction(async transaction => operation({
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

async function inspectLeague(league) {
  const data = league.data();
  const memberUserIds = new Set(data.memberUserIds || []);
  if (data.creatorId) memberUserIds.add(data.creatorId);

  for (const teamId of data.memberTeamIds || []) {
    if (teamId.startsWith('manual_') || teamId.startsWith('recruit_')) continue;
    const members = await withQuotaRetry(() => db.collection('teams').doc(teamId).collection('members').get());
    members.forEach(member => {
      const uid = member.data().userId;
      if (uid) memberUserIds.add(uid);
    });
  }

  const next = [...memberUserIds].sort();
  const hasMembershipCache = Array.isArray(data.memberUserIds);
  const previous = [...(hasMembershipCache ? data.memberUserIds : [])].sort();
  const needsMembershipUpdate = !hasMembershipCache || JSON.stringify(next) !== JSON.stringify(previous);
  if (needsMembershipUpdate) {
    membershipChanges += 1;
    if (verbose) console.log(`${apply ? 'Updating' : 'Would update'} ${league.id}: ${next.length} member users`);
  }
  publicViewWrites += 1;
  if (verbose) console.log(`${apply ? 'Repairing' : 'Would repair'} canonical public spectator view for ${league.id}`);
  if (apply) {
    if (needsMembershipUpdate) {
      await withQuotaRetry(() => league.ref.update({ memberUserIds: next }));
    }
    await withQuotaRetry(() => syncPublicLeagueView(league.id, undefined, projectionStore));
  }
}

// Production writes use lower concurrency so a large recovery stays below the
// Firestore burst quota. Retry handles brief throttling and transport failures.
const CONCURRENCY = apply ? 4 : 10;
for (let index = 0; index < leagues.docs.length; index += CONCURRENCY) {
  await Promise.all(leagues.docs.slice(index, index + CONCURRENCY).map(inspectLeague));
}

const leagueIds = new Set(leagues.docs.map(league => league.id));
const publicViews = await withQuotaRetry(() => db.collection('publicLeagueViews').get());
for (const publicView of publicViews.docs) {
  if (leagueIds.has(publicView.id)) continue;
  stalePublicViewDeletes += 1;
  if (verbose) console.log(`${apply ? 'Deleting' : 'Would delete'} stale spectator view ${publicView.id}`);
  if (apply) await withQuotaRetry(() => syncPublicLeagueView(publicView.id, undefined, projectionStore));
}

console.log(`${apply ? 'Updated' : 'Dry run found'} ${membershipChanges} membership records, ${publicViewWrites} spectator projections to write, and ${stalePublicViewDeletes} stale projections to delete.`);
