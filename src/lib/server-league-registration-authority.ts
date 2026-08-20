export function canDeleteLeagueRegistration({
  creatorId,
  actorUid,
  actorRole,
}: {
  creatorId: unknown;
  actorUid: string;
  actorRole?: string;
}): boolean {
  return creatorId === actorUid || actorRole === 'superadmin';
}
