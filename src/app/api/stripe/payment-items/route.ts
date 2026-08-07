import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe-client';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { getTeamFinanceAccess } from '@/lib/server-team-entitlements';
import { resolveTeamConnectAccount } from '@/lib/server-stripe-connect';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

/**
 * Payment Items API — manages payable items that coaches/organizers create for
 * their team (league fees, tournament fees, equipment charges, etc.).
 *
 * Hub Stripe Routing:
 *   - If the team's hub (schoolId or clubId) has stripeConnectMode === 'shared',
 *     payment items are created on the hub's stripe_connect_account_id with
 *     squad metadata attached so the hub admin can track origin.
 *   - If stripeConnectMode === 'per_squad' (or no hub), each squad uses their
 *     own connected account (stored on the user doc as stripe_connect_account_id).
 *   - Hub admins (isPrimaryClubAuthority) can also create items directly.
 *
 * Collections:
 *   teams/{teamId}/paymentItems/{itemId}
 */

const VALID_CATEGORIES = new Set(['league', 'tournament', 'equipment', 'other', 'donation', 'fundraising']);
const VALID_CURRENCIES = new Set(['cad', 'usd']);
const SAFE_ID = /^[A-Za-z0-9_-]{1,200}$/;
const SAFE_OPERATION_ID = /^[A-Za-z0-9_-]{16,100}$/;

/**
 * Resolves which Stripe connected account to use for a given team.
 *
 * Priority:
 * 1. If the team belongs to a hub with stripeConnectMode === 'shared' → use hub's account
 * 2. Otherwise → use the team's owner's connected account
 *
 * Returns: { connectAccountId, isHubAccount, hubTeamId, hubTeamName, squadName }
 */
