export type SessionIdentity = {
  uid: string;
  role?: string;
  signInProvider?: string;
};

export type AccountSessionProfile = {
  role?: string | null;
  accountStatus?: string | null;
  deletionStatus?: string | null;
  activeTeamId?: string | null;
  isSchoolAdmin?: boolean;
  isPrimaryClubAuthority?: boolean;
  plan_type?: string | null;
  planId?: string | null;
  activePlanId?: string | null;
};

export type AccountAccessReader = {
  getProfile(uid: string): Promise<AccountSessionProfile | null>;
  hasTrustedInstitutionAuthority?(uid: string): Promise<boolean>;
  hasActiveSquadAuthority(uid: string, activeTeamId?: string | null): Promise<boolean>;
};

export type AccountSessionDecision =
  | { allowed: false; code: 'auth/account-unavailable' }
  | {
      allowed: true;
      redirectTo: '/onboarding' | '/teams/join' | null;
      profile: AccountSessionProfile | null;
    };

function normalized(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isUnavailable(profile: AccountSessionProfile): boolean {
  const accountStatus = normalized(profile.accountStatus);
  return accountStatus === 'suspended' ||
    accountStatus === 'pending_deletion' ||
    normalized(profile.deletionStatus) === 'pending';
}

function hasIndependentAuthority(
  identity: SessionIdentity,
  profile: AccountSessionProfile,
): boolean {
  const claimRole = normalized(identity.role);
  const profileRole = normalized(profile.role);
  return claimRole === 'superadmin' ||
    profileRole === 'superadmin' ||
    profileRole === 'league_creator' ||
    profile.isPrimaryClubAuthority === true;
}

export function createAccountSessionResolver(reader: AccountAccessReader) {
  return async (identity: SessionIdentity): Promise<AccountSessionDecision> => {
    if (normalized(identity.signInProvider) === 'anonymous') {
      return { allowed: true, redirectTo: null, profile: null };
    }

    const profile = await reader.getProfile(identity.uid);
    if (!profile) {
      return { allowed: true, redirectTo: '/onboarding', profile: null };
    }
    if (isUnavailable(profile)) {
      return { allowed: false, code: 'auth/account-unavailable' };
    }
    if (hasIndependentAuthority(identity, profile)) {
      return { allowed: true, redirectTo: null, profile };
    }
    if (
      profile.isSchoolAdmin === true &&
      await reader.hasTrustedInstitutionAuthority?.(identity.uid) === true
    ) {
      return { allowed: true, redirectTo: null, profile };
    }

    const hasSquadAuthority = await reader.hasActiveSquadAuthority(
      identity.uid,
      profile.activeTeamId,
    );
    return {
      allowed: true,
      redirectTo: hasSquadAuthority ? null : '/teams/join',
      profile,
    };
  };
}
