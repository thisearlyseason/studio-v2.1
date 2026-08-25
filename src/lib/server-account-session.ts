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

export function createServerAccountAccessReader(
  dependencies: ServerAccountAccessDependencies,
): AccountAccessReader {
  return {
    async getProfile(uid) {
      const snapshot = await dependencies.db.collection('users').doc(uid).get();
      return snapshot.exists ? snapshot.data() as AccountSessionProfile : null;
    },

    async hasActiveSquadAuthority(uid, activeTeamId) {
      if (activeTeamId) {
        const selectedAuthority = await dependencies.getTeamAuthority(activeTeamId, uid);
        if (
          selectedAuthority &&
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
          .limit(1)
          .get(),
      ]);
      return members.docs.some(member => isActiveMember(member.data())) ||
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
