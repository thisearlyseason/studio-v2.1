import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { isActiveTeamMembership } from '@/lib/team-membership-security';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { isActiveWaiverDocument } from '@/lib/global-waiver-policy';
import { buildWaiverVersionIdentity, canSignWaiverAssignment, canonicalWaiverRecordMatches, validateWaiverSignatureInput } from '@/lib/waiver-security';

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'sign-team-waiver', 40, 60 * 60 * 1000);
    if (limited) return limited;
    const input = validateWaiverSignatureInput(await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000));

    const teamRef = adminDb.collection('teams').doc(input.teamId);
    const memberRef = teamRef.collection('members').doc(input.memberId);
    const documentRef = teamRef.collection('documents').doc(input.documentId);
    const signedAt = new Date().toISOString();
    const result = await adminDb.runTransaction(async transaction => {
      const [team, member, waiver] = await Promise.all([
        transaction.get(teamRef), transaction.get(memberRef), transaction.get(documentRef),
      ]);
      const teamData = team.data() || {};
      const memberData = member.data() || {};
      if (!team.exists || teamData.isActive === false || teamData.isArchived === true || !member.exists || !isActiveTeamMembership(memberData)) {
        throw new Error('PARTICIPANT_NOT_FOUND');
      }
      const waiverData = waiver.data() || {};
      if (!waiver.exists || !isActiveWaiverDocument(waiverData)) throw new Error('WAIVER_NOT_FOUND');
      const identity = buildWaiverVersionIdentity({
        title: waiverData.title, content: waiverData.content, version: waiverData.version,
        waiverAudience: waiverData.waiverAudience, assignedTo: waiverData.assignedTo,
      });
      if (identity.waiverAudience !== 'participant') throw new Error('WAIVER_NOT_FOUND');
      if (input.expectedVersion !== identity.version || input.expectedTextHash !== identity.textHash) throw new Error('STALE_WAIVER');

      const playerId = String(memberData.playerId || input.memberId);
      const playerRef = adminDb.collection('players').doc(playerId);
      const player = await transaction.get(playerRef);
      const playerData = player.data() || {};
      if (player.exists && !isActiveTeamMembership(playerData)) throw new Error('PARTICIPANT_NOT_FOUND');
      const isSelf = input.memberId === auth.uid || memberData.userId === auth.uid;
      const isGuardian = memberData.parentId === auth.uid || playerData.parentId === auth.uid ||
        (Array.isArray(memberData.guardianIds) && memberData.guardianIds.includes(auth.uid)) ||
        (Array.isArray(playerData.guardianIds) && playerData.guardianIds.includes(auth.uid));
      if (!isSelf && !isGuardian) throw new Error('SIGNER_FORBIDDEN');
      if (!canSignWaiverAssignment(identity.assignedTo, [input.memberId, playerId])) throw new Error('WAIVER_NOT_FOUND');

      const versionKey = `${input.documentId}_v${identity.version}`;
      const signatureRef = memberRef.collection('signatures').doc(versionKey);
      const archiveRef = teamRef.collection('archived_waivers').doc(`receipt_${versionKey}_${input.memberId}`);
      const protocolRef = teamRef.collection('protocol_signatures').doc(`${versionKey}_${auth.uid}_${input.memberId}`);
      const certificateRef = teamRef.collection('files').doc(`cert_${input.memberId}_${versionKey}`);
      const [existing, archive, protocol, certificate] = await Promise.all([
        transaction.get(signatureRef), transaction.get(archiveRef), transaction.get(protocolRef), transaction.get(certificateRef),
      ]);
      const memberName = memberData.name || [playerData.firstName, playerData.lastName].filter(Boolean).join(' ') || 'Participant';
      const signedByParent = isGuardian && !isSelf;
      const receipt = {
        documentId: input.documentId, version: identity.version, textHash: identity.textHash,
        waiverTitle: identity.title, waiverText: identity.content, teamId: input.teamId,
        memberId: input.memberId, subjectPlayerId: playerId, signedBy: auth.uid,
        signedByParent, signerName: input.signatureName, signedAt, immutable: true,
        waiverAudience: identity.waiverAudience, assignedTo: identity.assignedTo,
      };
      if (existing.exists && !canonicalWaiverRecordMatches(existing.data() || {}, receipt)) throw new Error('RECEIPT_CONFLICT');
      for (const snapshot of [archive, protocol]) {
        if (snapshot.exists && !canonicalWaiverRecordMatches(snapshot.data() || {}, receipt)) throw new Error('RECEIPT_CONFLICT');
      }
      const signatureData = {
        id: `sig_${versionKey}_${input.memberId}`, docId: input.documentId, userId: auth.uid,
        userName: memberName, signature: input.signatureName, signatureName: input.signatureName,
        parentUserId: signedByParent ? auth.uid : null, timestamp: signedAt, ...receipt,
      };
      const certificateData = {
        id: certificateRef.id, name: `Signed Certificate: ${identity.title}`, category: 'Signed Certificate', url: '#', type: 'cert', size: '1kb', date: signedAt,
        teamName: teamData.name || 'Squad', waiverType: 'General', resolvedMemberName: memberName,
        resolvedDocTitle: identity.title, documentId: input.documentId, memberId: input.memberId,
        version: identity.version, signedAt, signedByParent,
      };
      if (certificate.exists && !canonicalWaiverRecordMatches(certificate.data() || {}, certificateData)) throw new Error('RECEIPT_CONFLICT');
      if (existing.exists) return { state: 'existing' as const, identity, signedAt: String(existing.data()?.signedAt || '') };
      transaction.create(signatureRef, signatureData);
      transaction.update(memberRef, { [`signatures.${versionKey}`]: { signedAt, signature: input.signatureName, signedByParent, signedBy: auth.uid, version: identity.version, textHash: identity.textHash } });
      if (!archive.exists) transaction.create(archiveRef, { id: archiveRef.id, title: identity.title, type: 'Team Document', memberName, ...receipt });
      if (!protocol.exists) transaction.create(protocolRef, { protocolId: input.documentId, docId: input.documentId, ...receipt });
      if (!certificate.exists) transaction.create(certificateRef, certificateData);
      transaction.update(documentRef, { signatureCount: FieldValue.increment(1) });
      return { state: 'created' as const, identity, signedAt };
    });

    return NextResponse.json({ success: true, alreadySigned: result.state === 'existing', version: result.identity.version, textHash: result.identity.textHash, signedAt: result.signedAt || undefined });
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && /valid|unsupported|version|hash/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && error.message === 'PARTICIPANT_NOT_FOUND') return NextResponse.json({ error: 'Squad participant not found.' }, { status: 404 });
    if (error instanceof Error && error.message === 'WAIVER_NOT_FOUND') return NextResponse.json({ error: 'Waiver not found or inactive.' }, { status: 404 });
    if (error instanceof Error && error.message === 'SIGNER_FORBIDDEN') return NextResponse.json({ error: 'You can only sign for yourself or your linked athlete.' }, { status: 403 });
    if (error instanceof Error && ['STALE_WAIVER', 'RECEIPT_CONFLICT'].includes(error.message)) return NextResponse.json({ error: 'This waiver changed before it was signed. Review the current version.' }, { status: 409 });
    console.error('[teams/waivers/sign] Error:', error);
    return NextResponse.json({ error: 'Unable to sign this waiver.' }, { status: 500 });
  }
}
