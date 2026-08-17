import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { isActiveTeamMembership } from '@/lib/team-membership-security';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'sign-team-waiver', 40, 60 * 60 * 1000);
    if (limited) return limited;

    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const teamId = String(body.teamId || '').trim();
    const memberId = String(body.memberId || '').trim();
    const documentId = String(body.documentId || '').trim();
    const signatureName = String(body.signatureName || '').trim().slice(0, 150);
    if (!ID_PATTERN.test(teamId) || !ID_PATTERN.test(memberId) || !ID_PATTERN.test(documentId) ||
        signatureName.length < 2) {
      return NextResponse.json({ error: 'A valid waiver, participant, and signature are required.' }, { status: 400 });
    }

    const teamRef = adminDb.collection('teams').doc(teamId);
    const memberRef = teamRef.collection('members').doc(memberId);
    const documentRef = teamRef.collection('documents').doc(documentId);
    const [team, member, waiver] = await Promise.all([
      teamRef.get(),
      memberRef.get(),
      documentRef.get(),
    ]);
    if (!team.exists || !member.exists || !isActiveTeamMembership(member.data())) {
      return NextResponse.json({ error: 'Squad participant not found.' }, { status: 404 });
    }
    const waiverData = waiver.data() || {};
    if (!waiver.exists || waiverData.type !== 'waiver' || waiverData.isActive !== true) {
      return NextResponse.json({ error: 'Waiver not found or inactive.' }, { status: 404 });
    }

    const memberData = member.data() || {};
    const playerId = String(memberData.playerId || memberId);
    const player = await adminDb.collection('players').doc(playerId).get();
    const playerData = player.data() || {};
    const isSelf = memberId === auth.uid || memberData.userId === auth.uid;
    const isGuardian = memberData.parentId === auth.uid || playerData.parentId === auth.uid ||
      (Array.isArray(memberData.guardianIds) && memberData.guardianIds.includes(auth.uid)) ||
      (Array.isArray(playerData.guardianIds) && playerData.guardianIds.includes(auth.uid));
    if (!isSelf && !isGuardian) {
      return NextResponse.json({ error: 'You can only sign for yourself or your linked athlete.' }, { status: 403 });
    }

    const signatureRef = memberRef.collection('signatures').doc(documentId);
    const archiveRef = teamRef.collection('archived_waivers').doc(`arch_team_${memberId}_${documentId}`);
    const protocolRef = teamRef.collection('protocol_signatures').doc(`${documentId}_${auth.uid}_${memberId}`);
    const certificateRef = teamRef.collection('files').doc(`cert_${memberId}_${documentId}`);
    const signedAt = new Date().toISOString();
    const memberName = memberData.name || [playerData.firstName, playerData.lastName].filter(Boolean).join(' ') || 'Participant';
    const signedByParent = isGuardian && !isSelf;
    const waiverType = documentId === 'default_medical'
      ? 'Medical'
      : documentId === 'default_travel'
        ? 'Travel'
        : documentId === 'default_parental'
          ? 'Parental'
          : 'General';

    const result = await adminDb.runTransaction(async transaction => {
      const [existing, existingCertificate] = await Promise.all([
        transaction.get(signatureRef),
        transaction.get(certificateRef),
      ]);
      const existingSignature = existing.data() || {};

      if (!existingCertificate.exists) {
        transaction.set(certificateRef, {
          id: certificateRef.id,
          name: `Signed Certificate: ${documentId}`,
          category: 'Signed Certificate',
          url: '#',
          type: 'cert',
          size: '1kb',
          date: existingSignature.signedAt || signedAt,
          memberId,
          documentId,
          teamId,
          teamName: team.data()?.name || 'Squad',
          waiverType,
          resolvedMemberName: memberName,
          resolvedDocTitle: waiverData.title || 'Waiver',
          signedByParent: existing.exists ? existingSignature.signedByParent === true : signedByParent,
          signerName: existingSignature.signatureName || existingSignature.signature || signatureName,
        });
      }

      if (existing.exists) return 'existing';

      const signature = {
        id: `sig_${documentId}_${memberId}`,
        docId: documentId,
        documentId,
        teamId,
        memberId,
        userId: auth.uid,
        parentUserId: signedByParent ? auth.uid : null,
        userName: memberName,
        signature: signatureName,
        signatureName,
        signedAt,
        timestamp: signedAt,
        signedByParent,
      };
      transaction.set(signatureRef, signature);
      transaction.update(memberRef, {
        [`signatures.${documentId}`]: {
          signedAt,
          signature: signatureName,
          signedByParent,
          signedBy: auth.uid,
        },
      });
      transaction.set(archiveRef, {
        id: archiveRef.id,
        documentId,
        title: waiverData.title || 'Waiver',
        waiverText: waiverData.content || '',
        signer: signatureName,
        signedAt,
        type: 'Team Document',
        memberId,
        memberName,
        signedByParent,
        signedBy: auth.uid,
      });
      transaction.set(protocolRef, {
        protocolId: documentId,
        docId: documentId,
        teamId,
        userId: auth.uid,
        memberId,
        signedAt,
        signerName: signatureName,
      });
      transaction.update(documentRef, { signatureCount: FieldValue.increment(1) });
      return 'created';
    });

    return NextResponse.json({ success: true, alreadySigned: result === 'existing' });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[teams/waivers/sign] Error:', error);
    return NextResponse.json({ error: 'Unable to sign this waiver.' }, { status: 500 });
  }
}
