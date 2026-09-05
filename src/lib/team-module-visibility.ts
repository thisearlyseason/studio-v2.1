export const TEAM_MODULE_DEFINITIONS = Object.freeze([
  { key: 'attendance', name: 'Attendance', route: '/events' },
  { key: 'equipment', name: 'Equipment', route: '/equipment' },
  { key: 'facilities', name: 'Facilities', route: '/facilities' },
  { key: 'feed', name: 'Feed', route: '/feed' },
  { key: 'files', name: 'Files', route: '/files' },
  { key: 'fundraising', name: 'Fundraising', route: '/fundraising' },
  { key: 'practice', name: 'Practice', route: '/practice' },
  { key: 'volunteers', name: 'Volunteers', route: '/volunteers' },
] as const);

export type TeamModuleKey = (typeof TEAM_MODULE_DEFINITIONS)[number]['key'];

export function isTeamModuleRouteDisabled(
  pathname: string,
  features: Partial<Record<TeamModuleKey, boolean>> | undefined,
) {
  const definition = TEAM_MODULE_DEFINITIONS.find(
    item => pathname === item.route || pathname.startsWith(`${item.route}/`),
  );
  return Boolean(definition && features?.[definition.key] === false);
}
