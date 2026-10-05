export const STAFF_POSITIONS = new Set([
  'coach',
  'head coach',
  'assistant coach',
  'team representative',
  'athletic director',
  'director of athletics',
  'staff',
  'manager',
  'squad leader',
  'coach guest',
  'team lead',
  'platform admin',
]);

export function isStaffPosition(position: unknown): boolean {
  return STAFF_POSITIONS.has(String(position || '').trim().toLowerCase());
}

export function hasStaffRole(member: { role?: unknown; position?: unknown } | null | undefined): boolean {
  return Boolean(member) && (
    String(member?.role || '').trim().toLowerCase() === 'admin' ||
    String(member?.role || '').trim().toLowerCase() === 'staff' ||
    isStaffPosition(member?.position)
  );
}
