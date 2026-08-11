import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { isEntitledSubscriptionStatus } from '@/lib/subscription-seat-policy';
import { isBillableSquadSeat } from '@/lib/team-seat-policy';

const ORGANIZATION_PLANS = new Set(['elite', 'league', 'school']);

type OrganizationContext = {
  ownerId: string;
  hubId: string | null;
  type: 'club' | 'school';
  planId: string;
  teamLimit: number;
};

function includesUser(value: unknown, userId: string): boolean {
  return Array.isArray(value) && value.includes(userId);
}

async function resolveOrganization(
  transaction: FirebaseFirestore.Transaction,
  auth: { uid: string; role?: string },
  hubTeamId: unknown
): Promise<OrganizationContext> {
  let ownerId = auth.uid;
  let hubId: string | null = null;
  let type: 'club' | 'school' = 'club';

  if (typeof hubTeamId === 'string' && hubTeamId) {
    const hubSnapshot = await transaction.get(adminDb.collection('teams').doc(hubTeamId));
    if (!hubSnapshot.exists) throw new Error('HUB_NOT_FOUND');
    const hub = hubSnapshot.data() || {};
    if (isBillableSquadSeat(hub) || !['school', 'school_hub'].includes(hub.type)) {
      throw new Error('INVALID_HUB');
    }
    ownerId = hub.ownerUserId;
    hubId = hubSnapshot.id;
    type = 'school';
    const authorized =
      auth.role === 'superadmin' ||
      hub.ownerUserId === auth.uid ||
      includesUser(hub.schoolAdminIds, auth.uid);
    if (!authorized) throw new Error('FORBIDDEN');
  } else if (auth.role !== 'superadmin' && ownerId !== auth.uid) {
    throw new Error('FORBIDDEN');
  }

  if (typeof ownerId !== 'string' || !ownerId) throw new Error('INVALID_HUB');
  const ownerSnapshot = await transaction.get(adminDb.collection('users').doc(ownerId));
  if (!ownerSnapshot.exists) throw new Error('OWNER_NOT_FOUND');
  const owner = ownerSnapshot.data() || {};
  if (
    auth.role !== 'superadmin' &&
    (!ORGANIZATION_PLANS.has(owner.plan_type) ||
      !isEntitledSubscriptionStatus(owner.subscription_status))
  ) {
    throw new Error('NO_PAID_ORGANIZATION');
  }

  const configuredLimit = Number(owner.team_limit ?? owner.proTeamLimit);
  return {
    ownerId,
    hubId,
    type,
    planId: ORGANIZATION_PLANS.has(owner.plan_type) ? owner.plan_type : 'school',
    teamLimit:
      auth.role === 'superadmin'
        ? Math.max(Number.isInteger(configuredLimit) ? configuredLimit : 0, 100)
        : Number.isInteger(configuredLimit) && configuredLimit >= 0
          ? configuredLimit
          : 1,
  };
}

function projection(
  teamId: string,
  team: FirebaseFirestore.DocumentData,
  organization: OrganizationContext,
  allocated: boolean,
  now: string
) {
  return {
    teamId,
    name: team.name || team.teamName || 'Squad',
    ownerUserId: team.ownerUserId,
    ...(team.type ? { type: team.type } : {}),
    isPro: allocated,
    planId: allocated ? organization.planId : 'free',
    organizationOwnerUserId: allocated ? organization.ownerId : FieldValue.delete(),
    organizationType: allocated ? organization.type : FieldValue.delete(),
    schoolId:
      allocated && organization.hubId ? organization.hubId : FieldValue.delete(),
    clubId:
      allocated && !organization.hubId ? organization.ownerId : FieldValue.delete(),
    last_plan_sync: now,
  };
}

