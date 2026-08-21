export type LeagueCloneDestination = 'division' | 'league';

const LEAGUE_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

type CloneSource = Record<string, unknown> & {
  id: string;
  name: string;
  divisionTitle?: string;
};

type CloneIdentity = {
  name: string;
  divisionTitle: string;
};

export type LeagueCloneResult = CloneIdentity & {
  leagueId: string;
  destination: LeagueCloneDestination;
  status: 'setup';
};

export function buildLeagueCloneResult(_input: {
  leagueId: string;
  destination: LeagueCloneDestination;
  identity: CloneIdentity;
}): LeagueCloneResult {
  return {
    leagueId: _input.leagueId,
    destination: _input.destination,
    name: _input.identity.name,
    divisionTitle: _input.identity.divisionTitle,
    status: 'setup',
  };
}

export function getLeagueCloneSuccessCopy(_result: LeagueCloneResult): {
  title: string;
  description: string;
} {
  if (_result.destination === 'division') {
    return {
      title: 'Division created',
      description: `“${_result.divisionTitle || 'Main Division'}” was added to “${_result.name}”. Opening it now. It starts in Setup with no teams or schedule.`,
    };
  }
  return {
    title: 'League created',
    description: `“${_result.name}” was created as a separate league. Opening it now. It starts in Setup with no teams or schedule.`,
  };
}

export function getLeagueDeploymentLabel(_league: {
  deploymentStatus?: unknown;
  schedule?: unknown;
}): 'Schedule live' | 'Setup — no schedule' {
  const hasSchedule = Array.isArray(_league.schedule) && _league.schedule.length > 0;
  return _league.deploymentStatus === 'deployed' || hasSchedule ? 'Schedule live' : 'Setup — no schedule';
}

export function assertLeagueCloneCapacity(_input: {
  destination: LeagueCloneDestination;
  existingLeagues: Array<Record<string, unknown>>;
  leagueLimit: number;
}): void {
  if (_input.destination === 'division') return;
  const leagueGroups = new Set(
    _input.existingLeagues.flatMap(league =>
      typeof league.name === 'string' && league.name.trim()
        ? [league.name.trim().toLocaleLowerCase()]
        : []
    )
  );
  if (leagueGroups.size >= _input.leagueLimit) throw new Error('LEAGUE_LIMIT_REACHED');
}

export function parseLeagueCloneRequest(_body: Record<string, unknown>): {
  sourceLeagueId: string;
  destination: LeagueCloneDestination;
  requestedName: string;
} {
  const sourceLeagueId = typeof _body.leagueId === 'string' && LEAGUE_ID_PATTERN.test(_body.leagueId)
    ? _body.leagueId
    : '';
  if (!sourceLeagueId) throw new Error('SOURCE_LEAGUE_INVALID');
  if (_body.destination !== 'division' && _body.destination !== 'league') {
    throw new Error('CLONE_DESTINATION_INVALID');
  }
  if (typeof _body.name !== 'string') throw new Error('CLONE_NAME_INVALID');
  const requestedName = _body.name.trim();
  if (!requestedName || requestedName.length > 120) throw new Error('CLONE_NAME_INVALID');
  return { sourceLeagueId, destination: _body.destination, requestedName };
}

export function resolveLeagueCloneIdentity(_input: {
  source: CloneSource;
  destination: LeagueCloneDestination;
  requestedName: string;
  existingLeagues: Array<Record<string, unknown>>;
}): CloneIdentity {
  const requestedName = _input.requestedName.trim();
  if (!requestedName) throw new Error('CLONE_NAME_REQUIRED');

  const sameText = (left: unknown, right: string) =>
    typeof left === 'string' && left.trim().toLocaleLowerCase() === right.toLocaleLowerCase();

  if (_input.destination === 'division') {
    const collision = _input.existingLeagues.some(league =>
      sameText(league.name, _input.source.name) && sameText(league.divisionTitle, requestedName)
    );
    if (collision) throw new Error('DIVISION_ALREADY_EXISTS');
    return { name: _input.source.name, divisionTitle: requestedName };
  }

  if (_input.existingLeagues.some(league => sameText(league.name, requestedName))) {
    throw new Error('LEAGUE_ALREADY_EXISTS');
  }
  return {
    name: requestedName,
    divisionTitle: typeof _input.source.divisionTitle === 'string'
      ? _input.source.divisionTitle.trim()
      : '',
  };
}

export function buildLeagueCloneDocument(_input: {
  source: CloneSource;
  leagueId: string;
  actorUid: string;
  identity: CloneIdentity;
  now: string;
}): Record<string, unknown> {
  const { source, leagueId, actorUid, identity, now } = _input;
  const configurableFields = [
    'sport',
    'description',
    'startDate',
    'endDate',
    'ages',
    'contactEmail',
    'contactPhone',
    'registrationCost',
    'paymentInstructions',
    'socialLinks',
    'requiredSquads',
    'blackoutDaysOfWeek',
    'schedulerConfig',
  ] as const;
  const configuration = Object.fromEntries(
    configurableFields.flatMap(key => source[key] === undefined ? [] : [[key, source[key]]])
  );

  return {
    id: leagueId,
    name: identity.name,
    divisionTitle: identity.divisionTitle,
    ...configuration,
    slug: `${leagueId.slice(-6)}-clone`,
    creatorId: actorUid,
    createdAt: now,
    isArchived: false,
    is_active: false,
    teams: {},
    individualRecruits: {},
    schedule: [],
    settingsCopiedFrom: source.id,
    settingsCopiedAt: now,
    deploymentStatus: 'undeployed',
    memberTeamIds: [],
    memberUserIds: [actorUid],
    memberIndivIds: [],
  };
}
