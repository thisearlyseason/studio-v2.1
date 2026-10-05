import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { getTeamAuthority, isParentMember, isStaffMember } from '@/lib/server-team-access';
import { isAlertRelevantToRecipient, type AlertAudienceRecord } from '@/lib/alert-audience';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

class AlertHistoryAccessError extends Error {}

function createdAtString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return '';
}

export async function GET(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  const params = new URL(req.url).searchParams;
  const teamId = params.get('teamId');
  if (
    !teamId ||
    !ID_PATTERN.test(teamId) ||
    [...params.keys()].some(key => key !== 'teamId' || params.getAll(key).length !== 1)
  ) {
    return NextResponse.json({ error: 'Invalid squad alert request.' }, { status: 400, headers });
  }

  try {
    const authority = await getTeamAuthority(teamId, auth.uid, auth.role);
    if (!authority || (!authority.isOwner && !authority.isSuperAdmin && !authority.member)) {
      return NextResponse.json({ error: 'Squad alert history is unavailable.' }, { status: 403, headers });
    }

    const result = await adminDb.runTransaction(async transaction => {
      const team = await transaction.get(authority.teamRef);
      if (!team.exists) throw new AlertHistoryAccessError();

      const currentOwner = team.data()?.ownerUserId === auth.uid;
      let memberData = authority.member?.data;
      if (!currentOwner && !authority.isSuperAdmin) {
        if (!authority.member) throw new AlertHistoryAccessError();
        const member = await transaction.get(authority.member.ref);
        memberData = member.data();
        const belongsToUser = member.exists && (
          memberData?.userId === auth.uid ||
          (authority.member.ref.id === auth.uid && !memberData?.userId)
        );
        if (!belongsToUser || memberData?.status === 'removed' || memberData?.isDeleted === true) {
          throw new AlertHistoryAccessError();
        }
      }

      const profile = await transaction.get(adminDb.collection('users').doc(auth.uid));
      const profileRole = String(profile.data()?.role || auth.role || '').trim().toLowerCase();
      const isStaff = authority.isSuperAdmin || currentOwner || isStaffMember(memberData);
      const isParent = isParentMember(memberData) || profileRole === 'parent' || profileRole === 'guardian';
      const isPlayer = !isStaff && !isParent && (
        ['player', 'adult_player', 'youth_player'].includes(profileRole) || Boolean(memberData)
      );
      const snapshot = await transaction.get(authority.teamRef.collection('alerts').orderBy('createdAt', 'desc'));

      const alerts = snapshot.docs
        .map<AlertAudienceRecord & Record<string, unknown> & { id: string }>(document => ({
          id: document.id,
          ...(document.data() as Record<string, unknown>),
        } as AlertAudienceRecord & Record<string, unknown> & { id: string }))
        .filter(alert => isAlertRelevantToRecipient(alert, {
          userId: auth.uid,
          isStaff,
          isParent,
          isPlayer,
        }))
        .map(alert => ({
          id: alert.id,
          title: String(alert.title || ''),
          message: String(alert.message || ''),
          audience: String(alert.audience || ''),
          targetUserId: typeof alert.targetUserId === 'string' ? alert.targetUserId : null,
          createdAt: createdAtString(alert.createdAt),
          createdBy: String(alert.createdBy || ''),
        }));

      return alerts;
    });

    if (auth.role === 'superadmin') {
      const signups = await adminDb.collection('adminSignupAlerts').orderBy('createdAt','desc').limit(50).get();
      result.push(...signups.docs.map(d => ({ id:`signup_${d.id}`, title:String(d.data().title), message:String(d.data().message), audience:'everyone', targetUserId:auth.uid, createdAt:String(d.data().createdAt), createdBy:'system' })));
      result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    }
    return NextResponse.json({ alerts: result }, { headers });
  } catch (error) {
    if (error instanceof AlertHistoryAccessError) {
      return NextResponse.json({ error: 'Squad alert history is unavailable.' }, { status: 403, headers });
    }
    console.error('[teams/alerts] Unable to load alert history.');
    return NextResponse.json({ error: 'Unable to load squad alert history.' }, { status: 500, headers });
  }
}
