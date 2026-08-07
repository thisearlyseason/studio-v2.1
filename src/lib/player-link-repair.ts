const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

const STAFF_POSITIONS = new Set([
  'coach',
  'head coach',
  'assistant coach',
  'manager',
  'squad leader',
  'athletic director',
  'staff',
]);

type RepairCandidate = {
  status?: unknown;
  isDeleted?: unknown;
  playerId?: unknown;
  role?: unknown;
  position?: unknown;
  userId?: unknown;
  name?: unknown;
};

export function isRepairableAthlete(member: RepairCandidate | undefined): boolean {
  if (!member || member.status === 'removed' || member.isDeleted === true || member.playerId) return false;

  const role = String(member.role || '').trim().toLowerCase();
  const position = String(member.position || '').trim().toLowerCase();
  return role !== 'admin' && role !== 'staff' && !STAFF_POSITIONS.has(position);
}

export function playerIdentityForMember(teamId: string, memberId: string, member: RepairCandidate): string {
  const userId = typeof member.userId === 'string' && ID_PATTERN.test(member.userId) ? member.userId : '';
  return userId && memberId === userId ? `p_${userId}` : `legacy_${teamId}_${memberId}`;
}

export function playerNamesFromMember(member: RepairCandidate): { firstName: string; lastName: string } {
  const name = typeof member.name === 'string' ? member.name.trim() : '';
  const [firstName = 'Athlete', ...lastName] = name.split(/\s+/).filter(Boolean);
  return { firstName, lastName: lastName.join(' ') };
}

export function isValidRepairId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}
