type StorageReader = Pick<Storage, 'getItem'>;

export type SportsHubPreferenceState = {
  favoriteSports?: string[];
  coachingLevel?: string;
  ageGroups?: string[];
  leagueType?: string;
};

export function sportsHubStorageKey(kind: 'bookmarks' | 'preferences', userId?: string | null): string {
  const scope = typeof userId === 'string' && userId.length > 0 ? userId : 'anonymous';
  return `sh:${kind}:${scope}`;
}

function readJson(storage: StorageReader, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function readSportsHubArray(storage: StorageReader, kind: 'bookmarks', userId?: string | null): string[] {
  const value = readJson(storage, sportsHubStorageKey(kind, userId));
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function readSportsHubPreferences(storage: StorageReader, userId?: string | null): SportsHubPreferenceState {
  const value = readJson(storage, sportsHubStorageKey('preferences', userId));
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  return {
    ...(Array.isArray(source.favoriteSports) ? { favoriteSports: source.favoriteSports.filter((item): item is string => typeof item === 'string') } : {}),
    ...(typeof source.coachingLevel === 'string' ? { coachingLevel: source.coachingLevel } : {}),
    ...(Array.isArray(source.ageGroups) ? { ageGroups: source.ageGroups.filter((item): item is string => typeof item === 'string') } : {}),
    ...(typeof source.leagueType === 'string' ? { leagueType: source.leagueType } : {}),
  };
}
