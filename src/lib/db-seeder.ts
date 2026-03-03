
'use client';

import { 
  Firestore, 
  doc, 
  collection, 
  getDocs, 
  writeBatch,
  query,
  where,
  deleteDoc,
  setDoc,
  updateDoc,
  addDoc
} from 'firebase/firestore';

export async function seedSubscriptionData(db: Firestore) {
  try {
    const featuresSnapshot = await getDocs(collection(db, 'features'));
    if (featuresSnapshot.empty) {
      const batch = writeBatch(db);
      
      const defaultFeatures = [
        { id: 'schedule_games_events', description: 'Plan and coordinate team matches and events.', defaultEnabled: true },
        { id: 'tournaments', description: 'Manage multi-day tournament series and brackets.', defaultEnabled: false },
        { id: 'basic_roster', description: 'Manage a basic list of team members.', defaultEnabled: true },
        { id: 'full_roster_details', description: 'Track medical info, emergency contacts, and coaching notes.', defaultEnabled: false },
        { id: 'attendance_tracking', description: 'Track RSVPs and real-time attendance for events.', defaultEnabled: false },
        { id: 'live_feed_read', description: 'View the squad activity feed.', defaultEnabled: true },
        { id: 'live_feed_post', description: 'Post updates, photos, and polls to the squad.', defaultEnabled: false },
        { id: 'group_chat', description: 'Real-time messaging channels for coordination.', defaultEnabled: false },
        { id: 'score_tracking', description: 'Record game results and season progress.', defaultEnabled: true },
        { id: 'stats_basic', description: 'Basic performance metrics and trends.', defaultEnabled: false },
        { id: 'media_uploads', description: 'Upload and share playbooks, photos, and files.', defaultEnabled: false },
        { id: 'history_unlimited', description: 'Retain full history of posts, chats, and results.', defaultEnabled: false },
        { id: 'high_priority_alerts', description: 'Broadcast urgent team-wide popups.', defaultEnabled: false },
      ];

      defaultFeatures.forEach((f) => {
        const ref = doc(db, 'features', f.id);
        batch.set(ref, { id: f.id, description: f.description, defaultEnabled: f.defaultEnabled });
      });

      await batch.commit();
    }

    const plansSnapshot = await getDocs(collection(db, 'plans'));
    
    if (plansSnapshot.empty) {
      const batch = writeBatch(db);

      const proFeaturesMap = {
        schedule_games_events: true, tournaments: true, basic_roster: true, full_roster_details: true,
        attendance_tracking: true, live_feed_read: true, live_feed_post: true, group_chat: true,
        score_tracking: true, stats_basic: true, media_uploads: true, history_unlimited: true,
        high_priority_alerts: true, leagues: true
      };

      const starterFeatures = {
        schedule_games_events: true, basic_roster: true, live_feed_read: true, score_tracking: true
      };

      const plans = [
        {
          id: 'starter_squad', name: 'Starter Squad', description: 'Essential coordination for growing teams.',
          priceDisplay: '$0', annualPriceDisplay: '$0', billingCycle: '', isPublic: true, isContactOnly: false,
          billingType: 'free', teamLimit: null, features: starterFeatures, proTeamLimit: 0
        },
        {
          id: 'squad_pro', name: 'Squad Pro', description: 'Full-scale coordination and analytics for elite squads.',
          priceDisplay: '$12.99', annualPriceDisplay: '$99', billingCycle: '/mo', isPublic: true, isContactOnly: false,
          billingType: 'monthly', teamLimit: 1, features: proFeaturesMap, proTeamLimit: 1
        },
        {
          id: 'squad_duo', name: 'Club Duo', description: 'Elite features for 2 professional squads.',
          priceDisplay: '$23.99', annualPriceDisplay: '$180', billingCycle: '/mo', isPublic: true, isContactOnly: false,
          billingType: 'monthly', teamLimit: 2, features: proFeaturesMap, proTeamLimit: 2
        },
        {
          id: 'squad_crew', name: 'Club Crew', description: 'Full coordination for up to 4 elite teams.',
          priceDisplay: '$44.99', annualPriceDisplay: '$340', billingCycle: '/mo', isPublic: true, isContactOnly: false,
          billingType: 'monthly', teamLimit: 4, features: proFeaturesMap, proTeamLimit: 4
        },
        {
          id: 'squad_league', name: 'Club League', description: 'Management for up to 9 competitive teams.',
          priceDisplay: '$89.99', annualPriceDisplay: '$680', billingCycle: '/mo', isPublic: true, isContactOnly: false,
          billingType: 'monthly', teamLimit: 9, features: proFeaturesMap, proTeamLimit: 9
        },
        {
          id: 'squad_division', name: 'Club Division', description: 'Coordination for 12 elite squads.',
          priceDisplay: '$119.99', annualPriceDisplay: '$900', billingCycle: '/mo', isPublic: true, isContactOnly: false,
          billingType: 'monthly', teamLimit: 12, features: proFeaturesMap, proTeamLimit: 12
        },
        {
          id: 'squad_conference', name: 'Club Conference', description: 'Professional hub for 15 elite teams.',
          priceDisplay: '$149.99', annualPriceDisplay: '$1,120', billingCycle: '/mo', isPublic: true, isContactOnly: false,
          billingType: 'monthly', teamLimit: 15, features: proFeaturesMap, proTeamLimit: 15
        },
        {
          id: 'squad_organization', name: 'Club Custom', description: 'Enterprise solutions for leagues and multi-team organizations.',
          priceDisplay: 'Custom', annualPriceDisplay: 'Custom', billingCycle: '', isPublic: true, isContactOnly: true,
          billingType: 'manual', teamLimit: null, features: proFeaturesMap, proTeamLimit: 100
        }
      ];

      plans.forEach((p) => {
        const ref = doc(db, 'plans', p.id);
        batch.set(ref, p);
      });

      await batch.commit();
    }
  } catch (error) {
    console.error('Error seeding subscription data:', error);
  }
}

