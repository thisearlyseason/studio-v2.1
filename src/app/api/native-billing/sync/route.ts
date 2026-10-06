import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, assertNonAnonymous } from '@/lib/api-auth';
import { enforceUserRateLimit, readJsonBodyWithLimit } from '@/lib/server-request-guards';
import { syncNativeBilling } from '@/lib/native-billing/server';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req); if (auth instanceof NextResponse) return auth;
  const anonymous = assertNonAnonymous(auth); if (anonymous) return anonymous;
  const rate = await enforceUserRateLimit(auth.uid,'native-billing-sync',30,60_000); if(rate) return rate;
  try {
    const {teamId} = await readJsonBodyWithLimit<{teamId?:unknown}>(req,2048);
    if (teamId !== undefined && (typeof teamId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(teamId))) return NextResponse.json({error:'Invalid team'},{status:400});
    return NextResponse.json(await syncNativeBilling(auth.uid, teamId as string | undefined),{headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({error:'Your purchase could not be verified yet. Try Restore purchases again shortly.'},{status:503}); }
}
