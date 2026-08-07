import { adminDb } from '@/lib/firebase-admin';
import { isActiveTeamMembership } from '@/lib/team-membership-security';

const STAFF_POSITIONS = new Set(['coach', 'head coach', 'assistant coach', 'manager', 'squad leader', 'athletic director', 'staff']);
const EMAIL_PATTERN = /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/;

export type TeamDeliveryTargets = {
  userIds: Set<string>;
  emails: Set<string>;
  tokens: Set<string>;
};

export async function isAuthorizedTeamNotifier(teamId: string, uid: string, role?: string): Promise<boolean> {
  if (!teamId || !uid) return false;
  if (role === 'superadmin') return true;
  const teamRef = adminDb.collection('teams').doc(teamId);
  const team = await teamRef.get();
  if (!team.exists) return false;
  const teamData = team.data() || {};
  if (teamData.ownerUserId === uid || (Array.isArray(teamData.schoolAdminIds) && teamData.schoolAdminIds.includes(uid))) {
    return true;
  }
  const direct = await teamRef.collection('members').doc(uid).get();
  if (direct.exists) {
    const data = direct.data() || {};
    if (!isActiveTeamMembership(data)) return false;
    if (String(data.role || '').toLowerCase() === 'admin') return true;
    if (STAFF_POSITIONS.has(String(data.position || '').toLowerCase())) return true;
  }
  const query = await teamRef.collection('members').where('userId', '==', uid).limit(5).get();
  return query.docs.some(snapshot => {
    const data = snapshot.data();
    return isActiveTeamMembership(data) && (
      String(data.role || '').toLowerCase() === 'admin' ||
      STAFF_POSITIONS.has(String(data.position || '').toLowerCase())
    );
  });
}

export async function getTeamDeliveryTargets(teamId: string): Promise<TeamDeliveryTargets> {
  const userIds = new Set<string>();
  const emails = new Set<string>();
  const tokens = new Set<string>();
  const members = await adminDb.collection('teams').doc(teamId).collection('members').limit(1_000).get();

  for (const snapshot of members.docs) {
    const data = snapshot.data();
    if (!isActiveTeamMembership(data)) continue;
    const memberUserId = typeof data.userId === 'string' ? data.userId : '';
    if (memberUserId) userIds.add(memberUserId);
    for (const email of [data.email, data.parentEmail]) {
      const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
      if (EMAIL_PATTERN.test(normalized)) emails.add(normalized);
    }
  }

  const refs = [...userIds].map(uid => adminDb.collection('users').doc(uid));
  if (refs.length) {
    const users = await adminDb.getAll(...refs);
    for (const snapshot of users) {
      if (!snapshot.exists) continue;
      const data = snapshot.data() || {};
      const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
      if (EMAIL_PATTERN.test(email)) emails.add(email);
      if (Array.isArray(data.fcmTokens)) {
        for (const token of data.fcmTokens.slice(0, 20)) {
          if (typeof token === 'string' && token.length >= 20 && token.length <= 4096) tokens.add(token);
        }
      }
    }
  }
  return { userIds, emails, tokens };
}

export function validNotificationUrl(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string' || value.length > 500) return false;
  if (value.startsWith('/')) return !value.startsWith('//');
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['thesquad.pro', 'www.thesquad.pro'].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
