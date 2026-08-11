import { adminDb } from '@/lib/firebase-admin';
import { isEntitledSubscriptionStatus } from '@/lib/subscription-seat-policy';

export { isEntitledSubscriptionStatus } from '@/lib/subscription-seat-policy';

const PAID_PLAN_TYPES = new Set([
  'team',
  'elite',
  'league',
  'school',
  'squad_pro',
  'squad_pro_demo',
]);

export type TeamFinanceAccess = {
  allowed: boolean;
  paid: boolean;
  status: number;
  error?: string;
  team?: FirebaseFirestore.DocumentData;
  user?: FirebaseFirestore.DocumentData;
};

export type PaidTeamFeatureAccess = TeamFinanceAccess;

function includesUser(value: unknown, userId: string): boolean {
  return Array.isArray(value) && value.includes(userId);
}

function isActiveMembership(data: FirebaseFirestore.DocumentData | undefined): boolean {
  return Boolean(data) && data?.status !== 'removed' && data?.isDeleted !== true;
}

async function hasTeamMembership(
  teamId: string,
  userId: string,
  directMembership: FirebaseFirestore.DocumentSnapshot
): Promise<boolean> {
  if (directMembership.exists && isActiveMembership(directMembership.data())) return true;

  const [userMembership, parentMembership] = await Promise.all([
    adminDb
      .collection('teams')
      .doc(teamId)
      .collection('members')
      .where('userId', '==', userId)
      .limit(10)
      .get(),
    adminDb
      .collection('teams')
      .doc(teamId)
      .collection('members')
      .where('parentId', '==', userId)
      .limit(10)
      .get(),
  ]);
  return (
    userMembership.docs.some(snapshot => isActiveMembership(snapshot.data())) ||
    parentMembership.docs.some(snapshot => isActiveMembership(snapshot.data()))
  );
}

async function resolvePaidEntitlement(
  team: FirebaseFirestore.DocumentData,
  requestingUserId: string,
  requestingUserSnapshot: FirebaseFirestore.DocumentSnapshot
): Promise<boolean> {
  let entitlementOwnerId =
    typeof team.ownerUserId === 'string' ? team.ownerUserId : requestingUserId;
  const hubTeamId =
    typeof team.schoolId === 'string' && team.schoolId
      ? team.schoolId
      : typeof team.clubId === 'string' && team.clubId
        ? team.clubId
        : null;

  if (hubTeamId) {
    const hubSnapshot = await adminDb.collection('teams').doc(hubTeamId).get();
    const hubOwnerId = hubSnapshot.data()?.ownerUserId;
    if (typeof hubOwnerId === 'string' && hubOwnerId) {
      entitlementOwnerId = hubOwnerId;
    }
  }

  const entitlementUserSnapshot =
    entitlementOwnerId === requestingUserId
      ? requestingUserSnapshot
      : await adminDb.collection('users').doc(entitlementOwnerId).get();
  const entitlementUser = entitlementUserSnapshot.data() || {};

  return (
    team.isPro === true &&
    PAID_PLAN_TYPES.has(team.planId || '') &&
    PAID_PLAN_TYPES.has(entitlementUser.plan_type || '') &&
    isEntitledSubscriptionStatus(entitlementUser.subscription_status)
  );
}

