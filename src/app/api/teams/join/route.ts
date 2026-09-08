import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { assertNonAnonymous, verifyFirebaseToken } from '@/lib/api-auth';
import { safeJoinPosition } from '@/lib/account-membership-policy';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { hasStaffRole } from '@/lib/staff-position';
import { findActiveTeamMember } from '@/lib/server-team-access';
import { permitsLegacyOrPaidPortals } from '@/lib/public-portal-data';
import { buildWaiverVersionIdentity, canonicalWaiverRecordMatches, validateWaiverSignatureInput } from '@/lib/waiver-security';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const CODE_PATTERN = /^[A-Z0-9_-]{4,32}$/;

function requestKey(req: NextRequest, suffix: string) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return `${(forwarded || 'local').slice(0, 100)}:${suffix}`;
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function teamAcceptsRegistrations(data: FirebaseFirestore.DocumentData) {
  return data.isArchived !== true && data.isActive !== false && data.rapidJoinEnabled !== false;
}

function teamAcceptsPublicRapidJoin(data: FirebaseFirestore.DocumentData) {
  return teamAcceptsRegistrations(data) &&
    permitsLegacyOrPaidPortals(data.planId, data.plan_type, data.subscriptionPlanId);
}

async function findTeamByCode(code: string) {
  for (const field of ['code', 'teamCode', 'inviteCode']) {
    const result = await adminDb.collection('teams').where(field, '==', code).limit(1).get();
    if (!result.empty) return result.docs[0];
  }
  return null;
}

function readCode(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.trim().toUpperCase() || '';
  return CODE_PATTERN.test(code) ? code : '';
}

