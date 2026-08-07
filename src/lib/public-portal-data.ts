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
  if (markers.length === 0) return true;
  // Older team documents can retain a free planId after a user-level subscription
  // sync. Any paid marker is authoritative when more than one plan field exists.
  if (markers.some(planId => PUBLIC_PLAN_IDS.has(planId))) return true;
  return markers.every(planId => !['free', 'starter', 'starter_squad', 'school_demo'].includes(planId))
    && markers.length === 0;
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
    isActive: !!event.isTournament && event.isArchived !== true,
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
    teamWaiverText: event.teamWaiverText,
    teamAgreements: Object.fromEntries(Object.entries(event.teamAgreements || {}).map(([teamName, raw]) => {
      const agreement = raw as any;
      return [teamName, {
        agreed: agreement?.agreed === true || agreement?.status === 'signed',
        status: agreement?.status,
      }];
    })),
    requiresCode: !!event.scoringCode,
    scorekeeperConfigured: !!event.scoringCode || id.startsWith('demo_') || String(event.teamId || '').startsWith('demo_'),
    referees: (event.refereePool || []).map((referee: any) => ({
      id: referee.id,
      name: referee.name,
      certLevel: referee.certLevel,
    })),
  };
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
    registration_cost: config.registration_cost,
    offline_payment_instructions: config.offline_payment_instructions,
    require_division_selection: config.require_division_selection === true,
    available_divisions: Array.isArray(config.available_divisions)
      ? config.available_divisions.map(String)
      : [],
  };
}