export async function seedDemoData(db: Firestore, teamId: string, planId: string, userId: string, extraOptions?: any) {
  const batch = writeBatch(db);
  const now = new Date();
  const isStarter = planId === 'starter_squad';
  const isPro = !isStarter || planId === 'tournament_pro';

  const names = [
    'Jordan Smith', 'Alex Rivera', 'Sam Taylor', 'Casey Morgan', 'Riley Jones', 
    'Morgan Lee', 'Taylor Quinn', 'Chris Brooks', 'Jamie Day', 'Robin Hood',
    'Sidney Vane', 'Blake Bell', 'Charlie Reed', 'Avery Hill', 'Parker Pen'
  ];
  
  for (let i = 0; i < (isStarter ? 10 : 15); i++) {
    const mid = `demo_mem_${teamId}_${i}`;
    batch.set(doc(db, 'teams', teamId, 'members', mid), {
      id: mid, userId: `demo_user_${teamId}_${i}`, teamId, name: names[i] || `Teammate ${i+1}`, 
      role: 'Member', position: 'Player', jersey: (i + 10).toString(),
      avatar: `https://picsum.photos/seed/demo_${i}_${teamId}/150/150`, 
      joinedAt: now.toISOString(), amountOwed: 0, feesPaid: true, isDemo: true
    });
  }

  // Add a multi-day tournament if requested
  if (planId === 'tournament_pro' || extraOptions?.includeTournament) {
    const eid = `demo_tournament_${teamId}`;
    const day1Date = new Date(now.getTime() - 86400000); // Yesterday
    const day2Date = now; // Today
    const day3Date = new Date(now.getTime() + 86400000); // Tomorrow

    const day1Str = day1Date.toISOString().split('T')[0];
    const day2Str = day2Date.toISOString().split('T')[0];
    const day3Str = day3Date.toISOString().split('T')[0];

    batch.set(doc(db, 'teams', teamId, 'events', eid), {
      id: eid, teamId, title: 'Summer Regional Finals', 
      date: day1Date.toISOString(),
      endDate: day3Date.toISOString(),
      startTime: '09:00 AM', location: 'Metropolitan Stadium', 
      description: 'Grand finale tournament for the region. Elite bracket deployment active.',
      isTournament: true,
      isTournamentPaid: true, // This enables the Elite standings/bracket views
      tournamentTeams: ['Westside Warriors', 'Eastside Elite', 'Northside Knights', 'Southside Strikers', 'Metro Stars', 'City Rangers'],
      tournamentGames: [
        // DAY 1 - Completed
        { id: 'g1', team1: 'Westside Warriors', team2: 'Eastside Elite', score1: 4, score2: 2, date: day1Str, time: '10:00 AM', isCompleted: true, winnerId: 'Westside Warriors' },
        { id: 'g2', team1: 'Northside Knights', team2: 'Southside Strikers', score1: 1, score2: 1, date: day1Str, time: '12:00 PM', isCompleted: true },
        // DAY 2 - Active
        { id: 'g3', team1: 'Metro Stars', team2: 'City Rangers', score1: 0, score2: 3, date: day2Str, time: '09:00 AM', isCompleted: true, winnerId: 'City Rangers' },
        { id: 'g4', team1: 'Westside Warriors', team2: 'Northside Knights', score1: 0, score2: 0, date: day2Str, time: '02:00 PM', isCompleted: false },
        // DAY 3 - Future
        { id: 'g5', team1: 'City Rangers', team2: 'Eastside Elite', score1: 0, score2: 0, date: day3Str, time: '11:00 AM', isCompleted: false }
      ],
      userRsvps: { [userId]: 'going' }, isDemo: true, createdAt: now.toISOString(), lastUpdated: now.toISOString()
    });
  } else {
    batch.set(doc(db, 'teams', teamId, 'events', `demo_evt_${teamId}_0`), {
      id: `demo_evt_${teamId}_0`, teamId, title: 'Squad Training', 
      date: new Date(now.getTime() + 86400000).toISOString(),
      startTime: '10:00 AM', location: 'Team Grounds', description: 'High priority event.',
      userRsvps: { [userId]: 'going' }, isDemo: true, createdAt: now.toISOString()
    });
  }

  const gamesList = [
    { opponent: 'Wildcats', result: 'Win', myScore: 4, opponentScore: 2 },
    { opponent: 'Storm', result: 'Loss', myScore: 1, opponentScore: 3 }
  ];
  gamesList.forEach((g, i) => {
    const gid = `demo_game_${teamId}_${i}`;
    batch.set(doc(db, 'teams', teamId, 'games', gid), {
      ...g, id: gid, teamId, date: new Date(now.getTime() - 86400000 * (i + 2)).toISOString(),
      location: 'Arena Central', notes: isPro ? 'Elite execution under pressure.' : '', isDemo: true, createdAt: now.toISOString()
    });
  });

  if (isPro) {
    const cid = `demo_chat_${teamId}`;
    batch.set(doc(db, 'teams', teamId, 'groupChats', cid), {
      id: cid, teamId, name: 'Tactical Command', memberIds: [userId], createdBy: userId, 
      createdAt: now.toISOString(), lastMessage: 'Review the plays for the regional finals.', unread: 0, isDemo: true
    });
  }

  await batch.commit();
}

