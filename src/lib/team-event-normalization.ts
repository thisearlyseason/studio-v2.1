export function normalizeTeamEvent<T extends Record<string, unknown>>(
  event: T,
  fallbackTeamId: string | null | undefined,
): (T & { teamId: string }) | null {
  const explicitTeamId = typeof event.teamId === 'string' ? event.teamId.trim() : '';
  const teamId = explicitTeamId || String(fallbackTeamId || '').trim();
  if (!teamId) return null;
  return { ...event, teamId };
}
