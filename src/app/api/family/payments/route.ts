import { NextRequest, NextResponse } from 'next/server';
import { assertNonAnonymous, verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { buildHouseholdPaymentProjection, HouseholdPaymentMutationError } from '@/lib/household-payment-mutation';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { getTeamFinanceAccess } from '@/lib/server-team-entitlements';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

async function input(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const anonymous = assertNonAnonymous(auth);
  if (anonymous) return anonymous;
  const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 12_000);
  const teamId = typeof body.teamId === 'string' && ID_PATTERN.test(body.teamId) ? body.teamId : '';
  if (!teamId) return NextResponse.json({ error: 'Valid squad required.' }, { status: 400 });
  const access = await getTeamFinanceAccess(auth.uid, teamId, auth.role === 'superadmin', false);
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  return { auth, body, teamId, team: access.team || {} };
}

export async function POST(req: NextRequest) {
  try {
    const context = await input(req);
    if (context instanceof NextResponse) return context;
    const { auth, body, teamId, team } = context;
    const limited = await enforceUserRateLimit(auth.uid, 'household-payment-create', 120, 60 * 60 * 1000);
    if (limited) return limited;
    const childId = typeof body.childId === 'string' && ID_PATTERN.test(body.childId) ? body.childId : '';
    const requestId = typeof body.requestId === 'string' && ID_PATTERN.test(body.requestId) ? body.requestId : '';
    if (!childId || !requestId) return NextResponse.json({ error: 'Valid athlete and request identity required.' }, { status: 400 });
    const [childSnapshot, existing] = await Promise.all([
      adminDb.collection('players').doc(childId).get(),
      adminDb.collection('teams').doc(teamId).collection('householdPayments').doc(requestId).get(),
    ]);
    if (!childSnapshot.exists) return NextResponse.json({ error: 'Athlete not found.' }, { status: 404 });
    if (existing.exists) return NextResponse.json({ error: 'Payment request already exists.' }, { status: 409 });
    const now = new Date().toISOString();
    const payment = buildHouseholdPaymentProjection({ paymentId: requestId, teamId, team, childId, child: childSnapshot.data() || {}, input: body, actorUid: auth.uid, now });
    const parentId = String(payment.parentId);
    const sourceRef = adminDb.collection('teams').doc(teamId).collection('householdPayments').doc(requestId);
    const projectionRef = adminDb.collection('users').doc(parentId).collection('payments').doc(requestId);
    await adminDb.runTransaction(async transaction => {
      if ((await transaction.get(sourceRef)).exists) throw new HouseholdPaymentMutationError('Payment request already exists.', 409);
      transaction.create(sourceRef, { ...payment, projectionPath: projectionRef.path });
      transaction.create(projectionRef, payment);
    });
    return NextResponse.json({ ok: true, paymentId: requestId }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError || error instanceof HouseholdPaymentMutationError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Unable to create household payment.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const context = await input(req);
    if (context instanceof NextResponse) return context;
    const { auth, body, teamId } = context;
    const paymentId = typeof body.paymentId === 'string' && ID_PATTERN.test(body.paymentId) ? body.paymentId : '';
    if (!paymentId) return NextResponse.json({ error: 'Valid payment required.' }, { status: 400 });
    const sourceRef = adminDb.collection('teams').doc(teamId).collection('householdPayments').doc(paymentId);
    const result = await adminDb.runTransaction(async transaction => {
      const source = await transaction.get(sourceRef);
      if (!source.exists) return false;
      const current = source.data() || {};
      const status = String(body.status || current.status);
      if (!['paid', 'pending', 'overdue'].includes(status)) throw new HouseholdPaymentMutationError('Valid payment status required.');
      const projectionPath = String(current.projectionPath || '');
      if (!/^users\/[A-Za-z0-9_-]{1,200}\/payments\/[A-Za-z0-9_-]{1,200}$/.test(projectionPath)) throw new HouseholdPaymentMutationError('Payment projection is invalid.', 409);
      const updates = { status, updatedAt: new Date().toISOString(), recordedBy: auth.uid };
      transaction.update(sourceRef, updates);
      transaction.update(adminDb.doc(projectionPath), updates);
      return true;
    });
    return result ? NextResponse.json({ ok: true, paymentId }) : NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
  } catch (error) {
    if (error instanceof RequestBodyError || error instanceof HouseholdPaymentMutationError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Unable to update household payment.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const context = await input(req);
    if (context instanceof NextResponse) return context;
    const { body, teamId } = context;
    const paymentId = typeof body.paymentId === 'string' && ID_PATTERN.test(body.paymentId) ? body.paymentId : '';
    if (!paymentId) return NextResponse.json({ error: 'Valid payment required.' }, { status: 400 });
    const sourceRef = adminDb.collection('teams').doc(teamId).collection('householdPayments').doc(paymentId);
    const result = await adminDb.runTransaction(async transaction => {
      const source = await transaction.get(sourceRef);
      if (!source.exists) return false;
      const projectionPath = String(source.data()?.projectionPath || '');
      if (!/^users\/[A-Za-z0-9_-]{1,200}\/payments\/[A-Za-z0-9_-]{1,200}$/.test(projectionPath)) throw new HouseholdPaymentMutationError('Payment projection is invalid.', 409);
      transaction.delete(sourceRef);
      transaction.delete(adminDb.doc(projectionPath));
      return true;
    });
    return result ? NextResponse.json({ ok: true, paymentId }) : NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
  } catch (error) {
    if (error instanceof RequestBodyError || error instanceof HouseholdPaymentMutationError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Unable to delete household payment.' }, { status: 500 });
  }
}
