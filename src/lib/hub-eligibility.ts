export function isHubTeamType(type?: string) {
  return ['school', 'school_hub', 'club', 'club_hub'].includes(type || '');
}

export function isHubPlan(plan?: string | null) {
  return ['school', 'elite', 'league'].includes(plan || '');
}
