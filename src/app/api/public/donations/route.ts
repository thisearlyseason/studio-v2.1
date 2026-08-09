import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

function safeExternalUrl(value: unknown) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
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

export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use /api/public/fundraising.' },
    { status: 410 }
  );
}
