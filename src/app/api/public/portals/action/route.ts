import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { FieldPath, FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { recordTournamentScore, validateBracketScoreSubmission } from '@/lib/scheduler-utils';
import { credentialsMatch, isLegacyOpenPortal, validScore } from '@/lib/score-action-security';
import { permitsLegacyOrPaidPortals } from '@/lib/public-portal-data';
import {
  publicLeagueGameProjection,
  recalculatePublicLeagueStandings,
} from '@/lib/public-league-scoring';
import {
  TournamentScheduleDeploymentError,
  withTournamentScheduleMutationLock,
} from '@/lib/server-tournament-schedule-deployment';
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
      let matches = await adminDb.collection('teams').where('inviteCode', '==', teamCode).limit(1).get();
      if (matches.empty) matches = await adminDb.collection('teams').where('teamCode', '==', teamCode).limit(1).get();
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
      let entryParentRef: DocumentReference;
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
        const eventSnap = await eventRef.get();
        if (!eventSnap.exists || !eventSnap.data()?.isTournament) return NextResponse.json({ error: 'Tournament portal not found.' }, { status: 404 });
        entryParentRef = eventRef;
        configRef = eventRef.collection('registration').doc(protocolId);
      }

      const configSnap = await configRef.get();
      if (!configSnap.exists || configSnap.data()?.is_active !== true) return NextResponse.json({ error: 'Registration portal is inactive.' }, { status: 409 });
      const config = configSnap.data()!;
      const { answers, schema } = sanitizeRegistrationAnswers(rawAnswers, config);
      if (kind === 'tournament') {
        const requiredCore = ['teamName', 'name', 'email'];
        if (requiredCore.some(key => typeof answers[key] !== 'string' || !answers[key].trim())) {
          return NextResponse.json({ error: 'Please complete the required team and contact details.' }, { status: 400 });
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
          ? ['teamName', 'name', 'email', 'phone']
          : registrationType === 'waiver'
            ? ['fullName', 'email', 'phone']
            : ['fullName', 'email', 'phone', 'dateOfBirth'];
        if (requiredCore.some(key => typeof answers[key] !== 'string' || !answers[key].trim())) {
          return NextResponse.json({ error: 'Please complete the required registration details.' }, { status: 400 });
        }

        if (registrationType === 'player') {
          const birthDate = new Date(String(answers.dateOfBirth));
          if (Number.isNaN(birthDate.getTime())) {
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
      const waiverParts = [
        config.require_default_waiver ? config.default_waiver_text : '',
        config.custom_waiver_text || '',
        ...(config.team_waivers_content || []).map((waiver: any) => waiver.content || ''),
      ].filter(Boolean);
      if (waiverParts.length > 0 && !signature) {
        return NextResponse.json({ error: 'A signature is required for this registration.' }, { status: 400 });
      }
      const createdAt = new Date().toISOString();
      const entry = entryParentRef.collection('registrationEntries').doc();
      const entryData = {
        league_id: kind === 'league' ? parentRef.id : null,
        event_id: eventId || null,
        protocol_id: protocolId,
        answers,
        form_version: Number(body.formVersion || config.form_version || 0),
        waiver_signed_text: waiverParts.join('\n\n') || signature || null,
        signature_date: signature ? createdAt : null,
        status: 'pending', registrationCost, payment_received: false,
        created_at: createdAt, createdAt,
      };

      if (kind === 'tournament' && protocolId === 'team_config' && eventId) {
        const teamName = configuredAnswer(answers, schema, ['teamName'], /team name|squad name/i).slice(0, 200);
        const coachName = configuredAnswer(answers, schema, ['name', 'fullName'], /coach|contact name|captain/i).slice(0, 200);
        const logoUrl = typeof answers.teamLogoUrl === 'string' && /^https:\/\//i.test(answers.teamLogoUrl)
          ? answers.teamLogoUrl.slice(0, 2_000)
          : '';
        if (!teamName) return NextResponse.json({ error: 'A team name is required.' }, { status: 400 });

        const tournamentEventRef = parentRef.collection('events').doc(eventId);
        const result = await adminDb.runTransaction(async transaction => {
          const [freshEvent, freshConfig] = await Promise.all([
            transaction.get(tournamentEventRef),
            transaction.get(configRef),
          ]);
          if (!freshEvent.exists || freshEvent.data()?.isTournament !== true || freshEvent.data()?.isArchived === true) {
            return { accepted: false as const, code: 'TOURNAMENT_NOT_FOUND', message: 'Tournament registration is inactive.', status: 404 };
          }
          if (!freshConfig.exists || freshConfig.data()?.is_active !== true) {
            return { accepted: false as const, code: 'REGISTRATION_INACTIVE', message: 'Registration portal is inactive.', status: 409 };
          }
          if (Array.isArray(freshEvent.data()?.tournamentGames) && freshEvent.data()!.tournamentGames.length > 0) {
            return { accepted: false as const, code: 'TOURNAMENT_ROSTER_LOCKED', message: 'Registration is closed because the tournament bracket has already been published.', status: 409 };
          }

          transaction.create(entry, entryData);
          if (signature) {
            transaction.set(entryParentRef.collection('archived_waivers').doc(`arch_waiver_${entry.id}`), {
              id: `arch_waiver_${entry.id}`, entryId: entry.id, protocolId,
              title: teamName, signer: signature, signedAt: createdAt,
              waiverText: waiverParts.join('\n\n'), type: 'Squad', answers,
            });
          }
          transaction.update(tournamentEventRef, {
            tournamentTeams: FieldValue.arrayUnion(teamName),
            tournamentTeamsData: FieldValue.arrayUnion({ id: `p_${entry.id}`, name: teamName, coach: coachName || 'Pipeline Coach', logoUrl, source: 'pipeline' }),
          });
          return { accepted: true as const };
        });
        if (!result.accepted) {
          return NextResponse.json({ error: result.message, code: result.code }, { status: result.status });
        }
        return NextResponse.json({ success: true, entryId: entry.id });
      }

      // Public registrations cross a trusted server boundary. Persist the raw
      // response and the league's operational projection in one atomic batch so
      // organizers never receive an entry that is absent from team/player tools.
      const batch = adminDb.batch();
      batch.create(entry, entryData);

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
                coachName: coachName || 'Recruit Coach',
                coachEmail: typeof answers.email === 'string' ? answers.email.slice(0, 320) : '',
                coachPhone: typeof answers.phone === 'string' ? answers.phone.slice(0, 100) : '',
                teamLogoUrl: typeof answers.teamLogoUrl === 'string' && /^https:\/\//i.test(answers.teamLogoUrl)
                  ? answers.teamLogoUrl.slice(0, 2_000)
                  : '',
                wins: 0,
                losses: 0,
                ties: 0,
                points: 0,
                status: 'pending',
                signedAt: signature ? createdAt : null,
                inviteCode: entry.id.slice(-6).toUpperCase(),
              },
              memberTeamIds: FieldValue.arrayUnion(recruitId),
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
          batch.update(parentRef, {
            [`individualRecruits.${recruitId}`]: {
              name: participantName,
              email: typeof answers.email === 'string' ? answers.email.slice(0, 320) : '',
              phone: typeof answers.phone === 'string' ? answers.phone.slice(0, 100) : '',
              status: 'pending',
              signedAt: signature ? createdAt : null,
              teamCode: typeof answers.recruiter_code === 'string' ? answers.recruiter_code.slice(0, 100) : null,
              teamName: typeof answers.team_name === 'string' ? answers.team_name.slice(0, 200) : null,
              teamId: typeof answers.team_id === 'string' ? answers.team_id.slice(0, 200) : null,
            },
            memberIndivIds: FieldValue.arrayUnion(recruitId),
          });
        }
      }

      if (signature) {
        const registrationName = configuredAnswer(answers, schema, ['teamName', 'name', 'fullName'], /team name|participant|athlete|full name/i);
        batch.set(entryParentRef.collection('archived_waivers').doc(`arch_waiver_${entry.id}`), {
          id: `arch_waiver_${entry.id}`, entryId: entry.id, protocolId,
          title: registrationName || 'Participant Registration',
          signer: signature, signedAt: createdAt, waiverText: waiverParts.join('\n\n'),
          type: protocolId === 'player_config' ? 'Individual' : 'Squad', answers,
        });
      }

      await batch.commit();
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
        const result = await withTournamentScheduleMutationLock(() => adminDb.runTransaction(async transaction => {
          const fresh = await transaction.get(ref);
          const games = [...(fresh.data()?.tournamentGames || [])];
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
          const freshLeague = fresh.data() || {};
          const schedule: Array<Record<string, unknown>> = Array.isArray(freshLeague.schedule)
            ? freshLeague.schedule.map((game: Record<string, unknown>) => ({ ...game }))
            : [];
          const gameIndex = schedule.findIndex((game: Record<string, unknown>) => game.id === gameId);
          if (gameIndex < 0) {
            return { valid: false as const, code: 'MATCH_NOT_FOUND', message: 'Match not found.' };
          }
          const currentGame = schedule[gameIndex];
          const team1Id = currentGame.team1Id;
          const team2Id = currentGame.team2Id;
          if (!isSafeId(team1Id) || !isSafeId(team2Id) || team1Id === team2Id) {
            return {
              valid: false as const,
              code: 'INVALID_MATCH_TEAMS',
              message: 'This match does not have two valid team assignments.',
            };
          }
          const updatedAt = new Date().toISOString();
          const updatedGame: Record<string, unknown> = {
            ...currentGame,
            score1: body.score1,
            score2: body.score2,
            isCompleted: true,
            isDisputed: false,
            disputeNotes: null,
            reportedBy: body.reportedBy || 'Scorekeeper Portal',
            updatedAt,
          };
          schedule[gameIndex] = updatedGame;
          const teams = recalculatePublicLeagueStandings(freshLeague.teams, schedule);
          const leagueName = typeof freshLeague.name === 'string' && freshLeague.name.trim()
            ? freshLeague.name.trim().slice(0, 160)
            : 'League';
          const team1Projection = publicLeagueGameProjection({
            leagueId: ref.id,
            leagueName,
            game: updatedGame,
            teamId: team1Id,
            opponentTeamId: team2Id,
            opponent: typeof updatedGame.team2 === 'string' ? updatedGame.team2 : 'Opponent',
            myScore: body.score1,
            opponentScore: body.score2,
            updatedAt,
          });
          const team2Projection = publicLeagueGameProjection({
            leagueId: ref.id,
            leagueName,
            game: updatedGame,
            teamId: team2Id,
            opponentTeamId: team1Id,
            opponent: typeof updatedGame.team1 === 'string' ? updatedGame.team1 : 'Opponent',
            myScore: body.score2,
            opponentScore: body.score1,
            updatedAt,
          });
          const team1Ref = adminDb.collection('teams').doc(team1Id).collection('games').doc(String(team1Projection.id));
          const team2Ref = adminDb.collection('teams').doc(team2Id).collection('games').doc(String(team2Projection.id));
          transaction.update(ref, { schedule, teams, updatedAt: FieldValue.serverTimestamp() });
          transaction.set(team1Ref, team1Projection);
          transaction.set(team2Ref, team2Projection);
          transaction.set(ref.collection('scoreAudit').doc(), auditData(req, 'score', gameId, { score1: body.score1, score2: body.score2 }));
          return { valid: true as const };
        });
        if (!result.valid) {
          return NextResponse.json(
            { error: result.message, code: result.code },
            { status: result.code === 'MATCH_NOT_FOUND' ? 404 : 409 },
          );
        }
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
    if (error instanceof TournamentScheduleDeploymentError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('[public/portals/action] Error:', error.message);
    return NextResponse.json({ error: 'Portal action could not be completed.' }, { status: 500 });
  }
}
