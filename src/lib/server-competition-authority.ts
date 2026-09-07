import type { DocumentData, DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { authorizeDashboardRoute } from '@/lib/dashboard-route-policy';
import { hasStaffRole } from '@/lib/staff-position';

export type CompetitionAuthority = {
  actorUid: string;
  tenantId: string;
  memberRefPath: string;
  role: 'owner' | 'superadmin' | 'league_creator' | 'coach' | 'staff';
  planId: string;
};

export type CompetitionAuthorityInput = {
  actorUid: string;
  actorRole?: string;
  teamId: string;
  leagueId?: string;
  db?: Firestore;
  transaction?: Transaction;
};

export type CompetitionMutationAuthorityInput = Omit<CompetitionAuthorityInput, 'transaction'> & {
  transaction: Transaction;
};

function forbidden(): never {
  throw new Error('Forbidden competition mutation.');
}

function activeMember(data: DocumentData | undefined): boolean {
  return Boolean(data) && data?.status === 'active' && data?.isDeleted !== true;
}

function includesActor(value: unknown, actorUid: string): boolean {
  return Array.isArray(value) && value.includes(actorUid);
}

function planIdOf(team: DocumentData): string {
  const planId = [team.planId, team.plan_type, team.subscriptionPlanId]
    .find(value => typeof value === 'string' && value.trim()) as string | undefined;
  const normalized = planId?.trim().toLowerCase() || '';
  const entitlement = authorizeDashboardRoute('/competition', { role: 'coach', planId: normalized });
  if (!normalized || !entitlement.allowed) forbidden();
  return normalized;
}

function explicitLeagueTenant(league: DocumentData): string {
  const tenants = new Set(
    [league.tenantId, league.hostTeamId, league.ownerTeamId, league.teamId]
      .filter((value): value is string => typeof value === 'string' && Boolean(value)),
  );
  if (tenants.size !== 1) forbidden();
  return [...tenants][0];
}

async function read<T extends DocumentData = DocumentData>(
  ref: DocumentReference<T>,
  transaction?: Transaction,
) {
  return transaction ? transaction.get(ref) : ref.get();
}

async function findActorMember(
  db: Firestore,
  teamId: string,
  actorUid: string,
  transaction?: Transaction,
) {
  const members = db.collection('teams').doc(teamId).collection('members');
  const direct = await read(members.doc(actorUid), transaction);
  const directData = direct.data();
  if (direct.exists && activeMember(directData) && (!directData?.userId || directData.userId === actorUid)) {
    return direct;
  }
  const linkedQuery = members.where('userId', '==', actorUid).limit(10);
  const linked = transaction ? await transaction.get(linkedQuery) : await linkedQuery.get();
  return linked.docs.find(candidate => activeMember(candidate.data())) || null;
}

function staffRole(data: DocumentData): CompetitionAuthority['role'] {
  const role = String(data.role || '').trim().toLowerCase();
  const position = String(data.position || '').trim().toLowerCase();
  return role === 'coach' || position === 'coach' || position === 'head coach' || position === 'assistant coach'
    ? 'coach'
    : 'staff';
}

/** Resolve current authority for preflight/read use; writes must use the transaction-bound assertion below. */
export async function resolveCompetitionAuthority(
  input: CompetitionAuthorityInput,
): Promise<CompetitionAuthority> {
  const db = input.db || adminDb;
  const actorUid = String(input.actorUid || '').trim();
  const teamId = String(input.teamId || '').trim();
  if (!actorUid || !teamId) forbidden();

  const teamRef = db.collection('teams').doc(teamId);
  const teamSnapshot = await read(teamRef, input.transaction);
  if (!teamSnapshot.exists) forbidden();
  const team = teamSnapshot.data() || {};
  const planId = planIdOf(team);

  let leagueRefPath: string | null = null;
  let isOrganizer = false;
  if (input.leagueId) {
    const leagueRef = db.collection('leagues').doc(input.leagueId);
    const leagueSnapshot = await read(leagueRef, input.transaction);
    if (!leagueSnapshot.exists) forbidden();
    const league = leagueSnapshot.data() || {};
    const leagueTenant = explicitLeagueTenant(league);
    if (leagueTenant !== teamId) forbidden();
    isOrganizer = league.creatorId === actorUid;
    leagueRefPath = leagueRef.path;
  }

  const base = { actorUid, tenantId: teamId, planId };
  if (input.actorRole === 'superadmin') {
    return { ...base, memberRefPath: teamRef.path, role: 'superadmin' };
  }
  if (team.ownerUserId === actorUid) {
    return { ...base, memberRefPath: teamRef.path, role: 'owner' };
  }
  if (isOrganizer) {
    return { ...base, memberRefPath: leagueRefPath!, role: 'league_creator' };
  }
  if (
    includesActor(team.schoolAdminIds, actorUid) ||
    includesActor(team.organizationAdminIds, actorUid)
  ) {
    return { ...base, memberRefPath: teamRef.path, role: 'staff' };
  }

  const member = await findActorMember(db, teamId, actorUid, input.transaction);
  const memberData = member?.data();
  if (member && activeMember(memberData) && hasStaffRole(memberData)) {
    return { ...base, memberRefPath: member.ref.path, role: staffRole(memberData!) };
  }

  const hubTeamId = [team.schoolId, team.organizationHubId]
    .find(value => typeof value === 'string' && value && value !== teamId) as string | undefined;
  if (!hubTeamId) forbidden();
  const hubRef = db.collection('teams').doc(hubTeamId);
  const hubSnapshot = await read(hubRef, input.transaction);
  if (!hubSnapshot.exists) forbidden();
  const hub = hubSnapshot.data() || {};
  if (
    hub.ownerUserId === actorUid ||
    includesActor(hub.schoolAdminIds, actorUid) ||
    includesActor(hub.organizationAdminIds, actorUid)
  ) {
    return { ...base, memberRefPath: hubRef.path, role: 'staff' };
  }
  const hubMember = await findActorMember(db, hubTeamId, actorUid, input.transaction);
  const hubMemberData = hubMember?.data();
  if (!hubMember || !activeMember(hubMemberData) || !hasStaffRole(hubMemberData)) forbidden();
  return { ...base, memberRefPath: hubMember.ref.path, role: staffRole(hubMemberData!) };
}

/** Re-read authority and competition entitlement inside the caller's committing transaction. */
export async function assertCompetitionMutationAuthority(
  input: CompetitionMutationAuthorityInput,
): Promise<void> {
  await resolveCompetitionAuthority(input);
}
