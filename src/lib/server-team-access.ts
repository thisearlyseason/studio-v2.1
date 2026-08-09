import type { DocumentData, DocumentReference } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { hasStaffRole } from '@/lib/staff-position';

export type ActiveTeamMember = {
  ref: DocumentReference<DocumentData>;
  data: DocumentData;
};

export function isStaffMember(data: DocumentData | undefined): boolean {
  if (!data) return false;
  return hasStaffRole(data);
}

export function isParentMember(data: DocumentData | undefined): boolean {
  if (!data) return false;
  const position = String(data.position || '').trim().toLowerCase();
  return position === 'parent' || position === 'guardian';
}

export async function findActiveTeamMember(
  teamId: string,
  uid: string
): Promise<ActiveTeamMember | null> {
  const members = adminDb.collection('teams').doc(teamId).collection('members');
  const direct = await members.doc(uid).get();
  if (direct.exists && direct.data()?.status !== 'removed' && direct.data()?.isDeleted !== true) {
    return { ref: direct.ref, data: direct.data() || {} };
  }

  const linked = await members.where('userId', '==', uid).limit(10).get();
  const match = linked.docs.find(
    candidate => candidate.data().status !== 'removed' && candidate.data().isDeleted !== true
  );
  return match ? { ref: match.ref, data: match.data() } : null;
}

export async function getTeamAuthority(teamId: string, uid: string, tokenRole?: string) {
  const teamRef = adminDb.collection('teams').doc(teamId);
  const [team, member] = await Promise.all([teamRef.get(), findActiveTeamMember(teamId, uid)]);
  if (!team.exists) return null;
  const teamData = team.data() || {};
  const isOwner = teamData.ownerUserId === uid;
  const isSuperAdmin = tokenRole === 'superadmin';
  return {
    teamRef,
    teamData,
    member,
    isOwner,
    isSuperAdmin,
    isStaff: isSuperAdmin || isOwner || isStaffMember(member?.data),
  };
}
