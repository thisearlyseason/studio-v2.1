import type { Firestore } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { getTeamAuthority } from '@/lib/server-team-access';
import {
  createAccountSessionResolver,
  type AccountAccessReader,
  type AccountSessionDecision,
  type AccountSessionProfile,
  type SessionIdentity,
} from '@/lib/account-session-policy';

type ServerAccountAccessDependencies = {
  db: Pick<Firestore, 'collection' | 'collectionGroup'>;
  getTeamAuthority: typeof getTeamAuthority;
};

function isActiveMember(data: Record<string, unknown>): boolean {
  return String(data.status || '').trim().toLowerCase() !== 'removed' && data.isDeleted !== true;
}

function isActiveOwnedTeam(data: Record<string, unknown>): boolean {
  const status = String(data.status || '').trim().toLowerCase();
  return data.isDeleted !== true && status !== 'deleted' && status !== 'removed';
}

function isCanonicalSchoolInstitution(data: Record<string, unknown>, uid: string): boolean {
  const planId = String(data.planId || '').trim().toLowerCase();
  const planType = String(data.planType || '').trim().toLowerCase();
  return isActiveOwnedTeam(data) &&
    data.type === 'school' &&
    data.isInstitution === true &&
    planId === 'school' &&
    planType === 'school' &&
    Array.isArray(data.schoolAdminIds) &&
    data.schoolAdminIds.includes(uid);
}

export function createServerAccountAccessReader(
  dependencies: ServerAccountAccessDependencies,
): AccountAccessReader {
  return {
    async getProfile(uid) {
      const snapshot = await dependencies.db.collection('users').doc(uid).get();
      return snapshot.exists ? snapshot.data() as AccountSessionProfile : null;
    },

    async hasTrustedInstitutionAuthority(uid) {
      const schools = await dependencies.db
        .collection('teams')
        .where('schoolAdminIds', 'array-contains', uid)
        .limit(20)
        .get();
      return schools.docs.some(team => {
        const data = team.data();
        return isCanonicalSchoolInstitution(data, uid);
      });
    },

    async hasActiveSquadAuthority(uid, activeTeamId) {
      if (activeTeamId) {
        const selectedAuthority = await dependencies.getTeamAuthority(activeTeamId, uid);
        if (
          selectedAuthority &&
          isActiveOwnedTeam(selectedAuthority.teamData) &&
          (selectedAuthority.isOwner || selectedAuthority.isSuperAdmin || selectedAuthority.member)
        ) {
          return true;
        }
      }

      const [members, ownedTeams] = await Promise.all([
        dependencies.db
          .collectionGroup('members')
          .where('userId', '==', uid)
          .limit(20)
          .get(),
        dependencies.db
          .collection('teams')
          .where('ownerUserId', '==', uid)
          .limit(20)
          .get(),
      ]);
      const activeMemberTeamReads = members.docs.flatMap(member => {
        if (!isActiveMember(member.data())) return [];
        const teamRef = member.ref.parent.parent;
        return teamRef ? [teamRef.get()] : [];
      });
      const activeMemberTeams = await Promise.all(activeMemberTeamReads);
      return activeMemberTeams.some(team => team.exists && isActiveOwnedTeam(team.data() || {})) ||
        ownedTeams.docs.some(team => isActiveOwnedTeam(team.data()));
    },
  };
}

const resolveAccountSession = createAccountSessionResolver(
  createServerAccountAccessReader({ db: adminDb, getTeamAuthority }),
);

export async function resolveServerAccountSession(
  identity: SessionIdentity,
): Promise<AccountSessionDecision> {
  return resolveAccountSession(identity);
}
