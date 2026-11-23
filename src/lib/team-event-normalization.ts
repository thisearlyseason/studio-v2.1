export function normalizeTeamEvent<T extends Record<string, unknown>>(
  event: T,
  fallbackTeamId: string | null | undefined,
): (T & { teamId: string }) | null {
  const explicitTeamId = typeof event.teamId === 'string' ? event.teamId.trim() : '';
  const containingTeamId = String(fallbackTeamId || '').trim();
  if (explicitTeamId && containingTeamId && explicitTeamId !== containingTeamId) return null;
  const teamId = containingTeamId || explicitTeamId;
  if (!teamId) return null;
  return { ...event, teamId };
}
