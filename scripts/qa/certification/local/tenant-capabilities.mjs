const CAPABILITY_NAMES = Object.freeze([
  'tenant-markers', 'paid-capacity', 'school-hub', 'club-squads', 'roster-rich',
  'recruiting-private', 'recruiting-public', 'family-two-child', 'family-payments',
  'family-waivers', 'youth-invite', 'branding-storage', 'race-barriers',
  'disposable-destructive', 'global-waiver', 'dynamic-cleanup',
]);

export const TENANT_SCENARIO_CAPABILITIES = Object.freeze({
  'teams-create-and-capacity': Object.freeze(['tenant-markers', 'paid-capacity', 'race-barriers', 'dynamic-cleanup']),
  'teams-join-by-code': Object.freeze(['tenant-markers', 'family-two-child', 'race-barriers', 'dynamic-cleanup']),
  'teams-profile-branding-settings': Object.freeze(['tenant-markers', 'branding-storage', 'dynamic-cleanup']),
  'teams-module-visibility': Object.freeze(['tenant-markers', 'paid-capacity', 'dynamic-cleanup']),
  'teams-seasonal-reset-delete-quota-resolution': Object.freeze(['disposable-destructive', 'paid-capacity', 'dynamic-cleanup']),
  'organization-club-school-overview': Object.freeze(['school-hub', 'club-squads', 'tenant-markers']),
  'organization-create-allocate-remove-squads': Object.freeze(['school-hub', 'paid-capacity', 'race-barriers', 'dynamic-cleanup']),
  'organization-global-waivers-documents-admins': Object.freeze(['school-hub', 'global-waiver', 'family-waivers', 'dynamic-cleanup']),
  'roster-member-add-edit-remove-reinstate': Object.freeze(['roster-rich', 'tenant-markers', 'dynamic-cleanup']),
  'roster-search-filter-sort-export': Object.freeze(['roster-rich', 'tenant-markers']),
  'roster-parent-player-self-views': Object.freeze(['family-two-child', 'roster-rich', 'tenant-markers']),
  'recruiting-private-profile-crud': Object.freeze(['recruiting-private', 'branding-storage', 'dynamic-cleanup']),
  'recruiting-public-scout-projection': Object.freeze(['recruiting-public', 'recruiting-private']),
  'family-children-invites-team-cards': Object.freeze(['family-two-child', 'youth-invite', 'dynamic-cleanup']),
  'family-schedule-waivers-payments': Object.freeze(['family-two-child', 'family-payments', 'family-waivers', 'tenant-markers']),
  'family-enable-youth-login': Object.freeze(['youth-invite', 'family-two-child', 'dynamic-cleanup']),
});

