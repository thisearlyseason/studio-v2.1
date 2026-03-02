
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

/**
 * Seeds the Firestore database with default plans and features if they don't exist.
 */
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
        { id: 'score_tracking', description: 'Record game results and season progress.', defaultEnabled: false },
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
        high_priority_alerts: true
      };

      const starterFeatures = {
        schedule_games_events: true, basic_roster: true, live_feed_read: true
      };

      const plans = [
        {
          id: 'starter_squad', name: 'Starter Squad', description: 'Essential coordination for growing teams.',
          priceDisplay: 'Free', annualPriceDisplay: 'Free', billingCycle: '', isPublic: true, isContactOnly: false,
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

/**
 * Seeds realistic demo data for a team roster and sub-collections.
 * Uses teamId to diversify mock data.
 */
export async function seedDemoData(db: Firestore, teamId: string, planId: string, userId: string) {
  console.log(`[Seeder] Seeding unique sub-collections for team ${teamId} (${planId})`);
  const batch = writeBatch(db);
  const now = new Date();
  const isStarter = planId === 'starter_squad';
  const isPro = !isStarter;

  const teamType = teamId.includes('sub') ? 'sub' : (teamId.includes('pro') ? 'pro' : 'base');
  const teamSuffix = teamId.slice(-1);

  // 1. Setup Team Roster
  const count = isStarter ? 10 : 15;
  const names = [
    'Jordan Smith', 'Alex Rivera', 'Sam Taylor', 'Casey Morgan', 'Riley Jones', 
    'Morgan Lee', 'Taylor Quinn', 'Chris Brooks', 'Jamie Day', 'Robin Hood',
    'Sidney Vane', 'Blake Bell', 'Charlie Reed', 'Avery Hill', 'Parker Pen'
  ];
  
  for (let i = 0; i < count; i++) {
    const mid = `demo_mem_${teamId}_${i}`;
    batch.set(doc(db, 'teams', teamId, 'members', mid), {
      id: mid, userId: `demo_user_${teamId}_${i}`, teamId, name: names[i] || `Teammate ${i+1}`, 
      role: 'Member', position: 'Player', jersey: (i + 10).toString(),
      avatar: `https://picsum.photos/seed/demo_${i}_${teamId}/150/150`, 
      joinedAt: now.toISOString(), amountOwed: 0, feesPaid: true, isDemo: true
    });
  }

  // 2. Setup Events
  const eventTitles = teamType === 'sub' 
    ? [`U${teamSuffix} Regional Qualifier`, 'Tactical Review', 'Squad Lunch']
    : ['Championship Finals', 'Intensive Training', 'Video Analysis'];

  eventTitles.forEach((title, i) => {
    const eid = `demo_evt_${teamId}_${i}`;
    batch.set(doc(db, 'teams', teamId, 'events', eid), {
      id: eid, teamId, title, date: new Date(now.getTime() + 86400000 * (i + 1)).toISOString(),
      startTime: '10:00 AM', location: 'Team Grounds', description: 'High priority event.',
      userRsvps: { [userId]: 'going' }, isDemo: true, createdAt: now.toISOString()
    });
  });

  // 3. Setup Drills
  if (isPro) {
    const drills = teamType === 'sub' && teamSuffix === '1'
      ? [{ title: 'Dribbling Fundamentals', desc: 'Eyes up coordination drills.' }, { title: 'The Triangle Play', desc: 'Rapid sequence passing.' }]
      : [{ title: 'Full Court Defensive Trap', desc: 'High energy pressure setup.' }, { title: 'Set Piece Wizardry', desc: 'Mastering set piece execution.' }];

    drills.forEach((d, i) => {
      const did = `demo_drill_${teamId}_${i}`;
      batch.set(doc(db, 'teams', teamId, 'drills', did), {
        ...d, id: did, teamId, createdBy: userId, createdAt: now.toISOString(), 
        thumbnailUrl: `https://picsum.photos/seed/drill_${teamId}_${i}/400/300`, isDemo: true
      });
    });
  }

  // 4. Setup Games
  if (isPro) {
    const games = [
      { opponent: 'Wildcats', result: 'Win', myScore: 4, opponentScore: 2 },
      { opponent: 'Storm', result: 'Loss', myScore: 1, opponentScore: 3 }
    ];
    games.forEach((g, i) => {
      const gid = `demo_game_${teamId}_${i}`;
      batch.set(doc(db, 'teams', teamId, 'games', gid), {
        ...g, id: gid, teamId, date: new Date(now.getTime() - 86400000 * (i + 2)).toISOString(),
        location: 'Arena Central', notes: 'Elite execution.', isDemo: true, createdAt: now.toISOString()
      });
    });
  }

  // 5. Setup Chat & Messages
  if (isPro) {
    const cid = `demo_chat_${teamId}`;
    const chatName = teamType === 'sub' ? `Academy Team ${teamSuffix}` : 'Tactical Command';
    batch.set(doc(db, 'teams', teamId, 'groupChats', cid), {
      id: cid, teamId, name: chatName, memberIds: [userId], createdBy: userId, 
      createdAt: now.toISOString(), lastMessage: 'Review the plays.', unread: 0, isDemo: true
    });

    const messages = [
      { content: `Initializing ${chatName} channel.`, author: 'System' },
      { content: 'New drill added to the library.', author: 'Guest Coordinator' },
      { content: 'Strategy for the weekend is now live.', author: 'Guest Coordinator' }
    ];

    messages.forEach((m, i) => {
      const mid = `demo_msg_${teamId}_${i}`;
      batch.set(doc(db, 'teams', teamId, 'groupChats', cid, 'messages', mid), {
        ...m, id: mid, authorId: userId, type: 'text', createdAt: new Date(now.getTime() + (i * 1000)).toISOString()
      });
    });
  }

  await batch.commit();
}

/**
 * Creates a fresh demo team for a guest user session.
 */
export async function seedGuestDemoTeam(db: Firestore, userId: string, planId: string) {
  const timestamp = Date.now();
  const teamId = `demo_guest_${userId.slice(-4)}_${timestamp}`;
  const teamName = planId === 'starter_squad' ? 'Guest Grassroots Stars' : 
                   planId === 'squad_pro' ? 'Guest Pro Elite' : 'Metro Academy Hub';
  
  const code = teamId.slice(-6).toUpperCase();
  const isPro = planId !== 'starter_squad';
  const batch = writeBatch(db);
  
  batch.set(doc(db, 'users', userId), {
    id: userId, fullName: 'Guest Coordinator', email: 'guest@thesquad.io',
    notificationsEnabled: true, createdAt: new Date().toISOString(),
    isDemo: true, avatarUrl: `https://picsum.photos/seed/${userId}/150/150`,
    activePlanId: planId, proTeamLimit: planId === 'squad_organization' ? 15 : (planId === 'squad_pro' ? 1 : 0),
    planSource: 'free'
  }, { merge: true });

  batch.set(doc(db, 'teams', teamId), {
    id: teamId, teamName, teamCode: code, createdBy: userId, ownerUserId: userId,
    createdAt: new Date().toISOString(), members: { [userId]: 'Admin' },
    isPro, planId, sport: 'Multi-Sport', isDemo: true,
    description: planId === 'squad_organization' ? 'Enterprise organization management.' : 'Professional coordination suite.'
  });
  
  batch.set(doc(db, 'users', userId, 'teamMemberships', teamId), {
    userId, teamId, teamName, teamCode: code, role: 'Admin', 
    isPro, planId, isDemo: true, 
    joinedAt: new Date().toISOString(), createdBy: userId, ownerUserId: userId
  });

  batch.set(doc(db, 'teams', teamId, 'members', userId), {
    id: userId, userId, teamId, name: 'Guest Coordinator', role: 'Admin',
    position: planId === 'squad_organization' ? 'Club Manager' : 'Coach', jersey: 'HQ',
    avatar: `https://picsum.photos/seed/${userId}/150/150`, joinedAt: new Date().toISOString(),
    phone: '(555) 000-9999', amountOwed: 0, feesPaid: true, isDemo: true
  });

  if (planId === 'squad_organization') {
    const subTeams = [
      { id: `demo_sub_${userId.slice(-4)}_1`, name: 'Elite Development U14' },
      { id: `demo_sub_${userId.slice(-4)}_2`, name: 'Varsity Regional U16' }
    ];

    for (const sub of subTeams) {
      batch.set(doc(db, 'teams', sub.id), {
        id: sub.id, teamName: sub.name, teamCode: sub.id.slice(-6).toUpperCase(), createdBy: userId, ownerUserId: userId,
        createdAt: new Date().toISOString(), members: { [userId]: 'Admin' },
        isPro: true, planId: 'squad_organization', isDemo: true, sport: 'Club'
      });
      batch.set(doc(db, 'users', userId, 'teamMemberships', sub.id), {
        userId, teamId: sub.id, teamName: sub.name, role: 'Admin', isPro: true, 
        planId: 'squad_organization', isDemo: true, joinedAt: new Date().toISOString(), 
        createdBy: userId, ownerUserId: userId
      });
      batch.set(doc(db, 'teams', sub.id, 'members', userId), {
        id: userId, userId, teamId: sub.id, name: 'Guest Coordinator', role: 'Admin',
        position: 'Club Manager', avatar: `https://picsum.photos/seed/${userId}/150/150`, 
        isDemo: true, joinedAt: new Date().toISOString()
      });
    }
  }
  
  await batch.commit();
  
  await seedDemoData(db, teamId, planId, userId);
  if (planId === 'squad_organization') {
    await seedDemoData(db, `demo_sub_${userId.slice(-4)}_1`, 'squad_organization', userId);
    await seedDemoData(db, `demo_sub_${userId.slice(-4)}_2`, 'squad_organization', userId);
  }

  return teamId;
}

/**
 * Atomic reset for demo environments.
 */
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
          if (sub === 'events') {
            const regs = await getDocs(collection(db, 'teams', tid, sub, docSnap.id, 'registrations'));
            const regBatch = writeBatch(db);
            regs.forEach(r => regBatch.delete(r.ref));
            if (regs.size > 0) await regBatch.commit();
          }

          batch.delete(docSnap.ref);
        }
        if (snap.size > 0) await batch.commit();
      }
    }

    await updateDoc(doc(db, 'users', userId), { createdAt: new Date().toISOString() });

    for (const tid of teamIds) {
      await seedDemoData(db, tid, planId, userId);
    }
  } catch (error) {
    console.error("Demo reset error:", error);
    throw error;
  }
}

