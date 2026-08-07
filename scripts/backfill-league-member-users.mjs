/**
 * Backfills leagues/{leagueId}.memberUserIds from the organizer and existing
 * teams/{teamId}/members records, and creates spectator-safe public views.
 * Run with ADC or FIREBASE_SERVICE_ACCOUNT_JSON. Defaults to dry-run; pass
 * --apply only after reviewing the reported changes.
 */
import admin from 'firebase-admin';

const apply = process.argv.includes('--apply');
const verbose = process.argv.includes('--verbose');

if (!admin.apps.length) {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  admin.initializeApp(encoded
    ? { credential: admin.credential.cert(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))) }
    : undefined);
}

const db = admin.firestore();
const leagues = await db.collection('leagues').get();
let membershipChanges = 0;
let publicViewCreates = 0;

function publicLeagueView(leagueId, data) {
  const teams = Object.fromEntries(Object.entries(data.teams || {}).map(([teamId, team]) => [teamId, {
    teamName: team?.teamName || '',
    teamLogoUrl: team?.teamLogoUrl || '',
    wins: Number(team?.wins || 0),
    losses: Number(team?.losses || 0),
    ties: Number(team?.ties || 0),
    points: Number(team?.points || 0),
  }]));
  const schedule = Array.isArray(data.schedule) ? data.schedule.map(game => ({
    id: game.id || '', team1: game.team1 || '', team1Id: game.team1Id || '',
    team2: game.team2 || '', team2Id: game.team2Id || '', date: game.date || '',
    time: game.time || '', location: game.location || '', status: game.status || 'scheduled',
    isCompleted: Boolean(game.isCompleted), score1: Number(game.score1 || 0), score2: Number(game.score2 || 0),
  })) : [];
  return {
    id: leagueId,
    name: data.name || '',
    sport: data.sport || '',
    divisionTitle: data.divisionTitle || '',
    teams,
    schedule,
    migratedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function inspectLeague(league) {
  const data = league.data();
  const memberUserIds = new Set(data.memberUserIds || []);
  if (data.creatorId) memberUserIds.add(data.creatorId);

  for (const teamId of data.memberTeamIds || []) {
    if (teamId.startsWith('manual_') || teamId.startsWith('recruit_')) continue;
    const members = await db.collection('teams').doc(teamId).collection('members').get();
    members.forEach(member => {
      const uid = member.data().userId;
      if (uid) memberUserIds.add(uid);
    });
  }

  const next = [...memberUserIds].sort();
  const previous = [...(data.memberUserIds || [])].sort();
  const needsMembershipUpdate = JSON.stringify(next) !== JSON.stringify(previous);
  const publicViewRef = db.collection('publicLeagueViews').doc(league.id);
  const publicViewExists = (await publicViewRef.get()).exists;

  if (needsMembershipUpdate) {
    membershipChanges += 1;
    if (verbose) console.log(`${apply ? 'Updating' : 'Would update'} ${league.id}: ${next.length} member users`);
  }
  if (!publicViewExists) {
    publicViewCreates += 1;
    if (verbose) console.log(`${apply ? 'Creating' : 'Would create'} public spectator view for ${league.id}`);
  }
  if (apply) {
    if (needsMembershipUpdate) await league.ref.update({ memberUserIds: next });
    if (!publicViewExists) await publicViewRef.set(publicLeagueView(league.id, data));
  }
}

// Limit concurrent reads to keep the audit quick without overwhelming Firestore.
const CONCURRENCY = 20;
for (let index = 0; index < leagues.docs.length; index += CONCURRENCY) {
  await Promise.all(leagues.docs.slice(index, index + CONCURRENCY).map(inspectLeague));
}

console.log(`${apply ? 'Updated' : 'Dry run found'} ${membershipChanges} membership records and ${publicViewCreates} public spectator records to create.`);
