export type TieredPreliminaryTeam = { id: string; name: string; logoUrl?: string };
export type TieredPreliminaryField = { id: string; name: string };
export type TieredDailyWindow = { date: string; startTime: string; endTime: string };

export type TieredPreliminaryInput = {
  teams: TieredPreliminaryTeam[];
  gamesPerTeam: number;
  fields: TieredPreliminaryField[];
  dailyWindows: TieredDailyWindow[];
  gameDurationMinutes: number;
  transitionMinutes: number;
};

export type TieredFeasibilityReport = {
  feasible: boolean;
  requiredGames: number | null;
  supportedGames: number;
  conflicts: string[];
  recommendations: string[];
};

export type TieredPreliminaryMatchup = {
  id: string;
  team1Id: string;
  team2Id: string;
  team1: string;
  team2: string;
  team1LogoUrl?: string;
  team2LogoUrl?: string;
  round: string;
  stage: 'Preliminary';
  phase: 'preliminary';
};

export class TieredScheduleError extends Error {
  constructor(public readonly conflicts: string[]) {
    super(conflicts.join(' '));
    this.name = 'TieredScheduleError';
  }
}

function minutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60 ? hour * 60 + minute : null;
}

function capacity(input: TieredPreliminaryInput): number {
  if (!Number.isFinite(input.gameDurationMinutes) || input.gameDurationMinutes <= 0 ||
      !Number.isFinite(input.transitionMinutes) || input.transitionMinutes < 0 || !input.fields.length) return 0;
  const interval = input.gameDurationMinutes + input.transitionMinutes;
  return input.dailyWindows.reduce((total, window) => {
    const start = minutes(window.startTime);
    const end = minutes(window.endTime);
    if (start === null || end === null || end <= start) return total;
    const perField = Math.max(0, Math.floor((end - start + input.transitionMinutes) / interval));
    return total + perField * input.fields.length;
  }, 0);
}

export function analyzeTieredFeasibility(input: TieredPreliminaryInput): TieredFeasibilityReport {
  const conflicts: string[] = [];
  const recommendations: string[] = [];
  const teamCount = Array.isArray(input.teams) ? input.teams.length : 0;
  const validGamesPerTeam = Number.isInteger(input.gamesPerTeam) && input.gamesPerTeam > 0;
  const appearances = validGamesPerTeam ? teamCount * input.gamesPerTeam : 0;
  const requiredGames = appearances > 0 && appearances % 2 === 0 ? appearances / 2 : null;
  const supportedGames = capacity(input);

  if (teamCount < 2) conflicts.push('At least two participating teams are required.');
  if (new Set(input.teams.map(team => team.id)).size !== teamCount || input.teams.some(team => !team.id || !team.name)) {
    conflicts.push('Every participating team requires a unique identity and name.');
  }
  if (!validGamesPerTeam) conflicts.push('Games per team must be a positive whole number.');
  if (validGamesPerTeam && input.gamesPerTeam > teamCount - 1) {
    conflicts.push(`${teamCount} teams can provide at most ${teamCount - 1} unique preliminary opponents per team.`);
  }
  if (appearances % 2 !== 0) conflicts.push('The requested team appearances cannot be paired evenly.');
  if (!input.fields.length) conflicts.push('At least one field, court, rink, or resource is required.');
  if (!input.dailyWindows.length) conflicts.push('At least one tournament operating window is required.');
  if (!Number.isFinite(input.gameDurationMinutes) || input.gameDurationMinutes <= 0) conflicts.push('Game duration must be greater than zero.');
  if (!Number.isFinite(input.transitionMinutes) || input.transitionMinutes < 0) conflicts.push('Transition time cannot be negative.');
  if (requiredGames !== null && requiredGames > supportedGames) {
    conflicts.push(`${teamCount} teams playing ${input.gamesPerTeam} preliminary games requires ${requiredGames} games. Current resource availability supports ${supportedGames} games.`);
    recommendations.push('Add another field or playing resource.');
    recommendations.push('Extend tournament hours or add another tournament day.');
    recommendations.push('Reduce games per team or game duration where tournament rules permit.');
  }

  return { feasible: conflicts.length === 0, requiredGames, supportedGames, conflicts, recommendations };
}

function edges(teamCount: number, degree: number): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  const circularOffsets = Math.floor(degree / 2);
  for (let offset = 1; offset <= circularOffsets; offset++) {
    for (let index = 0; index < teamCount; index++) result.push([index, (index + offset) % teamCount]);
  }
  if (degree % 2 === 1) {
    for (let index = 0; index < teamCount / 2; index++) result.push([index, index + teamCount / 2]);
  }
  return result;
}

export function generateTieredPreliminaryMatchups(input: TieredPreliminaryInput): TieredPreliminaryMatchup[] {
  const report = analyzeTieredFeasibility(input);
  if (!report.feasible) throw new TieredScheduleError(report.conflicts);
  const homeCounts = new Map(input.teams.map(team => [team.id, 0]));
  return edges(input.teams.length, input.gamesPerTeam).map(([leftIndex, rightIndex], index) => {
    let left = input.teams[leftIndex];
    let right = input.teams[rightIndex];
    const leftHomes = homeCounts.get(left.id) || 0;
    const rightHomes = homeCounts.get(right.id) || 0;
    if (leftHomes > rightHomes || (leftHomes === rightHomes && index % 2 === 1)) [left, right] = [right, left];
    homeCounts.set(left.id, (homeCounts.get(left.id) || 0) + 1);
    return {
      id: `tiered_preliminary_${index + 1}`,
      team1Id: left.id,
      team2Id: right.id,
      team1: left.name,
      team2: right.name,
      team1LogoUrl: left.logoUrl,
      team2LogoUrl: right.logoUrl,
      round: 'Preliminary',
      stage: 'Preliminary',
      phase: 'preliminary',
    };
  });
}
