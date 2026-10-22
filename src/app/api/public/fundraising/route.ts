import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import {
  enforcePublicRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';
import { validFirestoreDocumentId } from '@/lib/firestore-document-id';

const MAX_DONATION = 100_000;
const MAX_NAME_LENGTH = 120;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const RELATIONSHIPS = new Set(['parent', 'family_member', 'friend', 'other']);

function cleanId(value: string | null): string | null {
  return validFirestoreDocumentId(value);
}

function publicCampaign(data: Record<string, any>, id: string) {
  return {
    id,
    title: typeof data.title === 'string' ? data.title : 'Fundraising Campaign',
    description: typeof data.description === 'string' ? data.description : '',
    goalAmount: Number(data.goalAmount) || 0,
    currentAmount: Number(data.currentAmount) || 0,
    deadline: typeof data.deadline === 'string' ? data.deadline : '',
    externalLink: typeof data.externalLink === 'string' ? data.externalLink : '',
    eTransferDetails:
      typeof data.eTransferDetails === 'string' ? data.eTransferDetails : '',
    isShareable: data.isShareable === true,
  };
}

function campaignIsOpen(data: Record<string, any>): boolean {
  if (data.isShareable !== true) return false;
  if (typeof data.deadline !== 'string' || !data.deadline) return true;
  const deadline = new Date(data.deadline);
  return !Number.isNaN(deadline.getTime()) && deadline.getTime() >= Date.now();
}

async function getCampaign(req: NextRequest) {
  const teamId = cleanId(req.nextUrl.searchParams.get('teamId'));
  const fundId = cleanId(req.nextUrl.searchParams.get('fundId'));
  if (!teamId || !fundId) return null;

  const ref = adminDb
    .collection('teams')
    .doc(teamId)
    .collection('fundraising')
    .doc(fundId);
  const snapshot = await ref.get();
  if (!snapshot.exists || !campaignIsOpen(snapshot.data() || {})) return null;
  return { ref, snapshot, teamId, fundId };
}

export async function GET(req: NextRequest) {
  try {
    const rateLimit = await enforcePublicRateLimit(
      req,
      'fundraising-read',
      60,
      10 * 60 * 1000,
      `${req.nextUrl.searchParams.get('teamId') || ''}:${req.nextUrl.searchParams.get('fundId') || ''}`
    );
    if (rateLimit) return rateLimit;
    const campaign = await getCampaign(req);
    if (!campaign) {
      return NextResponse.json(
        { error: 'This fundraising campaign is unavailable.' },
        { status: 404 }
      );
    }
    return NextResponse.json({
      campaign: publicCampaign(campaign.snapshot.data() || {}, campaign.fundId),
    });
  } catch (error: any) {
    console.error('[public/fundraising GET] Error:', error?.message || error);
    return NextResponse.json(
      { error: 'Unable to load this fundraising campaign.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const rateLimit = await enforcePublicRateLimit(
      req,
      'fundraising-submit',
      10,
      60 * 60 * 1000,
      `${req.nextUrl.searchParams.get('teamId') || ''}:${req.nextUrl.searchParams.get('fundId') || ''}`
    );
    if (rateLimit) return rateLimit;
    const campaign = await getCampaign(req);
    if (!campaign) {
      return NextResponse.json(
        { error: 'This fundraising campaign is unavailable.' },
        { status: 404 }
      );
    }

    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 16_000);
    const donorName =
      typeof body.donorName === 'string'
        ? body.donorName.trim().slice(0, MAX_NAME_LENGTH)
        : '';
    const amount = Number(body.amount);
    const method = body.method;
    const donorEmail =
      typeof body.donorEmail === 'string' ? body.donorEmail.trim().toLowerCase().slice(0, 254) : '';
    const donorPhone =
      typeof body.donorPhone === 'string' ? body.donorPhone.trim().slice(0, 40) : '';
    const relationship = typeof body.relationship === 'string' ? body.relationship : '';
    const idempotencyKey = req.headers.get('idempotency-key') || '';

    if (donorName.length < 2) {
      return NextResponse.json({ error: 'Enter a valid donor name.' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donorEmail) || donorPhone.length < 7) {
      return NextResponse.json({ error: 'Enter a valid email address and phone number.' }, { status: 400 });
    }
    if (!RELATIONSHIPS.has(relationship)) {
      return NextResponse.json({ error: 'Select how you are connected to the participant.' }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount < 0.01 || amount > MAX_DONATION) {
      return NextResponse.json(
        { error: `Donation amount must be between $0.01 and $${MAX_DONATION.toLocaleString()}.` },
        { status: 400 }
      );
    }
    if (method !== 'external' && method !== 'etransfer') {
      return NextResponse.json({ error: 'Invalid donation method.' }, { status: 400 });
    }
    if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
      return NextResponse.json(
        { error: 'A valid submission key is required.' },
        { status: 400 }
      );
    }

    const donationId = createHash('sha256')
      .update(`${campaign.teamId}:${campaign.fundId}:${idempotencyKey}`)
      .digest('hex');
    const donationRef = campaign.ref.collection('donations').doc(donationId);

    try {
      await donationRef.create({
        id: donationId,
        donorName,
        donorEmail,
        donorPhone,
        relationship,
        amount: Math.round(amount * 100) / 100,
        method,
        status: 'pending',
        source: 'public_portal',
        createdAt: new Date().toISOString(),
      });
    } catch (error: any) {
      if (error?.code !== 6 && error?.code !== 'already-exists') throw error;
    }

    return NextResponse.json({ ok: true, donationId });
  } catch (error: any) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[public/fundraising POST] Error:', error?.message || error);
    return NextResponse.json(
      { error: 'Unable to record this donation intent.' },
      { status: 500 }
    );
  }
}
