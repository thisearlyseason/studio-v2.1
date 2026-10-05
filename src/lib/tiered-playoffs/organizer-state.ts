export type TieredOrganizerStage =
  | 'enrollment'
  | 'preliminary_setup'
  | 'preliminary_in_progress'
  | 'playoff_setup'
  | 'seeding_review'
  | 'playoffs_ready'
  | 'playoffs_in_progress'
  | 'complete';

export type TieredOrganizerPrimaryAction =
  | 'generate_preliminaries'
  | 'schedule_playoffs'
  | 'review_seeding'
  | 'publish_playoffs'
  | null;

export type TieredOrganizerState = {
  stage: TieredOrganizerStage;
  completed: number;
  total: number;
  blockingGameIds: string[];
  primaryAction: TieredOrganizerPrimaryAction;
};

type OrganizerEvent = {
  tournamentTeamsData?: Array<{ id?: string; eligibleForPlayoffs?: boolean; tieredStatus?: string }>;
  tournamentGames?: Array<{ id?: string; team1Id?: string; team2Id?: string; phase?: string; isCompleted?: boolean; isDisputed?: boolean }>;
  selectedFields?: unknown[];
  dailyWindows?: unknown[];
  tieredPlayoffs?: {
    divisions?: { definitions?: unknown[] };
    seeding?: { status?: string };
    playoffs?: { status?: string };
  };
};

export function tieredOrganizerState(event: OrganizerEvent): TieredOrganizerState {
  const eligibleIds = new Set((event.tournamentTeamsData || [])
    .filter(team => team.eligibleForPlayoffs !== false && !['withdrawn', 'disqualified'].includes(String(team.tieredStatus || '')))
    .map(team => String(team.id || ''))
    .filter(Boolean));
  const preliminary = (event.tournamentGames || []).filter(game =>
    game.phase !== 'playoff' && eligibleIds.has(String(game.team1Id || '')) && eligibleIds.has(String(game.team2Id || '')));
  const blocking = preliminary.filter(game => game.isCompleted !== true || game.isDisputed === true);
  const progress = {
    completed: preliminary.length - blocking.length,
    total: preliminary.length,
    blockingGameIds: blocking.map(game => String(game.id || '')).filter(Boolean),
  };

  if (eligibleIds.size < 2) return { stage: 'enrollment', ...progress, primaryAction: null };
  if (!preliminary.length) {
    const logisticsReady = Boolean(event.selectedFields?.length && event.dailyWindows?.length);
    return { stage: 'preliminary_setup', ...progress, primaryAction: logisticsReady ? 'generate_preliminaries' : null };
  }
  if (blocking.length) return { stage: 'preliminary_in_progress', ...progress, primaryAction: null };

  const definitions = event.tieredPlayoffs?.divisions?.definitions || [];
  if (!definitions.length) return { stage: 'playoff_setup', ...progress, primaryAction: 'schedule_playoffs' };

  const seedingStatus = String(event.tieredPlayoffs?.seeding?.status || 'pending');
  const playoffStatus = String(event.tieredPlayoffs?.playoffs?.status || 'pending');
  if (seedingStatus === 'pending') return { stage: 'seeding_review', ...progress, primaryAction: 'review_seeding' };
  if (playoffStatus === 'ready') return { stage: 'playoffs_ready', ...progress, primaryAction: 'publish_playoffs' };
  if (playoffStatus !== 'published') return { stage: 'playoffs_ready', ...progress, primaryAction: null };

  const playoffs = (event.tournamentGames || []).filter(game => game.phase === 'playoff');
  const complete = playoffs.length > 0 && playoffs.every(game => game.isCompleted === true && game.isDisputed !== true);
  return { stage: complete ? 'complete' : 'playoffs_in_progress', ...progress, primaryAction: null };
}
