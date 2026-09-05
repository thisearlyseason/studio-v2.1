import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';

const FAMILY_ROLES = new Set(['parent', 'guardian']);

function safeTeamProjection(id: string, data: FirebaseFirestore.DocumentData) {
  const name = typeof data.name === 'string' && data.name.trim()
    ? data.name.trim()
    : typeof data.teamName === 'string' && data.teamName.trim()
      ? data.teamName.trim()
      : 'Squad';
  return {
    id,
    name,
    ...(typeof data.teamLogoUrl === 'string' && data.teamLogoUrl ? { teamLogoUrl: data.teamLogoUrl } : {}),
    ...(typeof data.heroImageUrl === 'string' && data.heroImageUrl ? { heroImageUrl: data.heroImageUrl } : {}),
  };
}

export async function GET(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const profile = await adminDb.collection('users').doc(auth.uid).get();
    const role = String(profile.data()?.role || auth.role || '').toLowerCase();
    if (!FAMILY_ROLES.has(role)) {
      return NextResponse.json({ error: 'Family access required.' }, { status: 403 });
    }

    // Child and squad scope is derived exclusively from the verified account.
    // Query parameters and client-provided identity hints are intentionally ignored.
    const children = await adminDb.collection('players').where('parentId', '==', auth.uid).get();
    const teamIds = [...new Set(children.docs.flatMap(child => {
      const joinedTeamIds = child.data()?.joinedTeamIds;
      return Array.isArray(joinedTeamIds)
        ? joinedTeamIds.filter((teamId): teamId is string => typeof teamId === 'string' && teamId.length > 0)
        : [];
    }))].sort();

    if (teamIds.length === 0) return NextResponse.json({ teams: [] });
    const snapshots = await adminDb.getAll(...teamIds.map(teamId => adminDb.collection('teams').doc(teamId)));
    const teams = snapshots
      .filter(snapshot => snapshot.exists)
      .map(snapshot => safeTeamProjection(snapshot.id, snapshot.data() || {}));
    return NextResponse.json({ teams });
  } catch (error) {
    console.error('[family/teams] Unable to resolve child squads.', error);
    return NextResponse.json({ error: 'Unable to load family squads.' }, { status: 500 });
  }
}
