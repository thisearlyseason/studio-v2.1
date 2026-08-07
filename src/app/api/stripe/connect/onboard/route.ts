import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe-client';
import { verifyFirebaseToken } from '@/lib/api-auth';
import {
  enforceUserRateLimit,
  getTrustedAppOrigin,
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

const PAID_PLAN_TYPES = new Set(['team', 'elite', 'league', 'school', 'squad_pro', 'squad_pro_demo']);

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'stripe-connect-onboard', 20, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const userId = body.userId;
    const teamId = typeof body.teamId === 'string' ? body.teamId : undefined;
    const requestedMode = body.mode ?? 'user';

    if (typeof userId !== 'string' || !userId) {
      return NextResponse.json({ error: 'Missing userId.' }, { status: 400 });
    }
    if (!['user', 'hub'].includes(String(requestedMode))) {
      return NextResponse.json({ error: 'mode must be user or hub.' }, { status: 400 });
    }
    const mode: 'user' | 'hub' = requestedMode === 'hub' ? 'hub' : 'user';

    if (auth.uid !== userId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const userSnap = await adminDb.collection('users').doc(userId).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }
    const userData = userSnap.data()!;

    // ── Plan gate ─────────────────────────────────────────────────────────────
    const isPaidPlan = PAID_PLAN_TYPES.has(userData.plan_type || '');
    const isSuperAdmin = userData.role === 'superadmin';
    if (!isPaidPlan && !isSuperAdmin) {
      return NextResponse.json(
        { error: 'Online payments require a paid plan. Please upgrade to connect Stripe.' },
        { status: 403 }
      );
    }

    // ── Hub mode: verify the user is the hub team owner ───────────────────────
    if (mode === 'hub') {
      if (!teamId || teamId.includes('/')) {
        return NextResponse.json({ error: 'teamId is required for hub mode.' }, { status: 400 });
      }
      const teamSnap = await adminDb.collection('teams').doc(teamId).get();
      if (!teamSnap.exists) {
        return NextResponse.json({ error: 'Hub team not found.' }, { status: 404 });
      }
      if (teamSnap.data()!.ownerUserId !== userId && !isSuperAdmin) {
        return NextResponse.json({ error: 'Forbidden: must be hub team owner.' }, { status: 403 });
      }
    }

    const stripe = getStripe();
    const origin = getTrustedAppOrigin(req);

    // Determine where the existing connect account ID is stored
    let connectAccountId: string | undefined;
    if (mode === 'hub' && teamId) {
      const hubSnap = await adminDb.collection('teams').doc(teamId).get();
      connectAccountId = hubSnap.data()?.stripeConnectAccountId;
    } else {
      connectAccountId = userData.stripe_connect_account_id;
    }

    // Create Connect Express account if not already created
    if (!connectAccountId) {
      const account = await stripe.accounts.create(
        {
          type: 'express',
          email: userData.email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          business_type: 'individual',
          metadata: {
            firebase_uid: userId,
            ...(mode === 'hub' && teamId ? { hub_team_id: teamId } : {}),
          },
        },
        { idempotencyKey: `connect-${mode}-${mode === 'hub' ? teamId : userId}` },
      );
      connectAccountId = account.id;

      // Store on the right document
      if (mode === 'hub' && teamId) {
        await adminDb.collection('teams').doc(teamId).update({
          stripeConnectAccountId: connectAccountId,
        });
      } else {
        await adminDb.collection('users').doc(userId).update({
          stripe_connect_account_id: connectAccountId,
        });
      }
    }

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
    if (err instanceof RequestBodyError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[stripe/connect/onboard] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
