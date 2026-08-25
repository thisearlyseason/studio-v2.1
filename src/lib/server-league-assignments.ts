import { NextRequest, NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import type { DecodedToken } from '@/lib/api-auth';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

type Assignment = Record<string, unknown> & { id: string; league_id: string };

type LeagueAssignmentsGetDependencies = {
  verifyFirebaseToken(request: NextRequest): Promise<DecodedToken | NextResponse>;
  getTeamAuthority(teamId: string, uid: string, role?: string): Promise<{ isStaff?: boolean } | null>;
  readAssignments(teamId: string): Promise<Assignment[]>;
  logUnavailable?(code: string): void;
};

export function createLeagueAssignmentsReader(
  db: Pick<Firestore, 'collectionGroup'>,
) {
  return async (teamId: string): Promise<Assignment[]> => {
    const snapshot = await db.collectionGroup('registrationEntries')
      .where('assigned_team_id', '==', teamId)
      .limit(200)
      .get();

    return snapshot.docs.flatMap(document => {
      const data = document.data();
      if (data.status !== 'assigned') return [];
      return [{
        ...data,
        id: document.id,
        league_id: data.league_id || document.ref.parent.parent?.id || '',
      }];
    });
  };
}

export function createLeagueAssignmentsGetHandler(
  dependencies: LeagueAssignmentsGetDependencies,
) {
  return async function GET(req: NextRequest) {
    const auth = await dependencies.verifyFirebaseToken(req);
    if (auth instanceof NextResponse) return auth;

    const teamId = req.nextUrl.searchParams.get('teamId');
    if (!teamId || !ID_PATTERN.test(teamId)) {
      return NextResponse.json({ error: 'Invalid squad.' }, { status: 400 });
    }

    const authority = await dependencies.getTeamAuthority(teamId, auth.uid, auth.role);
    if (!authority?.isStaff) {
      return NextResponse.json(
        { error: 'Only authorized squad staff can view assignments.' },
        { status: 403 },
      );
    }

    try {
      const assignments = await dependencies.readAssignments(teamId);
      return NextResponse.json({ assignments });
    } catch (error) {
      const code = typeof (error as { code?: unknown })?.code === 'string' ||
        typeof (error as { code?: unknown })?.code === 'number'
        ? String((error as { code: string | number }).code)
        : 'unknown';
      dependencies.logUnavailable?.(code);
      return NextResponse.json(
        { error: 'League assignments are temporarily unavailable.' },
        { status: 503 },
      );
    }
  };
}
