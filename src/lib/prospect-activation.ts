export type ProspectActivationRecord = {
  status?: unknown;
};

/**
 * Recruiting profile status is the authoritative prospect activation state.
 * The legacy players.recruitingProfileEnabled field is intentionally ignored;
 * it remains in existing records only for backwards compatibility.
 */
export function isProspectActivated(profile: ProspectActivationRecord | null | undefined): boolean {
  return profile?.status === 'active' || profile?.status === 'committed';
}