export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('teamId') || '';
  const code = readCode(req);

  // Shared rapid-join links must resolve before the recipient signs in. The
  // team ID and invite code are both required and must identify the same team.
  if (teamId) {
    try {
      if (!ID_PATTERN.test(teamId) || !code) {
        return NextResponse.json({ error: 'Invalid or incomplete squad invitation.' }, { status: 400 });
      }
      const limited = await enforceUserRateLimit(requestKey(req, teamId), 'rapid-join-session', 20, 60 * 60 * 1000);
      if (limited) return limited;

      const teamRef = adminDb.collection('teams').doc(teamId);
      const team = await teamRef.get();
      const teamData = team.data() || {};
      const validCodes = [teamData.teamCode, teamData.code, teamData.inviteCode]
        .map(value => String(value || '').trim().toUpperCase())
        .filter(Boolean);
      if (!team.exists || !validCodes.includes(code) || !teamAcceptsPublicRapidJoin(teamData)) {
        return NextResponse.json({ error: 'This squad invitation is invalid or no longer active.' }, { status: 404 });
      }

      const waiverQuery = await teamRef.collection('documents').where('isActive', '==', true).limit(20).get();
      const waiver = waiverQuery.docs.find(snapshot => {
        const data = snapshot.data();
        return data.type === 'waiver' && data.waiverAudience !== 'team' && (!Array.isArray(data.assignedTo) || data.assignedTo.includes('all'));
      });
      const waiverIdentity = waiver ? buildWaiverVersionIdentity({
        title: waiver.data().title, content: waiver.data().content, version: waiver.data().version,
        waiverAudience: waiver.data().waiverAudience, assignedTo: waiver.data().assignedTo,
      }) : null;
      const sessionToken = randomBytes(32).toString('base64url');
      const expiresAt = Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);
      await adminDb.collection('team_join_sessions').doc(tokenHash(sessionToken)).set({
        teamId,
        ...(waiver && waiverIdentity ? { waiverId: waiver.id, waiverVersion: waiverIdentity.version, waiverTextHash: waiverIdentity.textHash } : {}),
        expiresAt,
        createdAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({
        data: {
          team: { id: team.id, name: String(teamData.teamName || teamData.name || 'Squad') },
          waiver: waiver && waiverIdentity ? {
            id: waiver.id,
            title: waiverIdentity.title,
            content: waiverIdentity.content.slice(0, 50_000),
            version: waiverIdentity.version,
            textHash: waiverIdentity.textHash,
          } : null,
          sessionToken,
          expiresAt: expiresAt.toDate().toISOString(),
        },
      });
    } catch (error) {
      console.error('[teams/join] Session error:', error);
      return NextResponse.json({ error: 'Unable to open this squad invitation.' }, { status: 500 });
    }
  }

  // The dashboard's code preview remains authenticated and returns only the
  // minimal squad identity needed for its confirmation dialog.
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  if (!code) return NextResponse.json({ error: 'Enter a valid squad code.' }, { status: 400 });
  const limited = await enforceUserRateLimit(auth.uid, 'team-join-preview', 30, 10 * 60 * 1000);
  if (limited) return limited;
  const teamSnapshot = await findTeamByCode(code);
  if (!teamSnapshot) return NextResponse.json({ error: 'Squad code not found.' }, { status: 404 });
  const team = teamSnapshot.data() || {};
  if (!teamAcceptsRegistrations(team)) {
    return NextResponse.json({ error: 'Squad code not found.' }, { status: 404 });
  }
  return NextResponse.json({ teamId: teamSnapshot.id, teamName: String(team.name || team.teamName || 'Squad') });
}

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const nonAnonymous = assertNonAnonymous(auth);
  if (nonAnonymous) return nonAnonymous;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'team-join', 10, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const usePendingSignupCode = body.usePendingSignupCode === true;
    const userRef = adminDb.collection('users').doc(auth.uid);
    const initialUserSnapshot = usePendingSignupCode ? await userRef.get() : null;
    const initialUser = initialUserSnapshot?.data() || {};
    if (usePendingSignupCode && initialUser.role !== 'adult_player') {
      return NextResponse.json({ ok: true, pendingEnrollment: false });
    }
    const submittedCode = typeof body.code === 'string' ? body.code : '';
    const pendingCode = typeof initialUser.pendingTeamJoinCode === 'string' ? initialUser.pendingTeamJoinCode : '';
    const code = (usePendingSignupCode ? pendingCode : submittedCode).trim().toUpperCase();
    if (usePendingSignupCode && !code) {
      return NextResponse.json({ ok: true, pendingEnrollment: false });
    }
    const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken.trim() : '';
    const submittedPlayerId = typeof body.playerId === 'string' ? body.playerId : '';
    // The dashboard represents self-enrollment as p_<authenticated uid>.
    // Normalize that UI identifier to the server's self path so it is not
    // mistaken for a guardian attempting to enroll a linked child.
    const requestedPlayerId = submittedPlayerId === `p_${auth.uid}` ? '' : submittedPlayerId;
    const requestedPlayerEnrollment = body.enrollmentIntent === 'player' || sessionToken.length >= 32;
    const selfPlayers = requestedPlayerId
      ? null
      : await adminDb.collection('players').where('userId', '==', auth.uid).limit(2).get();
    if (selfPlayers && selfPlayers.size > 1) {
      return NextResponse.json({ error: 'Your athlete profile needs account support before joining a squad.' }, { status: 409 });
    }
    const playerId = requestedPlayerId || selfPlayers?.docs[0]?.id || `p_${auth.uid}`;
    const joiningLinkedChild = requestedPlayerId.length > 0;
    if ((!CODE_PATTERN.test(code) && sessionToken.length < 32) || !ID_PATTERN.test(playerId)) {
      return NextResponse.json({ error: 'A valid squad invitation and athlete are required.' }, { status: 400 });
    }

    const sessionRef = sessionToken
      ? adminDb.collection('team_join_sessions').doc(tokenHash(sessionToken))
      : null;
    const session = sessionRef ? await sessionRef.get() : null;
    const sessionData = session?.data() || {};
    const sessionExpiry = typeof sessionData.expiresAt?.toMillis === 'function' ? sessionData.expiresAt.toMillis() : 0;
    if (sessionRef && (!session?.exists || !ID_PATTERN.test(String(sessionData.teamId || '')) || sessionExpiry < Date.now())) {
      return NextResponse.json({ error: 'This squad invitation has expired. Open the shared link again.' }, { status: 410 });
    }

    const teamSnapshot = sessionRef
      ? await adminDb.collection('teams').doc(String(sessionData.teamId)).get()
      : await findTeamByCode(code);
    if (!teamSnapshot?.exists) return NextResponse.json({ error: 'Squad invitation not found.' }, { status: 404 });
    const team = teamSnapshot.data() || {};
    if (!teamAcceptsRegistrations(team) || (sessionRef && !teamAcceptsPublicRapidJoin(team))) {
      return NextResponse.json({ error: 'This squad is not accepting new members.' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const existingSelfMembership = !joiningLinkedChild
      ? await findActiveTeamMember(teamSnapshot.id, auth.uid)
      : null;
    if (requestedPlayerEnrollment && hasStaffRole(existingSelfMembership?.data)) {
      return NextResponse.json({ error: 'You already have staff access to this squad.' }, { status: 409 });
    }
    const playerRef = adminDb.collection('players').doc(playerId);
    const memberRef = existingSelfMembership?.ref
      || teamSnapshot.ref.collection('members').doc(joiningLinkedChild ? playerId : auth.uid);
    const membershipRef = userRef.collection('teamMemberships').doc(teamSnapshot.id);
    const requiredWaiverId = String(sessionData.waiverId || '');
    const acceptanceRecord = body.waiverAcceptance && typeof body.waiverAcceptance === 'object' && !Array.isArray(body.waiverAcceptance)
      ? body.waiverAcceptance as Record<string, unknown>
      : null;
    if (requiredWaiverId && !acceptanceRecord) {
      return NextResponse.json({ error: 'Review and sign the current waiver before joining.' }, { status: 409 });
    }
    const waiverInput = acceptanceRecord ? validateWaiverSignatureInput({
      teamId: teamSnapshot.id, memberId: memberRef.id, ...acceptanceRecord,
    }) : null;
    if (requiredWaiverId && waiverInput?.documentId !== requiredWaiverId) {
      return NextResponse.json({ error: 'The required waiver changed. Reopen the invitation and review it again.' }, { status: 409 });
    }
    const waiverRef = waiverInput ? teamSnapshot.ref.collection('documents').doc(waiverInput.documentId) : null;
    const versionKey = waiverInput ? `${waiverInput.documentId}_v${waiverInput.expectedVersion}` : '';
    const signatureRef = waiverInput ? memberRef.collection('signatures').doc(versionKey) : null;
    const archiveRef = waiverInput ? teamSnapshot.ref.collection('archived_waivers').doc(`receipt_${versionKey}_${memberRef.id}`) : null;
    const protocolRef = waiverInput ? teamSnapshot.ref.collection('protocol_signatures').doc(`${versionKey}_${auth.uid}_${memberRef.id}`) : null;
    const certificateRef = waiverInput ? teamSnapshot.ref.collection('files').doc(`cert_${memberRef.id}_${versionKey}`) : null;

    const result = await adminDb.runTransaction(async transaction => {
      const [userSnapshot, memberSnapshot, playerSnapshot, freshSession, freshTeamSnapshot, freshWaiver] = await Promise.all([
        transaction.get(userRef),
        transaction.get(memberRef),
        transaction.get(playerRef),
        sessionRef ? transaction.get(sessionRef) : Promise.resolve(null),
        transaction.get(teamSnapshot.ref),
        waiverRef ? transaction.get(waiverRef) : Promise.resolve(null),
      ]);
      if (!freshTeamSnapshot.exists || !teamAcceptsRegistrations(freshTeamSnapshot.data() || {}) ||
          (sessionRef && !teamAcceptsPublicRapidJoin(freshTeamSnapshot.data() || {}))) return 'inactive';
      if (sessionRef) {
        const freshSessionData = freshSession?.data() || {};
        const freshExpiry = typeof freshSessionData.expiresAt?.toMillis === 'function' ? freshSessionData.expiresAt.toMillis() : 0;
        if (!freshSession?.exists || freshSessionData.teamId !== teamSnapshot.id || freshExpiry < Date.now()) return 'expired';
        if (String(freshSessionData.waiverId || '') !== requiredWaiverId ||
            (requiredWaiverId && (freshSessionData.waiverVersion !== waiverInput?.expectedVersion || freshSessionData.waiverTextHash !== waiverInput?.expectedTextHash))) return 'waiver_changed';
      }

      const user = userSnapshot.data() || {};
      if (usePendingSignupCode && (
        user.role !== 'adult_player' ||
        String(user.pendingTeamJoinCode || '').trim().toUpperCase() !== code
      )) return 'pending_unavailable';
      const existingPlayer = playerSnapshot.data() || {};
      if (joiningLinkedChild && existingPlayer.parentId !== auth.uid) throw new Error('CHILD_FORBIDDEN');
      if (requestedPlayerEnrollment && hasStaffRole(memberSnapshot.data())) throw new Error('STAFF_MEMBERSHIP_EXISTS');
      const position = safeJoinPosition({
        profileRole: user.role,
        joiningLinkedChild,
        requestedPlayerEnrollment,
      });
      const profileName = String(user.name || user.fullName || '').trim();
      const authenticatedName = String(auth.name || '').trim();
      const accountName = user.isBetaTester === true
        ? authenticatedName || profileName
        : profileName || authenticatedName;
      const displayName = String(
        existingPlayer.firstName
          ? `${existingPlayer.firstName} ${existingPlayer.lastName || ''}`.trim()
          : accountName || auth.email?.split('@')[0] || 'Athlete'
      );
      const avatar = String(user.avatar || user.avatarUrl || '');
      let waiverAlreadySigned = false;
      let waiverReceipt: Record<string, unknown> | null = null;
      let signatureSnapshot: FirebaseFirestore.DocumentSnapshot | null = null;
      let archiveSnapshot: FirebaseFirestore.DocumentSnapshot | null = null;
      let protocolSnapshot: FirebaseFirestore.DocumentSnapshot | null = null;
      let certificateSnapshot: FirebaseFirestore.DocumentSnapshot | null = null;
      if (waiverInput && waiverRef && signatureRef && archiveRef && protocolRef && certificateRef) {
        const waiverData = freshWaiver?.data() || {};
        if (!freshWaiver?.exists || waiverData.type !== 'waiver' || waiverData.isActive === false) return 'waiver_changed';
        const identity = buildWaiverVersionIdentity({
          title: waiverData.title, content: waiverData.content, version: waiverData.version,
          waiverAudience: waiverData.waiverAudience, assignedTo: waiverData.assignedTo,
        });
        if (identity.waiverAudience !== 'participant' || !identity.assignedTo.includes('all') ||
            waiverInput.expectedVersion !== identity.version || waiverInput.expectedTextHash !== identity.textHash) return 'waiver_changed';
        [signatureSnapshot, archiveSnapshot, protocolSnapshot, certificateSnapshot] = await Promise.all([
          transaction.get(signatureRef), transaction.get(archiveRef), transaction.get(protocolRef), transaction.get(certificateRef),
        ]);
        waiverReceipt = {
          documentId: waiverInput.documentId, version: identity.version, textHash: identity.textHash,
          waiverTitle: identity.title, waiverText: identity.content, waiverAudience: identity.waiverAudience,
          assignedTo: identity.assignedTo, teamId: teamSnapshot.id, memberId: memberRef.id,
          subjectPlayerId: playerId, signedBy: auth.uid, signedByParent: joiningLinkedChild,
          signerName: waiverInput.signatureName, signedAt: now, immutable: true,
        };
        for (const snapshot of [signatureSnapshot, archiveSnapshot, protocolSnapshot]) {
          if (snapshot?.exists && !canonicalWaiverRecordMatches(snapshot.data() || {}, waiverReceipt)) throw new Error('WAIVER_RECEIPT_CONFLICT');
        }
        waiverAlreadySigned = Boolean(signatureSnapshot?.exists);
      }
      if (!playerSnapshot.exists) {
        const [firstName = 'Athlete', ...lastName] = displayName.split(/\s+/).filter(Boolean);
        transaction.create(playerRef, {
          id: playerId, firstName, lastName: lastName.join(' '), userId: auth.uid,
          parentId: null, isMinor: false, hasLogin: true, createdAt: now, joinedTeamIds: [teamSnapshot.id],
        });
      } else {
        transaction.set(playerRef, {
          ...(!joiningLinkedChild ? { userId: auth.uid, hasLogin: true } : {}),
          joinedTeamIds: FieldValue.arrayUnion(teamSnapshot.id), updatedAt: now,
        }, { merge: true });
      }
      transaction.set(memberRef, {
        ...(memberSnapshot.data() || {}),
        id: memberRef.id, userId: existingPlayer.userId || (joiningLinkedChild ? null : auth.uid), playerId, teamId: teamSnapshot.id,
        name: displayName, avatar, parentId: existingPlayer.parentId || null, role: 'Member', position, jersey: '',
        status: 'active', joinedAt: memberSnapshot.data()?.joinedAt || now,
      }, { merge: true });
      if (waiverInput && waiverReceipt && signatureRef && archiveRef && protocolRef && certificateRef) {
        if (!signatureSnapshot?.exists) transaction.create(signatureRef, {
          id: `sig_${versionKey}_${memberRef.id}`, docId: waiverInput.documentId, userId: auth.uid,
          userName: displayName, signature: waiverInput.signatureName, signatureName: waiverInput.signatureName,
          parentUserId: joiningLinkedChild ? auth.uid : null, timestamp: now, ...waiverReceipt,
        });
        if (!archiveSnapshot?.exists) transaction.create(archiveRef, { id: archiveRef.id, title: waiverReceipt.waiverTitle, type: 'Team Document', memberName: displayName, ...waiverReceipt });
        if (!protocolSnapshot?.exists) transaction.create(protocolRef, { protocolId: waiverInput.documentId, docId: waiverInput.documentId, ...waiverReceipt });
        if (!certificateSnapshot?.exists) transaction.create(certificateRef, {
          id: certificateRef.id, name: `Signed Certificate: ${waiverReceipt.waiverTitle}`, category: 'Signed Certificate',
          url: '#', type: 'cert', size: '1kb', date: now, teamName: String(team.name || team.teamName || 'Squad'),
          waiverType: 'General', resolvedMemberName: displayName, resolvedDocTitle: waiverReceipt.waiverTitle,
          documentId: waiverInput.documentId, memberId: memberRef.id, version: waiverReceipt.version,
          signedAt: now, signedByParent: joiningLinkedChild,
        });
      }
      transaction.set(membershipRef, {
        teamId: teamSnapshot.id, name: String(team.name || team.teamName || 'Squad'), role: 'Member',
        code: code || team.code || team.teamCode || team.inviteCode || '', joinedAt: now,
        type: team.type || 'team', isPro: team.isPro === true, planId: team.planId || 'free',
      }, { merge: true });
      if (usePendingSignupCode) {
        transaction.set(userRef, { pendingTeamJoinCode: FieldValue.delete() }, { merge: true });
      }
      if (sessionRef) transaction.delete(sessionRef);
      return { state: memberSnapshot.exists ? 'existing' as const : 'joined' as const, waiverAlreadySigned };
    });

    if (result === 'expired') return NextResponse.json({ error: 'This squad invitation has expired.' }, { status: 410 });
    if (result === 'inactive') return NextResponse.json({ error: 'This squad is not accepting new members.' }, { status: 409 });
    if (result === 'waiver_changed') return NextResponse.json({ error: 'The required waiver changed. Reopen the invitation and review it again.' }, { status: 409 });
    if (result === 'pending_unavailable') return NextResponse.json({ ok: true, pendingEnrollment: false });
    return NextResponse.json({
      ok: true,
      success: true,
      pendingEnrollment: usePendingSignupCode,
      teamId: teamSnapshot.id,
      playerId,
      memberId: memberRef.id,
      teamName: String(team.name || team.teamName || 'Squad'),
      alreadyJoined: result.state === 'existing',
      waiverAlreadySigned: result.waiverAlreadySigned,
    });
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === 'CHILD_FORBIDDEN') return NextResponse.json({ error: 'You can only enroll a linked child profile.' }, { status: 403 });
    if (error instanceof Error && error.message === 'STAFF_MEMBERSHIP_EXISTS') return NextResponse.json({ error: 'You already have staff access to this squad.' }, { status: 409 });
    if (error instanceof Error && error.message === 'WAIVER_RECEIPT_CONFLICT') return NextResponse.json({ error: 'The existing waiver receipt does not match this enrollment.' }, { status: 409 });
    if (error instanceof Error && /valid waiver|displayed waiver|unsupported waiver/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('[teams/join] Error:', error);
    return NextResponse.json({ error: 'Unable to join the squad.' }, { status: 500 });
  }
}
