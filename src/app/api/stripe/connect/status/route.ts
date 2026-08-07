import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe-client';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { enforceUserRateLimit } from '@/lib/server-request-guards';

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
    const limited = await enforceUserRateLimit(auth.uid, 'stripe-connect-status', 120, 60 * 60 * 1000);
    if (limited) return limited;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const teamId = searchParams.get('teamId');
    const mode   = searchParams.get('mode') ?? 'user';

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId.' }, { status: 400 });
    }
    if (!['user', 'hub'].includes(mode) || (teamId && (teamId.includes('/') || teamId.length > 200))) {
      return NextResponse.json({ error: 'Invalid mode or teamId.' }, { status: 400 });
    }

    if (auth.uid !== userId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    let connectAccountId: string | undefined;

    if (mode === 'hub') {
      if (!teamId) {
        return NextResponse.json({ error: 'teamId required for hub mode.' }, { status: 400 });
      }
      const teamSnap = await adminDb.collection('teams').doc(teamId).get();
      if (!teamSnap.exists) {
        return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
      }
      // Hub admins only
      if (teamSnap.data()!.ownerUserId !== userId) {
        const userSnap = await adminDb.collection('users').doc(userId).get();
        if (userSnap.data()?.role !== 'superadmin') {
          return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
        }
      }
      connectAccountId = teamSnap.data()?.stripeConnectAccountId;
    } else {
      const userSnap = await adminDb.collection('users').doc(userId).get();
      if (!userSnap.exists) {
        return NextResponse.json({ error: 'User not found.' }, { status: 404 });
      }
      connectAccountId = userSnap.data()?.stripe_connect_account_id;
    }

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
