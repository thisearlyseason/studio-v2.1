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
  const rootPlayer = alias => documents.find(item => item.path.startsWith('players/') && !item.path.slice('players/'.length).includes('/') && item.data?.fixtureAlias === alias);
  const playerId = alias => rootPlayer(alias)?.data?.id;
  const teamId = alias => team(alias)?.id;
  const userId = alias => identity(alias)?.uid;
  const memberByPlayer = (teamAlias, childId) => documents.find(item =>
    item.path.startsWith(`teams/${teamId(teamAlias)}/members/`) && item.data?.playerId === childId)?.data;
  const teamRoot = alias => paths.get(`teams/${teamId(alias)}`);
  const teamMarkers = ['qa-team-a', 'qa-team-b', 'qa-team-c'].map(alias => teamRoot(alias)?.visibleMarker);
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
      return profile && ['team', 'elite', 'school', 'league'].includes(profile.plan_type) &&
        ['active', 'trialing', 'past_due'].includes(profile.subscription_status) &&
        Number.isInteger(profile.team_limit) && profile.team_limit > 0 && profile.outboundProvidersEnabled === false;
    }),
    'school-hub': schoolHub?.type === 'school_hub' && teamRoot('qa-school-hub')?.type === 'school_hub' &&
      schoolSquads.length === 3 && schoolSquads.every(item => paths.get(`teams/${item.id}`)?.schoolId === schoolHub.id) &&
      teamRoot('qa-school-hub')?.schoolAdminIds?.includes(userId('qa-school-delegate')),
    'club-squads': clubSquads.length === 3 && clubSquads.every(item =>
      paths.get(`teams/${item.id}`)?.ownerUserId === userId('qa-elite-owner')),
    'roster-rich': (catalog?.rosterVariants?.length || 0) >= 6 &&
      catalog.rosterVariants.some(item => item.variant === 'accented') && catalog.rosterVariants.some(item => item.variant === 'removed') &&
      catalog.rosterVariants.every(item => paths.get(`players/${item.id}`)?.id === item.id &&
        paths.get(`teams/${teamId('qa-team-a')}/members/${item.id}`)?.playerId === item.id),
    'recruiting-private': paths.has(`players/${adultA}/recruitingProfile/profile`) && paths.has(`players/${adultA}/recruitingProfile/metrics`) && paths.has(`players/${adultA}/recruitingContact/contact`) && documents.some(item => item.path.startsWith(`players/${adultA}/stats/`)) && documents.some(item => item.path.startsWith(`players/${adultA}/evaluations/`)) && documents.some(item => item.path.startsWith(`players/${adultA}/videos/`)),
    'recruiting-public': documents.filter(item => item.path.endsWith('/recruitingProfile/profile')).some(item => item.data.status === 'active') && documents.filter(item => item.path.endsWith('/recruitingProfile/profile')).some(item => item.data.status === 'hidden'),
    'family-two-child': catalog?.households?.find(item => item.alias === 'qa-household-a')?.children.length === 2 &&
      catalog?.households?.find(item => item.alias === 'qa-household-b')?.children.length === 1 &&
      (catalog?.households || []).every(household => {
        const persisted = paths.get(`households/${household.id}`);
        return persisted?.parentUserId === household.parentUserId && household.children.every(child => {
          const childId = playerId(child.playerAlias);
          return Boolean(childId) && persisted.childPlayerIds?.includes(childId) &&
            paths.get(`players/${childId}`)?.parentId === household.parentUserId &&
            memberByPlayer(child.teamAlias, childId)?.parentId === household.parentUserId;
        });
      }),
    'family-payments': documents.filter(item => item.path.startsWith(`users/${userId('qa-parent-a')}/payments/`)).length >= 3,
    'family-waivers': paths.has(`teams/${teamId('qa-team-c')}/members/${youthC}`) && paths.has(`teams/${teamId('qa-team-b')}/members/${youthB}`) && documents.some(item => item.path.startsWith(`teams/${teamId('qa-team-c')}/documents/`) && item.data.type === 'waiver' && item.data.ownerUserId === team('qa-team-c')?.ownerUserId),
    'youth-invite': catalog?.youthInvite?.collection === 'invites' && /^p_[A-Za-z0-9_-]{1,200}$/.test(catalog?.youthInvite?.childId || '') &&
      catalog.youthInvite.childId === youthC && paths.get(`players/${youthC}`)?.parentId === catalog.youthInvite.parentId &&
      paths.get(`teams/${catalog.youthInvite.teamId}/members/${youthC}`)?.parentId === catalog.youthInvite.parentId &&
      catalog.youthInvite.startState === 'no-active-invite' && !documents.some(item => item.path.startsWith('youthInvites/')),
    'branding-storage': (catalog?.storageObjects || []).some(item => item.path.startsWith(`teams/${teamId('qa-team-a')}/branding/`) && item.lifecycle === 'present') && (catalog?.storageObjects || []).every(item => item.path && item.lifecycle),
    'race-barriers': ['qa-race-team-capacity', 'qa-race-join-code'].every(alias => {
      const race = (catalog?.raceFixtures || []).find(item => item.alias === alias);
      return race?.participantAliases.length === 2 && race.expectedWinnerCount === 1 && Boolean(race.barrierKey);
    }),
    'disposable-destructive': catalog?.dynamicCleanupContract?.destructiveBaselineAliases?.includes('qa-disposable-team') &&
      Boolean(teamRoot('qa-disposable-team')) && ['games', 'events', 'documents'].every(collection =>
        documents.some(item => item.path.startsWith(`teams/${teamId('qa-disposable-team')}/${collection}/`))) &&
      (catalog?.storageObjects || []).some(item => item.path.startsWith(`teams/${teamId('qa-disposable-team')}/`) && item.lifecycle === 'present'),
    'global-waiver': (() => {
      const deployment = catalog?.globalWaiverDeployment;
      if (!deployment?.masterPath || !Array.isArray(deployment.copyPaths) || deployment.copyPaths.length === 0) return false;
      const master = paths.get(deployment.masterPath);
      if (!master || master.isClubMaster !== true || master.isGlobal !== true ||
          master.deploymentId !== deployment.deploymentId || !['participant', 'team'].includes(master.waiverAudience)) return false;
      const teamIds = new Set();
      for (const path of deployment.copyPaths) {
        const copy = paths.get(path);
        const pathTeamId = path.split('/')[1];
        if (!copy || copy.isClubMaster !== true || copy.isGlobal !== false || copy.teamId !== pathTeamId ||
            copy.deploymentId !== deployment.deploymentId || copy.waiverAudience !== master.waiverAudience ||
            copy.sourceGlobalDocumentId !== master.id || teamIds.has(copy.teamId)) return false;
        teamIds.add(copy.teamId);
      }
      return true;
    })(),
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