async function mutateOrganizationSquad(req: NextRequest, allocated: boolean) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const input = await req.json();
    const teamId = typeof input.teamId === 'string' ? input.teamId : '';
    if (!teamId) return NextResponse.json({ error: 'Missing teamId.' }, { status: 400 });

    let response: { planId: string; remaining: number } | undefined;
    await adminDb.runTransaction(async transaction => {
      const organization = await resolveOrganization(transaction, auth, input.hubTeamId);
      const teamRef = adminDb.collection('teams').doc(teamId);
      const ownedTeamsQuery = adminDb.collection('teams').where('ownerUserId', '==', organization.ownerId);
      const [teamSnapshot, ownedTeams] = await Promise.all([
        transaction.get(teamRef),
        transaction.get(ownedTeamsQuery),
      ]);
      if (!teamSnapshot.exists) throw new Error('TEAM_NOT_FOUND');
      const team = teamSnapshot.data() || {};
      if (team.ownerUserId !== organization.ownerId || !isBillableSquadSeat(team)) {
        throw new Error('INVALID_SQUAD');
      }
      if (
        organization.hubId &&
        team.schoolId !== organization.hubId &&
        team.organizationHubId !== organization.hubId
      ) {
        throw new Error('FORBIDDEN');
      }

      const otherAllocated = ownedTeams.docs.filter(snapshot =>
        snapshot.id !== teamId &&
        snapshot.data().isPro === true &&
        isBillableSquadSeat(snapshot.data()) &&
        (!organization.hubId ||
          snapshot.data().schoolId === organization.hubId ||
          snapshot.data().organizationHubId === organization.hubId)
      ).length;
      if (allocated && otherAllocated >= organization.teamLimit) throw new Error('NO_SEATS');

      const now = new Date().toISOString();
      transaction.update(teamRef, {
        isPro: allocated,
        planId: allocated ? organization.planId : 'free',
        organizationOwnerUserId: allocated ? organization.ownerId : FieldValue.delete(),
        organizationHubId:
          allocated && organization.hubId ? organization.hubId : FieldValue.delete(),
        organizationType: allocated ? organization.type : FieldValue.delete(),
        schoolId:
          allocated && organization.hubId ? organization.hubId : FieldValue.delete(),
        clubId:
          allocated && !organization.hubId ? organization.ownerId : FieldValue.delete(),
        last_plan_sync: now,
      });

      const projectionData = projection(teamId, team, organization, allocated, now);
      for (const userId of new Set([organization.ownerId, auth.uid])) {
        transaction.set(
          adminDb.collection('users').doc(userId).collection('teamMemberships').doc(teamId),
          projectionData,
          { merge: true }
        );
      }
      response = {
        planId: allocated ? organization.planId : 'free',
        remaining: Math.max(0, organization.teamLimit - (otherAllocated + (allocated ? 1 : 0))),
      };
    });

    return NextResponse.json({ success: true, ...response });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    const errors: Record<string, [number, string]> = {
      TEAM_NOT_FOUND: [404, 'Squad not found.'],
      HUB_NOT_FOUND: [404, 'Organization hub not found.'],
      OWNER_NOT_FOUND: [409, 'The organization owner profile is incomplete.'],
      INVALID_HUB: [400, 'A valid school hub is required.'],
      INVALID_SQUAD: [403, 'Only playable squads owned by this organization can use its seats.'],
      FORBIDDEN: [403, 'Only the organization owner or an authorized hub administrator can manage squad seats.'],
      NO_PAID_ORGANIZATION: [403, 'An active Club or School subscription is required.'],
      NO_SEATS: [409, 'No Pro squad seats are available on this organization subscription.'],
    };
    const known = errors[code];
    if (known) return NextResponse.json({ error: known[1] }, { status: known[0] });
    console.error('[organizations/squads] Failed:', error);
    return NextResponse.json({ error: 'Unable to update this organization squad.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return mutateOrganizationSquad(req, true);
}

export async function DELETE(req: NextRequest) {
  return mutateOrganizationSquad(req, false);
}

export async function GET(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const hubTeamId = req.nextUrl.searchParams.get('hubTeamId');
    const capacity = await adminDb.runTransaction(async transaction => {
      const organization = await resolveOrganization(transaction, auth, hubTeamId);
      const ownedTeams = await transaction.get(
        adminDb.collection('teams').where('ownerUserId', '==', organization.ownerId)
      );
      const organizationTeams = ownedTeams.docs.filter(snapshot => {
        const team = snapshot.data();
        return isBillableSquadSeat(team) &&
          (!organization.hubId || team.schoolId === organization.hubId || team.organizationHubId === organization.hubId);
      });
      const allocatedSnapshots = organizationTeams.filter(snapshot =>
        snapshot.data().isPro === true
      );
      const squads = allocatedSnapshots.map(snapshot => ({
        id: snapshot.id,
        ...snapshot.data(),
        name: snapshot.data().name || snapshot.data().teamName || 'Squad',
      }));
      const teams = organizationTeams
        .map(snapshot => ({
          id: snapshot.id,
          ...snapshot.data(),
          name: snapshot.data().name || snapshot.data().teamName || 'Squad',
        }));
      return {
        allocated: squads.length,
        limit: organization.teamLimit,
        remaining: Math.max(0, organization.teamLimit - squads.length),
        squads,
        teams,
      };
    });
    return NextResponse.json(capacity);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }
    if (code === 'NO_PAID_ORGANIZATION') {
      return NextResponse.json({ error: 'An active Club or School subscription is required.' }, { status: 403 });
    }
    console.error('[organizations/squads GET] Failed:', error);
    return NextResponse.json({ error: 'Unable to load organization capacity.' }, { status: 500 });
  }
}
