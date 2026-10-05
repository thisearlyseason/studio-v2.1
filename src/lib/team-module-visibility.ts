export const TEAM_MODULE_DEFINITIONS = Object.freeze([
  { key: 'attendance', name: 'Attendance', route: '/events' },
  { key: 'equipment', name: 'Equipment', route: '/equipment' },
  { key: 'facilities', name: 'Facilities', route: '/facilities' },
  { key: 'feed', name: 'Feed', route: '/feed' },
  { key: 'files', name: 'Files', route: '/files', legacyKey: 'library' },
  { key: 'fundraising', name: 'Fundraising', route: '/fundraising' },
  { key: 'practice', name: 'Practice', route: '/practice' },
  { key: 'volunteers', name: 'Volunteers', route: '/volunteers', legacyKey: 'volunteer' },
] as const);

export type TeamModuleKey = (typeof TEAM_MODULE_DEFINITIONS)[number]['key'];
export type LegacyTeamModuleKey = 'roster' | 'playbook' | 'tacticalChat' | 'volunteer' | 'library';
export type TeamModuleFeatures = Partial<Record<TeamModuleKey | LegacyTeamModuleKey, boolean>>;

export const LEGACY_TEAM_MODULE_DEFINITIONS = Object.freeze([
  { key: 'roster', name: 'Roster', routes: ['/roster'] },
  { key: 'playbook', name: 'Playbook', routes: ['/drills', '/playbook'] },
  { key: 'tacticalChat', name: 'Tactical Chat', routes: ['/chats'] },
] as const);

export const TEAM_MODULE_SETTINGS_DEFINITIONS = Object.freeze([
  ...TEAM_MODULE_DEFINITIONS,
  ...LEGACY_TEAM_MODULE_DEFINITIONS.map(item => ({ ...item, route: item.routes[0] })),
]);

export function isTeamModuleEnabled(
  definition: { key: string; legacyKey?: string },
  features: TeamModuleFeatures | undefined,
) {
  const canonical = features?.[definition.key as TeamModuleKey | LegacyTeamModuleKey];
  if (canonical !== undefined) return canonical !== false;
  return definition.legacyKey ? features?.[definition.legacyKey as LegacyTeamModuleKey] !== false : true;
}

export function teamModuleFeaturePatch(
  definition: { key: string; legacyKey?: string },
  enabled: boolean,
) {
  return Object.freeze({
    [definition.key]: enabled,
    ...(definition.legacyKey ? { [definition.legacyKey]: enabled } : {}),
  });
}

export function isTeamModuleRouteDisabled(
  pathname: string,
  features: TeamModuleFeatures | undefined,
) {
  const definition = TEAM_MODULE_DEFINITIONS.find(
    item => pathname === item.route || pathname.startsWith(`${item.route}/`),
  );
  if (definition) return !isTeamModuleEnabled(definition, features);
  const legacy = LEGACY_TEAM_MODULE_DEFINITIONS.find(item =>
    item.routes.some(route => pathname === route || pathname.startsWith(`${route}/`)),
  );
  return Boolean(legacy && features?.[legacy.key] === false);
}
