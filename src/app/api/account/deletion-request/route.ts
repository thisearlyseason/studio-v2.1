import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { AccountDeletionError, createAccountDeletionActions } from '@/lib/server-account-deletion';

const RECENT_SIGN_IN_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.authTime || Date.now() - auth.authTime * 1000 > RECENT_SIGN_IN_MS) {
    return NextResponse.json({ error: 'For security, sign out and back in immediately before scheduling account deletion.' }, { status: 401 });
  }
  try {
    const actions = createAccountDeletionActions(adminDb, admin.auth());
    await actions.eligible(auth.uid);
    // Store-only addition. The normal website's existing deletion path is unchanged.
    if (process.env.NEXT_PUBLIC_APP_DISTRIBUTION === 'store') {
      const record = await admin.auth().getUser(auth.uid);
      if (record.providerData.some(provider => provider.providerId === 'apple.com')) {
        return NextResponse.json({ code: 'apple_confirmation_required', error: 'Confirm with Apple before deleting this account.' }, { status: 409 });
      }
    }
    return NextResponse.json({ success: true, purgeAt: await actions.schedule(auth.uid) });
  } catch (error) {
    if (error instanceof AccountDeletionError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[account/deletion-request] Unable to schedule account deletion.');
    return NextResponse.json({ error: 'Unable to schedule account deletion. Please try again.' }, { status: 500 });
  }
}
