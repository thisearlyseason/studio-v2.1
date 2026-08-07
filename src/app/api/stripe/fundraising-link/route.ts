import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe-client';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { isActiveTeamMembership } from '@/lib/team-membership-security';

/**
 * POST /api/stripe/fundraising-link
 *
 * Creates a Stripe Payment Link with a custom (donor-set) amount for a
 * fundraising campaign. Uses Stripe's `custom_unit_amount` feature so donors
 * can enter any amount they wish.
 *
 * The link is saved to the campaign doc:
 *   teams/{teamId}/fundraising/{campaignId}.stripePaymentLinkUrl
 *
 * Body: { userId, teamId, campaignId, campaignTitle, campaignDescription? }
 *
 * Returns: { paymentLinkUrl, paymentLinkId }
 */

const PAID_PLAN_TYPES = new Set(['team', 'elite', 'league', 'school', 'squad_pro', 'squad_pro_demo']);

async function resolveConnectAccount(teamId: string): Promise<string | null> {
  const teamSnap = await adminDb.collection('teams').doc(teamId).get();
  const teamData = teamSnap.data();

  const hubTeamId: string | null = teamData?.schoolId || teamData?.clubId || null;
  if (hubTeamId) {
    const hubSnap = await adminDb.collection('teams').doc(hubTeamId).get();
    const hubData = hubSnap.data();
    if (hubData?.stripeConnectMode === 'shared' && hubData?.stripeConnectAccountId) {
      return hubData.stripeConnectAccountId;
    }
  }

  // Standalone/per-squad payments always belong to the team owner, even when
  // another authorized team admin creates the link.
  const ownerUserId = teamData?.ownerUserId;
  if (typeof ownerUserId !== 'string' || !ownerUserId) return null;
  const userSnap = await adminDb.collection('users').doc(ownerUserId).get();
  return userSnap.data()?.stripe_connect_account_id ?? null;
}

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'stripe-fundraising-link', 30, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 16_000);
    const { userId, teamId, campaignId, campaignTitle, campaignDescription } = body;

    if (
      typeof userId !== 'string' || !userId ||
      typeof teamId !== 'string' || !teamId || teamId.includes('/') ||
      typeof campaignId !== 'string' || !campaignId || campaignId.includes('/') ||
      typeof campaignTitle !== 'string' || !campaignTitle.trim()
    ) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, teamId, campaignId, campaignTitle.' },
        { status: 400 }
      );
    }
    if (campaignTitle.length > 200 || (campaignDescription != null && (typeof campaignDescription !== 'string' || campaignDescription.length > 2_000))) {
      return NextResponse.json({ error: 'Campaign title or description is too long.' }, { status: 400 });
    }

    if (auth.uid !== userId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    // Caller identity is checked here; the team entitlement is checked below.
    const userSnap = await adminDb.collection('users').doc(userId).get();
    if (!userSnap.exists) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    const userData = userSnap.data()!;
    const isSuperAdmin = userData.role === 'superadmin';

    // Verify team access
    const teamSnap = await adminDb.collection('teams').doc(teamId).get();
    if (!teamSnap.exists) return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    const teamData = teamSnap.data()!;
    const ownerSnap = await adminDb.collection('users').doc(teamData.ownerUserId || '__missing__').get();
    const teamHasPaidPlan = PAID_PLAN_TYPES.has(teamData.planId || teamData.plan_type || '') ||
      PAID_PLAN_TYPES.has(ownerSnap.data()?.plan_type || '');
    if (!teamHasPaidPlan && !isSuperAdmin) {
      return NextResponse.json({ error: 'Online payments require a paid team plan.' }, { status: 403 });
    }
    const isOwner = teamData.ownerUserId === userId;
    const memberSnap = await adminDb.collection('teams').doc(teamId).collection('members').doc(userId).get();
    const isAdmin = memberSnap.exists && isActiveTeamMembership(memberSnap.data()) && memberSnap.data()?.role === 'Admin';
    if (!isOwner && !isAdmin && !isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden: must be team owner or admin.' }, { status: 403 });
    }

    // Verify the campaign exists
    const campaignRef = adminDb.collection('teams').doc(teamId).collection('fundraising').doc(campaignId);
    const campaignSnap = await campaignRef.get();
    if (!campaignSnap.exists) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }
    const campaignData = campaignSnap.data()!;

    // Resolve Stripe account (hub shared or per-squad)
    const connectAccountId = await resolveConnectAccount(teamId);
    if (!connectAccountId) {
      return NextResponse.json(
        { error: 'No Stripe account connected. Connect Stripe from the Finance tab first.' },
        { status: 400 }
      );
    }
    if (
      campaignData.stripeEnabled === true &&
      typeof campaignData.stripePaymentLinkUrl === 'string' &&
      typeof campaignData.stripePaymentLinkId === 'string' &&
      campaignData.stripeConnectAccountId === connectAccountId
    ) {
      return NextResponse.json({
        paymentLinkUrl: campaignData.stripePaymentLinkUrl,
        paymentLinkId: campaignData.stripePaymentLinkId,
        alreadyExists: true,
      });
    }

    const stripe = getStripe();
    const teamName = teamData.name || teamData.teamName || 'the team';
    const storedTitle = typeof campaignData.title === 'string' && campaignData.title.trim()
      ? campaignData.title.trim()
      : campaignTitle.trim();
    const storedDescription = typeof campaignData.description === 'string' && campaignData.description.trim()
      ? campaignData.description.trim()
      : typeof campaignDescription === 'string' ? campaignDescription.trim() : '';

    // 1. Create a Product for the fundraising campaign
    const product = await stripe.products.create(
      {
        name: storedTitle,
        description: storedDescription
          ? storedDescription
          : `Fundraising campaign for ${teamName}`,
        metadata: {
          firebase_team_id: teamId,
          firebase_campaign_id: campaignId,
          firebase_user_id: userId,
          type: 'fundraising',
        },
      },
      { stripeAccount: connectAccountId }
    );

    // 2. Create a Price with custom_unit_amount (donor sets their own amount)
    const price = await stripe.prices.create(
      {
        product: product.id,
        currency: 'usd',
        custom_unit_amount: {
          enabled: true,
          minimum: 100,   // $1.00 minimum
          preset: 2500,   // $25.00 suggested default
          maximum: 10_000_000, // $100,000 fraud/entry guard
        },
      },
      { stripeAccount: connectAccountId }
    );

    // 3. Create the Payment Link
    const paymentLink = await stripe.paymentLinks.create(
      {
        line_items: [{ price: price.id, quantity: 1 }],
        after_completion: {
          type: 'hosted_confirmation',
          hosted_confirmation: {
            custom_message: `Thank you for supporting ${teamName}! Your donation means a lot to us.`,
          },
        },
        metadata: {
          firebase_team_id: teamId,
          firebase_campaign_id: campaignId,
          payment_item_category: 'donation',
          type: 'fundraising',
        },
        invoice_creation: { enabled: true },
      },
      { stripeAccount: connectAccountId }
    );

    // 4. Save the payment link to the campaign document
    await campaignRef.update({
      stripePaymentLinkUrl: paymentLink.url,
      stripePaymentLinkId: paymentLink.id,
      stripeProductId: product.id,
      stripePriceId: price.id,
      stripeConnectAccountId: connectAccountId,
      stripeEnabled: true,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      paymentLinkUrl: paymentLink.url,
      paymentLinkId: paymentLink.id,
    }, { status: 201 });
  } catch (err: any) {
    if (err instanceof RequestBodyError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[stripe/fundraising-link POST] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/stripe/fundraising-link
 * Deactivates the Payment Link for a fundraising campaign.
 * Body: { userId, teamId, campaignId }
 */
export async function DELETE(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'stripe-fundraising-delete', 30, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const { userId, teamId, campaignId } = body;

    if (typeof userId !== 'string' || !userId || typeof teamId !== 'string' || !teamId || teamId.includes('/') || typeof campaignId !== 'string' || !campaignId || campaignId.includes('/')) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }
    if (auth.uid !== userId) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

    const teamSnap = await adminDb.collection('teams').doc(teamId).get();
    if (!teamSnap.exists) return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    const isOwner = teamSnap.data()!.ownerUserId === userId;
    const memberSnap = await adminDb.collection('teams').doc(teamId).collection('members').doc(userId).get();
    const isAdmin = memberSnap.exists && isActiveTeamMembership(memberSnap.data()) && memberSnap.data()?.role === 'Admin';
    const userSnap = await adminDb.collection('users').doc(userId).get();
    const isSuperAdmin = userSnap.data()?.role === 'superadmin';
    if (!isOwner && !isAdmin && !isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const campaignRef = adminDb.collection('teams').doc(teamId).collection('fundraising').doc(campaignId);
    const campaignSnap = await campaignRef.get();
    if (!campaignSnap.exists) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });

    const data = campaignSnap.data()!;
    if (data.stripePaymentLinkId && data.stripeConnectAccountId) {
      try {
        const stripe = getStripe();
        await stripe.paymentLinks.update(
          data.stripePaymentLinkId,
          { active: false },
          { stripeAccount: data.stripeConnectAccountId }
        );
      } catch (err: any) {
        console.warn('[stripe/fundraising-link DELETE] Stripe warning:', err.message);
      }
    }

    await campaignRef.update({
      stripeEnabled: false,
      stripePaymentLinkUrl: null,
      stripePaymentLinkId: null,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof RequestBodyError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[stripe/fundraising-link DELETE] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
