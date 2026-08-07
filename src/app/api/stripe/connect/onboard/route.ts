import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe-client';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { getTeamFinanceAccess } from '@/lib/server-team-entitlements';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

/**
 * POST /api/stripe/connect/onboard
 *
 * Creates a Stripe Connect Express account and returns a Stripe-hosted
 * onboarding URL.
 *
 * Modes:
 *   - mode === 'user' (default): stores account on the user's Firestore doc
 *     (stripe_connect_account_id). Used by individual squad coaches.
 *   - mode === 'hub': stores account on the HUB TEAM doc
 *     (teams/{teamId}.stripeConnectAccountId). Used by Athletic Directors /
 *     Club Admins when configuring a shared Stripe account for all sub-squads.
 *
 * Body: { userId, teamId?, mode?: 'user' | 'hub' }
 */

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { userId, teamId, mode = 'user' } = await readJsonBodyWithLimit<{
      userId?: unknown;
      teamId?: unknown;
      mode?: unknown;
    }>(req, 8_000);

    if (typeof userId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(userId)) {
      return NextResponse.json({ error: 'Missing userId.' }, { status: 400 });
    }

    if (auth.uid !== userId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }
    if (mode !== 'user' && mode !== 'hub') {
      return NextResponse.json({ error: 'Invalid Stripe connection mode.' }, { status: 400 });
    }

    const rateLimit = await enforceUserRateLimit(
      auth.uid,
      'stripe-connect-onboard',
      10,
      60 * 60 * 1000
    );
    if (rateLimit) return rateLimit;

    const userSnap = await adminDb.collection('users').doc(userId).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }
    const userData = userSnap.data()!;
    const isSuperAdmin = auth.role === 'superadmin';
    if (typeof teamId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(teamId)) {
      return NextResponse.json(
        { error: 'A paid squad is required to connect Stripe.' },
        { status: 400 }
      );
    }

    const access = await getTeamFinanceAccess(userId, teamId, isSuperAdmin, true);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const stripe = getStripe();
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;

    // Determine where the existing connect account ID is stored
    const teamRef = adminDb.collection('teams').doc(teamId);
    const teamSnap = await teamRef.get();
    if (!teamSnap.exists) {
      return NextResponse.json({ error: 'Squad not found.' }, { status: 404 });
    }
    let connectAccountId: string | undefined = teamSnap.data()?.stripeConnectAccountId;
    if (!connectAccountId && teamSnap.data()?.ownerUserId === userId) {
      connectAccountId = userData.stripe_connect_account_id;
    }

    // Create Connect Express account if not already created
    if (!connectAccountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: userData.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: {
          firebase_uid: userId,
          firebase_team_id: teamId,
          ...(mode === 'hub' ? { hub_team_id: teamId } : {}),
        },
      }, { idempotencyKey: `connect-account:${teamId}` });
      connectAccountId = account.id;
    }

    // Every payout destination is persisted on the team/hub itself. This keeps
    // all authorized finance admins on one destination and prevents the caller's
    // personal account from silently becoming the team's payout account.
    await teamRef.update({
      stripeConnectAccountId: connectAccountId,
      stripeConnectConfiguredBy: userId,
      stripeConnectUpdatedAt: new Date().toISOString(),
    });

    // Return URL includes mode + teamId so the status check knows where to look
    const returnParams = new URLSearchParams({
      stripe_connect_return: 'true',
      ...(mode === 'hub' && teamId ? { stripe_connect_mode: 'hub', stripe_connect_team: teamId } : {}),
    });
    const refreshParams = new URLSearchParams({
      stripe_connect_refresh: 'true',
      ...(mode === 'hub' && teamId ? { stripe_connect_mode: 'hub', stripe_connect_team: teamId } : {}),
    });

    const returnPath = mode === 'hub' ? '/club' : '/coaches-corner';

    const accountLink = await stripe.accountLinks.create({
      account: connectAccountId,
      refresh_url: `${origin}${returnPath}?${refreshParams.toString()}`,
      return_url: `${origin}${returnPath}?${returnParams.toString()}`,
      type: 'account_onboarding',
    });

    return NextResponse.json({ url: accountLink.url, connectAccountId });
  } catch (err: any) {
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[stripe/connect/onboard] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
