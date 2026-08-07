import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_SIGN_IN_MS = 5 * 60 * 1000;

/**
 * Queues a live account for deletion instead of allowing the browser to delete
 * its own Auth/profile records immediately. Accounts that own organizations
 * must be transferred or removed first so this flow cannot orphan team or
 * league data.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  if (!auth.authTime || Date.now() - auth.authTime * 1000 > RECENT_SIGN_IN_MS) {
    return NextResponse.json({
      error: 'For security, sign out and back in immediately before scheduling account deletion.',
    }, { status: 401 });
  }

  try {
    const userRef = adminDb.collection('users').doc(auth.uid);
    const [userSnap, ownedTeams, ownedLeagues] = await Promise.all([
      userRef.get(),
      adminDb.collection('teams').where('ownerUserId', '==', auth.uid).limit(1).get(),
      adminDb.collection('leagues').where('creatorId', '==', auth.uid).limit(1).get(),
    ]);

    if (userSnap.data()?.isDemo === true) {
      return NextResponse.json({ error: 'Demo accounts reset automatically and cannot be queued for live-account deletion.' }, { status: 400 });
    }
    if (!ownedTeams.empty || !ownedLeagues.empty) {
      return NextResponse.json({
        error: 'Transfer or delete every team and league you own before deleting this account. This prevents orphaned organization data.',
      }, { status: 409 });
    }

    const now = Date.now();
    const purgeAt = admin.firestore.Timestamp.fromMillis(now + RETENTION_MS);
    const requestedAt = admin.firestore.Timestamp.fromMillis(now);
    const requestRef = adminDb.collection('accountDeletionRequests').doc(auth.uid);
    const effectivePurgeAt = await adminDb.runTransaction(async (transaction) => {
      const existing = await transaction.get(requestRef);
      const existingData = existing.data();
      const existingPurgeAt = existingData?.purgeAt;
      if (
        existingData?.status === 'pending' &&
        existingPurgeAt instanceof admin.firestore.Timestamp
      ) {
        transaction.set(userRef, {
          deletionRequestedAt: existingData.requestedAt ?? requestedAt,
          deletionPurgeAt: existingPurgeAt,
          deletionStatus: 'pending',
        }, { merge: true });
        return existingPurgeAt;
      }

      transaction.set(requestRef, { uid: auth.uid, requestedAt, purgeAt, status: 'pending' });
      transaction.set(userRef, {
        deletionRequestedAt: requestedAt,
        deletionPurgeAt: purgeAt,
        deletionStatus: 'pending',
      }, { merge: true });
      return purgeAt;
    });

    // Retain the records for seven days, but immediately revoke application
    // access so a deletion-pending account cannot continue using team data.
    await admin.auth().revokeRefreshTokens(auth.uid);
    await admin.auth().updateUser(auth.uid, { disabled: true });

    return NextResponse.json({
      success: true,
      purgeAt: effectivePurgeAt.toDate().toISOString(),
    });
  } catch (err: any) {
    console.error('[account/deletion-request] Error:', err.message);
    return NextResponse.json({ error: 'Unable to schedule account deletion. Please try again.' }, { status: 500 });
  }
}
