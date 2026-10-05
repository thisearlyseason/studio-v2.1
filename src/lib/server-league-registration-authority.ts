export function canDeleteLeagueRegistration({
  creatorId,
  actorUid,
  actorRole,
}: {
  creatorId: unknown;
  actorUid: string;
  actorRole?: string;
}): boolean {
  return creatorId === actorUid || actorRole === 'superadmin';
}

/** Approval enrolls a standalone team before the schedule is generated. */
export function leagueTeamApprovalError(league: Record<string, any>, entry: Record<string, any>, entryId: string): string | null {
  if (entry.protocol_id !== 'team_config' || !league.teams?.[`recruit_${entryId}`]) return 'Choose a team registration.';
  if (entry.status === 'accepted') return null;
  if (league.isArchived || league.deploymentStatus === 'deployed' || league.schedule?.length) return 'Teams must be approved before generating the season schedule.';
  const paid = Number(entry.payment?.amount ?? entry.registrationCost ?? 0) > 0;
  if (paid && entry.payment?.mode === 'stripe' && entry.payment?.status !== 'paid') return 'Stripe must confirm payment before this team can be approved.';
  if (paid && entry.payment?.mode !== 'stripe' && entry.payment_received !== true) return 'Confirm the offline payment before approving this team.';
  return null;
}
