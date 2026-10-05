export type CalendarFeedType = 'user' | 'team' | 'multi';
export type CalendarFeedAction = 'create' | 'rotate' | 'revoke';

export type CalendarFeedRecord = {
  id: string;
  active?: unknown;
  serverIssued?: unknown;
  type?: unknown;
  teamId?: unknown;
  teamIds?: unknown;
};

type Scope = {
  type: CalendarFeedType;
  teamId: string | null;
  teamIds: string[];
};

function hasSameScope(feed: CalendarFeedRecord, scope: Scope): boolean {
  if (feed.serverIssued !== true || feed.active !== true || feed.type !== scope.type) return false;
  if (scope.type === 'team') return feed.teamId === scope.teamId;
  if (scope.type === 'multi') {
    return Array.isArray(feed.teamIds) && feed.teamIds.length === scope.teamIds.length &&
      feed.teamIds.every((teamId, index) => teamId === scope.teamIds[index]);
  }
  return true;
}

export function resolveCalendarFeedMutation({
  action,
  type,
  teamId,
  teamIds,
  feeds,
  nextToken,
}: {
  action: CalendarFeedAction;
  type: CalendarFeedType;
  teamId: string | null;
  teamIds: string[];
  feeds: CalendarFeedRecord[];
  nextToken: string;
}): { kind: 'existing' | 'issue' | 'revoked'; token?: string; deactivateIds: string[] } {
  const scope = { type, teamId, teamIds };
  const matching = feeds.filter(feed => hasSameScope(feed, scope));
  const deactivateIds = matching.map(feed => feed.id);

  if (action === 'revoke') return { kind: 'revoked', deactivateIds };
  if (action === 'create' && matching[0]) {
    return { kind: 'existing', token: matching[0].id, deactivateIds: [] };
  }
  return { kind: 'issue', token: nextToken, deactivateIds };
}