function capabilityChecks(catalog) {
  const documents = Array.isArray(catalog?.firestoreDocuments) ? catalog.firestoreDocuments : [];
  const paths = new Map(documents.map(item => [item.path, item.data]));
  const team = alias => catalog?.teams?.find(item => item.alias === alias);
  const identity = alias => catalog?.identities?.find(item => item.alias === alias);
  const playerId = alias => `${alias}-${catalog?.runSuffix}`;
  const teamId = alias => team(alias)?.id;
  const userId = alias => identity(alias)?.uid;
  const teamMarkers = ['qa-team-a', 'qa-team-b', 'qa-team-c'].map(alias => team(alias)?.visibleMarker);
  const adultA = playerId('qa-player-adult-a');
  const youthC = playerId('qa-player-youth-c');
  const youthB = playerId('qa-player-youth-b');
  const schoolHub = team('qa-school-hub');
  const schoolSquads = catalog?.teams?.filter(item => item.type === 'school_squad') || [];
  const clubSquads = catalog?.teams?.filter(item => item.organizationAlias === 'qa-club-elite') || [];
  return {
    'tenant-markers': teamMarkers.length === 3 && teamMarkers.every(Boolean) && new Set(teamMarkers).size === 3,
    'paid-capacity': ['qa-pro-owner', 'qa-elite-owner', 'qa-school-owner', 'qa-league-owner-a'].every(alias => {
      const profile = paths.get(`users/${userId(alias)}`);
      return profile && profile.plan_type && profile.subscription_status && Number.isInteger(profile.team_limit) && profile.outboundProvidersEnabled === false;
    }),
    'school-hub': schoolHub?.type === 'school_hub' && schoolSquads.length === 3 && schoolSquads.every(item => item.schoolId === schoolHub.id) && schoolHub.schoolAdminIds.includes(userId('qa-school-delegate')),
    'club-squads': clubSquads.length === 3 && clubSquads.every(item => item.ownerUserId === userId('qa-elite-owner')),
    'roster-rich': (catalog?.rosterVariants?.length || 0) >= 6 && catalog.rosterVariants.some(item => item.variant === 'accented') && catalog.rosterVariants.some(item => item.variant === 'removed'),
    'recruiting-private': paths.has(`players/${adultA}/recruitingProfile/profile`) && paths.has(`players/${adultA}/recruitingProfile/metrics`) && paths.has(`players/${adultA}/recruitingContact/contact`) && documents.some(item => item.path.startsWith(`players/${adultA}/stats/`)) && documents.some(item => item.path.startsWith(`players/${adultA}/evaluations/`)) && documents.some(item => item.path.startsWith(`players/${adultA}/videos/`)),
    'recruiting-public': documents.filter(item => item.path.endsWith('/recruitingProfile/profile')).some(item => item.data.status === 'active') && documents.filter(item => item.path.endsWith('/recruitingProfile/profile')).some(item => item.data.status === 'hidden'),
    'family-two-child': catalog?.households?.find(item => item.alias === 'qa-household-a')?.children.length === 2 && catalog?.households?.find(item => item.alias === 'qa-household-b')?.children.length === 1,
    'family-payments': documents.filter(item => item.path.startsWith(`users/${userId('qa-parent-a')}/payments/`)).length >= 3,
    'family-waivers': paths.has(`teams/${teamId('qa-team-c')}/members/${youthC}`) && paths.has(`teams/${teamId('qa-team-b')}/members/${youthB}`) && documents.some(item => item.path.startsWith(`teams/${teamId('qa-team-c')}/documents/`) && item.data.type === 'waiver' && item.data.ownerUserId === team('qa-team-c')?.ownerUserId),
    'youth-invite': catalog?.youthInvite?.collection === 'invites' && catalog.youthInvite.childId === youthC && catalog.youthInvite.startState === 'no-active-invite' && !documents.some(item => item.path.startsWith('youthInvites/')),
    'branding-storage': (catalog?.storageObjects || []).some(item => item.path.startsWith(`teams/${teamId('qa-team-a')}/branding/`) && item.lifecycle === 'present') && (catalog?.storageObjects || []).every(item => item.path && item.lifecycle),
    'race-barriers': ['qa-race-team-capacity', 'qa-race-join-code'].every(alias => (catalog?.raceFixtures || []).find(item => item.alias === alias)?.participantAliases.length === 2),
    'disposable-destructive': catalog?.dynamicCleanupContract?.destructiveBaselineAliases?.includes('qa-disposable-team') && !catalog.dynamicCleanupContract.destructiveBaselineAliases.includes('run-created-sacrificial-team'),
    'global-waiver': Boolean(catalog?.globalWaiverDeployment?.masterPath) && catalog.globalWaiverDeployment.copyPaths.every(path => paths.get(path)?.deploymentId === catalog.globalWaiverDeployment.deploymentId),
    'dynamic-cleanup': catalog?.dynamicCleanupContract?.registrationRequiredBeforeWrite === true && ['firestore', 'auth', 'storage', 'browser'].every(kind => catalog.dynamicCleanupContract.resourceKinds.includes(kind)),
  };
}

export function inspectTenantCapabilities(catalog) {
  const checks = capabilityChecks(catalog);
  const capabilities = CAPABILITY_NAMES.map(name => Object.freeze({
    name,
    state: checks[name] === true ? 'READY' : 'MISSING',
  }));
  return Object.freeze({
    capabilities: Object.freeze(capabilities),
    missing: Object.freeze(capabilities.filter(item => item.state !== 'READY').map(item => item.name)),
  });
}