export async function seedGuestDemoTeam(db: Firestore, userId: string, planId: string) {
  const timestamp = Date.now();
  const teamId = `demo_guest_${userId.slice(-4)}_${timestamp}`;
  const teamName = planId === 'starter_squad' ? 'Guest Grassroots Stars' : 
                   planId === 'squad_pro' ? 'Guest Pro Elite' : 
                   planId === 'tournament_pro' ? 'Regional Tournament Hub' : 'Metro Academy Hub';
  
  const code = teamId.slice(-6).toUpperCase();
  const actualPlanId = planId === 'tournament_pro' ? 'squad_pro' : planId;
  const isPro = actualPlanId !== 'starter_squad';
  const batch = writeBatch(db);
  const nowStr = new Date().toISOString();
  
  // RESET THE TIMER BY UPDATING createdAt TO THE EXACT MOMENT OF SEEDING
  batch.set(doc(db, 'users', userId), {
    id: userId, fullName: 'Guest Coordinator', email: 'guest@thesquad.io',
    notificationsEnabled: true, createdAt: nowStr,
    isDemo: true, avatarUrl: `https://picsum.photos/seed/${userId}/150/150`,
    activePlanId: actualPlanId, proTeamLimit: planId === 'squad_organization' ? 15 : 1,
    planSource: 'free', tournamentCredits: planId === 'tournament_pro' ? 1 : 0
  }, { merge: true });

  batch.set(doc(db, 'teams', teamId), {
    id: teamId, teamName, teamCode: code, createdBy: userId, ownerUserId: userId,
    createdAt: nowStr, members: { [userId]: 'Admin' },
    isPro, planId: actualPlanId, sport: 'Multi-Sport', isDemo: true,
    description: planId === 'squad_organization' ? 'Enterprise organization management demo.' : 'Professional coordination suite demo.'
  });
  
  batch.set(doc(db, 'users', userId, 'teamMemberships', teamId), {
    userId, teamId, teamName, teamCode: code, role: 'Admin', 
    isPro, planId: actualPlanId, isDemo: true, 
    joinedAt: nowStr, createdBy: userId, ownerUserId: userId
  });

  batch.set(doc(db, 'teams', teamId, 'members', userId), {
    id: userId, userId, teamId, name: 'Guest Coordinator', role: 'Admin',
    position: planId === 'squad_organization' ? 'Club Manager' : 'Coach', jersey: 'HQ',
    avatar: `https://picsum.photos/seed/${userId}/150/150`, joinedAt: nowStr,
    phone: '(555) 000-9999', amountOwed: 0, feesPaid: true, isDemo: true
  });

  await batch.commit();
  
  await seedDemoData(db, teamId, planId, userId, { includeTournament: planId === 'tournament_pro' });

  return teamId;
}

