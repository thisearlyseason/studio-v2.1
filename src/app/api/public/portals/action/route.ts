import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { FieldPath, FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { advanceBracketMatch } from '@/lib/scheduler-utils';
import { credentialsMatch, isLegacyOpenPortal, validScore } from '@/lib/score-action-security';
import { permitsLegacyOrPaidPortals } from '@/lib/public-portal-data';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

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

function sanitizeRegistrationAnswers(raw: Record<string, unknown>, config: Record<string, any>) {
  const schema = Array.isArray(config.form_schema) ? config.form_schema : [];
  const allowed = new Set<string>([
    ...schema.map((field: any) => String(field.id || '')).filter(Boolean),
    'name', 'fullName', 'teamName', 'email', 'phone', 'dateOfBirth', 'dob',
    'division', 'teamLogoUrl', 'recruiter_code', 'team_name', 'team_id',
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

    if (action === 'lookup-team') {
      const teamCode = String(body.teamCode || '').trim().toUpperCase();
      if (teamCode.length < 3 || teamCode.length > 20) return NextResponse.json({ error: 'Invalid team code.' }, { status: 400 });
      let matches = await adminDb.collection('teams').where('teamCode', '==', teamCode).limit(1).get();
      if (matches.empty) matches = await adminDb.collection('teams').where('code', '==', teamCode).limit(1).get();
      if (matches.empty) return NextResponse.json({ error: 'Team code not found.' }, { status: 404 });
      const team = matches.docs[0];
      return NextResponse.json({ success: true, team: { id: team.id, name: team.data().name || team.data().teamName, teamLogoUrl: team.data().teamLogoUrl } });
    }

    if (action === 'register' && (kind === 'league' || kind === 'tournament')) {
      const protocolId = String(body.protocolId || '').trim();
      const rawAnswers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : null;
      const signature = typeof body.signature === 'string' ? body.signature.trim().slice(0, 300) : '';
      if (!isSafeId(protocolId) || !rawAnswers || JSON.stringify(rawAnswers).length > 50_000) {
        return NextResponse.json({ error: 'Invalid registration submission.' }, { status: 400 });
      }

      let parentRef: DocumentReference;
      let configRef: DocumentReference;
      let registrationCost = 0;
      let eventId: string | undefined;

      if (kind === 'league') {
        const identifier = String(body.leagueId || '');
        if (!isSafeId(identifier)) return NextResponse.json({ error: 'Invalid league identifier.' }, { status: 400 });
        let leagueSnap = await adminDb.collection('leagues').doc(identifier).get();
        if (!leagueSnap.exists) {
          const bySlug = await adminDb.collection('leagues').where('slug', '==', identifier).limit(1).get();
          if (bySlug.empty) return NextResponse.json({ error: 'League portal not found.' }, { status: 404 });
          leagueSnap = bySlug.docs[0];
        }
        const creator = leagueSnap.data()?.creatorId
          ? await adminDb.collection('users').doc(leagueSnap.data()!.creatorId).get()
          : null;
        if (creator?.exists && !permitsLegacyOrPaidPortals(creator.data()?.plan_type)) {
          return NextResponse.json({ error: 'This subscription does not include public registration.' }, { status: 403 });
        }
        parentRef = leagueSnap.ref;
        configRef = parentRef.collection('registration').doc(protocolId);
        registrationCost = parseFloat(leagueSnap.data()?.registrationCost || leagueSnap.data()?.registration_cost || '0') || 0;
      } else {
        const teamId = String(body.teamId || '');
        eventId = String(body.eventId || '');
        if (!isSafeId(teamId) || !isSafeId(eventId)) return NextResponse.json({ error: 'Missing or invalid tournament identifiers.' }, { status: 400 });
        parentRef = adminDb.collection('teams').doc(teamId);
        const teamSnap = await parentRef.get();
        if (!teamSnap.exists || !permitsLegacyOrPaidPortals(teamSnap.data()?.planId)) {
          return NextResponse.json({ error: 'This subscription does not include public registration.' }, { status: 403 });
        }
        const eventRef = parentRef.collection('events').doc(eventId);
        const eventSnap = await eventRef.get();
        if (!eventSnap.exists || !eventSnap.data()?.isTournament) return NextResponse.json({ error: 'Tournament portal not found.' }, { status: 404 });
        configRef = eventRef.collection('registration').doc(protocolId);
      }

      const configSnap = await configRef.get();
      if (!configSnap.exists || configSnap.data()?.is_active !== true) return NextResponse.json({ error: 'Registration portal is inactive.' }, { status: 409 });
      const config = configSnap.data()!;
      const { answers, schema } = sanitizeRegistrationAnswers(rawAnswers, config);
      const missingRequired = schema.some((field: any) => {
        if (field.required !== true || ['header', 'information_box'].includes(field.type)) return false;
        const value = answers[String(field.id || '')];
        return value == null || value === '' || (Array.isArray(value) && value.length === 0);
      });
      if (missingRequired) {
        return NextResponse.json({ error: 'Please complete every required registration field.' }, { status: 400 });
      }
      const waiverParts = [
        config.require_default_waiver ? config.default_waiver_text : '',
        config.custom_waiver_text || '',
        ...(config.team_waivers_content || []).map((waiver: any) => waiver.content || ''),
      ].filter(Boolean);
      if (waiverParts.length > 0 && !signature) {
        return NextResponse.json({ error: 'A signature is required for this registration.' }, { status: 400 });
      }
      const createdAt = new Date().toISOString();
      const entry = await parentRef.collection('registrationEntries').add({
        league_id: kind === 'league' ? parentRef.id : null,
        event_id: eventId || null,
        protocol_id: protocolId,
        answers,
        form_version: Number(body.formVersion || config.form_version || 0),
        waiver_signed_text: waiverParts.join('\n\n') || signature || null,
        signature_date: signature ? createdAt : null,
        status: 'pending', registrationCost, payment_received: false,
        created_at: createdAt, createdAt,
      });

      if (signature) {
        const registrationName = configuredAnswer(answers, schema, ['teamName', 'name', 'fullName'], /team name|participant|athlete|full name/i);
        await parentRef.collection('archived_waivers').doc(`arch_waiver_${entry.id}`).set({
          id: `arch_waiver_${entry.id}`, entryId: entry.id, protocolId,
          title: registrationName || 'Participant Registration',
          signer: signature, signedAt: createdAt, waiverText: waiverParts.join('\n\n'),
          type: protocolId === 'player_config' ? 'Individual' : 'Squad', answers,
        });
      }

      if (kind === 'tournament' && protocolId === 'team_config' && eventId) {
        const teamName = configuredAnswer(answers, schema, ['teamName'], /team name|squad name/i).slice(0, 200);
        const coachName = configuredAnswer(answers, schema, ['name', 'fullName'], /coach|contact name|captain/i).slice(0, 200);
        const logoUrl = typeof answers.teamLogoUrl === 'string' && /^https:\/\//i.test(answers.teamLogoUrl)
          ? answers.teamLogoUrl.slice(0, 2_000)
          : '';
        if (teamName) {
          await parentRef.collection('events').doc(eventId).update({
            tournamentTeams: FieldValue.arrayUnion(teamName),
            tournamentTeamsData: FieldValue.arrayUnion({ id: `p_${entry.id}`, name: teamName, coach: coachName || 'Pipeline Coach', logoUrl, source: 'pipeline' }),
          });
        }
      }
      return NextResponse.json({ success: true, entryId: entry.id });
    }

    if (kind === 'tournament') {
      const { teamId, eventId } = body;
      if (!isSafeId(teamId) || !isSafeId(eventId)) return NextResponse.json({ error: 'Missing or invalid tournament identifiers.' }, { status: 400 });
      const ref = adminDb.collection('teams').doc(teamId).collection('events').doc(eventId);
      const [snap, teamSnap] = await Promise.all([
        ref.get(),
        adminDb.collection('teams').doc(teamId).get(),
      ]);
      if (teamSnap.exists && !permitsLegacyOrPaidPortals(teamSnap.data()?.planId)) {
        return NextResponse.json({ error: 'This subscription does not include public portals.' }, { status: 403 });
      }
      if (!snap.exists || !snap.data()?.isTournament) return NextResponse.json({ error: 'Tournament portal not found.' }, { status: 404 });
      const event = snap.data()!;
      if (event.isArchived === true) return NextResponse.json({ error: 'Tournament portal is inactive.' }, { status: 404 });
      const legacyOpen = isLegacyOpenPortal(teamId, eventId);

      if (action === 'verify') {
        if (!event.scoringCode && !legacyOpen) {
          return NextResponse.json({ error: 'Scorekeeper access is not configured for this tournament.' }, { status: 409 });
        }
        return credentialsMatch(event.scoringCode, code, legacyOpen)
          ? NextResponse.json({ success: true })
          : NextResponse.json({ error: 'Invalid scorekeeper code.' }, { status: 403 });
      }

      if (action === 'score') {
        if (!event.scoringCode && !legacyOpen) return NextResponse.json({ error: 'Scorekeeper access is not configured for this tournament.' }, { status: 409 });
        if (!credentialsMatch(event.scoringCode, code, legacyOpen)) return NextResponse.json({ error: 'Invalid scorekeeper code.' }, { status: 403 });
        if (!gameId || !validScore(body.score1) || !validScore(body.score2)) {
          return NextResponse.json({ error: 'A valid game and scores from 0 to 999 are required.' }, { status: 400 });
        }
        const result = await adminDb.runTransaction(async transaction => {
          const fresh = await transaction.get(ref);
          const games = [...(fresh.data()?.tournamentGames || [])];
          const index = games.findIndex((game: any) => game.id === gameId);
          if (index < 0) return false;
          games[index] = { ...games[index], score1: body.score1, score2: body.score2, isCompleted: true, isDisputed: false, disputeNotes: null, updatedAt: new Date().toISOString() };
          transaction.update(ref, { tournamentGames: advanceBracketMatch(games, gameId, body.score1, body.score2) });
          transaction.set(ref.collection('scoreAudit').doc(), auditData(req, 'score', gameId, { score1: body.score1, score2: body.score2 }));
          return true;
        });
        if (!result) return NextResponse.json({ error: 'Match not found.' }, { status: 404 });
        return NextResponse.json({ success: true });
      }

      if (action === 'dispute') {
        if (!event.scoringCode && !legacyOpen) return NextResponse.json({ error: 'Scorekeeper access is not configured for this tournament.' }, { status: 409 });
        if (!credentialsMatch(event.scoringCode, code, legacyOpen)) return NextResponse.json({ error: 'Invalid scorekeeper code.' }, { status: 403 });
        const notes = String(body.notes || '').trim().slice(0, 2000);
        if (!gameId || !notes) return NextResponse.json({ error: 'A match and dispute details are required.' }, { status: 400 });
        const result = await adminDb.runTransaction(async transaction => {
          const fresh = await transaction.get(ref);
          const games = [...(fresh.data()?.tournamentGames || [])];
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
        if (!teamName || !signer || !(event.tournamentTeams || []).includes(teamName)) {
          return NextResponse.json({ error: 'A valid tournament team and signer are required.' }, { status: 400 });
        }
        const signedAt = new Date().toISOString();
        await ref.update(new FieldPath('teamAgreements', teamName), { agreed: true, captainName: signer.slice(0, 300), signedAt });
        const archiveId = `arch_tournament_${eventId}_${teamName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        await adminDb.collection('teams').doc(teamId).collection('archived_waivers').doc(archiveId).set({
          id: archiveId, eventId, tournamentTeamName: teamName, signer, signedAt,
          type: 'Tournament Waiver', status: 'verified',
        });
        return NextResponse.json({ success: true });
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
      const league = snap.data()!;
      const creatorId = typeof league.creatorId === 'string' ? league.creatorId : '';
      if (creatorId) {
        const creator = await adminDb.collection('users').doc(creatorId).get();
        if (creator.exists && !permitsLegacyOrPaidPortals(creator.data()?.plan_type)) {
          return NextResponse.json({ error: 'This subscription does not include public portals.' }, { status: 403 });
        }
      }
      if (league.is_active === false || league.isArchived === true) {
        return NextResponse.json({ error: 'League portal is inactive.' }, { status: 404 });
      }
      const legacyOpen = isLegacyOpenPortal(ref.id);
      if (!league.scorekeeperPin && !legacyOpen) return NextResponse.json({ error: 'Scorekeeper access is not configured for this league.' }, { status: 409 });
      if (!credentialsMatch(league.scorekeeperPin, code, legacyOpen)) return NextResponse.json({ error: 'Invalid scorekeeper PIN.' }, { status: 403 });
      if (action === 'score') {
        if (!gameId || !validScore(body.score1) || !validScore(body.score2)) {
          return NextResponse.json({ error: 'A valid game and scores from 0 to 999 are required.' }, { status: 400 });
        }
        const result = await adminDb.runTransaction(async transaction => {
          const fresh = await transaction.get(ref);
          const schedule = (fresh.data()?.schedule || []).map((game: any) => game.id === gameId ? {
            ...game, score1: body.score1, score2: body.score2, isCompleted: true,
            isDisputed: false, disputeNotes: null, reportedBy: body.reportedBy || 'Scorekeeper Portal',
            updatedAt: new Date().toISOString(),
          } : game);
          if (!schedule.some((game: any) => game.id === gameId)) return false;
          transaction.update(ref, { schedule, updatedAt: FieldValue.serverTimestamp() });
          transaction.set(ref.collection('scoreAudit').doc(), auditData(req, 'score', gameId, { score1: body.score1, score2: body.score2 }));
          return true;
        });
        if (!result) return NextResponse.json({ error: 'Match not found.' }, { status: 404 });
        return NextResponse.json({ success: true });
      }
      if (action === 'dispute') {
        const notes = String(body.notes || '').trim().slice(0, 2000);
        if (!gameId || !notes) return NextResponse.json({ error: 'A match and dispute details are required.' }, { status: 400 });
        const result = await adminDb.runTransaction(async transaction => {
          const fresh = await transaction.get(ref);
          const schedule = (fresh.data()?.schedule || []).map((game: any) => game.id === gameId ? {
            ...game, isDisputed: true, disputeNotes: notes, updatedAt: new Date().toISOString(),
          } : game);
          if (!schedule.some((game: any) => game.id === gameId)) return false;
          transaction.update(ref, { schedule });
          transaction.set(ref.collection('scoreAudit').doc(), auditData(req, 'dispute', gameId, { notes }));
          return true;
        });
        if (!result) return NextResponse.json({ error: 'Match not found.' }, { status: 404 });
        return NextResponse.json({ success: true });
      }
    }

    return NextResponse.json({ error: 'Invalid portal action.' }, { status: 400 });
  } catch (error: any) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[public/portals/action] Error:', error.message);
    return NextResponse.json({ error: 'Portal action could not be completed.' }, { status: 500 });
  }
}
