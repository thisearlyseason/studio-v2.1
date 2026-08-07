export const PLAN_TEAM_LIMITS = {
  free: 1,
  team: 1,
  elite: 8,
  league: 18,
  school: 15,
} as const;

const PLAN_ALIASES: Record<string, keyof typeof PLAN_TEAM_LIMITS> = {
  starter: 'free',
  starter_squad: 'free',
  basic_demo: 'free',
  player_demo: 'free',
  parent_demo: 'free',
  pro: 'team',
  squad_pro: 'team',
  pro_demo: 'team',
  coach_demo: 'team',
  elite_teams: 'elite',
  league_demo: 'league',
  elite_league: 'league',
  school_demo: 'school',
  schools: 'school',
};

export function canonicalPlanId(planId: string | null | undefined): keyof typeof PLAN_TEAM_LIMITS {
  const normalized = String(planId || 'free').trim().toLowerCase();
  if (normalized in PLAN_TEAM_LIMITS) return normalized as keyof typeof PLAN_TEAM_LIMITS;
  return PLAN_ALIASES[normalized] || 'free';
}

export function getPlanTeamLimit(planId: string | null | undefined): number {
  return PLAN_TEAM_LIMITS[canonicalPlanId(planId)];
}
