export function isHubTeamType(type?: string) {
  return ['school', 'school_hub', 'club', 'club_hub'].includes(type || '');
}

export function isHubPlan(plan?: string | null) {
  return ['school', 'elite', 'league'].includes(plan || '');
}

type HubTeam = { id: string; type?: string; ownerUserId?: string; clubId?: string; schoolId?: string; organizationHubId?: string };

export function resolveBrandingHub<T extends HubTeam>(
  teams: T[], activeId: string | undefined, uid: string | undefined, schoolMode: boolean
) {
  const active = teams.find(team => team.id === activeId);
  if (!uid || (activeId && !active)) return;
  const owned = teams.filter(team => team.ownerUserId === uid);
  if (active && isHubTeamType(active.type)) return owned.find(team => team.id === activeId);
  const parentId = active?.organizationHubId || active?.schoolId || active?.clubId;
  if (parentId && parentId !== uid) {
    return owned.find(team => team.id === parentId);
  }
  const candidates = owned.filter(team => schoolMode
    ? ['school', 'school_hub'].includes(team.type || '')
    : ['club', 'club_hub'].includes(team.type || ''));
  if (candidates.length === 1) return candidates[0];
  if (candidates.length || owned.some(team => isHubTeamType(team.type))) return;
  // Older accounts have one account-level hub backed by their owned squads.
  if (!activeId) return owned[0];
  if (active?.ownerUserId === uid) return active;
}

export function squadBelongsToHub(team: HubTeam, hub: HubTeam | undefined) {
  if (!hub?.ownerUserId || team.ownerUserId !== hub.ownerUserId || isHubTeamType(team.type)) return false;
  const parent = team.organizationHubId || team.schoolId || team.clubId;
  if (parent && parent !== team.ownerUserId) return parent === hub.id;
  return !isHubTeamType(hub.type);
}

export function hubLabel(hub: {type?: string; name?: string; hubDisplayName?: string} | undefined,
  profileName: string | undefined, sameKindCount: number, fallback: string) {
  return hub?.hubDisplayName || (sameKindCount <= 1 && profileName) ||
    (isHubTeamType(hub?.type) && hub?.name) || fallback;
}