export async function getPaidTeamFeatureAccess(
  userId: string,
  teamId: string,
  isSuperAdmin: boolean
): Promise<PaidTeamFeatureAccess> {
  const [teamSnapshot, userSnapshot, memberSnapshot] = await Promise.all([
    adminDb.collection('teams').doc(teamId).get(),
    adminDb.collection('users').doc(userId).get(),
    adminDb.collection('teams').doc(teamId).collection('members').doc(userId).get(),
  ]);
  if (!teamSnapshot.exists) {
    return { allowed: false, paid: false, status: 404, error: 'Team not found.' };
  }

  const team = teamSnapshot.data() || {};
  const user = userSnapshot.data() || {};
  if (
    !isSuperAdmin &&
    team.ownerUserId !== userId &&
    memberSnapshot.exists &&
    !isActiveMembership(memberSnapshot.data())
  ) {
    return {
      allowed: false,
      paid: false,
      status: 403,
      error: 'Your squad access has been removed.',
    };
  }
  if (!isSuperAdmin && (team.isDemo === true || user.isDemo === true)) {
    return {
      allowed: false,
      paid: false,
      status: 403,
      error: 'Externally billed features are unavailable in demo workspaces.',
    };
  }
  const hasMembership = await hasTeamMembership(teamId, userId, memberSnapshot);
  const hasAccess =
    isSuperAdmin ||
    team.ownerUserId === userId ||
    includesUser(team.financeAdminIds, userId) ||
    includesUser(team.schoolAdminIds, userId) ||
    hasMembership;

  if (!hasAccess) {
    return {
      allowed: false,
      paid: false,
      status: 403,
      error: 'You do not have access to this squad.',
    };
  }
  if (isSuperAdmin) {
    return { allowed: true, paid: true, status: 200, team, user };
  }

  const paid = await resolvePaidEntitlement(team, userId, userSnapshot);
  if (!paid) {
    return {
      allowed: false,
      paid: false,
      status: 403,
      error: 'This feature requires an active paid seat for this squad.',
    };
  }

  return { allowed: true, paid: true, status: 200, team, user };
}

export async function getTeamFinanceAccess(
  userId: string,
  teamId: string,
  isSuperAdmin: boolean,
  requirePaid: boolean
): Promise<TeamFinanceAccess> {
  const [teamSnapshot, userSnapshot, memberSnapshot] = await Promise.all([
    adminDb.collection('teams').doc(teamId).get(),
    adminDb.collection('users').doc(userId).get(),
    adminDb.collection('teams').doc(teamId).collection('members').doc(userId).get(),
  ]);
  if (!teamSnapshot.exists) {
    return { allowed: false, paid: false, status: 404, error: 'Team not found.' };
  }

  const team = teamSnapshot.data() || {};
  const user = userSnapshot.data() || {};
  if (
    !isSuperAdmin &&
    team.ownerUserId !== userId &&
    memberSnapshot.exists &&
    !isActiveMembership(memberSnapshot.data())
  ) {
    return {
      allowed: false,
      paid: false,
      status: 403,
      error: 'Your squad access has been removed.',
    };
  }
  let authority =
    isSuperAdmin ||
    team.ownerUserId === userId ||
    includesUser(team.financeAdminIds, userId) ||
    includesUser(team.schoolAdminIds, userId) ||
    (
      memberSnapshot.exists &&
      isActiveMembership(memberSnapshot.data()) &&
      memberSnapshot.data()?.role === 'Admin'
    );

  const hubTeamId =
    typeof team.schoolId === 'string' && team.schoolId
      ? team.schoolId
      : typeof team.clubId === 'string' && team.clubId
        ? team.clubId
        : null;

  if (hubTeamId) {
    const hubSnapshot = await adminDb.collection('teams').doc(hubTeamId).get();
    if (hubSnapshot.exists) {
      const hub = hubSnapshot.data() || {};
      authority =
        authority ||
        hub.ownerUserId === userId ||
        includesUser(hub.financeAdminIds, userId) ||
        includesUser(hub.schoolAdminIds, userId);
    }
  }

  if (!authority) {
    return {
      allowed: false,
      paid: false,
      status: 403,
      error: 'You do not have finance permission for this squad.',
    };
  }

  if (requirePaid && !isSuperAdmin && (team.isDemo === true || user.isDemo === true)) {
    return {
      allowed: false,
      paid: false,
      status: 403,
      error: 'Online payments are unavailable in demo workspaces.',
    };
  }

  if (isSuperAdmin) {
    return { allowed: true, paid: true, status: 200, team, user };
  }

  const paid = await resolvePaidEntitlement(team, userId, userSnapshot);

  if (requirePaid && !paid) {
    return {
      allowed: false,
      paid: false,
      status: 403,
      error: 'Online payments require an active paid seat for this squad.',
    };
  }

  return { allowed: true, paid, status: 200, team, user };
}

export function isPaidPlanType(planType: unknown): boolean {
  return typeof planType === 'string' && PAID_PLAN_TYPES.has(planType);
}
