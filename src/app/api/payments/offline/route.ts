import { NextRequest, NextResponse } from 'next/server';
import { assertNonAnonymous, verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';
import { getTeamFinanceAccess } from '@/lib/server-team-entitlements';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_AMOUNT_CENTS = 100_000_000;

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const anonymousError = assertNonAnonymous(auth);
  if (anonymousError) return anonymousError;

  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 12_000);
    const teamId = typeof body.teamId === 'string' && ID_PATTERN.test(body.teamId)
      ? body.teamId
      : '';
    const payerName = boundedText(body.payerName, 120);
    const paymentItemName = boundedText(body.paymentItemName, 120);
    const payerEmail = typeof body.payerEmail === 'string'
      ? body.payerEmail.trim().toLowerCase()
      : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    const amount = body.amount;
    const currency = body.currency;

    if (!teamId || !payerName || !paymentItemName) {
      return NextResponse.json({ error: 'Squad, payer name, and description are required.' }, { status: 400 });
    }
    if (payerEmail && (payerEmail.length > 254 || !EMAIL_PATTERN.test(payerEmail))) {
      return NextResponse.json({ error: 'Enter a valid payer email.' }, { status: 400 });
    }
    if (notes.length > 2_000) {
      return NextResponse.json({ error: 'Notes must be 2,000 characters or fewer.' }, { status: 400 });
    }
    if (!Number.isInteger(amount) || (amount as number) < 1 || (amount as number) > MAX_AMOUNT_CENTS) {
      return NextResponse.json({ error: 'Enter a valid payment amount.' }, { status: 400 });
    }
    if (currency !== 'usd' && currency !== 'cad') {
      return NextResponse.json({ error: 'Unsupported payment currency.' }, { status: 400 });
    }

    const rateLimit = await enforceUserRateLimit(
      auth.uid,
      'offline-payment-create',
      60,
      10 * 60 * 1000
    );
    if (rateLimit) return rateLimit;

    const access = await getTeamFinanceAccess(
      auth.uid,
      teamId,
      auth.role === 'superadmin',
      false
    );
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const now = new Date().toISOString();
    const payment = await adminDb
      .collection('teams')
      .doc(teamId)
      .collection('payments')
      .add({
        teamId,
        paymentItemName,
        payer_name: payerName,
        payer_email: payerEmail,
        amount,
        currency,
        payment_method: 'offline',
        status: 'paid',
        notes,
        recorded_by: auth.uid,
        createdAt: now,
        updatedAt: now,
      });

    return NextResponse.json({ ok: true, paymentId: payment.id });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[payments/offline] Unable to record payment:', error);
    return NextResponse.json({ error: 'Unable to record payment.' }, { status: 500 });
  }
}
