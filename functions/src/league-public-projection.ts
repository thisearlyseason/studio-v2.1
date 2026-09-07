export type VersionedRecord = {
  exists: boolean;
  data: Record<string, unknown>;
  version: number;
};

export type LeagueProjectionTransaction = {
  read(collection: string, id: string): Promise<VersionedRecord>;
  write(collection: string, id: string, data: Record<string, unknown>): Promise<void>;
  delete(collection: string, id: string): Promise<void>;
};

export type LeagueProjectionStore = {
  runTransaction<T>(operation: (transaction: LeagueProjectionTransaction) => Promise<T>): Promise<T>;
};

export type LeagueProjectionResult = { action: "written" | "revoked" | "unchanged" };

export type LeagueSpectatorProjection = Record<string, unknown> & {
  id: string;
  schedule: Array<Record<string, unknown>>;
  teams: Record<string, Record<string, unknown>>;
  isActive: boolean;
};

const PUBLIC_PLAN_IDS = new Set([
  "team", "elite", "league", "school", "pro", "squad_pro", "elite_teams", "elite_league", "schools",
]);
const ENTITLED_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const BLOCKED_ACCOUNT_STATUSES = new Set(["deleted", "disabled", "pending_deletion", "suspended"]);
const BLOCKED_DELETION_STATUSES = new Set(["completed", "deleted", "pending", "processing"]);

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalized(value: unknown): string {
  return text(value).trim().toLowerCase();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function activeRecord(value: Record<string, unknown>): boolean {
  const status = normalized(value.status);
  return value.isArchived !== true && value.isDeleted !== true && value.is_active !== false && value.isActive !== false &&
    status !== "removed" && status !== "cancelled";
}

function activeOwner(value: Record<string, unknown>): boolean {
  const plan = normalized(value.plan_type || value.planId || value.activePlanId);
  return activeRecord(value) && PUBLIC_PLAN_IDS.has(plan) &&
    ENTITLED_SUBSCRIPTION_STATUSES.has(normalized(value.subscription_status || value.subscriptionStatus)) &&
    !BLOCKED_ACCOUNT_STATUSES.has(normalized(value.accountStatus)) &&
    !BLOCKED_DELETION_STATUSES.has(normalized(value.deletionStatus));
}

function activeTenant(value: Record<string, unknown>, ownerId: string): boolean {
  const plan = normalized(value.planId || value.plan_type || value.subscriptionPlanId);
  return value.ownerUserId === ownerId && activeRecord(value) && PUBLIC_PLAN_IDS.has(plan) &&
    !BLOCKED_ACCOUNT_STATUSES.has(normalized(value.accountStatus)) &&
    !BLOCKED_DELETION_STATUSES.has(normalized(value.deletionStatus));
}

function standings(rawTeams: unknown, schedule: Array<Record<string, unknown>>): Record<string, Record<string, unknown>> {
  const sourceTeams = record(rawTeams);
  const teams = Object.fromEntries(Object.entries(sourceTeams).map(([teamId, raw]) => [teamId, {
    ...record(raw), wins: 0, losses: 0, ties: 0, points: 0,
  }])) as Record<string, Record<string, unknown>>;
  for (const game of schedule) {
    if (game.isExhibition === true || game.isDisputed === true || game.isCompleted !== true) continue;
    const score1 = Number(game.score1);
    const score2 = Number(game.score2);
    const team1Id = text(game.team1Id);
    const team2Id = text(game.team2Id);
    if (!Number.isInteger(score1) || !Number.isInteger(score2) || !teams[team1Id] || !teams[team2Id]) continue;
    if (score1 > score2) {
      teams[team1Id].wins = Number(teams[team1Id].wins) + 1;
      teams[team1Id].points = Number(teams[team1Id].points) + 3;
      teams[team2Id].losses = Number(teams[team2Id].losses) + 1;
    } else if (score2 > score1) {
      teams[team2Id].wins = Number(teams[team2Id].wins) + 1;
      teams[team2Id].points = Number(teams[team2Id].points) + 3;
      teams[team1Id].losses = Number(teams[team1Id].losses) + 1;
    } else {
      teams[team1Id].ties = Number(teams[team1Id].ties) + 1;
      teams[team1Id].points = Number(teams[team1Id].points) + 1;
      teams[team2Id].ties = Number(teams[team2Id].ties) + 1;
      teams[team2Id].points = Number(teams[team2Id].points) + 1;
    }
  }
  return teams;
}

/** The single allowlisted League spectator DTO used by the app and the projection worker. */
export function buildLeagueSpectatorProjection(id: string, league: Record<string, unknown>): LeagueSpectatorProjection {
  const schedule = Array.isArray(league.schedule) ? league.schedule.map(record) : [];
  const rankedTeams = standings(league.teams, schedule);
  return {
    id,
    name: text(league.name),
    sport: text(league.sport),
    divisions: Array.isArray(league.divisions) ? league.divisions.filter(value => typeof value === "string") : [],
    divisionTitle: text(league.divisionTitle),
    schedule: schedule.map(game => ({
      id: text(game.id), team1: text(game.team1), team2: text(game.team2),
      team1Id: text(game.team1Id), team2Id: text(game.team2Id),
      date: text(game.date), time: text(game.time), location: text(game.location),
      score1: Number(game.score1 || 0), score2: Number(game.score2 || 0),
      isCompleted: game.isCompleted === true, isDisputed: game.isDisputed === true,
      isExhibition: game.isExhibition === true,
    })),
    teams: Object.fromEntries(Object.entries(rankedTeams)
      .filter(([, raw]) => ["accepted", "assigned"].includes(normalized(raw.status)))
      .map(([teamId, team]) => [teamId, {
        teamName: text(team.teamName), teamLogoUrl: text(team.teamLogoUrl), division: text(team.division), status: team.status,
        wins: Number(team.wins || 0), losses: Number(team.losses || 0), ties: Number(team.ties || 0), points: Number(team.points || 0),
      }])),
    isActive: activeRecord(league),
  };
}

function sameProjection(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Deterministically converges the public view against current source and entitlement state. */
export async function syncPublicLeagueView(
  leagueId: string,
  expectedVersion: number | undefined,
  store: LeagueProjectionStore,
): Promise<LeagueProjectionResult> {
  return store.runTransaction(async transaction => {
    const [leagueSnapshot, projectionSnapshot] = await Promise.all([
      transaction.read("leagues", leagueId),
      transaction.read("publicLeagueViews", leagueId),
    ]);
    const revoke = async (): Promise<LeagueProjectionResult> => {
      if (!projectionSnapshot.exists) return { action: "unchanged" };
      await transaction.delete("publicLeagueViews", leagueId);
      return { action: "revoked" };
    };
    if (!leagueSnapshot.exists) return revoke();
    if (!Number.isSafeInteger(leagueSnapshot.version) || leagueSnapshot.version <= 0) return revoke();

    const league = leagueSnapshot.data;
    const creatorId = text(league.creatorId).trim();
    const ownerId = text(league.billingOwnerUserId).trim();
    const tenantId = text(league.tenantId).trim();
    if (!creatorId || creatorId !== ownerId || !tenantId || !activeRecord(league)) return revoke();

    const ownerSnapshot = await transaction.read("users", ownerId);
    if (!ownerSnapshot.exists || !Number.isSafeInteger(ownerSnapshot.version) || ownerSnapshot.version <= 0 || !activeOwner(ownerSnapshot.data)) return revoke();

    let tenantVersion = 0;
    if (tenantId.startsWith("profile:")) {
      if (tenantId !== `profile:${ownerId}`) return revoke();
    } else {
      const tenantSnapshot = await transaction.read("teams", tenantId);
      if (!tenantSnapshot.exists || !Number.isSafeInteger(tenantSnapshot.version) || tenantSnapshot.version <= 0 || !activeTenant(tenantSnapshot.data, ownerId)) return revoke();
      tenantVersion = tenantSnapshot.version;
    }

    const sourceVersion = Math.max(leagueSnapshot.version, ownerSnapshot.version, tenantVersion);
    if (expectedVersion !== undefined && (!Number.isSafeInteger(expectedVersion) || expectedVersion <= 0 || expectedVersion > sourceVersion)) return revoke();
    const projection = buildLeagueSpectatorProjection(leagueId, league);
    if (projectionSnapshot.exists && projectionSnapshot.version > sourceVersion) return { action: "unchanged" };
    if (projectionSnapshot.exists && sameProjection(projectionSnapshot.data, projection)) return { action: "unchanged" };
    await transaction.write("publicLeagueViews", leagueId, projection);
    return { action: "written" };
  });
}

export async function syncPublicLeagueViews(
  leagueIds: string[],
  expectedVersion: number | undefined,
  sync: (leagueId: string, expectedVersion?: number) => Promise<LeagueProjectionResult>,
): Promise<{ synced: number }> {
  const uniqueIds = [...new Set(leagueIds.filter(id => id.length > 0))];
  const results = await Promise.allSettled(uniqueIds.map(id => sync(id, expectedVersion)));
  const failures = results.filter(result => result.status === "rejected");
  if (failures.length > 0) throw new Error(`${failures.length} League projection sync failed.`);
  return { synced: uniqueIds.length };
}
