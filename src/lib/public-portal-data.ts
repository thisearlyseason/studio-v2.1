import { recalculatePublicLeagueStandings } from './public-league-scoring';
import { calculateTournamentStandings } from './tournament-standings';

const PUBLIC_PLAN_IDS = new Set([
  'team', 'elite', 'league', 'school',
  'pro', 'squad_pro', 'elite_teams', 'elite_league', 'schools',
]);

export function supportsPublicPortals(planId: string | null | undefined): boolean {
  return !!planId && PUBLIC_PLAN_IDS.has(planId.toLowerCase());
}

export function permitsLegacyOrPaidPortals(...planIds: Array<string | null | undefined>): boolean {
  const markers = planIds
    .filter((planId): planId is string => typeof planId === 'string' && planId.trim().length > 0)
    .map(planId => planId.toLowerCase());
  if (markers.length === 0) return false;
  // Older team documents can retain a free planId after a user-level subscription
  // sync. Any paid marker is authoritative when more than one plan field exists.
  if (markers.some(planId => PUBLIC_PLAN_IDS.has(planId))) return true;
  return false;
}

export function isActiveTournamentPortal(teamId: string, team: any, event: any): boolean {
  const teamStatus = typeof team?.status === 'string' ? team.status.trim().toLowerCase() : '';
  const entitled = permitsLegacyOrPaidPortals(team?.planId, team?.plan_type, team?.subscriptionPlanId);
  const advancedEntitled = event?.tournamentType === 'round_robin' || team?.isPro === true;
  return Boolean(team && event && entitled && advancedEntitled && event.isTournament === true && event.teamId === teamId &&
    team.isArchived !== true && team.isDeleted !== true && team.is_active !== false && team.isActive !== false && teamStatus !== 'removed' && teamStatus !== 'cancelled' &&
    event.isArchived !== true && event.isDeleted !== true && event.is_active !== false && event.isActive !== false && event.status !== 'cancelled');
}

