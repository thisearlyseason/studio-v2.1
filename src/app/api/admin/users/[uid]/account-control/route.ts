import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

type AccountAction = 'suspend' | 'restore' | 'schedule_deletion' | 'cancel_deletion';

function isActiveSubscription(profile: FirebaseFirestore.DocumentData): boolean {
  const status = String(
    profile.subscriptionStatus ??
    profile.subscription_status ??
    profile.stripe_subscription_status ??
    '',
  ).toLowerCase();
  if (['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(status)) return true;
  if (['canceled', 'cancelled', 'ended', 'inactive'].includes(status)) return false;
  return Boolean(profile.stripe_subscription_id || profile.stripeSubscriptionId);
}

async function writeAuditLog(input: {
  action: AccountAction;
  actorUid: string;
  actorEmail?: string;
  targetUid: string;
  targetEmail?: string;
  purgeAt?: admin.firestore.Timestamp;
}) {
  await adminDb.collection('adminAuditLogs').add({
    category: 'account_control',
    action: input.action,
    actorUid: input.actorUid,
    actorEmail: input.actorEmail ?? null,
    targetUid: input.targetUid,
    targetEmail: input.targetEmail ?? null,
    purgeAt: input.purgeAt ?? null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function findOwnedOrganizations(uid: string): Promise<string[]> {
  const [teams, createdLeagues, ownedLeagues] = await Promise.all([
    adminDb.collection('teams').where('ownerUserId', '==', uid).limit(1).get(),
    adminDb.collection('leagues').where('creatorId', '==', uid).limit(1).get(),
    adminDb.collection('leagues').where('ownerUserId', '==', uid).limit(1).get(),
  ]);
  return [
    ...(!teams.empty ? ['squad, club, or school'] : []),
    ...(!createdLeagues.empty || !ownedLeagues.empty ? ['league or tournament organization'] : []),
  ];
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ uid: string }> },
) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== 'superadmin') {
    return NextResponse.json({ error: 'Super Admin access is required.' }, { status: 403 });
  }

  const { uid } = await context.params;
  if (!UID_PATTERN.test(uid)) {
    return NextResponse.json({ error: 'A valid user ID is required.' }, { status: 400 });
  }
  if (uid === auth.uid) {
    return NextResponse.json({ error: 'You cannot suspend or delete your own Super Admin account.' }, { status: 400 });
  }

  try {
    const body = await readJsonBodyWithLimit<{ action?: unknown; confirmationEmail?: unknown }>(request, 4_000);
    const action = body.action as AccountAction;
    if (!['suspend', 'restore', 'schedule_deletion', 'cancel_deletion'].includes(action)) {
      return NextResponse.json({ error: 'A valid account action is required.' }, { status: 400 });
    }

    const userRef = adminDb.collection('users').doc(uid);
    const deletionRef = adminDb.collection('accountDeletionRequests').doc(uid);
    const [profileSnapshot, authUser, deletionSnapshot] = await Promise.all([
      userRef.get(),
      admin.auth().getUser(uid),
      deletionRef.get(),
    ]);
    if (!profileSnapshot.exists) {
      return NextResponse.json({ error: 'The user profile no longer exists.' }, { status: 404 });
    }

    const profile = profileSnapshot.data() ?? {};
    const targetEmail = String(profile.email ?? authUser.email ?? '').trim().toLowerCase();
    const profileRole = String(profile.role ?? '').toLowerCase();
    const authRole = String(authUser.customClaims?.role ?? '').toLowerCase();
    if (profileRole === 'superadmin' || authRole === 'superadmin') {
      return NextResponse.json({ error: 'Super Admin accounts cannot be changed from the Users Directory.' }, { status: 403 });
    }
    if (profile.isDemo === true) {
      return NextResponse.json({ error: 'Demo accounts reset automatically and cannot enter the live-account deletion workflow.' }, { status: 400 });
    }

    if (action === 'suspend') {
      if (deletionSnapshot.data()?.status === 'pending') {
        return NextResponse.json({ error: 'This account is already pending deletion. Cancel deletion to restore it.' }, { status: 409 });
      }
      await admin.auth().revokeRefreshTokens(uid);
      await admin.auth().updateUser(uid, { disabled: true });
      await userRef.set({
        accountStatus: 'suspended',
        suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
        suspendedBy: auth.uid,
      }, { merge: true });
      await writeAuditLog({ action, actorUid: auth.uid, actorEmail: auth.email, targetUid: uid, targetEmail });
      return NextResponse.json({ success: true, status: 'suspended' });
    }

    if (action === 'restore') {
      if (deletionSnapshot.data()?.status === 'pending') {
        return NextResponse.json({ error: 'Use Cancel Deletion to restore an account pending deletion.' }, { status: 409 });
      }
      await admin.auth().updateUser(uid, { disabled: false });
      await admin.auth().revokeRefreshTokens(uid);
      await userRef.set({
        accountStatus: 'active',
        suspendedAt: admin.firestore.FieldValue.delete(),
        suspendedBy: admin.firestore.FieldValue.delete(),
      }, { merge: true });
      await writeAuditLog({ action, actorUid: auth.uid, actorEmail: auth.email, targetUid: uid, targetEmail });
      return NextResponse.json({ success: true, status: 'active' });
    }

    if (action === 'cancel_deletion') {
      if (deletionSnapshot.data()?.status !== 'pending') {
        return NextResponse.json({ error: 'This account does not have a pending deletion request.' }, { status: 409 });
      }
      await admin.auth().updateUser(uid, { disabled: false });
      await admin.auth().revokeRefreshTokens(uid);
      await adminDb.runTransaction(async transaction => {
        transaction.delete(deletionRef);
        transaction.set(userRef, {
          accountStatus: 'active',
          deletionStatus: admin.firestore.FieldValue.delete(),
          deletionRequestedAt: admin.firestore.FieldValue.delete(),
          deletionPurgeAt: admin.firestore.FieldValue.delete(),
          deletionRequestedBy: admin.firestore.FieldValue.delete(),
        }, { merge: true });
      });
      await writeAuditLog({ action, actorUid: auth.uid, actorEmail: auth.email, targetUid: uid, targetEmail });
      return NextResponse.json({ success: true, status: 'active' });
    }

    const confirmationEmail = String(body.confirmationEmail ?? '').trim().toLowerCase();
    if (!targetEmail || confirmationEmail !== targetEmail) {
      return NextResponse.json({ error: 'Enter the account email exactly to confirm deletion.' }, { status: 400 });
    }
    if (isActiveSubscription(profile)) {
      return NextResponse.json({
        error: 'Cancel or resolve the active Stripe subscription before scheduling account deletion.',
      }, { status: 409 });
    }

    const ownedOrganizations = await findOwnedOrganizations(uid);
    if (ownedOrganizations.length) {
      return NextResponse.json({
        error: `Transfer or delete the user’s ${ownedOrganizations.join(' and ')} before deleting this account.`,
      }, { status: 409 });
    }

    const existingDeletion = deletionSnapshot.data();
    let purgeAt: admin.firestore.Timestamp;
    if (existingDeletion?.status === 'pending' && existingDeletion.purgeAt instanceof admin.firestore.Timestamp) {
      purgeAt = existingDeletion.purgeAt;
    } else {
      const now = admin.firestore.Timestamp.now();
      purgeAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + RETENTION_MS);
      await adminDb.runTransaction(async transaction => {
        transaction.set(deletionRef, {
          uid,
          requestedAt: now,
          purgeAt,
          status: 'pending',
          requestedBy: auth.uid,
          requestSource: 'superadmin',
        });
        transaction.set(userRef, {
          accountStatus: 'pending_deletion',
          deletionStatus: 'pending',
          deletionRequestedAt: now,
          deletionPurgeAt: purgeAt,
          deletionRequestedBy: auth.uid,
        }, { merge: true });
      });
    }

    await admin.auth().revokeRefreshTokens(uid);
    await admin.auth().updateUser(uid, { disabled: true });
    await writeAuditLog({
      action,
      actorUid: auth.uid,
      actorEmail: auth.email,
      targetUid: uid,
      targetEmail,
      purgeAt,
    });
    return NextResponse.json({
      success: true,
      status: 'pending_deletion',
      purgeAt: purgeAt.toDate().toISOString(),
    });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if ((error as { code?: string }).code === 'auth/user-not-found') {
      return NextResponse.json({ error: 'The Firebase Authentication account no longer exists.' }, { status: 404 });
    }
    console.error('[Admin Account Control] Failed:', error);
    return NextResponse.json({ error: 'Unable to update this account safely.' }, { status: 500 });
  }
}
