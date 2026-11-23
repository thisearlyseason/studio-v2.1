import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { getTeamAuthority } from '@/lib/server-team-access';

export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.teamId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(body.teamId) ||
      !Array.isArray(body.order) || body.order.length > 50 ||
      !body.order.every((href: unknown) => typeof href === 'string' && /^\/[a-z0-9-]{1,80}$/.test(href)) ||
      new Set(body.order).size !== body.order.length) return NextResponse.json({error:'Invalid tool order.'},{status:400});
  const authority = await getTeamAuthority(body.teamId, auth.uid, auth.role);
  if (!authority?.isStaff) return NextResponse.json({error:'Team staff access required.'},{status:403});
  await adminDb.collection('users').doc(auth.uid).set({sidebarOrder:{[body.teamId]:body.order}}, {merge:true});
  return NextResponse.json({ok:true});
}