export function leagueBillingOwnerUserId(league: Record<string, unknown>): string {
  for (const candidate of [league.billingOwnerUserId, league.creatorId]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
}

export function publicGame(game: any) {
  return {
    id: game.id,
    team1: game.team1,
    team2: game.team2,
    team1Id: game.team1Id,
    team2Id: game.team2Id,
    date: game.date,
    time: game.time,
    location: game.location,
    field: game.field,
    round: game.round,
    stage: game.stage,
    winnerTo: game.winnerTo,
    winnerToSlot: game.winnerToSlot,
    loserTo: game.loserTo,
    loserToSlot: game.loserToSlot,
    pool: Number.isInteger(game.pool) ? game.pool : undefined,
    isResetMatch: game.isResetMatch === true,
    isConditional: game.isConditional === true,
    score1: Number(game.score1 || 0),
    score2: Number(game.score2 || 0),
    isCompleted: !!game.isCompleted,
    isDisputed: !!game.isDisputed,
    winnerId: game.winnerId,
    refereeId: game.refereeId,
    refereeName: game.refereeName,
  };
}

export function publicLeague(id: string, league: any) {
  const teams = Object.fromEntries(Object.entries(league.teams || {}).map(([teamId, raw]) => {
    const team = raw as any;
    return [teamId, {
      teamName: team.teamName,
      wins: Number(team.wins || 0),
      losses: Number(team.losses || 0),
      ties: Number(team.ties || 0),
      points: Number(team.points || 0),
      status: team.status,
      teamLogoUrl: team.teamLogoUrl,
      division: team.division,
    }];
  }));

  return {
    id,
    name: league.name,
    sport: league.sport,
    description: league.description,
    startDate: league.startDate,
    endDate: league.endDate,
    ages: league.ages,
    contactEmail: league.contactEmail,
    contactPhone: league.contactPhone,
    registrationCost: league.registrationCost,
    paymentInstructions: league.paymentInstructions,
    divisions: league.divisions || [],
    divisionTitle: league.divisionTitle,
    schedule: (league.schedule || []).map(publicGame),
    teams,
    isActive: league.is_active !== false && league.isArchived !== true,
    requiresPin: !!league.scorekeeperPin,
    scorekeeperConfigured: !!league.scorekeeperPin || id.startsWith('demo_'),
  };
}

// These DTOs are independent of Registration's deliberately richer publicLeague contract.
export function spectatorLeague(id: string, league: any) {
  const standings = recalculatePublicLeagueStandings(league.teams, Array.isArray(league.schedule) ? league.schedule : []);
  return {
    id, name: typeof league.name === 'string' ? league.name : '',
    sport: typeof league.sport === 'string' ? league.sport : '',
    divisions: Array.isArray(league.divisions) ? league.divisions.filter((value: unknown) => typeof value === 'string') : [],
    divisionTitle: typeof league.divisionTitle === 'string' ? league.divisionTitle : '',
    schedule: (Array.isArray(league.schedule) ? league.schedule : []).map((game: any) => ({
      id: String(game.id || ''), team1: String(game.team1 || ''), team2: String(game.team2 || ''),
      team1Id: String(game.team1Id || ''), team2Id: String(game.team2Id || ''),
      date: String(game.date || ''), time: String(game.time || ''), location: String(game.location || ''),
      score1: Number(game.score1 || 0), score2: Number(game.score2 || 0),
      isCompleted: game.isCompleted === true, isDisputed: game.isDisputed === true,
      isExhibition: game.isExhibition === true,
    })),
    teams: Object.fromEntries(Object.entries(standings).filter(([, raw]) => ['accepted', 'assigned'].includes((raw as any)?.status)).map(([teamId, raw]) => {
      const team = raw as any;
      return [teamId, { teamName: String(team.teamName || ''), teamLogoUrl: String(team.teamLogoUrl || ''), division: String(team.division || ''), status: team.status,
        wins: Number(team.wins || 0), losses: Number(team.losses || 0), ties: Number(team.ties || 0), points: Number(team.points || 0) }];
    })),
    isActive: league.is_active !== false && league.isArchived !== true && league.isDeleted !== true,
  };
}

export function scorekeeperLeague(id: string, league: any) {
  const dto = spectatorLeague(id, league);
  return { ...dto, requiresPin: true, scorekeeperConfigured: league.scorekeeperConfigured === true || !!league.scorekeeperPin,
    schedule: dto.schedule.map((game: any, index: number) => ({ ...game, gameVersion: league.schedule[index].gameVersion ?? 0 })) };
}

export function memberLeague(id: string, league: any) {
  return { ...scorekeeperLeague(id, league),
    description: typeof league.description === 'string' ? league.description : '',
    startDate: typeof league.startDate === 'string' ? league.startDate : '',
    endDate: typeof league.endDate === 'string' ? league.endDate : '',
    ages: typeof league.ages === 'string' ? league.ages : '',
  };
}

export function publicTournament(id: string, event: any) {
  return {
    id,
    teamId: event.teamId,
    title: event.title,
    date: event.date,
    endDate: event.endDate,
    startTime: event.startTime,
    location: event.location,
    description: event.description,
    sport: event.sport,
    ages: event.ages,
    division: event.division,
    contactEmail: event.contactEmail,
    contactPhone: event.contactPhone,
    paymentInstructions: event.paymentInstructions,
    registration_cost: event.registration_cost,
    tournamentType: event.tournamentType,
    isTournament: !!event.isTournament,
    isActive: !!event.isTournament && event.isArchived !== true && event.isDeleted !== true && event.is_active !== false && event.isActive !== false && event.status !== 'cancelled',
    tournamentTeams: event.tournamentTeams || [],
    tournamentTeamsData: (event.tournamentTeamsData || []).map((team: any) => ({
      id: team.id,
      name: team.name || team.teamName,
      teamName: team.teamName || team.name,
      logoUrl: team.logoUrl || team.teamLogoUrl,
      teamLogoUrl: team.teamLogoUrl || team.logoUrl,
      division: team.division,
    })),
    tournamentGames: (event.tournamentGames || []).map(publicGame),
    teamAgreements: Object.fromEntries(Object.entries(event.teamAgreements || {}).map(([teamName, raw]) => {
      const agreement = raw as any;
      return [teamName, {
        agreed: agreement?.agreed === true || agreement?.status === 'signed',
        status: agreement?.status,
      }];
    })),
    requiresCode: event.scorekeeperConfigured === true || !!event.scoringCode,
    scorekeeperConfigured: event.scorekeeperConfigured === true || !!event.scoringCode || id.startsWith('demo_') || String(event.teamId || '').startsWith('demo_'),
    referees: (event.refereePool || []).map((referee: any) => ({
      id: referee.id,
      name: referee.name,
      certLevel: referee.certLevel,
    })),
  };
}

function tournamentPublicGame(game: any) {
  return {
    id: String(game.id || ''),
    team1: String(game.team1 || 'TBD'),
    team2: String(game.team2 || 'TBD'),
    team1Id: String(game.team1Id || ''),
    team2Id: String(game.team2Id || ''),
    team1LogoUrl: typeof game.team1LogoUrl === 'string' ? game.team1LogoUrl : '',
    team2LogoUrl: typeof game.team2LogoUrl === 'string' ? game.team2LogoUrl : '',
    score1: Number(game.score1 || 0),
    score2: Number(game.score2 || 0),
    date: String(game.date || ''),
    time: String(game.time || ''),
    location: String(game.location || ''),
    round: String(game.round || ''),
    stage: String(game.stage || ''),
    winnerTo: typeof game.winnerTo === 'string' ? game.winnerTo : '',
    winnerToSlot: game.winnerToSlot === 'team1' || game.winnerToSlot === 'team2' ? game.winnerToSlot : undefined,
    loserTo: typeof game.loserTo === 'string' ? game.loserTo : '',
    loserToSlot: game.loserToSlot === 'team1' || game.loserToSlot === 'team2' ? game.loserToSlot : undefined,
    pool: Number.isInteger(game.pool) ? game.pool : undefined,
    isCompleted: game.isCompleted === true,
    isDisputed: game.isDisputed === true,
    isOfficial: game.isCompleted === true && game.isDisputed !== true,
    winnerId: typeof game.winnerId === 'string' ? game.winnerId : null,
    isResetMatch: game.isResetMatch === true,
    isConditional: game.isConditional === true,
  };
}

/** Minimum public Tournament result/bracket projection; Registration intentionally uses publicTournament. */
export function spectatorTournament(id: string, event: any) {
  const teams = (Array.isArray(event.tournamentTeamsData) ? event.tournamentTeamsData : []).map((team: any) => ({
    id: String(team.id || ''),
    name: String(team.name || team.teamName || ''),
    logoUrl: String(team.logoUrl || team.teamLogoUrl || ''),
    division: String(team.division || ''),
  }));
  const games = (Array.isArray(event.tournamentGames) ? event.tournamentGames : []).map(tournamentPublicGame);
  return {
    id,
    isTournament: event.isTournament === true,
    teamId: String(event.teamId || ''),
    title: String(event.title || ''),
    sport: String(event.sport || ''),
    date: String(event.date || ''),
    endDate: String(event.endDate || ''),
    startTime: String(event.startTime || ''),
    location: String(event.location || ''),
    division: String(event.division || ''),
    tournamentType: String(event.tournamentType || ''),
    tournamentTeamsData: teams,
    tournamentGames: games,
    standings: calculateTournamentStandings(teams, games),
    isActive: event.isTournament === true && event.isArchived !== true && event.isDeleted !== true && event.is_active !== false && event.isActive !== false && event.status !== 'cancelled',
  };
}

export function scorekeeperTournament(id: string, event: any) {
  const dto = spectatorTournament(id, event);
  const sourceGames = Array.isArray(event.tournamentGames) ? event.tournamentGames : [];
  return {
    ...dto,
    lifecycleVersion: Number(event.lifecycleVersion || 0),
    scheduleVersion: Number(event.scheduleVersion || 0),
    credentialVersion: Number(event.credentialVersion || 0),
    requiresCode: true,
    scorekeeperConfigured: event.scorekeeperConfigured === true,
    tournamentGames: dto.tournamentGames.map((game: ReturnType<typeof tournamentPublicGame>, index: number) => ({
      ...game,
      gameVersion: Number(sourceGames[index]?.gameVersion || 0),
    })),
  };
}

export function refereeTournament(id: string, event: any, refereeId: string) {
  const assignedGames = (Array.isArray(event.tournamentGames) ? event.tournamentGames : [])
    .filter((game: any) => game.refereeId === refereeId);
  const dto = spectatorTournament(id, { ...event, tournamentGames: assignedGames });
  return { ...dto, activeRefereeId: refereeId };
}

export function publicRegistrationConfig(id: string, config: any) {
  return {
    id,
    title: config.title,
    description: config.description,
    is_active: config.is_active === true,
    type: config.type,
    form_schema: Array.isArray(config.form_schema) ? config.form_schema.map((field: any) => ({
      id: field.id,
      label: field.label,
      type: field.type,
      required: field.required === true,
      options: Array.isArray(field.options) ? field.options.map(String) : undefined,
      step: field.step,
      placeholder: field.placeholder,
      infoContent: field.infoContent,
    })) : [],
    waiver_mode: config.waiver_mode,
    team_waivers_content: Array.isArray(config.team_waivers_content)
      ? config.team_waivers_content.map((waiver: any) => ({
          id: waiver.id,
          title: waiver.title,
          content: waiver.content,
        }))
      : [],
    default_waiver_text: config.default_waiver_text,
    require_default_waiver: config.require_default_waiver === true,
    custom_waiver_text: config.custom_waiver_text,
    confirmation_message: config.confirmation_message,
    form_version: Number(config.form_version || 1),
    config_hash: typeof config.config_hash === 'string' ? config.config_hash : '',
    registration_cost: String(config.registration_cost || '0'),
    currency: typeof config.currency === 'string' ? config.currency : 'CAD',
    offline_payment_instructions: typeof config.offline_payment_instructions === 'string'
      ? config.offline_payment_instructions
      : '',
    require_division_selection: config.require_division_selection === true,
    available_divisions: Array.isArray(config.available_divisions)
      ? config.available_divisions.map(String)
      : [],
  };
}
