import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';
import { DEMO_PLANS, getDemoTeamShells } from '@/lib/demo-plan-config';

/**
 * Creates only protected demo identity and team-shell records. Rich synthetic
 * content is filled afterward by the existing blueprint, scoped to these
 * server-approved shells through demoSessionOwnerId.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { planId } = await req.json();
    const plan = typeof planId === 'string' ? DEMO_PLANS[planId] : undefined;
    if (!plan) return NextResponse.json({ error: 'Invalid demo plan.' }, { status: 400 });

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
    const shells = getDemoTeamShells(uid, planId, plan);
    const leagueId = `demo_league_${uid.slice(-4)}`;
    const isElite = ['elite_teams', 'elite', 'league'].includes(planId);
    const name = plan.role === 'admin' ? 'Guest Admin' : `Guest ${plan.position}`;

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

    if (isAnonymousDemo) {
      batch.set(userRef, {
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
        avatarUrl: `https://picsum.photos/seed/${uid}/150/150`,
        clubName: plan.planType === 'school' ? 'Springfield High School' : isElite ? 'Apex Academy' : 'Squad Sports Hub',
        clubDescription: isElite ? 'Precision performance at a professional scale.' : plan.planType === 'school' ? 'Secondary Athletic Program Command' : '',
        schoolAdminIds: plan.planType === 'school' ? [uid] : [],
        isPrimaryClubAuthority: plan.isPro && !['parent', 'adult_player'].includes(plan.role),
        demoInitializedAt: now,
        createdAt: now,
      }, { merge: true });
    }

    for (const shell of shells) {
      const teamRef = adminDb.collection('teams').doc(shell.id);
      batch.set(teamRef, {
        id: shell.id,
        name: shell.name,
        teamName: shell.name,
        ownerUserId: shell.ownerUserId,
        demoSessionOwnerId: uid,
        isDemo: true,
        isPro: plan.isPro,
        planId: plan.planType,
        type: shell.type,
        sport: plan.planType === 'school' || planId === 'parent_demo' || planId === 'player_demo' ? 'Basketball' : 'Multi-Sport',
        createdAt: now,
        updatedAt: now,
      }, { merge: true });

      // Chat messages are server-authored in production. Seed the deterministic
      // demo conversation here so the client blueprint never has to bypass the
      // protected message-create route.
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
    }

    // League documents are server-created in production. Bootstrap the demo
    // league here before the client blueprint enriches it, otherwise the
    // browser's first write is rejected by the creation rule.
    batch.set(adminDb.collection('leagues').doc(leagueId), {
      id: leagueId,
      creatorId: uid,
      createdBy: uid,
      memberUserIds: [uid],
      memberTeamIds: shells.map((shell) => shell.id),
      isDemo: true,
      demoSessionOwnerId: uid,
      demoSeeded: true,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    await batch.commit();
    return NextResponse.json({
      ok: true,
      planId,
      teamIds: shells.map((shell) => shell.id),
      primaryTeamId: shells.find((shell) => shell.type !== 'school')?.id || null,
    });
  } catch (error: any) {
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
