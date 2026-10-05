export type LeagueLifecycleClientPolicy = {
  create: boolean;
  edit: boolean;
  clone: boolean;
  archive: boolean;
  delete: boolean;
  readPrivate: boolean;
};

export function leagueLifecycleClientPolicy({
  isDemo,
  canManage,
}: {
  isDemo: boolean;
  canManage: boolean;
}): LeagueLifecycleClientPolicy {
  return {
    create: canManage && !isDemo,
    edit: canManage,
    clone: canManage && !isDemo,
    archive: canManage && !isDemo,
    delete: canManage && !isDemo,
    readPrivate: canManage && !isDemo,
  };
}

export function buildManualLeagueTeamUpdate({
  teamId,
  teamName,
  coachName,
  coachEmail,
  inviteCode,
  createdAt,
}: {
  teamId: string;
  teamName: string;
  coachName: string;
  coachEmail: string;
  inviteCode: string;
  createdAt: string;
}) {
  return {
    teamUpdate: {
      teamId,
      publicFields: {
        teamName: teamName.trim(),
        wins: 0,
        losses: 0,
        ties: 0,
        points: 0,
        status: 'accepted',
        manual: true,
        createdAt,
      },
      privateFields: {
        coachName: coachName.trim(),
        coachEmail: coachEmail.trim().toLowerCase(),
        inviteCode: inviteCode.trim().toUpperCase(),
      },
    },
  };
}

export async function stageManualLeagueTeam({
  leagueId,
  updateLeague,
  ...team
}: Parameters<typeof buildManualLeagueTeamUpdate>[0] & {
  leagueId: string;
  updateLeague: (leagueId: string, updates: ReturnType<typeof buildManualLeagueTeamUpdate>) => Promise<unknown>;
}) {
  return updateLeague(leagueId, buildManualLeagueTeamUpdate(team));
}
