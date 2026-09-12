import { hasStaffRole } from './staff-position';

type Squad = { id: string; ownerUserId?: string };
type Membership = { id: string; role?: string; position?: string; status?: string; isDeleted?: boolean };

// Client request selection only. APIs and Firestore still enforce canonical
// membership; organization seat visibility is not private-record authority.
export function privateOrganizationSquads<T extends Squad>(
  squads: T[], memberships: Membership[], userId: string | undefined, isSuperAdmin: boolean,
): T[] {
  const staffIds = new Set(memberships.filter(member =>
    hasStaffRole(member) && member.status !== 'removed' && member.isDeleted !== true
  ).map(member => member.id));
  return squads.filter(team => isSuperAdmin || (userId && team.ownerUserId === userId) || staffIds.has(team.id));
}
