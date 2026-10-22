import 'server-only';

import * as admin from 'firebase-admin';
import { adminDb, getAdminAuth } from '@/lib/firebase-admin';

async function deleteDocuments(
  documents: admin.firestore.QueryDocumentSnapshot[]
): Promise<void> {
  const unique = [...new Map(documents.map(document => [document.ref.path, document])).values()];
  for (let index = 0; index < unique.length; index += 400) {
    const batch = adminDb.batch();
    unique.slice(index, index + 400).forEach(document => batch.delete(document.ref));
    await batch.commit();
  }
}

export async function deleteAnonymousDemo(uid: string): Promise<void> {
  const auth = getAdminAuth();

  try {
    const user = await auth.getUser(uid);
    if (user.providerData.length > 0) {
      throw new Error('Only anonymous demo accounts can use immediate cleanup.');
    }
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'auth/user-not-found') return;
    throw error;
  }

  const [ownedTeams, demoTeams, leagues, players, facilities] = await Promise.all([
    adminDb.collection('teams').where('ownerUserId', '==', uid).get(),
    adminDb.collection('teams').where('demoSessionOwnerId', '==', uid).get(),
    adminDb.collection('leagues').where('creatorId', '==', uid).get(),
    adminDb.collection('players').where('demoOwnerUserId', '==', uid).get(),
    adminDb.collection('facilities').where('clubId', '==', uid).get(),
  ]);

  const teams = new Map<string, admin.firestore.QueryDocumentSnapshot>();
  ownedTeams.docs.forEach(team => teams.set(team.id, team));
  demoTeams.docs.forEach(team => teams.set(team.id, team));

  const bookingSnapshots = await Promise.all([
    ...[...teams.keys()].map(teamId =>
      adminDb.collection('scheduleBookings').where('hostTeamId', '==', teamId).get()
    ),
    ...leagues.docs.map(league =>
      adminDb.collection('scheduleBookings').where('leagueId', '==', league.id).get()
    ),
  ]);
  await deleteDocuments(bookingSnapshots.flatMap(snapshot => snapshot.docs));

  for (const team of teams.values()) {
    const data = team.data();
    if (data.isDemo === true || data.demoSessionOwnerId === uid) {
      await adminDb.recursiveDelete(team.ref);
    }
  }
  for (const league of leagues.docs) {
    if (league.data().isDemo !== true) continue;
    await adminDb.recursiveDelete(league.ref);
    await adminDb.collection('publicLeagueViews').doc(league.id).delete();
  }
  for (const player of players.docs) {
    if (player.data().isDemo === true) await adminDb.recursiveDelete(player.ref);
  }
  for (const facility of facilities.docs) {
    if (facility.data().isDemo === true) await adminDb.recursiveDelete(facility.ref);
  }

  await adminDb.recursiveDelete(adminDb.collection('users').doc(uid));
  try {
    await auth.deleteUser(uid);
  } catch (error: unknown) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
  }
}
