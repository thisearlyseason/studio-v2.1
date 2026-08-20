const TOURNAMENT_BLUEPRINT_FIELDS = [
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
  'adminEmails',
  'sport',
  'division',
  'divisionTitle',
  'waiverIds',
  'waiverDocuments',
  'teamWaiverText',
  'venueSettings',
] as const;

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
