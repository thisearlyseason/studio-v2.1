import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { findActiveTeamMember, getTeamAuthority } from '@/lib/server-team-access';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';
import { adminDb } from '@/lib/firebase-admin';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 4_000);
    const teamId =
      typeof body.teamId === 'string' && ID_PATTERN.test(body.teamId) ? body.teamId : '';
    const opportunityId =
      typeof body.opportunityId === 'string' && ID_PATTERN.test(body.opportunityId)
        ? body.opportunityId
        : '';
    const contributorId =
      typeof body.contributorId === 'string' && ID_PATTERN.test(body.contributorId)
        ? body.contributorId
        : '';

    if (!teamId || !opportunityId || !contributorId) {
      return NextResponse.json({ error: 'Valid team, opportunity, and contributor IDs are required.' }, { status: 400 });
    }

    const rateLimit = await enforceUserRateLimit(
      auth.uid,
      'volunteer-point-verification',
      60,
      10 * 60 * 1000
    );
    if (rateLimit) return rateLimit;

    const authority = await getTeamAuthority(teamId, auth.uid, auth.role);
    if (!authority?.isStaff) {
      return NextResponse.json(
        { error: 'Only authorized squad staff can verify contribution points.' },
        { status: 403 }
      );
    }

    const contributor = contributorId.startsWith('public_')
      ? null
      : await findActiveTeamMember(teamId, contributorId);
    const opportunityRef = authority.teamRef.collection('volunteers').doc(opportunityId);

    const result = await adminDb.runTransaction(async transaction => {
      const opportunitySnap = await transaction.get(opportunityRef);
      if (!opportunitySnap.exists) return { status: 404 as const };

      const opportunity = opportunitySnap.data() || {};
      const signupEntries = Object.entries<Record<string, any>>(opportunity.signups || {});
      const signupEntry =
        signupEntries.find(([key]) => key === contributorId) ||
        signupEntries.find(([, value]) => value?.userId === contributorId);
      const signupKey = signupEntry?.[0];
      const signup = signupEntry?.[1];
      if (!signup) return { status: 404 as const, missingSignup: true };

      const points = Math.max(0, Math.min(100_000, Math.round(Number(opportunity.points) || 0)));
      if (signup.status === 'verified') {
        return {
          status: 200 as const,
          alreadyVerified: true,
          points: Number(signup.verifiedPoints) || points,
        };
      }

      transaction.update(opportunityRef, {
        [`signups.${signupKey}.status`]: 'verified',
        [`signups.${signupKey}.verifiedPoints`]: points,
        [`signups.${signupKey}.verifiedAt`]: new Date().toISOString(),
        [`signups.${signupKey}.verifiedBy`]: auth.uid,
      });
      if (contributor) {
        transaction.update(contributor.ref, {
          volunteerPoints: FieldValue.increment(points),
          volunteerPointsUpdatedAt: new Date().toISOString(),
        });
      }

      return { status: 200 as const, alreadyVerified: false, points };
    });

    if (result.status === 404) {
      return NextResponse.json(
        {
          error: 'missingSignup' in result && result.missingSignup
            ? 'The selected contributor is not signed up for this opportunity.'
            : 'Volunteer opportunity not found.',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      points: result.points,
      alreadyVerified: result.alreadyVerified,
    });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[teams/volunteers/verify] Unable to verify contribution:', error);
    return NextResponse.json({ error: 'Unable to verify contribution points.' }, { status: 500 });
  }
}
