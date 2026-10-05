import { adminDb } from '@/lib/firebase-admin';

export type TeamConnectAccount = {
  connectAccountId: string | null;
  isHubAccount: boolean;
  hubTeamId: string | null;
  hubTeamName: string | null;
  squadName: string | null;
};

/**
 * Resolve the payout account from server-owned team configuration. A finance
 * admin's personal Stripe account must never become the destination merely
 * because that admin happened to create the payment item.
 */
export async function resolveTeamConnectAccount(teamId: string): Promise<TeamConnectAccount> {
  const teamSnap = await adminDb.collection('teams').doc(teamId).get();
  if (!teamSnap.exists) {
    return {
      connectAccountId: null,
      isHubAccount: false,
      hubTeamId: null,
      hubTeamName: null,
      squadName: null,
    };
  }

  const team = teamSnap.data() || {};
  const squadName = typeof team.name === 'string' ? team.name : null;
  const hubTeamId = typeof (team.schoolId || team.clubId) === 'string'
    ? (team.schoolId || team.clubId)
    : null;

  if (hubTeamId) {
    const hubSnap = await adminDb.collection('teams').doc(hubTeamId).get();
    const hub = hubSnap.data() || {};
    if (hub.stripeConnectMode === 'shared' && typeof hub.stripeConnectAccountId === 'string') {
      return {
        connectAccountId: hub.stripeConnectAccountId,
        isHubAccount: true,
        hubTeamId,
        hubTeamName: typeof hub.name === 'string' ? hub.name : null,
        squadName,
      };
    }
  }

  if (typeof team.stripeConnectAccountId === 'string') {
    return {
      connectAccountId: team.stripeConnectAccountId,
      isHubAccount: false,
      hubTeamId,
      hubTeamName: null,
      squadName,
    };
  }

  // Backward compatibility for accounts connected before payout destinations
  // were stored on the squad. Only the squad owner's legacy account qualifies.
  if (typeof team.ownerUserId === 'string' && team.ownerUserId) {
    const ownerSnap = await adminDb.collection('users').doc(team.ownerUserId).get();
    const legacyAccountId = ownerSnap.data()?.stripe_connect_account_id;
    if (typeof legacyAccountId === 'string') {
      return {
        connectAccountId: legacyAccountId,
        isHubAccount: false,
        hubTeamId,
        hubTeamName: null,
        squadName,
      };
    }
  }

  return {
    connectAccountId: null,
    isHubAccount: false,
    hubTeamId,
    hubTeamName: null,
    squadName,
  };
}

export async function connectAccountOwnsTeam(
  teamId: string,
  connectedAccountId: string | undefined
): Promise<boolean> {
  if (!connectedAccountId) return false;
  const resolved = await resolveTeamConnectAccount(teamId);
  return resolved.connectAccountId === connectedAccountId;
}
