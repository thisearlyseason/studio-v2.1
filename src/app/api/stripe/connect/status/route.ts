import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe-client';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { getTeamFinanceAccess } from '@/lib/server-team-entitlements';
import { resolveTeamConnectAccount } from '@/lib/server-stripe-connect';

/**
 * GET /api/stripe/connect/status
 *
 * Returns Stripe Connect account status.
 *
 * Query params:
 *   - userId (required)
 *   - teamId (optional) — required when mode=hub
 *   - mode   (optional) — 'user' (default) | 'hub'
 *
 * In user mode: reads stripe_connect_account_id from users/{userId}
 * In hub  mode: reads stripeConnectAccountId from teams/{teamId}
 */
export async function GET(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const teamId = searchParams.get('teamId');

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId.' }, { status: 400 });
    }

    if (auth.uid !== userId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }
    if (!teamId) {
      return NextResponse.json({ error: 'Missing teamId.' }, { status: 400 });
    }

    const access = await getTeamFinanceAccess(
      userId,
      teamId,
      auth.role === 'superadmin',
      true
    );
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { connectAccountId } = await resolveTeamConnectAccount(teamId);

    if (!connectAccountId) {
      return NextResponse.json({ connected: false });
    }

    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(connectAccountId);

    return NextResponse.json({
      connected: true,
      chargesEnabled: account.charges_enabled,
      detailsSubmitted: account.details_submitted,
      email: account.email ?? null,
      connectAccountId,
    });
  } catch (err: any) {
    console.error('[stripe/connect/status] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
