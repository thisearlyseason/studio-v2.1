import { NextRequest, NextResponse } from 'next/server';
import { readJsonBodyWithLimit } from '@/lib/server-request-guards';
import { syncNativeBilling, validWebhookAuthorization } from '@/lib/native-billing/server';
import { adminDb } from '@/lib/firebase-admin';
import { isAccountAccessBlocked } from '@/lib/account-access-policy';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  if (!validWebhookAuthorization(req.headers.get('authorization'))) return new NextResponse(null,{status:401});
  try {
    const body = await readJsonBodyWithLimit<{event?:{type?:string;app_user_id?:string;transferred_from?:string[];transferred_to?:string[]}}>(req,64000);
    if (body.event?.type === 'TEST') return NextResponse.json({received:true});
    const ids = body.event?.type === 'TRANSFER'
      ? [...(body.event.transferred_from || []),...(body.event.transferred_to || [])]
      : [body.event?.app_user_id];
    const users = [...new Set(ids)].filter((id):id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id));
    if (!users.length || users.length > 20) return new NextResponse(null,{status:400});
    // Re-read provider state instead of trusting event order or granting from payloads.
    // Replays and late renewals/expirations are safe; failures return 503 for retry.
    for (const uid of users) {
      const user = (await adminDb.collection('users').doc(uid).get()).data();
      // Deleted users and anonymous RevenueCat IDs must never recreate accounts.
      if (!user || user.isDemo || isAccountAccessBlocked(user)) continue;
      await syncNativeBilling(uid);
    }
    return NextResponse.json({received:true});
  } catch { return new NextResponse(null,{status:503}); }
}