/**
 * Initializes global baseline demo environments.
 */
export async function launchDemoEnvironments(db: Firestore, superAdminId: string) {
  const demoTeams = [
    { id: 'demo_starter_team', name: 'U10 Grassroots Stars', planId: 'starter_squad', sport: 'Soccer' },
    { id: 'demo_pro_team', name: 'Elite Pro Squad', planId: 'squad_pro', sport: 'Basketball' },
    { id: 'demo_club_team_1', name: 'City Central United', planId: 'squad_organization', sport: 'Academy' }
  ];

  for (const dt of demoTeams) {
    const teamRef = doc(db, 'teams', dt.id);
    const snap = await getDocs(query(collection(db, 'teams'), where('id', '==', dt.id)));
    
    if (snap.empty) {
      const code = dt.id.slice(0, 6).toUpperCase();
      const batch = writeBatch(db);
      batch.set(teamRef, {
        id: dt.id, teamName: dt.name, teamCode: code, createdBy: superAdminId, ownerUserId: superAdminId,
        createdAt: new Date().toISOString(), members: { [superAdminId]: 'Admin' },
        isPro: dt.planId !== 'starter_squad', planId: dt.planId, sport: dt.sport, isDemo: true
      });
      batch.set(doc(db, 'users', superAdminId, 'teamMemberships', dt.id), {
        userId: superAdminId, teamId: dt.id, teamName: dt.name, teamCode: code,
        role: 'Admin', isPro: dt.planId !== 'starter_squad', planId: dt.planId, isDemo: true, joinedAt: new Date().toISOString(),
        createdBy: superAdminId, ownerUserId: superAdminId
      });
      batch.set(doc(db, 'teams', dt.id, 'members', superAdminId), {
        id: superAdminId, userId: superAdminId, teamId: dt.id, name: 'Platform Admin', role: 'Admin',
        position: 'Platform Admin', jersey: 'HQ', avatar: `https://picsum.photos/seed/${superAdminId}/150/150`,
        joinedAt: new Date().toISOString(), phone: '(555) 000-0000', amountOwed: 0, feesPaid: true, isDemo: true
      });
      await batch.commit();
      await seedDemoData(db, dt.id, dt.planId, superAdminId);
    }
  }
}