// ── POST — create a payment item ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const {
      userId,
      teamId,
      name,
      description,
      amountDollars,
      category,
      currency = 'usd',
      operationId,
    } = await readJsonBodyWithLimit<{
      userId?: unknown;
      teamId?: unknown;
      name?: unknown;
      description?: unknown;
      amountDollars?: unknown;
      category?: unknown;
      currency?: unknown;
      operationId?: unknown;
    }>(req, 16_000);

    if (
      typeof userId !== 'string' ||
      typeof teamId !== 'string' ||
      typeof name !== 'string' ||
      typeof category !== 'string' ||
      typeof operationId !== 'string' ||
      !SAFE_ID.test(userId) ||
      !SAFE_ID.test(teamId) ||
      !SAFE_OPERATION_ID.test(operationId) ||
      !name.trim() ||
      name.trim().length > 120 ||
      (description !== undefined && (typeof description !== 'string' || description.length > 500))
    ) {
      return NextResponse.json(
        { error: 'Invalid payment item request.' },
        { status: 400 }
      );
    }
    if (name.length > 200 || (description != null && (typeof description !== 'string' || description.length > 2_000))) {
      return NextResponse.json({ error: 'Name or description is too long.' }, { status: 400 });
    }
    if (typeof currency !== 'string' || !['usd', 'cad'].includes(currency.toLowerCase())) {
      return NextResponse.json({ error: 'Currency must be USD or CAD.' }, { status: 400 });
    }

    if (auth.uid !== userId) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

    const normalizedCurrency = typeof currency === 'string' ? currency.toLowerCase() : '';
    if (!VALID_CATEGORIES.has(category) || !VALID_CURRENCIES.has(normalizedCurrency)) {
      return NextResponse.json({ error: 'Invalid category.' }, { status: 400 });
    }

    const numericAmount = typeof amountDollars === 'number'
      ? amountDollars
      : Number(amountDollars);
    const amountCents = Math.round(numericAmount * 100);
    if (!Number.isFinite(amountCents) || amountCents < 50 || amountCents > 10_000_000) {
      return NextResponse.json({ error: 'Amount must be between $0.50 and $100,000.' }, { status: 400 });
    }

    const rateLimit = await enforceUserRateLimit(
      auth.uid,
      'stripe-payment-item-create',
      20,
      60 * 60 * 1000
    );
    if (rateLimit) return rateLimit;

    const access = await getTeamFinanceAccess(
      userId,
      teamId,
      auth.role === 'superadmin',
      true
    );
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    // Resolve which Stripe account to use (shared hub or per-squad)
    const { connectAccountId, isHubAccount, hubTeamName, squadName } =
      await resolveTeamConnectAccount(teamId);

    if (!connectAccountId) {
      const msg = isHubAccount
        ? 'No Stripe account connected to the hub. The Athletic Director or Club Admin must connect Stripe first.'
        : 'No Stripe account connected. Please connect Stripe first from the Finance tab.';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const teamName = access.team?.name || 'the team';
    const stripe = getStripe();
    const itemRef = adminDb
      .collection('teams')
      .doc(teamId)
      .collection('paymentItems')
      .doc(operationId);
    const existingItem = await itemRef.get();
    if (existingItem.exists && existingItem.data()?.stripePaymentLinkUrl) {
      return NextResponse.json({ item: existingItem.data(), duplicate: true });
    }

    // Build metadata — include squad info when routing through hub account
    const productMetadata: Record<string, string> = {
      firebase_team_id: teamId,
      firebase_payment_item_id: itemRef.id,
      firebase_user_id: userId,
      category,
    };
    if (isHubAccount && squadName) {
      productMetadata.squad_name = squadName;
      if (hubTeamName) productMetadata.hub_team_name = hubTeamName;
    }

    // 1. Create a Stripe Product on the resolved connected account
    const product = await stripe.products.create(
      {
        name: isHubAccount && squadName ? `${squadName} — ${name.trim()}` : name.trim(),
        description: description || undefined,
        metadata: productMetadata,
      },
      { stripeAccount: connectAccountId, idempotencyKey: `payment-item:${operationId}:product` }
    );

    // 2. Create a Price for the product
    const price = await stripe.prices.create(
      {
        product: product.id,
        unit_amount: amountCents,
        currency: normalizedCurrency,
      },
      { stripeAccount: connectAccountId, idempotencyKey: `payment-item:${operationId}:price` }
    );

    // 3. Create a Payment Link (reusable, shareable)
    const paymentLink = await stripe.paymentLinks.create(
      {
        line_items: [{ price: price.id, quantity: 1 }],
        after_completion: {
          type: 'hosted_confirmation',
          hosted_confirmation: {
            custom_message: `Thank you for your payment to ${teamName}!`,
          },
        },
        metadata: {
          firebase_team_id: teamId,
          firebase_payment_item_id: itemRef.id,
          firebase_user_id: userId,
          payment_item_category: category,
          ...(isHubAccount && squadName ? { squad_name: squadName } : {}),
        },
        invoice_creation: { enabled: true },
      },
      { stripeAccount: connectAccountId, idempotencyKey: `payment-item:${operationId}:link` }
    );

    // 4. Persist to Firestore
    const now = new Date().toISOString();
    const item = {
      id: operationId,
      teamId,
      name: name.trim(),
      description: description || '',
      amount: amountCents,
      currency: normalizedCurrency,
      category,
      stripeProductId: product.id,
      stripePriceId: price.id,
      stripePaymentLinkId: paymentLink.id,
      stripePaymentLinkUrl: paymentLink.url,
      stripeAccountId: connectAccountId,
      isHubAccount,
      ...(isHubAccount && squadName ? { squadName } : {}),
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      isActive: true,
    };
    await itemRef.set(item);

    return NextResponse.json({ item }, { status: 201 });
  } catch (err: any) {
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[stripe/payment-items POST] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── GET — list payment items for a team ───────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'stripe-payment-item-list', 120, 60 * 60 * 1000);
    if (limited) return limited;
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get('teamId');

    if (!teamId || teamId.includes('/') || teamId.length > 200) return NextResponse.json({ error: 'Missing or invalid teamId.' }, { status: 400 });

    const teamSnap = await adminDb.collection('teams').doc(teamId).get();
    if (!teamSnap.exists) return NextResponse.json({ error: 'Team not found.' }, { status: 404 });

    const teamData = teamSnap.data()!;
    const isOwner = teamData.ownerUserId === auth.uid;
    if (!isOwner) {
      const membersRef = adminDb.collection('teams').doc(teamId).collection('members');
      const [directMember, linkedMembers] = await Promise.all([
        membersRef.doc(auth.uid).get(),
        membersRef.where('userId', '==', auth.uid).limit(10).get(),
      ]);
      const isSuperAdmin = auth.role === 'superadmin';
      const isActiveMember = [directMember, ...linkedMembers.docs].some(member => {
        if (!member.exists) return false;
        const data = member.data() || {};
        return data.status !== 'removed' && data.isDeleted !== true;
      });

      if (!isActiveMember && !isSuperAdmin) {
        return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
      }
    }

    // Query with composite index (isActive + createdAt). Falls back to simple
    // query without orderBy if the index isn't built yet.
    let items: FirebaseFirestore.DocumentData[] = [];
    try {
      const itemsSnap = await adminDb
        .collection('teams').doc(teamId)
        .collection('paymentItems')
        .where('isActive', '==', true)
        .orderBy('createdAt', 'desc')
        .get();
      items = itemsSnap.docs.map(d => d.data());
    } catch (indexErr: any) {
      if (indexErr.code === 9 || indexErr.message?.includes('index')) {
        // Index not yet built — fall back to unordered query
        console.warn('[stripe/payment-items GET] Index not ready, falling back:', indexErr.message?.slice(0, 120));
        const fallbackSnap = await adminDb
          .collection('teams').doc(teamId)
          .collection('paymentItems')
          .where('isActive', '==', true)
          .get();
        items = fallbackSnap.docs.map(d => d.data())
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      } else {
        throw indexErr;
      }
    }

    return NextResponse.json({ items });
  } catch (err: any) {
    console.error('[stripe/payment-items GET] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


// ── DELETE — deactivate a payment item ───────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'stripe-payment-item-delete', 40, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const { userId, teamId, itemId } = body;

    if (typeof userId !== 'string' || !userId || typeof teamId !== 'string' || !teamId || teamId.includes('/') || typeof itemId !== 'string' || !itemId || itemId.includes('/')) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    if (auth.uid !== userId) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

    const access = await getTeamFinanceAccess(
      userId,
      teamId,
      auth.role === 'superadmin',
      false
    );
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const itemRef = adminDb.collection('teams').doc(teamId).collection('paymentItems').doc(itemId);
    const itemSnap = await itemRef.get();
    if (!itemSnap.exists) return NextResponse.json({ error: 'Payment item not found.' }, { status: 404 });

    const itemData = itemSnap.data()!;
    // Use the stored stripe account id (could be hub or per-squad)
    const connectAccountId: string | null = itemData.stripeAccountId ?? null;

    // Deactivate the Stripe Payment Link (if we have a connected account)
    if (connectAccountId && itemData.stripePaymentLinkId) {
      try {
        const stripe = getStripe();
        await stripe.paymentLinks.update(
          itemData.stripePaymentLinkId,
          { active: false },
          { stripeAccount: connectAccountId }
        );
      } catch (stripeErr: any) {
        console.warn('[stripe/payment-items DELETE] Stripe deactivation warning:', stripeErr.message);
      }
    }

    await itemRef.update({ isActive: false, updatedAt: new Date().toISOString() });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof RequestBodyError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[stripe/payment-items DELETE] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
