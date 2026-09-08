import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';
import { DEMO_PLANS, demoTeamSlug, getDemoTeamShells, type DemoPlan } from '@/lib/demo-plan-config';

function demoNamespaceForUid(uid: string): string {
  return createHash('sha256').update(`demo-session-v1\0${uid}`).digest('hex').slice(0, 24);
}

function parsePlanBody(body: unknown): { planId: string; plan: DemoPlan } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const entries = Object.entries(body);
  if (entries.length !== 1 || entries[0][0] !== 'planId' || typeof entries[0][1] !== 'string') return null;
  const plan = DEMO_PLANS[entries[0][1]];
  return plan ? { planId: entries[0][1], plan } : null;
}

function ownsDemoLeague(data: Record<string, unknown>, uid: string, planId: string) {
  return data.isDemo === true
    && data.demoSeeded === true
    && data.demoSessionOwnerId === uid
    && data.creatorId === uid
    && data.billingOwnerUserId === uid
    && data.tenantId === `profile:${uid}`
    && data.demoPlanId === planId;
}

function ownsDemoTeam(data: Record<string, unknown>, uid: string, planId: string) {
  return data.isDemo === true && data.demoSessionOwnerId === uid && data.demoPlanId === planId;
}

function demoTournamentBlueprint(teamId: string, teamName: string, timestamp: string) {
  const start = new Date();
  start.setUTCHours(12, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + 1);
  const end = new Date(start.getTime() + (2 * 86400000));
  const teams = [
    { id: teamId, name: teamName, source: 'demo', complianceStatus: 'verified' },
    { id: `demo_tournament_thunder_${teamId}`, name: 'Thunder', source: 'demo', complianceStatus: 'verified' },
    { id: `demo_tournament_storm_${teamId}`, name: 'Storm', source: 'demo', complianceStatus: 'pending' },
    { id: `demo_tournament_shadows_${teamId}`, name: 'Shadows', source: 'demo', complianceStatus: 'verified' },
  ];
  const games = [
    { id: `demo_tournament_game_1_${teamId}`, team1Id: teams[0].id, team1: teams[0].name, team2Id: teams[1].id, team2: teams[1].name, score1: 5, score2: 2, isCompleted: true, status: 'completed', date: start.toISOString(), time: '10:00', location: 'Main Arena', matchTeamIds: [teams[0].id, teams[1].id] },
    { id: `demo_tournament_game_2_${teamId}`, team1Id: teams[2].id, team1: teams[2].name, team2Id: teams[3].id, team2: teams[3].name, score1: 4, score2: 6, isCompleted: true, status: 'completed', date: start.toISOString(), time: '12:00', location: 'Court B', matchTeamIds: [teams[2].id, teams[3].id] },
    { id: `demo_tournament_game_3_${teamId}`, team1Id: teams[0].id, team1: teams[0].name, team2Id: teams[3].id, team2: teams[3].name, score1: 0, score2: 0, isCompleted: false, status: 'scheduled', date: end.toISOString(), time: '14:00', location: 'Main Arena', matchTeamIds: [teams[0].id, teams[3].id] },
  ];
  return {
    id: `tourn_${teamId}`,
    teamId,
    title: `${teamName} Championship Tournament`,
    sport: 'Multi-Sport',
    eventType: 'tournament',
    isTournament: true,
    isDemo: true,
    date: start.toISOString(),
    endDate: end.toISOString(),
    location: 'Apex Performance Center',
    description: 'A three-day championship event for the live demo workspace.',
    tournamentTeams: teams.map(team => team.name),
    tournamentTeamsData: teams,
    tournamentGames: games,
    status: 'active',
    lifecycleVersion: 0,
    credentialVersion: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function demoFacilityBlueprints(uid: string, namespace: string, planId: string, plan: DemoPlan) {
  if (['starter_squad', 'free', 'parent_demo', 'player_demo'].includes(planId)) return [];
  const school = plan.planType === 'school';
  const elite = ['elite', 'league'].includes(plan.planType);
  const venues = [{
    id: `fac_main_${namespace}`,
    name: school ? 'Springfield High Athletic Complex' : elite ? 'Apex Performance Center' : 'Home Training Center',
    address: school ? '456 Education Ave, Springfield' : elite ? '789 Tactical Way, Metro City' : '123 Athletic Drive, Downtown',
    notes: school
      ? 'Main athletic campus. Parking lot C open for event days. Contact facilities@school.edu for rentals.'
      : 'Primary training venue. Gate code: 1992#. Concessions open on game days. Coaches arrive 45 min early.',
    resourcePrefix: 'res',
    resources: school
      ? ['Main Gymnasium', 'Field House', 'Outdoor Track', 'Football Field', 'Tennis Courts']
      : ['Main Arena', 'Practice Field A', 'Practice Field B', 'Weight Room'],
  }];
  if (elite || school) venues.push({
    id: `fac_secondary_${namespace}`,
    name: school ? 'Memorial Sports Complex' : 'Satellite Training Annex',
    address: school ? '900 Memorial Blvd, Springfield' : '456 West Campus Ave',
    notes: 'Secondary training venue. Call ahead for equipment setup.',
    resourcePrefix: 'res2',
    resources: school ? ['Court A', 'Court B', 'Wrestling Room'] : ['Turf Field 1', 'Turf Field 2'],
  });
  return venues.map(({ resourcePrefix, resources, ...venue }) => ({
    facility: { ...venue, clubId: uid, isDemo: true, demoSessionOwnerId: uid, demoPlanId: planId },
    fields: resources.map(name => ({
      id: `${resourcePrefix}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${namespace}`,
      facilityId: venue.id,
      name,
      isDemo: true,
    })),
  }));
}

function ownsDemoFacility(data: Record<string, unknown>, uid: string, planId: string) {
  // Existing browser-seeded demos prove ownership through clubId. Once upgraded,
  // their additional server ownership markers must also agree.
  return data.isDemo === true && data.clubId === uid
    && (data.demoSessionOwnerId === undefined || data.demoSessionOwnerId === uid)
    && (data.demoPlanId === undefined || data.demoPlanId === planId);
}

function demoLeagueBlueprint(uid: string, namespace: string, planId: string, plan: DemoPlan) {
  const shells = getDemoTeamShells(uid, planId, plan, namespace).filter(shell => shell.type !== 'school');
  const opponentNames = plan.planType === 'school'
    ? ['Riverside High School', 'Lincoln Prep Academy', 'Jefferson Academy', 'Westlake Athletic', 'Central High School', 'Northview Academy']
    : planId === 'parent_demo' || planId === 'player_demo'
      ? ['Hawks', 'Tigers', 'Eagles', 'Falcons', 'Wolves', 'Titans']
      : ['City Wildcats', 'Metro Stars', 'Valley Vipers', 'Coastal Elite', 'Summit United', 'Apex United'];
  const leagueTeams = shells.map(shell => ({ id: shell.id, name: shell.name }));
  for (const name of opponentNames) {
    if (leagueTeams.length >= 6) break;
    leagueTeams.push({ id: `demo_opponent_${namespace}_${demoTeamSlug(name)}`, name });
  }
  const teams = Object.fromEntries(leagueTeams.map((team, index) => [team.id, {
    teamName: team.name,
    wins: Math.max(0, 4 - index),
    losses: index % 4,
    points: Math.max(0, 12 - (index * 3)),
  }]));
  const day = new Date();
  day.setUTCHours(12, 0, 0, 0);
  const schedule = Array.from({ length: 6 }, (_, index) => {
    const team1 = leagueTeams[index % leagueTeams.length];
    const team2 = leagueTeams[(index + 1 + Math.floor(index / 3)) % leagueTeams.length];
    return {
      id: `demo_game_${namespace}_${index + 1}`,
      team1: team1.name,
      team1Id: team1.id,
      team2: team2.name,
      team2Id: team2.id,
      date: new Date(day.getTime() + ((index + 1) * 86400000)).toISOString(),
      time: `${String(10 + (index % 4) * 2).padStart(2, '0')}:00`,
      location: index % 2 ? 'Court B' : 'Main Arena',
      status: 'scheduled',
    };
  });
  return {
    name: plan.planType === 'school' ? 'State Academic Athletic League' : planId === 'parent_demo' || planId === 'player_demo' ? 'Elite Youth League' : 'Apex Premier Circuit',
    description: 'The premier circuit for top-tier competitive programs.',
    sport: plan.planType === 'school' ? 'Basketball' : 'Multi-Sport',
    memberTeamIds: leagueTeams.map(team => team.id),
    memberUserIds: [uid],
    status: 'active',
    teams,
    schedule,
  };
}

export async function PUT(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const selected = parsePlanBody(await req.json());
    if (!selected) {
      return NextResponse.json({ error: 'Invalid demo league blueprint.' }, { status: 400 });
    }
    const { planId, plan } = selected;
    const namespace = demoNamespaceForUid(auth.uid);
    const leagueId = `demo_league_${namespace}`;
    const blueprint = demoLeagueBlueprint(auth.uid, namespace, planId, plan);
    await adminDb.runTransaction(async transaction => {
      const leagueRef = adminDb.collection('leagues').doc(leagueId);
      const [league, profile] = await Promise.all([
        transaction.get(leagueRef),
        transaction.get(adminDb.collection('users').doc(auth.uid)),
      ]);
      const current = league.data() || {};
      if (!league.exists || !profile.exists || profile.data()?.demoPlanId !== planId || !ownsDemoLeague(current, auth.uid, planId)) {
        throw new Error('DEMO_BLUEPRINT_FORBIDDEN');
      }
      transaction.update(leagueRef, {
        ...blueprint,
        id: leagueId,
        creatorId: auth.uid,
        createdBy: auth.uid,
        billingOwnerUserId: auth.uid,
        tenantId: `profile:${auth.uid}`,
        sensitiveFieldsMigrated: true,
        updatedAt: new Date().toISOString(),
      });
    });
    return NextResponse.json({ ok: true, leagueId, demoNamespace: namespace });
  } catch (error: any) {
    if (error?.message === 'DEMO_BLUEPRINT_FORBIDDEN') return NextResponse.json({ error: 'Demo league access denied.' }, { status: 403 });
    console.error('[demo/seed PUT] Error:', error.message);
    return NextResponse.json({ error: 'Unable to initialize the demo league.' }, { status: 500 });
  }
}

/**
 * Creates protected demo identity, team shells, and facility blueprints. Rich team
 * content is filled afterward by the existing blueprint, scoped to these
 * server-approved shells through demoSessionOwnerId.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const selected = parsePlanBody(await req.json());
    if (!selected) return NextResponse.json({ error: 'Invalid demo plan.' }, { status: 400 });
    const { planId, plan } = selected;

    const uid = auth.uid;
    const userRef = adminDb.collection('users').doc(uid);
    const existingProfile = await userRef.get();
    const isAnonymousDemo = auth.signInProvider === 'anonymous';
    const isBetaTester = existingProfile.data()?.isBetaTester === true;
    if (!isAnonymousDemo && !isBetaTester) {
      return NextResponse.json({ error: 'Demo setup is limited to anonymous demos and approved beta testers.' }, { status: 403 });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const messageTimestamp = new Date().toISOString();
    const demoNamespace = demoNamespaceForUid(uid);
    const shells = getDemoTeamShells(uid, planId, plan, demoNamespace);
    const facilities = demoFacilityBlueprints(uid, demoNamespace, planId, plan);
    const leagueId = `demo_league_${demoNamespace}`;
    const isElite = ['elite_teams', 'elite', 'league'].includes(planId);
    const name = plan.role === 'admin' ? 'Guest Admin' : `Guest ${plan.position}`;

    await adminDb.runTransaction(async transaction => {
      const leagueRef = adminDb.collection('leagues').doc(leagueId);
      const profile = await transaction.get(userRef);
      const league = await transaction.get(leagueRef);
      const shellSnapshots = await Promise.all(shells.map(shell => transaction.get(adminDb.collection('teams').doc(shell.id))));
      const facilitySnapshots = await Promise.all(facilities.map(({ facility }) => transaction.get(adminDb.collection('facilities').doc(facility.id))));
      const currentProfile = profile.data() || {};
      if (auth.signInProvider !== 'anonymous' && currentProfile.isBetaTester !== true) throw new Error('DEMO_SETUP_FORBIDDEN');
      if (league.exists && !ownsDemoLeague(league.data() || {}, uid, planId)) throw new Error('DEMO_TARGET_OWNERSHIP_CONFLICT');
      if (shellSnapshots.some(snapshot => snapshot.exists && !ownsDemoTeam(snapshot.data() || {}, uid, planId))) {
        throw new Error('DEMO_TARGET_OWNERSHIP_CONFLICT');
      }
      if (facilitySnapshots.some(snapshot => snapshot.exists && !ownsDemoFacility(snapshot.data() || {}, uid, planId))) {
        throw new Error('DEMO_TARGET_OWNERSHIP_CONFLICT');
      }

      for (const { facility, fields } of facilities) {
        const facilityRef = adminDb.collection('facilities').doc(facility.id);
        transaction.set(facilityRef, facility, { merge: true });
        for (const field of fields) transaction.set(facilityRef.collection('fields').doc(field.id), field);
      }

      if (isAnonymousDemo) {
        transaction.set(userRef, {
          id: uid,
          fullName: name,
          email: `${plan.role}@thesquad.pro`,
          role: plan.role,
          plan_type: plan.planType,
          team_limit: plan.teamLimit,
          subscription_status: 'active',
          isDemo: true,
          isStaff: true,
          seenAlertIds: [],
          avatarUrl: `https://picsum.photos/seed/${demoNamespace}/150/150`,
          clubName: plan.planType === 'school' ? 'Springfield High School' : isElite ? 'Apex Academy' : 'Squad Sports Hub',
          clubDescription: isElite ? 'Precision performance at a professional scale.' : plan.planType === 'school' ? 'Secondary Athletic Program Command' : '',
          schoolAdminIds: plan.planType === 'school' ? [uid] : [],
          isPrimaryClubAuthority: plan.isPro && !['parent', 'adult_player'].includes(plan.role),
          demoPlanId: planId,
          demoNamespace,
          demoInitializedAt: now,
          createdAt: now,
        }, { merge: true });
      } else {
        transaction.set(userRef, { demoPlanId: planId, demoNamespace, demoInitializedAt: now }, { merge: true });
      }

      for (const shell of shells) {
        transaction.set(adminDb.collection('teams').doc(shell.id), {
          id: shell.id,
          name: shell.name,
          teamName: shell.name,
          ownerUserId: shell.ownerUserId,
          demoSessionOwnerId: uid,
          demoPlanId: planId,
          isDemo: true,
          isPro: plan.isPro,
          planId: plan.planType,
          type: shell.type,
          sport: plan.planType === 'school' || planId === 'parent_demo' || planId === 'player_demo' ? 'Basketball' : 'Multi-Sport',
          createdAt: now,
          updatedAt: now,
        }, { merge: true });
      }

      transaction.set(leagueRef, {
        id: leagueId,
        creatorId: uid,
        createdBy: uid,
        billingOwnerUserId: uid,
        tenantId: `profile:${uid}`,
        lifecycleVersion: 0,
        sensitiveFieldsMigrated: true,
        name: plan.role === 'admin' ? 'State Academic Athletic League' : 'Apex Premier Circuit',
        sport: plan.planType === 'school' ? 'Basketball' : 'Multi-Sport',
        description: 'The premier circuit for top-tier competitive programs.',
        memberUserIds: [uid],
        memberTeamIds: shells.map(shell => shell.id),
        isDemo: true,
        demoPlanId: planId,
        demoSessionOwnerId: uid,
        demoSeeded: true,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      }, { merge: true });
    });

    const bookingSnapshots = await Promise.all([
      ...shells.map(shell =>
        adminDb.collection('scheduleBookings').where('hostTeamId', '==', shell.id).get()
      ),
      adminDb.collection('scheduleBookings').where('leagueId', '==', leagueId).get(),
    ]);
    const staleBookings = [...new Map(
      bookingSnapshots.flatMap(snapshot => snapshot.docs).map(document => [document.ref.path, document])
    ).values()];
    for (let index = 0; index < staleBookings.length; index += 400) {
      const cleanupBatch = adminDb.batch();
      staleBookings.slice(index, index + 400).forEach(document => cleanupBatch.delete(document.ref));
      await cleanupBatch.commit();
    }

    const batch = adminDb.batch();

    for (const shell of shells) {
      const teamRef = adminDb.collection('teams').doc(shell.id);
      // These collections are server-authored in production. Seed deterministic
      // demo records here so the browser never has to bypass their protected rules.
      const demoChats = [
        { id: `chat1_${shell.id}`, name: 'Squad Main Channel', memberIds: [uid, `u1_${shell.id}`, `u2_${shell.id}`, `u3_${shell.id}`] },
        { id: `chat2_${shell.id}`, name: 'Coaching Staff', memberIds: [uid, `u1_${shell.id}`, `u2_${shell.id}`] },
      ];
      for (const chat of demoChats) {
        batch.set(teamRef.collection('groupChats').doc(chat.id), {
          ...chat,
          createdBy: uid,
          isDeleted: false,
          teamId: shell.id,
          createdAt: messageTimestamp,
          isDemo: true,
        }, { merge: true });
      }
      batch.set(teamRef.collection('feedPosts').doc(`demo_feed_1_${shell.id}`), {
        id: `demo_feed_1_${shell.id}`,
        teamId: shell.id,
        type: 'user',
        content: 'Tournament weekend is almost here. Brackets and preparation notes are ready.',
        author: 'Head Coach',
        authorId: `u1_${shell.id}`,
        createdAt: messageTimestamp,
        likes: [],
        isDemo: true,
      });
      batch.set(teamRef.collection('incidents').doc(`demo_incident_${shell.id}`), {
        id: `demo_incident_${shell.id}`,
        teamId: shell.id,
        title: 'Ankle Sprain - Grade 1',
        date: messageTimestamp,
        time: '3:45 PM',
        location: 'Practice Court B',
        description: 'Player landed awkwardly after a contested jump. Immediate swelling noted.',
        emergencyServicesCalled: false,
        severity: 'minor',
        treatmentProvided: 'RICE protocol initiated. Follow-up with physio required.',
        reportedBy: 'Head Coach',
        followUpRequired: true,
        isDemo: true,
      });
      batch.set(teamRef.collection('files').doc(`demo_file_${shell.id}`), {
        id: `demo_file_${shell.id}`,
        teamId: shell.id,
        name: 'Season Strategy Playbook.pdf',
        type: 'pdf',
        size: '2.4 MB',
        sizeBytes: 2516582,
        url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        category: 'Playbook',
        description: 'Full season tactical overview and formation guides.',
        date: messageTimestamp,
        isDemo: true,
      });
      batch.set(teamRef.collection('members').doc(`u3_${shell.id}`).collection('signatures').doc(`demo_waiver_${shell.id}`), {
        id: `demo_waiver_${shell.id}`,
        documentId: `w1_${shell.id}`,
        teamId: shell.id,
        userId: `u3_${shell.id}`,
        userName: 'Team Player',
        timestamp: messageTimestamp,
        isDemo: true,
      });
      const demoMessages = [
        { chatId: `chat1_${shell.id}`, id: `msg1_${shell.id}`, author: 'Head Coach', authorId: `u1_${shell.id}`, content: 'Ready for the tournament this weekend! Brackets are live.' },
        { chatId: `chat1_${shell.id}`, id: `msg2_${shell.id}`, author: 'Team Player', authorId: `u3_${shell.id}`, content: 'Practiced all morning. See everyone there.' },
        { chatId: `chat1_${shell.id}`, id: `msg3_${shell.id}`, author: 'Team Player', authorId: `u4_${shell.id}`, content: 'Can someone share the updated game plan?' },
        { chatId: `chat1_${shell.id}`, id: `msg4_${shell.id}`, author: 'Head Coach', authorId: `u1_${shell.id}`, content: 'The new Playbook drills are mandatory viewing.' },
        { chatId: `chat2_${shell.id}`, id: `coachmsg1_${shell.id}`, author: 'Head Coach', authorId: `u1_${shell.id}`, content: 'Reviewing film from the last game. Defense was excellent.' },
        { chatId: `chat2_${shell.id}`, id: `coachmsg2_${shell.id}`, author: 'Assistant Coach', authorId: `u2_${shell.id}`, content: 'Agreed. Transition attack needs work this week.' },
      ];
      for (const message of demoMessages) {
        const { chatId, ...messageData } = message;
        batch.set(teamRef.collection('groupChats').doc(chatId).collection('messages').doc(message.id), {
          ...messageData,
          type: 'text',
          createdAt: messageTimestamp,
          isDemo: true,
        });
      }
      if (shell.type !== 'school') {
        const tournament = demoTournamentBlueprint(shell.id, shell.name, messageTimestamp);
        batch.set(teamRef.collection('events').doc(tournament.id), tournament, { merge: true });
      }
    }

    const hubShell = plan.planType === 'school'
      ? shells.find(shell => shell.type === 'school')
      : isElite
        ? shells.find(shell => shell.type !== 'school')
        : undefined;
    if (hubShell) {
      const squadShells = shells.filter(shell => shell.type !== 'school');
      const hubMemberIds = [
        uid,
        ...squadShells.flatMap(shell => [`u1_${shell.id}`, `u2_${shell.id}`]),
      ];
      const staffMetadata = Object.fromEntries([
        [uid, {
          name: plan.planType === 'school' ? 'Guest Admin' : 'Guest Coach',
          position: plan.planType === 'school' ? 'Athletic Director' : 'League Organizer',
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${demoNamespace}`,
        }],
        ...squadShells.flatMap((shell, index) => ([
          [`u1_${shell.id}`, { name: `Head Coach ${index + 1}`, position: 'Head Coach', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=head${index + 1}`, squadName: shell.name }],
          [`u2_${shell.id}`, { name: `Assistant Coach ${index + 1}`, position: 'Assistant Coach', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=assistant${index + 1}`, squadName: shell.name }],
        ])),
      ]);
      const hubChatId = plan.planType === 'school'
        ? `hub_broadcast_${demoNamespace}`
        : `hub_broadcast_elite_${demoNamespace}`;
      batch.set(adminDb.collection('teams').doc(hubShell.id).collection('groupChats').doc(hubChatId), {
        id: hubChatId,
        name: plan.planType === 'school'
          ? 'Springfield High School — Broadcast Channel'
          : 'Apex Academy — Broadcast Channel',
        createdBy: uid,
        memberIds: hubMemberIds,
        isDeleted: false,
        teamId: hubShell.id,
        createdAt: messageTimestamp,
        isHubChannel: true,
        hubTeamId: hubShell.id,
        staffMetadata,
        isDemo: true,
      }, { merge: true });
    }

    await batch.commit();
    return NextResponse.json({
      ok: true,
      planId,
      demoNamespace,
      leagueId,
      teamIds: shells.map((shell) => shell.id),
      primaryTeamId: shells.find((shell) => shell.type !== 'school')?.id || null,
    });
  } catch (error: any) {
    if (error?.message === 'DEMO_SETUP_FORBIDDEN') return NextResponse.json({ error: 'Demo setup is not permitted.' }, { status: 403 });
    if (error?.message === 'DEMO_TARGET_OWNERSHIP_CONFLICT') return NextResponse.json({ error: 'Demo target ownership conflict.' }, { status: 403 });
    console.error('[demo/seed] Error:', error.message);
    return NextResponse.json({ error: 'Unable to initialize the demo environment.' }, { status: 500 });
  }
}

/** Marks an approved beta workspace complete only after rich seeding succeeds. */
export async function PATCH(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const userRef = adminDb.collection('users').doc(auth.uid);
    const user = await userRef.get();
    if (user.data()?.isBetaTester !== true) {
      return NextResponse.json({ error: 'Only approved beta testers can complete this setup.' }, { status: 403 });
    }
    await userRef.set({ betaDemoSeeded: true, betaDemoSeededAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[demo/seed PATCH] Error:', error.message);
    return NextResponse.json({ error: 'Unable to finalize the beta environment.' }, { status: 500 });
  }
}
