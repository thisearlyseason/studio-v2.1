import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { getTeamAuthority } from '@/lib/server-team-access';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { isActiveWaiverDocument } from '@/lib/global-waiver-policy';
import { isActiveTeamMembership } from '@/lib/team-membership-security';
import { hasStaffRole } from '@/lib/staff-position';
import { buildWaiverVersionIdentity, canSignWaiverAssignment, canonicalWaiverRecordMatches, validateCoachWaiverSignatureInput } from '@/lib/waiver-security';

export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const limited = await enforceUserRateLimit(auth.uid, 'sign-coach-waiver', 40, 60 * 60 * 1000);
    if (limited) return limited;
    const input = validateCoachWaiverSignatureInput(await readJsonBodyWithLimit<Record<string, unknown>>(request, 8_000));
    const authority = await getTeamAuthority(input.teamId, auth.uid, auth.role);
    if (!authority) return NextResponse.json({ error: 'Waiver not found.' }, { status: 404 });
    if (!authority.isStaff) return NextResponse.json({ error: 'Only active squad staff can sign this waiver.' }, { status: 403 });
    const waiverRef = authority.teamRef.collection('documents').doc(input.documentId);
    const signedAt = new Date().toISOString();
    const result = await adminDb.runTransaction(async transaction => {
      const reads = [transaction.get(authority.teamRef), transaction.get(waiverRef)];
      if (authority.member) reads.push(transaction.get(authority.member.ref));
      const [team, waiver, member] = await Promise.all(reads);
      const teamData = team.data() || {};
      const memberData = member?.data() || {};
      const activeStaff = auth.role === 'superadmin' || teamData.ownerUserId === auth.uid ||
        (Boolean(member?.exists) && isActiveTeamMembership(memberData) && hasStaffRole(memberData));
      if (!team.exists || teamData.isActive === false || teamData.isArchived === true) throw new Error('WAIVER_NOT_FOUND');
      if (!activeStaff) throw new Error('STAFF_FORBIDDEN');
      const waiverData = waiver.data() || {};
      if (!waiver.exists || !isActiveWaiverDocument(waiverData)) throw new Error('WAIVER_NOT_FOUND');
      const identity = buildWaiverVersionIdentity({
        title: waiverData.title, content: waiverData.content, version: waiverData.version,
        waiverAudience: waiverData.waiverAudience, assignedTo: waiverData.assignedTo,
      });
      if (identity.waiverAudience !== 'team' || !canSignWaiverAssignment(identity.assignedTo, [auth.uid])) throw new Error('WAIVER_NOT_FOUND');
      if (input.expectedVersion !== identity.version || input.expectedTextHash !== identity.textHash) throw new Error('STALE_WAIVER');
      const versionKey = `${input.documentId}_v${identity.version}`;
      const signatureRef = authority.teamRef.collection('coachWaiverSignatures').doc(`${versionKey}_${auth.uid}`);
      const archiveRef = authority.teamRef.collection('archived_waivers').doc(`receipt_coach_${versionKey}_${auth.uid}`);
      const [existing, archive] = await Promise.all([transaction.get(signatureRef), transaction.get(archiveRef)]);
      const receipt = {
        waiverDocId: input.documentId, documentId: input.documentId, version: identity.version, textHash: identity.textHash,
        waiverTitle: identity.title, waiverText: identity.content, waiverAudience: identity.waiverAudience, assignedTo: identity.assignedTo,
        signedBy: auth.uid, signedByName: input.signatureName, signerName: input.signatureName,
        signerUserId: auth.uid, signerRole: 'coach', signedAt,
        isGlobal: waiverData.isClubMaster === true, isClubMaster: waiverData.isClubMaster === true,
        teamId: input.teamId, immutable: true,
      };
      for (const snapshot of [existing, archive]) {
        if (snapshot.exists && !canonicalWaiverRecordMatches(snapshot.data() || {}, receipt)) throw new Error('RECEIPT_CONFLICT');
      }
      if (existing.exists) return { state: 'existing' as const, identity, signedAt: String(existing.data()?.signedAt || '') };
      transaction.create(signatureRef, receipt);
      if (!archive.exists) transaction.create(archiveRef, { id: archiveRef.id, type: 'waiver', ...receipt });
      return { state: 'created' as const, identity, signedAt };
    });
    return NextResponse.json({ success: true, alreadySigned: result.state === 'existing', version: result.identity.version, textHash: result.identity.textHash, signedAt: result.signedAt || undefined });
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && /valid|unsupported|version|hash/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && error.message === 'WAIVER_NOT_FOUND') return NextResponse.json({ error: 'Waiver not found or inactive.' }, { status: 404 });
    if (error instanceof Error && error.message === 'STAFF_FORBIDDEN') return NextResponse.json({ error: 'Only active squad staff can sign this waiver.' }, { status: 403 });
    if (error instanceof Error && ['STALE_WAIVER', 'RECEIPT_CONFLICT'].includes(error.message)) return NextResponse.json({ error: 'This waiver changed before it was signed. Review the current version.' }, { status: 409 });
    console.error('[teams/waivers/sign-coach]', error);
    return NextResponse.json({ error: 'Unable to sign this waiver.' }, { status: 500 });
  }
}
