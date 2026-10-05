import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import {
  isEntitledSubscriptionStatus,
  isPaidPlanType,
} from '@/lib/server-team-entitlements';
import { isBillableSquadSeat } from '@/lib/team-seat-policy';

const PAID_PLAN_TYPES = new Set(['team', 'elite', 'league', 'school', 'squad_pro', 'squad_pro_demo']);

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { teamId, planId } = await req.json();
    if (!teamId || typeof teamId !== 'string') {
      return NextResponse.json({ error: 'Missing teamId.' }, { status: 400 });
    }

    const isSuperAdmin = auth.role === 'superadmin';
    if (isSuperAdmin && (typeof planId !== 'string' || !PAID_PLAN_TYPES.has(planId))) {
      return NextResponse.json({ error: 'A valid paid plan is required.' }, { status: 400 });
    }

    const teamRef = adminDb.collection('teams').doc(teamId);
    let resolvedPlanId = '';
    await adminDb.runTransaction(async (transaction) => {
      const teamSnap = await transaction.get(teamRef);
      if (!teamSnap.exists) throw new Error('TEAM_NOT_FOUND');

      const team = teamSnap.data()!;
      if (!isSuperAdmin && team.ownerUserId !== auth.uid) throw new Error('FORBIDDEN');

      if (isSuperAdmin) {
        resolvedPlanId = planId;
      } else {
        const userRef = adminDb.collection('users').doc(auth.uid);
        const ownedTeamsQuery = adminDb.collection('teams').where('ownerUserId', '==', auth.uid);
        const [userSnap, ownedTeams] = await Promise.all([
          transaction.get(userRef),
          transaction.get(ownedTeamsQuery),
        ]);
        const user = userSnap.data();
        const accountPlan = user?.plan_type;
        if (
          !isPaidPlanType(accountPlan) ||
          !isEntitledSubscriptionStatus(user?.subscription_status)
        ) {
          throw new Error('NO_PAID_PLAN');
        }

        const teamLimit = Number(user?.team_limit ?? 1);
        const allocatedCount = ownedTeams.docs.filter(
          doc =>
            doc.id !== teamId &&
            doc.data().isPro === true &&
            isBillableSquadSeat(doc.data())
        ).length;
        if (allocatedCount >= teamLimit) throw new Error('NO_SEATS');
        resolvedPlanId = accountPlan;
      }

      transaction.update(teamRef, {
        isPro: true,
        planId: resolvedPlanId,
        last_plan_sync: new Date().toISOString(),
      });
      if (typeof team.ownerUserId === 'string' && team.ownerUserId) {
        transaction.set(
          adminDb
            .collection('users')
            .doc(team.ownerUserId)
            .collection('teamMemberships')
            .doc(teamId),
          {
            teamId,
            name: team.name || team.teamName || 'Squad',
            ownerUserId: team.ownerUserId,
            ...(team.type ? { type: team.type } : {}),
            ...(team.schoolId ? { schoolId: team.schoolId } : {}),
            isPro: true,
            planId: resolvedPlanId,
            last_plan_sync: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    });
    return NextResponse.json({ success: true, planId: resolvedPlanId });
  } catch (err: any) {
    if (err.message === 'TEAM_NOT_FOUND') return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    if (err.message === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    if (err.message === 'NO_PAID_PLAN') return NextResponse.json({ error: 'Upgrade your subscription before activating Pro features.' }, { status: 403 });
    if (err.message === 'NO_SEATS') return NextResponse.json({ error: 'No Pro team slots are available on this subscription.' }, { status: 409 });
    console.error('[teams/allocate-pro] Error:', err.message);
    return NextResponse.json({ error: 'Unable to activate Pro for this team.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { teamId } = await req.json();
    if (!teamId || typeof teamId !== 'string') {
      return NextResponse.json({ error: 'Missing teamId.' }, { status: 400 });
    }

    const teamRef = adminDb.collection('teams').doc(teamId);
    await adminDb.runTransaction(async transaction => {
      const teamSnap = await transaction.get(teamRef);
      if (!teamSnap.exists) throw new Error('TEAM_NOT_FOUND');
      const team = teamSnap.data()!;
      if (auth.role !== 'superadmin' && team.ownerUserId !== auth.uid) {
        throw new Error('FORBIDDEN');
      }
      const updatedAt = new Date().toISOString();
      transaction.update(teamRef, {
        isPro: false,
        planId: 'free',
        last_plan_sync: updatedAt,
      });
      if (typeof team.ownerUserId === 'string' && team.ownerUserId) {
        transaction.set(
          adminDb
            .collection('users')
            .doc(team.ownerUserId)
            .collection('teamMemberships')
            .doc(teamId),
          {
            teamId,
            name: team.name || team.teamName || 'Squad',
            ownerUserId: team.ownerUserId,
            ...(team.type ? { type: team.type } : {}),
            ...(team.schoolId ? { schoolId: team.schoolId } : {}),
            isPro: false,
            planId: 'free',
            last_plan_sync: updatedAt,
          },
          { merge: true }
        );
      }
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err.message === 'TEAM_NOT_FOUND') return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    if (err.message === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    console.error('[teams/allocate-pro DELETE] Error:', err.message);
    return NextResponse.json({ error: 'Unable to release this Pro team slot.' }, { status: 500 });
  }
}
