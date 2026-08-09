import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { canonicalPlanId, getPlanTeamLimit } from '@/lib/plan-catalog';
import { readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const ALLOWED_PLAN_IDS = new Set(['free', 'team', 'elite', 'league', 'school']);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ uid: string }> },
) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== 'superadmin') {
    return NextResponse.json({ error: 'Super Admin access is required.' }, { status: 403 });
  }

  const { uid } = await context.params;
  if (!UID_PATTERN.test(uid)) {
    return NextResponse.json({ error: 'A valid user ID is required.' }, { status: 400 });
  }

  try {
    const body = await readJsonBodyWithLimit<{ planId?: unknown; reason?: unknown }>(request, 4_000);
    const requestedPlan = String(body.planId || '').trim().toLowerCase();
    if (!ALLOWED_PLAN_IDS.has(requestedPlan)) {
      return NextResponse.json({ error: 'A canonical plan is required.' }, { status: 400 });
    }
    const reason = String(body.reason || 'Manual Super Admin provisioning').trim().slice(0, 500);
    const planId = canonicalPlanId(requestedPlan);
    const teamLimit = getPlanTeamLimit(planId);
    const userRef = adminDb.collection('users').doc(uid);
    const userSnapshot = await userRef.get();
    if (!userSnapshot.exists) {
      return NextResponse.json({ error: 'The user profile does not exist.' }, { status: 404 });
    }

    const batch = adminDb.batch();
    batch.set(userRef, {
      plan_type: planId,
      team_limit: teamLimit,
      activePlanId: planId,
      proTeamLimit: teamLimit,
      planSource: 'manual',
      manualEntitlementUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      manualEntitlementUpdatedBy: auth.uid,
    }, { merge: true });
    batch.set(adminDb.collection('adminAuditLogs').doc(), {
      category: 'entitlement_control',
      action: 'manual_plan_assignment',
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      targetUid: uid,
      previousPlanId: userSnapshot.data()?.plan_type ?? null,
      planId,
      teamLimit,
      reason,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();

    return NextResponse.json({ success: true, planId, teamLimit });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[Admin Entitlement] Failed:', error);
    return NextResponse.json({ error: 'Unable to update the entitlement.' }, { status: 500 });
  }
}
