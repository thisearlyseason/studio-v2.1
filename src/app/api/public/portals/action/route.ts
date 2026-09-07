import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { FieldPath, FieldValue, type DocumentReference, type DocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { recordTournamentScore, validateBracketScoreSubmission } from '@/lib/scheduler-utils';
import { credentialsMatch, isLegacyOpenPortal, validScore } from '@/lib/score-action-security';
import { leagueBillingOwnerUserId, permitsLegacyOrPaidPortals } from '@/lib/public-portal-data';
import { competitionScoringInput, submitCompetitionScore, openCompetitionDispute } from '@/lib/server-competition-scoring';
import { ScheduleDeploymentError } from '@/lib/server-schedule-deployment';
import {
  TournamentScheduleDeploymentError,
  withTournamentScheduleMutationLock,
} from '@/lib/server-tournament-schedule-deployment';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { getTeamAuthority } from '@/lib/server-team-access';
import { canDeleteLeagueRegistration } from '@/lib/server-league-registration-authority';
import { effectiveLeagueRegistrationConfig, isCalendarDate, nextRegistrationCount, registrationArchiveMatches, registrationCountFromLegacy, registrationPaymentSnapshot, registrationPayloadHash, RegistrationInputError } from '@/lib/registration-policy';
import { hasStaffRole } from '@/lib/staff-position';
import { hashTournamentScorekeeperCode, verifyTournamentScorekeeperCode } from '@/lib/server-competition-credential';

const LEGACY_REGISTRATION_SCAN_LIMIT=100001;

function requestFingerprint(req: NextRequest) {
  const address = (req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local').slice(0, 100);
  return createHash('sha256').update(address).digest('hex').slice(0, 32);
}

function auditData(req: NextRequest, action: string, gameId: string | undefined, extra: Record<string, unknown> = {}) {
  return {
    action,
    gameId: gameId || null,
    source: 'public-scorekeeper-portal',
    requestFingerprint: requestFingerprint(req),
    userAgent: (req.headers.get('user-agent') || '').slice(0, 300),
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('/');
}

async function verifiedTournamentEvent(transaction: any, ref: DocumentReference, teamId: string, eventId: string, supplied: unknown, legacyOpen: boolean) {
  const fresh = await transaction.get(ref);
  if (!fresh.exists || fresh.data()?.isTournament !== true || fresh.data()?.isArchived === true || fresh.data()?.is_active === false || fresh.data()?.status === 'cancelled') {
    throw new RegistrationInputError('Tournament portal is inactive.', 404);
  }
  const event = fresh.data()!;
  const privateRef = ref.collection('private').doc('scoring');
  const credential = await transaction.get(privateRef);
  const codeValue = typeof supplied === 'string' ? supplied.trim() : '';
  const storedHash = typeof credential.data()?.scorekeeperCodeHash === 'string' ? credential.data()!.scorekeeperCodeHash : '';
  if (storedHash) {
    if (!verifyTournamentScorekeeperCode(teamId, eventId, codeValue, storedHash)) throw new RegistrationInputError('Invalid scorekeeper code.', 403);
    return event;
  }
  const legacyCode = typeof event.scoringCode === 'string' ? event.scoringCode.trim() : '';
  if (legacyCode) {
    if (!credentialsMatch(legacyCode, codeValue, false)) throw new RegistrationInputError('Invalid scorekeeper code.', 403);
    transaction.set(privateRef, { teamId, eventId, scorekeeperCodeHash: hashTournamentScorekeeperCode(teamId, eventId, legacyCode), updatedAt: new Date().toISOString(), migratedFromLegacy: true });
    transaction.update(ref, { scoringCode: FieldValue.delete(), scoringCodeHash: FieldValue.delete() });
    return event;
  }
  if (!legacyOpen) throw new RegistrationInputError('Scorekeeper access is not configured for this tournament.', 409);
  return event;
}

function sanitizeRegistrationAnswers(raw: Record<string, unknown>, config: Record<string, any>) {
  const schema = Array.isArray(config.form_schema) ? config.form_schema : [];
  const allowed = new Set<string>([
    ...schema.map((field: any) => String(field.id || '')).filter(Boolean),
    'name', 'fullName', 'teamName', 'email', 'phone', 'dateOfBirth', 'dob',
    'teamOrigin', 'experience', 'teamCode',
    'division', 'teamLogoUrl', 'recruiter_code', 'team_name', 'team_id',
    'guardian_name', 'guardian_email', 'guardian_phone', 'guardian_relationship',
    'primary_phone', 'residence_address', 'medical_notes',
  ]);
  const answers: Record<string, string | number | boolean | string[] | null> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.has(key)) continue;
    if (typeof value === 'string') answers[key] = value.trim().slice(0, 2_000);
    else if (typeof value === 'boolean') answers[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) answers[key] = value;
    else if (value === null) answers[key] = null;
    else if (Array.isArray(value) && value.length <= 50 && value.every(item => typeof item === 'string')) {
      answers[key] = value.map(item => item.trim().slice(0, 500));
    }
  }

  for (const field of schema) {
    const key=String(field.id||''),value=answers[key],type=String(field.type||'');
    if(value==null||value==='')continue;
    const options=Array.isArray(field.options)?field.options.map(String):[];
    if(type==='email'){
      if(typeof value!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw new RegistrationInputError(`Invalid ${field.label || 'email'}.`);
      answers[key]=value.toLowerCase();
    }
    if(type==='number'&&(typeof value!=='number'&&!/^[-+]?\d+(\.\d+)?$/.test(String(value))))throw new RegistrationInputError(`Invalid ${field.label || 'number'}.`);
    if(type==='date'&&!isCalendarDate(value))throw new RegistrationInputError(`Invalid ${field.label || 'date'}.`);
    if(['select','dropdown','radio'].includes(type)&&!options.includes(String(value)))throw new RegistrationInputError(`Invalid ${field.label || 'selection'}.`);
    if(type==='multi_select'&&(!Array.isArray(value)||value.some(item=>!options.includes(String(item)))))throw new RegistrationInputError(`Invalid ${field.label || 'selection'}.`);
    if(type==='checkbox'&&typeof value!=='boolean')throw new RegistrationInputError(`Invalid ${field.label || 'confirmation'}.`);
  }

  return { answers, schema };
}

function configuredAnswer(
  answers: Record<string, any>,
  schema: any[],
  directKeys: string[],
  labelPattern: RegExp,
): string {
  for (const key of directKeys) {
    if (typeof answers[key] === 'string' && answers[key].trim()) return answers[key].trim();
  }
  const field = schema.find(candidate => labelPattern.test(String(candidate.label || '')));
  return field && typeof answers[field.id] === 'string' ? answers[field.id].trim() : '';
}

async function findTeamByCode(teamCode: string) {
  let matches = await adminDb.collection('teams').where('inviteCode', '==', teamCode).limit(1).get();
  if (matches.empty) matches = await adminDb.collection('teams').where('teamCode', '==', teamCode).limit(1).get();
  if (matches.empty) matches = await adminDb.collection('teams').where('code', '==', teamCode).limit(1).get();
  return matches.empty ? null : matches.docs[0];
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBodyWithLimit<Record<string, any>>(req, 20_000);
    const { kind, action, gameId, code } = body;
    const target = String(body.leagueId || body.eventId || body.teamId || 'unknown').slice(0, 200);
    const limited = await enforceUserRateLimit(
      `${requestFingerprint(req)}:${target}`,
      `public-portal-${action || 'unknown'}`,
      action === 'verify' ? 15 : 60,
      60 * 60 * 1000,
    );
    if (limited) return limited;

    if (action === 'delete-registration' && (kind === 'league' || kind === 'tournament')) {
      const auth = await verifyFirebaseToken(req);
      if (auth instanceof NextResponse) return auth;
      const entryId = String(body.entryId || '').trim();
      if (!isSafeId(entryId)) return NextResponse.json({ error: 'Invalid registration identifiers.' }, { status: 400 });
      if (kind === 'tournament') {
        const teamId = String(body.teamId || '').trim(), eventId = String(body.eventId || '').trim();
        if (!isSafeId(teamId) || !isSafeId(eventId)) return NextResponse.json({ error: 'Invalid registration identifiers.' }, { status: 400 });
        const authority = await getTeamAuthority(teamId, auth.uid, auth.role);
        if (!authority?.isStaff) return NextResponse.json({ error: 'Tournament staff access required.' }, { status: 403 });
        const eventRef = authority.teamRef.collection('events').doc(eventId);
        const legacy = body.legacy === true;
        const entryRef = legacy ? authority.teamRef.collection('registrationEntries').doc(entryId) : eventRef.collection('registrationEntries').doc(entryId);
        await adminDb.runTransaction(async transaction => {
          const [freshEvent, entry, team] = await Promise.all([transaction.get(eventRef), transaction.get(entryRef), transaction.get(authority.teamRef)]);
          const member = authority.member ? await transaction.get(authority.member.ref) : null;
          const memberData = member?.data();
          const currentStaff = authority.isSuperAdmin || team.data()?.ownerUserId === auth.uid || Boolean(member?.exists && (memberData?.userId === auth.uid || (!memberData?.userId && member.id === auth.uid)) && memberData?.status !== 'removed' && memberData?.isDeleted !== true && hasStaffRole(memberData));
          if (!team.exists || !freshEvent.exists || freshEvent.data()?.isTournament !== true || !currentStaff) throw new RegistrationInputError('Tournament staff access required.', 403);
          if (!entry.exists) return;
          if (legacy && entry.data()?.event_id !== eventId) throw new RegistrationInputError('Registration not found.', 404);
          if(Array.isArray(freshEvent.data()?.tournamentGames)&&freshEvent.data()!.tournamentGames.length>0)throw new RegistrationInputError('Registration cannot be deleted after the bracket is published.',409);
          const marker = `p_${entryId}`;
          const removedProjection=(freshEvent.data()?.tournamentTeamsData||[]).find((teamEntry:any)=>teamEntry.id===marker);
          const remainingTeams=(freshEvent.data()?.tournamentTeamsData||[]).filter((teamEntry:any)=>teamEntry.id!==marker);
          const removedName=String(removedProjection?.name||removedProjection?.teamName||entry.data()?.answers?.teamName||'').trim();
          const sameNameRemains=removedName&&remainingTeams.some((teamEntry:any)=>String(teamEntry.name||teamEntry.teamName||'').trim().toLowerCase()===removedName.toLowerCase());
          const agreement=removedName?freshEvent.data()?.teamAgreements?.[removedName]:null;
          let tournamentArchiveRef:DocumentReference|null=null;
          if(!sameNameRemains&&agreement){
            const expectedArchiveId=`arch_tournament_${createHash('sha256').update(`${eventId}:${agreement.sourceTeamId}:${agreement.waiverHash}`).digest('hex')}`;
            if(agreement.archiveId!==expectedArchiveId||!agreement.receiptHash)throw new RegistrationInputError('Tournament waiver receipt pointer is invalid.',409);
            tournamentArchiveRef=authority.teamRef.collection('archived_waivers').doc(agreement.archiveId);
            const archive=await transaction.get(tournamentArchiveRef),archiveData=archive.data()||{};
            const {receiptHash,...archiveIdentity}=archiveData;
            if(!archive.exists||receiptHash!==agreement.receiptHash||registrationPayloadHash(archiveIdentity)!==receiptHash||!registrationArchiveMatches({eventId:archiveData.eventId,teamId:archiveData.teamId,tournamentTeamName:archiveData.tournamentTeamName,sourceTeamId:archiveData.sourceTeamId,waiverHash:archiveData.waiverHash,waiverVersion:archiveData.waiverVersion,configHash:archiveData.configHash},{eventId,teamId,tournamentTeamName:removedName,sourceTeamId:agreement.sourceTeamId,waiverHash:agreement.waiverHash,waiverVersion:agreement.waiverVersion,configHash:agreement.configHash}))throw new RegistrationInputError('Tournament waiver receipt does not match this registration.',409);
          }
          let currentCount=freshEvent.data()?.registrationEntryCount;
          if(!legacy&&!Number.isInteger(Number(currentCount))){const entries=await transaction.get(eventRef.collection('registrationEntries').limit(LEGACY_REGISTRATION_SCAN_LIMIT));currentCount=registrationCountFromLegacy(currentCount,entries.size,entries.size===LEGACY_REGISTRATION_SCAN_LIMIT);}
          transaction.delete(entryRef);
          transaction.delete((legacy ? authority.teamRef : eventRef).collection('archived_waivers').doc(`arch_waiver_${entryId}`));
          if(tournamentArchiveRef)transaction.delete(tournamentArchiveRef);
          transaction.update(eventRef, {
            tournamentTeams: [...new Set(remainingTeams.map((teamEntry:any)=>String(teamEntry.name||teamEntry.teamName||'')).filter(Boolean))],
            tournamentTeamsData: remainingTeams,
            ...(legacy?{}:{registrationEntryCount:Math.max(0,Number(currentCount)-1)}),
          });
          if(removedName&&!sameNameRemains)transaction.update(eventRef,new FieldPath('teamAgreements',removedName),FieldValue.delete());
        });
        return NextResponse.json({ success: true });
      }
      const leagueId = String(body.leagueId || '').trim();
      if (!isSafeId(leagueId)) return NextResponse.json({ error: 'Invalid registration identifiers.' }, { status: 400 });
      const leagueRef = adminDb.collection('leagues').doc(leagueId);
      const entryRef = leagueRef.collection('registrationEntries').doc(entryId);
      const leagueSnap = await leagueRef.get();
      if (!leagueSnap.exists || !canDeleteLeagueRegistration({
        creatorId: leagueSnap.data()?.creatorId,
        actorUid: auth.uid,
        actorRole: auth.role,
      })) return NextResponse.json({ error: 'League organizer access required.' }, { status: 403 });
      const recruitId = `recruit_${entryId}`;
      await adminDb.runTransaction(async transaction => {
        const privateRef = leagueRef.collection('private').doc('lifecycle');
        const [freshLeague, entry, privateSnapshot] = await Promise.all([transaction.get(leagueRef), transaction.get(entryRef), transaction.get(privateRef)]);
        if (!freshLeague.exists || !canDeleteLeagueRegistration({ creatorId: freshLeague.data()?.creatorId, actorUid: auth.uid, actorRole: auth.role })) throw new RegistrationInputError('League organizer access required.', 403);
        if (!entry.exists) return;
        let currentCount=freshLeague.data()?.registrationEntryCount;
        if(!Number.isInteger(Number(currentCount))){const entries=await transaction.get(leagueRef.collection('registrationEntries').limit(LEGACY_REGISTRATION_SCAN_LIMIT));currentCount=registrationCountFromLegacy(currentCount,entries.size,entries.size===LEGACY_REGISTRATION_SCAN_LIMIT);}
        transaction.delete(entryRef);
        transaction.delete(leagueRef.collection('archived_waivers').doc(`arch_waiver_${entryId}`));
        transaction.update(leagueRef, {
          [`teams.${recruitId}`]: FieldValue.delete(), [`individualRecruits.${recruitId}`]: FieldValue.delete(),
          memberTeamIds: FieldValue.arrayRemove(recruitId), memberIndivIds: FieldValue.arrayRemove(recruitId),
          registrationEntryCount: Math.max(0,Number(currentCount)-1),
        });
        if (privateSnapshot.exists) transaction.update(privateRef, {
          [`teamContacts.${recruitId}`]: FieldValue.delete(),
          [`individualRecruits.${recruitId}`]: FieldValue.delete(),
        });
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'update-registration' && kind === 'tournament') {
      const auth=await verifyFirebaseToken(req);if(auth instanceof NextResponse)return auth;
      const teamId=String(body.teamId||''),eventId=String(body.eventId||''),entryId=String(body.entryId||''),status=String(body.status||'');
      if(!isSafeId(teamId)||!isSafeId(eventId)||!isSafeId(entryId)||!['pending','accepted','declined'].includes(status))return NextResponse.json({error:'Invalid registration update.'},{status:400});
      const authority=await getTeamAuthority(teamId,auth.uid,auth.role);if(!authority?.isStaff)return NextResponse.json({error:'Tournament staff access required.'},{status:403});
      const eventRef=authority.teamRef.collection('events').doc(eventId),legacy=body.legacy===true,entryRef=legacy?authority.teamRef.collection('registrationEntries').doc(entryId):eventRef.collection('registrationEntries').doc(entryId);
      await adminDb.runTransaction(async transaction=>{const [team,event,entry]=await Promise.all([transaction.get(authority.teamRef),transaction.get(eventRef),transaction.get(entryRef)]);const member=authority.member?await transaction.get(authority.member.ref):null,memberData=member?.data();const active=authority.isSuperAdmin||team.data()?.ownerUserId===auth.uid||Boolean(member?.exists&&(memberData?.userId===auth.uid||(!memberData?.userId&&member.id===auth.uid))&&memberData?.status!=='removed'&&memberData?.isDeleted!==true&&hasStaffRole(memberData));if(!active)throw new RegistrationInputError('Tournament staff access required.',403);if(!team.exists||!event.exists||event.data()?.isTournament!==true||!entry.exists||(legacy&&entry.data()?.event_id!==eventId))throw new RegistrationInputError('Registration not found.',404);transaction.update(entryRef,{status,updatedAt:new Date().toISOString(),updatedBy:auth.uid});});
      return NextResponse.json({success:true});
    }

    if (action === 'update-registration' && kind === 'league') {
      const auth=await verifyFirebaseToken(req);if(auth instanceof NextResponse)return auth;
      const leagueId=String(body.leagueId||''),entryId=String(body.entryId||'');
      const updates:Record<string,boolean>={};if(typeof body.verified==='boolean')updates.verified=body.verified;if(typeof body.payment_received==='boolean')updates.payment_received=body.payment_received;
      if(!isSafeId(leagueId)||!isSafeId(entryId)||Object.keys(updates).length!==1)return NextResponse.json({error:'Invalid registration update.'},{status:400});
      const leagueRef=adminDb.collection('leagues').doc(leagueId),entryRef=leagueRef.collection('registrationEntries').doc(entryId);
      await adminDb.runTransaction(async transaction=>{const [league,entry]=await Promise.all([transaction.get(leagueRef),transaction.get(entryRef)]);if(!league.exists||!canDeleteLeagueRegistration({creatorId:league.data()?.creatorId,actorUid:auth.uid,actorRole:auth.role}))throw new RegistrationInputError('League organizer access required.',403);if(!entry.exists)throw new RegistrationInputError('Registration not found.',404);transaction.update(entryRef,{...updates,updatedAt:new Date().toISOString(),updatedBy:auth.uid});});
      return NextResponse.json({success:true});
    }

    if (action === 'lookup-team') {
      const teamCode = String(body.teamCode || '').trim().toUpperCase();
      if (teamCode.length < 3 || teamCode.length > 20) return NextResponse.json({ error: 'Invalid team code.' }, { status: 400 });
      const team = await findTeamByCode(teamCode);
      if (!team) return NextResponse.json({ error: 'Team code not found.' }, { status: 404 });
      return NextResponse.json({ success: true, team: { id: team.id, name: team.data().name || team.data().teamName, teamLogoUrl: team.data().teamLogoUrl } });
    }

    if (action === 'register' && (kind === 'league' || kind === 'tournament')) {
      const protocolId = String(body.protocolId || '').trim();
      const requestId = String(body.requestId || '').trim();
      const submittedVersion = Number(body.formVersion);
      const submittedHash = String(body.formHash || '').trim();
      const rawAnswers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : null;
      const signature = typeof body.signature === 'string' ? body.signature.trim().slice(0, 300) : '';
      if(signature&&!/\p{L}.*\p{L}/u.test(signature))return NextResponse.json({error:'Enter a meaningful signature.'},{status:400});
      if (!isSafeId(protocolId) || !/^[A-Za-z0-9_-]{16,100}$/.test(requestId)
        || !Number.isInteger(submittedVersion) || submittedVersion < 1
        || !/^[a-f0-9]{64}$/.test(submittedHash)
        || !rawAnswers || JSON.stringify(rawAnswers).length > 50_000) {
        return NextResponse.json({ error: 'Invalid registration submission.' }, { status: 400 });
      }

      let parentRef: DocumentReference;
      let entryParentRef: DocumentReference;
      let configRef: DocumentReference;
      let registrationCost = 0;
      let eventId: string | undefined;
      let entitlementRef: DocumentReference | null = null;
      let registrationEventRef: DocumentReference | null = null;
      let linkedMemberRef: DocumentReference | null = null;
      let linkedActorUid: string | null = null;
      let manualActorUid: string | null = null;
      let manualMemberRef: DocumentReference | null = null;
      let manualSuperAdmin=false;
      let legacyLeagueData: Record<string,unknown> | null = null;

      if (kind === 'league') {
        const identifier = String(body.leagueId || '');
        if (!isSafeId(identifier)) return NextResponse.json({ error: 'Invalid league identifier.' }, { status: 400 });
        let leagueSnap = await adminDb.collection('leagues').doc(identifier).get();
        if (!leagueSnap.exists) {
          const bySlug = await adminDb.collection('leagues').where('slug', '==', identifier).limit(1).get();
          if (bySlug.empty) return NextResponse.json({ error: 'League portal not found.' }, { status: 404 });
          leagueSnap = bySlug.docs[0];
        }
        const billingOwnerId = leagueBillingOwnerUserId(leagueSnap.data() || {});
        const creator = billingOwnerId
          ? await adminDb.collection('users').doc(billingOwnerId).get()
          : null;
        if (!creator?.exists || !permitsLegacyOrPaidPortals(creator.data()?.plan_type)) {
          return NextResponse.json({ error: 'This subscription does not include public registration.' }, { status: 403 });
        }
        parentRef = leagueSnap.ref;
        legacyLeagueData = leagueSnap.data() || {};
        entitlementRef = creator?.ref || null;
        entryParentRef = parentRef;
        configRef = parentRef.collection('registration').doc(protocolId);
        registrationCost = parseFloat(leagueSnap.data()?.registrationCost || leagueSnap.data()?.registration_cost || '0') || 0;
      } else {
        const teamId = String(body.teamId || '');
        eventId = String(body.eventId || '');
        if (!isSafeId(teamId) || !isSafeId(eventId)) return NextResponse.json({ error: 'Missing or invalid tournament identifiers.' }, { status: 400 });
        parentRef = adminDb.collection('teams').doc(teamId);
        const teamSnap = await parentRef.get();
        if (!teamSnap.exists || !permitsLegacyOrPaidPortals(
          teamSnap.data()?.planId,
          teamSnap.data()?.plan_type,
          teamSnap.data()?.subscriptionPlanId,
        )) {
          return NextResponse.json({ error: 'This subscription does not include public registration.' }, { status: 403 });
        }
        const eventRef = parentRef.collection('events').doc(eventId);
        registrationEventRef = eventRef;
        const eventSnap = await eventRef.get();
        if (!eventSnap.exists || !eventSnap.data()?.isTournament) return NextResponse.json({ error: 'Tournament portal not found.' }, { status: 404 });
        entryParentRef = eventRef;
        configRef = eventRef.collection('registration').doc(protocolId);
      }

      if(rawAnswers.manual_enrollment===true){const actor=await verifyFirebaseToken(req);if(actor instanceof NextResponse)return actor;manualSuperAdmin=actor.role==='superadmin';if(kind==='league'){const parent=await parentRef.get();if(!manualSuperAdmin&&parent.data()?.creatorId!==actor.uid)return NextResponse.json({error:'League organizer access required.'},{status:403});}else{const authority=await getTeamAuthority(parentRef.id,actor.uid,actor.role);if(!authority?.isStaff)return NextResponse.json({error:'Tournament staff access required.'},{status:403});manualMemberRef=authority.member?.ref||null;}manualActorUid=actor.uid;}

      const configSnap = await configRef.get();
      if (!configSnap.exists || configSnap.data()?.is_active !== true) return NextResponse.json({ error: 'Registration portal is inactive.' }, { status: 409 });
      const config = kind === 'league'
        ? effectiveLeagueRegistrationConfig(configSnap.data() || {}, legacyLeagueData || {})
        : configSnap.data()!;
      if (Number(config.form_version || 0) !== submittedVersion || String(config.config_hash || '') !== submittedHash) {
        return NextResponse.json({ error: 'Registration form changed. Reload before submitting.' }, { status: 409 });
      }
      const payment = registrationPaymentSnapshot(config);
      registrationCost = payment.amount;
      const { answers, schema } = sanitizeRegistrationAnswers(rawAnswers, config);
      const isTeamRegistration = String(
        config.type || (protocolId === 'team_config' ? 'team' : '')
      ).toLowerCase() === 'team';

      // Linked squad identity is untrusted client input. Player registration may
      // resolve a shared team code, while a direct staff handoff requires a
      // verified Firebase session and current staff authority. Both paths use
      // the canonical squad document values below.
      const recruiterCode = typeof answers.recruiter_code === 'string'
        ? answers.recruiter_code.trim().toUpperCase()
        : '';
      let linkedTeam: DocumentSnapshot | null = null;
      if (recruiterCode) {
        linkedTeam = await findTeamByCode(recruiterCode);
        if (!linkedTeam) return NextResponse.json({ error: 'Team code not found.' }, { status: 400 });
        answers.recruiter_code = recruiterCode;
      } else if (typeof answers.team_id === 'string' && answers.team_id) {
        const sourceTeamId = answers.team_id;
        if (!isSafeId(sourceTeamId)) return NextResponse.json({ error: 'Invalid squad identity.' }, { status: 400 });
        const auth = await verifyFirebaseToken(req);
        if (auth instanceof NextResponse) return auth;
        const authority = await getTeamAuthority(sourceTeamId, auth.uid, auth.role);
        if (!authority?.isStaff) {
          return NextResponse.json({ error: 'Squad staff access is required for linked registration.' }, { status: 403 });
        }
        linkedMemberRef = authority.member?.ref || null;
        linkedActorUid = auth.uid;
        linkedTeam = await authority.teamRef.get();
      }

      if (linkedTeam) {
        const linkedData = linkedTeam.data() || {};
        const canonicalName = String(linkedData.name || linkedData.teamName || '').trim().slice(0, 200);
        if (!canonicalName) return NextResponse.json({ error: 'The linked squad does not have a valid name.' }, { status: 409 });
        const canonicalLogo = typeof linkedData.teamLogoUrl === 'string' && /^https:\/\//i.test(linkedData.teamLogoUrl)
          ? linkedData.teamLogoUrl.slice(0, 2_000)
          : '';
        answers.team_id = linkedTeam.id;
        answers.team_name = canonicalName;
        answers.teamLogoUrl = canonicalLogo;
        if (isTeamRegistration) {
          answers.teamName = canonicalName;
          for (const field of schema) {
            if (/^(team|squad) name$/i.test(String(field.label || '').trim()) && field.id) {
              answers[String(field.id)] = canonicalName;
            }
          }
        }
      }

      if (kind === 'tournament') {
        const registrationType = String(config.type || (protocolId === 'team_config' ? 'team' : 'player')).toLowerCase();
        const requiredCore = registrationType === 'team' ? ['teamName', 'name', 'email'] : ['fullName', 'email', 'dateOfBirth'];
        if (requiredCore.some(key => typeof answers[key] !== 'string' || !answers[key].trim())) {
          return NextResponse.json({ error: `Please complete the required ${registrationType === 'team' ? 'team and contact' : 'participant'} details.` }, { status: 400 });
        }

        const baselineAliases = [
          { key: 'teamName', pattern: /^team name$/i },
          { key: 'name', pattern: /^(authorized contact|head coach).*name$/i },
          { key: 'email', pattern: /^email( address)?$/i },
          { key: 'phone', pattern: /^phone( number)?$/i },
        ];
        for (const alias of baselineAliases) {
          const field = schema.find((candidate: any) => alias.pattern.test(String(candidate.label || '').trim()));
          if (field?.id && answers[field.id] == null && answers[alias.key] != null) {
            answers[field.id] = answers[alias.key];
          }
        }
      }
      if (kind === 'league') {
        const registrationType = config.type || (protocolId === 'team_config' ? 'team' : protocolId === 'waiver_config' ? 'waiver' : 'player');
        const requiredCore = registrationType === 'team'
          ? (manualActorUid ? ['teamName', 'name', 'email'] : ['teamName', 'name', 'email', 'phone'])
          : registrationType === 'waiver'
            ? ['fullName', 'email', 'phone']
            : (manualActorUid ? ['name', 'email'] : ['fullName', 'email', 'phone', 'dateOfBirth']);
        if (requiredCore.some(key => typeof answers[key] !== 'string' || !answers[key].trim())) {
          return NextResponse.json({ error: 'Please complete the required registration details.' }, { status: 400 });
        }

        if (registrationType === 'player' && !manualActorUid) {
          const birthValue=String(answers.dateOfBirth),birthDate = new Date(`${birthValue}T00:00:00Z`);
          if (!isCalendarDate(birthValue)) {
            return NextResponse.json({ error: 'Enter a valid date of birth.' }, { status: 400 });
          }
          const now = new Date();
          let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
          const beforeBirthday = now.getUTCMonth() < birthDate.getUTCMonth()
            || (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() < birthDate.getUTCDate());
          if (beforeBirthday) age -= 1;
          if (age < 18 && ['guardian_name', 'guardian_email', 'guardian_phone', 'guardian_relationship'].some(key => typeof answers[key] !== 'string' || !answers[key].trim())) {
            return NextResponse.json({ error: 'Guardian contact details are required for athletes under 18.' }, { status: 400 });
          }
        }
      }
      const missingRequired = schema.some((field: any) => {
        if (field.required !== true || ['header', 'information_box'].includes(field.type)) return false;
        const value = answers[String(field.id || '')];
        if (field.type === 'checkbox') return Array.isArray(value) ? value.length === 0 : value !== true;
        return value == null || value === '' || (Array.isArray(value) && value.length === 0);
      });
      if (missingRequired) {
        return NextResponse.json({ error: 'Please complete every required registration field.' }, { status: 400 });
      }
      if(typeof answers.email==='string'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers.email))return NextResponse.json({error:'Enter a valid email address.'},{status:400});
      if(typeof answers.phone==='string'&&answers.phone.replace(/\D/g,'').length<7)return NextResponse.json({error:'Enter a valid phone number.'},{status:400});
      const waiverParts = [
        config.require_default_waiver ? config.default_waiver_text : '',
        config.custom_waiver_text || '',
        ...(config.team_waivers_content || []).map((waiver: any) => waiver.content || ''),
      ].filter(Boolean);
      if (waiverParts.length > 0 && !signature) {
        return NextResponse.json({ error: 'A signature is required for this registration.' }, { status: 400 });
      }
      const createdAt = new Date().toISOString();
      const registrantEmail=String(answers.email||'').trim().toLowerCase();
      if (registrantEmail) answers.email = registrantEmail;
      const entryId = createHash('sha256').update(`${kind}:${entryParentRef.path}:${protocolId}:${registrantEmail}`).digest('hex');
      const entry = entryParentRef.collection('registrationEntries').doc(entryId);
      const payloadHash = registrationPayloadHash({ answers, signature, submittedVersion, submittedHash });
      const entryData = {
        league_id: kind === 'league' ? parentRef.id : null,
        event_id: eventId || null,
        protocol_id: protocolId,
        answers,
        form_version: submittedVersion,
        config_hash: submittedHash,
        request_id: requestId,
        payload_hash: payloadHash,
        waiver_signed_text: waiverParts.join('\n\n') || signature || null,
        signature_date: signature ? createdAt : null,
        status: manualActorUid ? 'accepted' : 'pending', manualActorUid, registrationCost, payment, payment_received: false,
        created_at: createdAt, createdAt,
      };
      const waiverArchiveRef=entryParentRef.collection('archived_waivers').doc(`arch_waiver_${entry.id}`);
      const archiveFromEntry=(stored:Record<string,any>)=>({id:waiverArchiveRef.id,entryId:entry.id,protocolId,title:configuredAnswer(stored.answers||{},schema,['teamName','name','fullName'],/team name|participant|athlete|full name/i)||'Participant Registration',signer:signature,signedAt:stored.signature_date,waiverText:stored.waiver_signed_text||'',type:protocolId==='player_config'?'Individual':'Squad',answers:stored.answers||{},formVersion:stored.form_version,configHash:stored.config_hash,payloadHash:stored.payload_hash,immutable:true});
      const waiverArchiveData=archiveFromEntry(entryData);

      if (kind === 'tournament' && protocolId === 'team_config' && eventId) {
        const teamName = configuredAnswer(answers, schema, ['teamName'], /team name|squad name/i).slice(0, 200);
        const coachName = configuredAnswer(answers, schema, ['name', 'fullName'], /coach|contact name|captain/i).slice(0, 200);
        const logoUrl = typeof answers.teamLogoUrl === 'string' && /^https:\/\//i.test(answers.teamLogoUrl)
          ? answers.teamLogoUrl.slice(0, 2_000)
          : '';
        if (!teamName) return NextResponse.json({ error: 'A team name is required.' }, { status: 400 });

        const tournamentEventRef = parentRef.collection('events').doc(eventId);
        const result = await adminDb.runTransaction(async transaction => {
          const [freshEvent, freshConfig, existingEntry, freshTeam, existingArchive, freshManualMember] = await Promise.all([
            transaction.get(tournamentEventRef),
            transaction.get(configRef),
            transaction.get(entry),
            transaction.get(parentRef),
            transaction.get(waiverArchiveRef),
            manualMemberRef?transaction.get(manualMemberRef):Promise.resolve(null),
          ]);
          if (!freshEvent.exists || freshEvent.data()?.isTournament !== true || freshEvent.data()?.isArchived === true) {
            return { accepted: false as const, code: 'TOURNAMENT_NOT_FOUND', message: 'Tournament registration is inactive.', status: 404 };
          }
          const closeAt = freshEvent.data()?.registrationCloseAt ? new Date(freshEvent.data()!.registrationCloseAt).getTime() : null;
          if (freshEvent.data()?.registrationOpen !== true || freshEvent.data()?.status === 'cancelled' || (closeAt != null && (!Number.isFinite(closeAt) || closeAt <= Date.now()))) {
            return { accepted: false as const, code: 'REGISTRATION_CLOSED', message: 'Tournament registration is closed.', status: 409 };
          }
          if (!freshConfig.exists || freshConfig.data()?.is_active !== true) {
            return { accepted: false as const, code: 'REGISTRATION_INACTIVE', message: 'Registration portal is inactive.', status: 409 };
          }
          if (!freshTeam.exists || !permitsLegacyOrPaidPortals(freshTeam.data()?.planId, freshTeam.data()?.plan_type, freshTeam.data()?.subscriptionPlanId)) {
            return { accepted: false as const, code: 'REGISTRATION_UNAVAILABLE', message: 'This subscription does not include public registration.', status: 403 };
          }
          if(manualActorUid&&!manualSuperAdmin){const memberData=freshManualMember?.data();const active=freshTeam.data()?.ownerUserId===manualActorUid||Boolean(freshManualMember?.exists&&(memberData?.userId===manualActorUid||(!memberData?.userId&&freshManualMember.id===manualActorUid))&&memberData?.status!=='removed'&&memberData?.isDeleted!==true&&hasStaffRole(memberData));if(!active)return {accepted:false as const,code:'STAFF_REVOKED',message:'Tournament staff access required.',status:403};}
          if (Number(freshConfig.data()?.form_version || 0) !== submittedVersion || String(freshConfig.data()?.config_hash || '') !== submittedHash) {
            return { accepted: false as const, code: 'REGISTRATION_CHANGED', message: 'Registration form changed. Reload before submitting.', status: 409 };
          }
          if (existingEntry.exists) {
            if(existingEntry.data()?.payload_hash!==payloadHash)return { accepted: false as const, code: 'REQUEST_COLLISION', message: 'This registration request was already used with different details.', status: 409 };
            if(signature){const expectedArchive=archiveFromEntry(existingEntry.data()||{});if(existingArchive.exists&&!registrationArchiveMatches(existingArchive.data(),expectedArchive))return {accepted:false as const,code:'RECEIPT_CONFLICT',message:'The stored waiver receipt conflicts with this registration.',status:409};if(!existingArchive.exists)transaction.create(waiverArchiveRef,expectedArchive);}
            return { accepted: true as const, replay: true };
          }
          if (Array.isArray(freshEvent.data()?.tournamentGames) && freshEvent.data()!.tournamentGames.length > 0) {
            return { accepted: false as const, code: 'TOURNAMENT_ROSTER_LOCKED', message: 'Registration is closed because the tournament bracket has already been published.', status: 409 };
          }
          if((freshEvent.data()?.tournamentTeamsData||[]).some((item:any)=>String(item.name||item.teamName||'').trim().toLowerCase()===teamName.toLowerCase()))return {accepted:false as const,code:'DUPLICATE_TEAM',message:'A squad with this name is already registered.',status:409};
          const rawCapacity=freshEvent.data()?.registrationCapacity??freshEvent.data()?.maxRegistrations??0;
          if(!Number.isInteger(Number(rawCapacity))||Number(rawCapacity)<0||Number(rawCapacity)>100000)return {accepted:false as const,code:'INVALID_CAPACITY',message:'Tournament registration configuration is invalid.',status:409};
          const capacity = Number(rawCapacity);
          let currentCount=freshEvent.data()?.registrationEntryCount;
          if(!Number.isInteger(Number(currentCount))){const legacy=await transaction.get(entryParentRef.collection('registrationEntries').limit(LEGACY_REGISTRATION_SCAN_LIMIT));currentCount=registrationCountFromLegacy(currentCount,legacy.size,legacy.size===LEGACY_REGISTRATION_SCAN_LIMIT);}
          const nextCount=nextRegistrationCount(Number(currentCount??0),capacity);
          if(!nextCount.accepted)return { accepted: false as const, code: 'REGISTRATION_FULL', message: 'Tournament registration is at capacity.', status: 409 };

          transaction.create(entry, entryData);
          if (signature) {
            transaction.create(waiverArchiveRef,waiverArchiveData);
          }
          transaction.update(tournamentEventRef, {
            tournamentTeams: FieldValue.arrayUnion(teamName),
            tournamentTeamsData: FieldValue.arrayUnion({
              id: `p_${entry.id}`,
              name: teamName,
              coach: coachName || 'Pipeline Coach',
              logoUrl,
              source: 'pipeline',
              sourceTeamId: typeof answers.team_id === 'string' ? answers.team_id.slice(0, 200) : null,
            }),
            registrationEntryCount: nextCount.count,
          });
          return { accepted: true as const };
        });
        if (!result.accepted) {
          return NextResponse.json({ error: result.message, code: result.code }, { status: result.status });
        }
        return NextResponse.json({ success: true, entryId: entry.id, replay: 'replay' in result && result.replay === true });
      }

      // Public registrations cross a trusted server boundary. Persist the raw
      // response and the league's operational projection in one atomic batch so
      // organizers never receive an entry that is absent from team/player tools.
      const commitResult = await adminDb.runTransaction(async batch => {
        const leaguePrivateRef = kind === 'league' ? parentRef.collection('private').doc('lifecycle') : null;
        const [freshConfig, existingEntry, freshParent, freshEntitlement, freshEvent, freshLinkedTeam, freshLinkedMember, existingArchive, freshManualMember, freshLeaguePrivate] = await Promise.all([
          batch.get(configRef),
          batch.get(entry),
          batch.get(parentRef),
          entitlementRef ? batch.get(entitlementRef) : Promise.resolve(null),
          registrationEventRef ? batch.get(registrationEventRef) : Promise.resolve(null),
          linkedTeam ? batch.get(linkedTeam.ref) : Promise.resolve(null),
          linkedMemberRef ? batch.get(linkedMemberRef) : Promise.resolve(null),
          batch.get(waiverArchiveRef),
          manualMemberRef?batch.get(manualMemberRef):Promise.resolve(null),
          leaguePrivateRef ? batch.get(leaguePrivateRef) : Promise.resolve(null),
        ]);
        if (!freshParent.exists || !freshConfig.exists || freshConfig.data()?.is_active !== true) {
          return { accepted: false as const, message: 'Registration portal is inactive.', status: 409 };
        }
        const freshConfigData = kind === 'league'
          ? effectiveLeagueRegistrationConfig(freshConfig.data() || {}, freshParent.data() || {})
          : freshConfig.data()!;
        const freshScope = kind === 'tournament' ? freshEvent?.data() : freshParent.data();
        const closeAt = freshScope?.registrationCloseAt ? new Date(freshScope.registrationCloseAt).getTime() : null;
        if (freshScope?.isActive === false || freshScope?.registrationOpen === false || (closeAt != null && Number.isFinite(closeAt) && closeAt <= Date.now())) {
          return { accepted: false as const, message: 'Registration portal is closed.', status: 409 };
        }
        if (kind === 'league' && (!freshEntitlement?.exists || !permitsLegacyOrPaidPortals(freshEntitlement.data()?.plan_type))) {
          return { accepted: false as const, message: 'This subscription does not include public registration.', status: 403 };
        }
        if (kind === 'tournament' && !permitsLegacyOrPaidPortals(freshParent.data()?.planId, freshParent.data()?.plan_type, freshParent.data()?.subscriptionPlanId)) {
          return { accepted: false as const, message: 'This subscription does not include public registration.', status: 403 };
        }
        if(manualActorUid&&!manualSuperAdmin&&kind==='league'&&freshParent.data()?.creatorId!==manualActorUid)return {accepted:false as const,message:'League organizer access required.',status:403};
        if(manualActorUid&&!manualSuperAdmin&&kind==='tournament'){const memberData=freshManualMember?.data();const active=freshParent.data()?.ownerUserId===manualActorUid||Boolean(freshManualMember?.exists&&(memberData?.userId===manualActorUid||(!memberData?.userId&&freshManualMember.id===manualActorUid))&&memberData?.status!=='removed'&&memberData?.isDeleted!==true&&hasStaffRole(memberData));if(!active)return {accepted:false as const,message:'Tournament staff access required.',status:403};}
        if (kind === 'tournament' && (!freshEvent?.exists || freshEvent.data()?.isTournament !== true || freshEvent.data()?.isArchived === true || freshEvent.data()?.registrationOpen !== true || freshEvent.data()?.status === 'cancelled')) {
          return { accepted: false as const, message: 'Tournament registration is inactive.', status: 409 };
        }
        if (linkedTeam) {
          const linkedData = freshLinkedTeam?.data() || {};
          const codeStillMatches = !recruiterCode || [linkedData.inviteCode, linkedData.teamCode, linkedData.code].some(value => String(value || '').toUpperCase() === recruiterCode);
          const canonicalName = String(linkedData.name || linkedData.teamName || '').trim().slice(0, 200);
          const memberData = freshLinkedMember?.data();
          const actorStillAuthorized = !linkedActorUid || linkedData.ownerUserId === linkedActorUid || Boolean(freshLinkedMember?.exists && (memberData?.userId === linkedActorUid || (!memberData?.userId && freshLinkedMember.id === linkedActorUid)) && memberData?.status !== 'removed' && memberData?.isDeleted !== true && hasStaffRole(memberData));
          if (!freshLinkedTeam?.exists || !codeStillMatches || !actorStillAuthorized || canonicalName !== answers.team_name || linkedTeam.id !== answers.team_id) return { accepted: false as const, message: 'Linked squad authority changed. Reload before submitting.', status: 409 };
        }
        if (Number(freshConfigData.form_version || 0) !== submittedVersion || String(freshConfigData.config_hash || '') !== submittedHash) {
          return { accepted: false as const, message: 'Registration form changed. Reload before submitting.', status: 409 };
        }
        if (existingEntry.exists) {
          if(existingEntry.data()?.payload_hash!==payloadHash)return { accepted: false as const, message: 'This registration request was already used with different details.', status: 409 };
          if(signature){const expectedArchive=archiveFromEntry(existingEntry.data()||{});if(existingArchive.exists&&!registrationArchiveMatches(existingArchive.data(),expectedArchive))return {accepted:false as const,message:'The stored waiver receipt conflicts with this registration.',status:409};if(!existingArchive.exists)batch.create(waiverArchiveRef,expectedArchive);}
          return { accepted: true as const, replay: true };
        }
        const rawCapacity=freshConfig.data()?.max_registrations??freshScope?.registrationCapacity??freshScope?.maxRegistrations??0;
        if(!Number.isInteger(Number(rawCapacity))||Number(rawCapacity)<0||Number(rawCapacity)>100000)return {accepted:false as const,message:'Registration capacity configuration is invalid.',status:409};
        const capacity = Number(rawCapacity);
        let currentCount=freshScope?.registrationEntryCount;
        if(!Number.isInteger(Number(currentCount))){const legacy=await batch.get(entryParentRef.collection('registrationEntries').limit(LEGACY_REGISTRATION_SCAN_LIMIT));currentCount=registrationCountFromLegacy(currentCount,legacy.size,legacy.size===LEGACY_REGISTRATION_SCAN_LIMIT);}
        const nextCount=nextRegistrationCount(Number(currentCount??0),capacity);
        if(!nextCount.accepted)return { accepted: false as const, message: 'Registration is at capacity.', status: 409 };
        batch.create(entry, entryData);
        batch.update(kind==='tournament'&&registrationEventRef?registrationEventRef:parentRef,{registrationEntryCount:nextCount.count});

      if (kind === 'league') {
        const registrationType = String(config.type || (
          protocolId === 'team_config' ? 'team' : protocolId === 'waiver_config' ? 'waiver' : 'player'
        )).toLowerCase();
        const recruitId = `recruit_${entry.id}`;

        if (registrationType === 'team' || protocolId === 'team_config') {
          const teamName = configuredAnswer(answers, schema, ['teamName'], /team name|squad name/i).slice(0, 200);
          const coachName = configuredAnswer(answers, schema, ['name', 'fullName'], /coach|contact name|captain/i).slice(0, 200);
          if (teamName) {
            batch.update(parentRef, {
              [`teams.${recruitId}`]: {
                teamName,
                teamLogoUrl: typeof answers.teamLogoUrl === 'string' && /^https:\/\//i.test(answers.teamLogoUrl)
                  ? answers.teamLogoUrl.slice(0, 2_000)
                  : '',
                teamId: typeof answers.team_id === 'string' ? answers.team_id.slice(0, 200) : null,
                wins: 0,
                losses: 0,
                ties: 0,
                points: 0,
                status: 'pending',
                signedAt: signature ? createdAt : null,
              },
              memberTeamIds: FieldValue.arrayUnion(recruitId),
            });
            batch.set(leaguePrivateRef!, {
              ...(freshLeaguePrivate?.data() || {}),
              teamContacts: {
                ...(freshLeaguePrivate?.data()?.teamContacts || {}),
                [recruitId]: {
                  coachName: coachName || 'Recruit Coach',
                  coachEmail: typeof answers.email === 'string' ? answers.email.slice(0, 320) : '',
                  coachPhone: typeof answers.phone === 'string' ? answers.phone.slice(0, 100) : '',
                  inviteCode: entry.id.slice(-6).toUpperCase(),
                },
              },
            });
          }
        } else if (
          registrationType === 'player' || registrationType === 'individual' ||
          protocolId === 'player_config' || protocolId === 'individual_config'
        ) {
          const participantName = configuredAnswer(
            answers,
            schema,
            ['fullName', 'name'],
            /participant|athlete|player|full name/i,
          ).slice(0, 200) || 'Recruit Athlete';
          batch.set(leaguePrivateRef!, {
            ...(freshLeaguePrivate?.data() || {}),
            individualRecruits: {
              ...(freshLeaguePrivate?.data()?.individualRecruits || {}),
              [recruitId]: {
              name: participantName,
              email: typeof answers.email === 'string' ? answers.email.slice(0, 320) : '',
              phone: typeof answers.phone === 'string' ? answers.phone.slice(0, 100) : '',
              status: 'pending',
              signedAt: signature ? createdAt : null,
              teamCode: typeof answers.recruiter_code === 'string' ? answers.recruiter_code.slice(0, 100) : null,
              teamName: typeof answers.team_name === 'string' ? answers.team_name.slice(0, 200) : null,
              teamId: typeof answers.team_id === 'string' ? answers.team_id.slice(0, 200) : null,
            },
            },
          });
          batch.update(parentRef, {
            memberIndivIds: FieldValue.arrayUnion(recruitId),
          });
        }
      }

      if (signature) {
        batch.create(waiverArchiveRef,waiverArchiveData);
      }
        return { accepted: true as const, replay: false };
      });
      if (!commitResult.accepted) return NextResponse.json({ error: commitResult.message }, { status: commitResult.status });
      return NextResponse.json({ success: true, entryId: entry.id, replay: commitResult.replay });
    }

    if (kind === 'tournament') {
      const { teamId, eventId } = body;
      if (!isSafeId(teamId) || !isSafeId(eventId)) return NextResponse.json({ error: 'Missing or invalid tournament identifiers.' }, { status: 400 });
      const ref = adminDb.collection('teams').doc(teamId).collection('events').doc(eventId);
      const [snap, teamSnap] = await Promise.all([
        ref.get(),
        adminDb.collection('teams').doc(teamId).get(),
      ]);
      if (!teamSnap.exists) {
        return NextResponse.json({ error: 'Tournament portal not found.' }, { status: 404 });
      }
      if (!permitsLegacyOrPaidPortals(
        teamSnap.data()?.planId,
        teamSnap.data()?.plan_type,
        teamSnap.data()?.subscriptionPlanId,
      )) {
        return NextResponse.json({ error: 'This subscription does not include public portals.' }, { status: 403 });
      }
      if (!snap.exists || !snap.data()?.isTournament) return NextResponse.json({ error: 'Tournament portal not found.' }, { status: 404 });
      const event = snap.data()!;
      if (event.isArchived === true) return NextResponse.json({ error: 'Tournament portal is inactive.' }, { status: 404 });
      const legacyOpen = isLegacyOpenPortal(teamId, eventId);

      if (action === 'verify') {
        await adminDb.runTransaction(transaction => verifiedTournamentEvent(transaction, ref, teamId, eventId, code, legacyOpen));
        return NextResponse.json({ success: true });
      }

      if (action === 'score') {
        if (!gameId || !validScore(body.score1) || !validScore(body.score2)) {
          return NextResponse.json({ error: 'A valid game and scores from 0 to 999 are required.' }, { status: 400 });
        }
        const result = await withTournamentScheduleMutationLock(() => adminDb.runTransaction(async transaction => {
          const fresh = await verifiedTournamentEvent(transaction, ref, teamId, eventId, code, legacyOpen);
          const games = [...(fresh.tournamentGames || [])];
          const index = games.findIndex((game: any) => game.id === gameId);
          if (index < 0) return { valid: false as const, code: 'MATCH_NOT_FOUND', message: 'Match not found.' };
          const validation = validateBracketScoreSubmission(games, gameId, body.score1, body.score2);
          if (!validation.valid) return validation;
          let updatedGames;
          try {
            updatedGames = recordTournamentScore(games, gameId, body.score1, body.score2)
              .map(game => game.id === gameId ? { ...game, updatedAt: new Date().toISOString() } : game);
          } catch (error: any) {
            return { valid: false as const, code: error.code || 'INVALID_SCORE', message: error.message || 'Score could not be posted.' };
          }
          transaction.update(ref, { tournamentGames: updatedGames });
          transaction.set(ref.collection('scoreAudit').doc(), auditData(req, 'score', gameId, { score1: body.score1, score2: body.score2 }));
          return { valid: true as const };
        }));
        if (!result.valid) {
          const status = result.code === 'MATCH_NOT_FOUND' ? 404 : result.code === 'INVALID_SCORE' ? 400 : 409;
          return NextResponse.json({ error: result.message, code: result.code }, { status });
        }
        return NextResponse.json({ success: true });
      }

      if (action === 'dispute') {
        const notes = String(body.notes || '').trim().slice(0, 2000);
        if (!gameId || !notes) return NextResponse.json({ error: 'A match and dispute details are required.' }, { status: 400 });
        const result = await adminDb.runTransaction(async transaction => {
          const fresh = await verifiedTournamentEvent(transaction, ref, teamId, eventId, code, legacyOpen);
          const games = [...(fresh.tournamentGames || [])];
          const index = games.findIndex((game: any) => game.id === gameId);
          if (index < 0) return false;
          games[index] = { ...games[index], isDisputed: true, disputeNotes: notes, updatedAt: new Date().toISOString() };
          transaction.update(ref, { tournamentGames: games });
          transaction.set(ref.collection('scoreAudit').doc(), auditData(req, 'dispute', gameId, { notes }));
          return true;
        });
        if (!result) return NextResponse.json({ error: 'Match not found.' }, { status: 404 });
        return NextResponse.json({ success: true });
      }

      if (action === 'waiver') {
        const teamName = String(body.teamName || '').trim();
        const signer = String(body.signer || '').trim();
        const registrationCode = String(body.registrationCode || '').trim().toUpperCase();
        const signedDate = String(body.signedDate || '').trim();
        const expectedVersion=Number(body.expectedVersion),expectedHash=String(body.expectedHash||'');
        const parsedSignedDate = /^\d{4}-\d{2}-\d{2}$/.test(signedDate)
          ? new Date(`${signedDate}T00:00:00.000Z`)
          : null;
        const today = new Date().toISOString().slice(0, 10);
        const isValidSignedDate = parsedSignedDate != null &&
          !Number.isNaN(parsedSignedDate.getTime()) &&
          parsedSignedDate.toISOString().startsWith(signedDate) && signedDate === today;
        if (!teamName || !signer || signer.length > 300 || !isValidSignedDate || !Number.isInteger(expectedVersion) || expectedVersion < 1 || !/^[a-f0-9]{64}$/.test(expectedHash) || !/^[A-Z0-9_-]{4,32}$/.test(registrationCode)) {
          return NextResponse.json({ error: 'A valid tournament team, signer, and signature date are required.' }, { status: 400 });
        }
        const auth = await verifyFirebaseToken(req);
        if (auth instanceof NextResponse) return auth;
        const registeredTeam = (event.tournamentTeamsData || []).find((team: any) => String(team.name || team.teamName || '').trim() === teamName);
        const sourceTeamId = String(registeredTeam?.sourceTeamId || registeredTeam?.teamId || '').trim();
        if (!isSafeId(sourceTeamId)) return NextResponse.json({ error: 'This tournament team is not linked to a verified squad.' }, { status: 403 });
        const teamAuthority = await getTeamAuthority(sourceTeamId, auth.uid, auth.role);
        if (!teamAuthority?.isStaff) return NextResponse.json({ error: 'Verified squad staff access is required to sign this waiver.' }, { status: 403 });
        const signedAt = new Date().toISOString();
        const configRef = ref.collection('registration').doc('team_config');
        const codeRef = adminDb.collection('tournamentRegistrationCodes').doc(registrationCode);
        const result = await adminDb.runTransaction(async transaction => {
          const reads = [transaction.get(ref), transaction.get(codeRef), transaction.get(configRef), transaction.get(teamAuthority.teamRef)];
          if (teamAuthority.member) reads.push(transaction.get(teamAuthority.member.ref));
          const [freshEvent, codeMapping, config, sourceTeam, freshMember] = await Promise.all(reads);
          if (!freshEvent.exists || freshEvent.data()?.isArchived === true) return { ok: false as const, status: 409, error: 'Tournament waiver is unavailable.' };
          if (!codeMapping.exists || codeMapping.data()?.teamId !== teamId || codeMapping.data()?.eventId !== eventId) return { ok: false as const, status: 403, error: 'The tournament registration code is invalid.' };
          const roster = (freshEvent.data()?.tournamentTeamsData || []).find((team: any) => String(team.name || team.teamName || '').trim() === teamName);
          if (!roster || String(roster.sourceTeamId || roster.teamId || '') !== sourceTeamId) return { ok: false as const, status: 403, error: 'The tournament team does not match the verified squad.' };
          const memberData = freshMember?.data();
          const activeStaff = teamAuthority.isSuperAdmin || (sourceTeam.exists && sourceTeam.data()?.ownerUserId === auth.uid) || Boolean(freshMember?.exists && (memberData?.userId === auth.uid || (!memberData?.userId && freshMember.id === auth.uid)) && memberData?.status !== 'removed' && memberData?.isDeleted !== true && hasStaffRole(memberData));
          if (!activeStaff) return { ok: false as const, status: 403, error: 'Verified squad staff access is required to sign this waiver.' };
          if (!config.exists || config.data()?.is_active !== true || !config.data()?.config_hash || !Number.isInteger(Number(config.data()?.form_version))) return { ok: false as const, status: 409, error: 'Tournament waiver configuration is unavailable.' };
          const configData = config.data()!;
          if(Number(configData.form_version)!==expectedVersion||String(configData.config_hash)!==expectedHash)return {ok:false as const,status:409,error:'Tournament waiver changed. Review the current version.'};
          const waiverText = [configData.require_default_waiver ? configData.default_waiver_text : '', configData.custom_waiver_text || '', ...(configData.team_waivers_content || []).map((item: any) => item.content || '')].filter(Boolean).join('\n\n');
          if (!waiverText) return { ok: false as const, status: 409, error: 'Tournament waiver configuration is unavailable.' };
          const waiverHash = createHash('sha256').update(`${configData.form_version}:${configData.config_hash}:${waiverText}`).digest('hex');
          const archiveId = `arch_tournament_${createHash('sha256').update(`${eventId}:${sourceTeamId}:${waiverHash}`).digest('hex')}`;
          const archiveRef = adminDb.collection('teams').doc(teamId).collection('archived_waivers').doc(archiveId);
          const prior = await transaction.get(archiveRef);
          const receiptIdentityBase = {id:archiveId,eventId,tournamentTeamName:teamName,signer,signedBy:auth.uid,sourceTeamId,signedDate,title:configData.title||`${freshEvent.data()?.title||'Tournament'} Waiver`,documentId:`registration_team_config_v${configData.form_version}`,waiverText,waiverHash,waiverVersion:configData.form_version,configHash:configData.config_hash,teamId,tournamentId:eventId,type:'Tournament Waiver',status:'verified',immutable:true};
          if (prior.exists) {
            const receiptIdentity={...receiptIdentityBase,signedAt:prior.data()?.signedAt};
            const receiptHash=registrationPayloadHash(receiptIdentity);
            return prior.data()?.receiptHash === receiptHash && registrationArchiveMatches(Object.fromEntries(Object.keys(receiptIdentity).map(key=>[key,prior.data()?.[key]])),receiptIdentity)
              ? { ok: true as const, replay: true }
              : { ok: false as const, status: 409, error: 'This waiver version was already signed with different details.' };
          }
          const receiptIdentity={...receiptIdentityBase,signedAt},receiptHash=registrationPayloadHash(receiptIdentity);
          transaction.update(ref, new FieldPath('teamAgreements', teamName), { agreed: true, captainName: signer, signedAt, signedDate, signedBy: auth.uid, sourceTeamId, waiverHash, waiverVersion: configData.form_version,configHash:configData.config_hash,archiveId,receiptHash });
          transaction.create(archiveRef, { ...receiptIdentity, receiptHash });
          return { ok: true as const, replay: false };
        });
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
        return NextResponse.json({ success: true, replay: result.replay });
      }
    }

    if (kind === 'league') {
      const identifier = body.leagueId;
      if (!isSafeId(identifier)) return NextResponse.json({ error: 'Missing or invalid leagueId.' }, { status: 400 });
      let ref = adminDb.collection('leagues').doc(identifier);
      let snap = await ref.get();
      if (!snap.exists) {
        const bySlug = await adminDb.collection('leagues').where('slug', '==', identifier).limit(1).get();
        if (bySlug.empty) return NextResponse.json({ error: 'League portal not found.' }, { status: 404 });
        snap = bySlug.docs[0];
        ref = snap.ref;
      }
      if (action === 'score') {
        const result = await submitCompetitionScore(competitionScoringInput({ ...body, leagueId: ref.id }));
        return NextResponse.json(result);
      }
      if (action === 'dispute') {
        const result = await openCompetitionDispute(competitionScoringInput({ ...body, leagueId: ref.id }));
        return NextResponse.json(result);
      }
    }

    return NextResponse.json({ error: 'Invalid portal action.' }, { status: 400 });
  } catch (error: any) {
    if (error instanceof ScheduleDeploymentError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error?.message === 'Request collision.') return NextResponse.json({ error: error.message }, { status: 409 });
    if (error?.message?.startsWith('Forbidden competition')) return NextResponse.json({ error: 'League access denied.' }, { status: 403 });
    if (error?.message?.startsWith('Invalid competition')) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof RegistrationInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof TournamentScheduleDeploymentError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('[public/portals/action] Error:', error.message);
    return NextResponse.json({ error: 'Portal action could not be completed.' }, { status: 500 });
  }
}
