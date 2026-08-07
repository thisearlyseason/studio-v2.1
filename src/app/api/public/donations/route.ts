import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const METHODS = new Set(['external', 'etransfer', 'e-transfer']);

function safeExternalUrl(value: unknown) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function requestKey(req: NextRequest, suffix: string) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return `${(forwarded || 'local').slice(0, 100)}:${suffix}`;
}

function activeCampaign(data: FirebaseFirestore.DocumentData | undefined) {
  if (!data || data.isShareable !== true || data.status === 'closed') return false;
  const deadline = new Date(data.deadline);
  return !Number.isNaN(deadline.getTime()) && deadline.getTime() >= Date.now();
}

function publicCampaign(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    title: String(data.title || 'Fundraising Campaign'),
    description: String(data.description || ''),
    goalAmount: Math.max(0, Number(data.goalAmount || 0)),
    currentAmount: Math.max(0, Number(data.currentAmount || 0)),
    deadline: data.deadline,
    isShareable: true,
    externalLink: safeExternalUrl(data.externalLink),
    eTransferDetails: String(data.eTransferDetails || '').slice(0, 2_000),
  };
}

export async function GET(req: NextRequest) {
  try {
    const teamId = req.nextUrl.searchParams.get('teamId') || '';
    const fundId = req.nextUrl.searchParams.get('fundId') || '';
    if (!ID_PATTERN.test(teamId) || !ID_PATTERN.test(fundId)) {
      return NextResponse.json({ error: 'Invalid donation link.' }, { status: 400 });
    }
    const snapshot = await adminDb.collection('teams').doc(teamId).collection('fundraising').doc(fundId).get();
    if (!snapshot.exists || !activeCampaign(snapshot.data())) {
      return NextResponse.json({ error: 'Campaign not found or inactive.' }, { status: 404 });
    }
    return NextResponse.json({ data: publicCampaign(snapshot.id, snapshot.data()!) });
  } catch (error) {
    console.error('[public/donations] Read error:', error);
    return NextResponse.json({ error: 'Donation portal is temporarily unavailable.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const teamId = String(body.teamId || '').trim();
    const fundId = String(body.fundId || '').trim();
    const donorName = String(body.donorName || '').trim().slice(0, 120);
    const method = String(body.method || '').trim().toLowerCase();
    const amount = Number(body.amount);
    if (!ID_PATTERN.test(teamId) || !ID_PATTERN.test(fundId) || donorName.length < 2 ||
        !METHODS.has(method) || !Number.isFinite(amount) || amount < 1 || amount > 1_000_000) {
      return NextResponse.json({ error: 'A valid donor, amount, and payment method are required.' }, { status: 400 });
    }

    const limited = await enforceUserRateLimit(
      requestKey(req, `${teamId}:${fundId}`),
      'public-donation',
      20,
      60 * 60 * 1000,
    );
    if (limited) return limited;

    const campaignRef = adminDb.collection('teams').doc(teamId).collection('fundraising').doc(fundId);
    const campaign = await campaignRef.get();
    if (!campaign.exists || !activeCampaign(campaign.data())) {
      return NextResponse.json({ error: 'Campaign not found or inactive.' }, { status: 404 });
    }
    const donationId = `don_${randomUUID()}`;
    await campaignRef.collection('donations').doc(donationId).set({
      id: donationId,
      donorName,
      amount: Math.round(amount * 100) / 100,
      method: method === 'e-transfer' ? 'etransfer' : method,
      status: 'pending',
      createdAt: new Date().toISOString(),
      source: 'public-portal',
    });
    return NextResponse.json({
      success: true,
      redirectUrl: method === 'external' ? safeExternalUrl(campaign.data()?.externalLink) : null,
    });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[public/donations] Submission error:', error);
    return NextResponse.json({ error: 'Donation intent could not be recorded.' }, { status: 500 });
  }
}
