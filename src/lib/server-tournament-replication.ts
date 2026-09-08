export const TOURNAMENT_BLUEPRINT_FIELDS = [
  'date',
  'endDate',
  'startTime',
  'endTime',
  'location',
  'description',
  'eventType',
  'registrationCost',
  'paymentInstructions',
  'customFormFields',
  'ages',
  'contactEmail',
  'contactPhone',
  'socialLinks',
  'gameLength',
  'breakLength',
  'gamesPerTeam',
  'maxDailyGamesPerTeam',
  'poolCount',
  'advancePerPool',
  'dailyWindows',
  'selectedFields',
  'manualVenue',
  'tournamentType',
  'tieredPlayoffs',
  'adminEmails',
  'sport',
  'division',
  'divisionTitle',
  'waiverIds',
  'waiverDocuments',
  'teamWaiverText',
  'venueSettings',
] as const;

/** Only accepted form definitions/identities are a reusable blueprint. */
export function buildTournamentReplicationConfig(source: Record<string, unknown>): Record<string, unknown> {
  const fields = ['id', 'form_id', 'fee_id', 'waiver_id', 'title', 'description', 'type', 'form_schema', 'form_version', 'config_hash',
    'waiver_mode', 'selected_team_waivers', 'team_waivers_content', 'default_waiver_text', 'require_default_waiver',
    'custom_waiver_text', 'confirmation_message', 'registration_cost', 'offline_payment_instructions', 'currency',
    'require_division_selection', 'available_divisions', 'payment_migrated'];
  return { ...Object.fromEntries(fields.filter(field => source[field] !== undefined).map(field => [field, source[field]])), is_active: false };
}

export function buildTournamentReplicationEvent({
  source,
  title,
  eventId,
  teamId,
  actorUid,
  ownerUserId,
  registrationCode,
  now,
}: {
  source: Record<string, unknown>;
  title: string;
  eventId: string;
  teamId: string;
  actorUid: string;
  ownerUserId: string;
  registrationCode: string;
  now: string;
}): Record<string, unknown> {
  const blueprint = Object.fromEntries(
    TOURNAMENT_BLUEPRINT_FIELDS.flatMap(field =>
      source[field] === undefined ? [] : [[field, source[field]]]
    )
  );

  return {
    ...blueprint,
    id: eventId,
    teamId,
    ownerUserId,
    creatorId: actorUid,
    title: title.trim(),
    eventType: 'tournament',
    isTournament: true,
    registrationCode,
    createdAt: now,
    updatedAt: now,
    isArchived: false,
    isCompleted: false,
    registrationOpen: false,
    registrationCount: 0,
    registrationEntryCount: 0,
    tournamentTeams: [],
    tournamentTeamsData: [],
    tournamentGames: [],
    schedule: [],
    archived_waivers: [],
    teamAgreements: {},
    refereePool: [],
    userRsvps: {},
    assignments: [],
    setupStatus: 'complete',
    bracketStatus: 'pending',
    scheduleStatus: 'pending',
    deploymentStatus: 'undeployed',
    deploymentError: '',
  };
}