export async function resetDemoEnvironment(db: Firestore, teamId: string, planId: string, userId: string) {
  try {
    const membershipsSnap = await getDocs(collection(db, 'users', userId, 'teamMemberships'));
    const teamIds = membershipsSnap.docs.map(d => d.id);
    const subcollections = ['events', 'games', 'drills', 'files', 'alerts', 'feedPosts', 'groupChats', 'members'];
    
    for (const tid of teamIds) {
      for (const sub of subcollections) {
        const snap = await getDocs(collection(db, 'teams', tid, sub));
        if (snap.empty) continue;
        const batch = writeBatch(db);
        for (const docSnap of snap.docs) {
          if (sub === 'members' && docSnap.data().userId === userId) continue;
          if (sub === 'groupChats') {
            const msgs = await getDocs(collection(db, 'teams', tid, sub, docSnap.id, 'messages'));
            const msgBatch = writeBatch(db);
            msgs.forEach(m => msgBatch.delete(m.ref));
            if (msgs.size > 0) await msgBatch.commit();
          }
          batch.delete(docSnap.ref);
        }
        if (snap.size > 0) await batch.commit();
      }
    }
    const nowStr = new Date().toISOString();
    // RESET TIMER ON HEARTBEAT RESET
    await updateDoc(doc(db, 'users', userId), { createdAt: nowStr });
    for (const tid of teamIds) {
      await seedDemoData(db, tid, planId, userId);
    }
  } catch (error) { throw error; }
}

export async function launchDemoEnvironments(db: Firestore, superAdminId: string) {
  const demoTeams = [
    { id: 'demo_starter_team', name: 'U10 Grassroots Stars', planId: 'starter_squad', sport: 'Soccer' },
    { id: 'demo_pro_team', name: 'Elite Pro Squad', planId: 'squad_pro', sport: 'Basketball' },
    { id: 'demo_tournament_team', name: 'Regionals Tournament', planId: 'tournament_pro', sport: 'Baseball' },
    { id: 'demo_club_team_1', name: 'City Central United', planId: 'squad_organization', sport: 'Academy' }
  ];

  for (const dt of demoTeams) {
    const teamRef = doc(db, 'teams', dt.id);
    const snap = await getDocs(query(collection(db, 'teams'), where('id', '==', dt.id)));
    if (snap.empty) {
      const code = dt.id.slice(0, 6).toUpperCase();
      const actualPid = dt.planId === 'tournament_pro' ? 'squad_pro' : dt.planId;
      const batch = writeBatch(db);
      const nowStr = new Date().toISOString();
      batch.set(teamRef, {
        id: dt.id, teamName: dt.name, teamCode: code, createdBy: superAdminId, ownerUserId: superAdminId,
        createdAt: nowStr, members: { [superAdminId]: 'Admin' },
        isPro: actualPid !== 'starter_squad', planId: actualPid, sport: dt.sport, isDemo: true
      });
      batch.set(doc(db, 'users', superAdminId, 'teamMemberships', dt.id), {
        userId: superAdminId, teamId: dt.id, teamName: dt.name, teamCode: code,
        role: 'Admin', isPro: actualPid !== 'starter_squad', planId: actualPid, isDemo: true, joinedAt: nowStr,
        createdBy: superAdminId, ownerUserId: superAdminId
      });
      batch.set(doc(db, 'teams', dt.id, 'members', superAdminId), {
        id: superAdminId, userId: superAdminId, teamId: dt.id, name: 'Platform Admin', role: 'Admin',
        position: 'Platform Admin', jersey: 'HQ', avatar: `https://picsum.photos/seed/${superAdminId}/150/150`,
        joinedAt: nowStr, phone: '(555) 000-0000', amountOwed: 0, feesPaid: true, isDemo: true
      });
      await batch.commit();
      await seedDemoData(db, dt.id, dt.planId, superAdminId, { includeTournament: dt.planId === 'tournament_pro' });
    }
  }
}
