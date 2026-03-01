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
  updateDoc
} from 'firebase/firestore';

/**
 * Seeds the Firestore database with default plans and features if they don't exist.
 */
export async function seedSubscriptionData(db: Firestore) {
  try {
    // 1. Seed Features if missing
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
        { id: 'multi_team_admin_dashboard', description: 'Centralized dashboard for multi-team owners.', defaultEnabled: false },
        { id: 'cross_team_announcements', description: 'Broadcast alerts to multiple squads at once.', defaultEnabled: false },
        { id: 'priority_support', description: 'Direct access to support specialists.', defaultEnabled: false },
        { id: 'early_feature_access', description: 'Access new tools before public release.', defaultEnabled: false },
        { id: 'custom_permissions', description: 'Define custom access levels for staff.', defaultEnabled: false },
      ];

      defaultFeatures.forEach((f) => {
        const ref = doc(db, 'features', f.id);
        batch.set(ref, { id: f.id, description: f.description, defaultEnabled: f.defaultEnabled });
      });

      await batch.commit();
    }

    // 2. Authoritative Plan Catalog
    const plansSnapshot = await getDocs(collection(db, 'plans'));
    
    if (plansSnapshot.empty) {
      const batch = writeBatch(db);

      const proFeaturesMap = {
        schedule_games_events: true, tournaments: true, basic_roster: true, full_roster_details: true,
        attendance_tracking: true, live_feed_read: true, live_feed_post: true, group_chat: true,
        score_tracking: true, stats_basic: true, media_uploads: true, history_unlimited: true
      };

      const starterFeatures = {
        schedule_games_events: true, basic_roster: true, live_feed_read: true
      };

      const plans = [
        {
          id: 'starter_squad', name: 'Starter Squad', description: 'Essential coordination for unlimited teams.',
          priceDisplay: 'Free', billingCycle: '', isPublic: true, isContactOnly: false,
          billingType: 'free', teamLimit: null, features: starterFeatures, proTeamLimit: 0
        },
        {
          id: 'squad_pro', name: 'Elite Solo', description: 'Pro features for a single competitive team.',
          priceDisplay: '$12.99', billingCycle: '/mo', isPublic: true, isContactOnly: false,
          billingType: 'monthly', teamLimit: 1, features: proFeaturesMap, proTeamLimit: 1
        },
        {
          id: 'squad_duo', name: 'Dynamic Duo', description: 'Power up two elite squads.',
          priceDisplay: '$23.99', billingCycle: '/mo', isPublic: true, isContactOnly: false,
          billingType: 'monthly', teamLimit: 2, features: proFeaturesMap, proTeamLimit: 2
        },
        {
          id: 'squad_crew', name: 'The Crew', description: 'Coordination suite for up to 4 teams.',
          priceDisplay: '$44.99', billingCycle: '/mo', isPublic: true, isContactOnly: false,
          billingType: 'monthly', teamLimit: 4, features: proFeaturesMap, proTeamLimit: 4
        },
        {
          id: 'squad_league', name: 'League Master', description: 'Full-scale coordination for 9 squads.',
          priceDisplay: '$89.99', billingCycle: '/mo', isPublic: true, isContactOnly: false,
          billingType: 'monthly', teamLimit: 9, features: proFeaturesMap, proTeamLimit: 9
        },
        {
          id: 'squad_division', name: 'Division Lead', description: 'Elite oversight for 12 squads.',
          priceDisplay: '$119.99', billingCycle: '/mo', isPublic: true, isContactOnly: false,
          billingType: 'monthly', teamLimit: 12, features: proFeaturesMap, proTeamLimit: 12
        },
        {
          id: 'squad_conference', name: 'Conference Pro', description: 'Master infrastructure for 15 teams.',
          priceDisplay: '$149.99', billingCycle: '/mo', isPublic: true, isContactOnly: false,
          billingType: 'monthly', teamLimit: 15, features: proFeaturesMap, proTeamLimit: 15
        },
        {
          id: 'squad_organization', name: 'Organization', description: 'Custom enterprise-grade infrastructure for large clubs.',
          priceDisplay: 'Custom', billingCycle: '', isPublic: true, isContactOnly: true,
          billingType: 'manual', teamLimit: null, features: proFeaturesMap, proTeamLimit: 15
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
 */
export async function seedDemoData(db: Firestore, teamId: string, planId: string, userId: string) {
  const batch = writeBatch(db);
  const now = new Date();

  // 1. Setup Team Roster
  const isStarter = planId === 'starter_squad';
  const count = isStarter ? 12 : 18;
  const memberPositions = ['Assistant Coach', 'Captain', 'Defender', 'Midfielder', 'Forward', 'Goalie'];
  const names = [
    'Jordan Smith', 'Alex Rivera', 'Sam Taylor', 'Casey Morgan', 'Riley Jones', 
    'Morgan Lee', 'Taylor Quinn', 'Chris Brooks', 'Jamie Day', 'Robin Hood',
    'Sidney Vane', 'Blake Bell', 'Charlie Reed', 'Avery Hill', 'Parker Pen',
    'Skyler Gray', 'Dakota Blue', 'Emerson Green', 'Phoenix Red', 'Quinn Rose'
  ];
  
  for (let i = 0; i < count; i++) {
    const mid = `demo_mem_${teamId}_${i}`;
    batch.set(doc(db, 'teams', teamId, 'members', mid), {
      id: mid, userId: `demo_user_${teamId}_${i}`, teamId, name: names[i] || `Teammate ${i+1}`, 
      role: 'Member', position: memberPositions[i % memberPositions.length], 
      jersey: (i + 10).toString(), avatar: `https://picsum.photos/seed/demo_${i}_${teamId}/150/150`, 
      joinedAt: now.toISOString(), phone: '(555) 000-0000', amountOwed: 0, feesPaid: true, 
      isDemo: true, notes: !isStarter ? 'Strong performance in regional qualifiers.' : ''
    });
  }

  // 2. Setup Events
  const eventData = [
    { title: 'Championship Final', date: new Date(now.getTime() + 86400000 * 2).toISOString(), startTime: '10:00 AM', location: 'City Stadium', description: 'Arrive 30 mins early for warmups.' },
    { title: 'Recovery Session', date: new Date(now.getTime() + 86400000 * 4).toISOString(), startTime: '05:00 PM', location: 'Clubhouse Pool', description: 'Bring towels and extra water.' },
    { title: 'Past Match Analysis', date: new Date(now.getTime() - 86400000 * 3).toISOString(), startTime: '06:00 PM', location: 'Team Room', description: 'Reviewing tapes from the weekend.' }
  ];

  eventData.forEach((e, i) => {
    const eid = `demo_evt_${teamId}_${i}`;
    batch.set(doc(db, 'teams', teamId, 'events', eid), {
      ...e, id: eid, teamId, createdBy: userId, createdAt: now.toISOString(), 
      userRsvps: { [userId]: 'going' }, isDemo: true
    });
  });

  // 3. Setup Games & Stats (Only for Pro/Club)
  if (!isStarter) {
    const games = [
      { opponent: 'Northern Tigers', date: new Date(now.getTime() - 86400000 * 3).toISOString(), myScore: 3, opponentScore: 1, result: 'Win', location: 'Home Field', notes: 'Great defensive pressure throughout.' },
      { opponent: 'Eastside Warriors', date: new Date(now.getTime() - 86400000 * 7).toISOString(), myScore: 2, opponentScore: 2, result: 'Tie', location: 'Warriors Den', notes: 'Hard fought match in the rain.' },
      { opponent: 'Valley Hawks', date: new Date(now.getTime() - 86400000 * 10).toISOString(), myScore: 1, opponentScore: 4, result: 'Loss', location: 'Valley Park', notes: 'Struggled with fatigue in second half.' }
    ];
    games.forEach((g, i) => {
      const gid = `demo_game_${teamId}_${i}`;
      batch.set(doc(db, 'teams', teamId, 'games', gid), { ...g, id: gid, teamId, createdBy: userId, createdAt: now.toISOString(), isDemo: true });
    });
  }

  // 4. Setup Chat & Feed
  if (!isStarter) {
    const cid = `demo_chat_${teamId}`;
    batch.set(doc(db, 'teams', teamId, 'groupChats', cid), { id: cid, teamId, name: 'Tactical Planning', memberIds: [userId], createdBy: userId, createdAt: now.toISOString(), lastMessage: 'Reviewing the tape now.', isDemo: true });
    
    const post = { 
      teamId, content: 'Check the new defensive drills in the library. Essential for this weekend!', 
      type: 'user', authorId: userId, author: { name: 'Guest Coordinator', avatar: `https://picsum.photos/seed/${userId}/150/150` }, 
      createdAt: now.toISOString(), likes: [userId], imageUrl: 'https://images.unsplash.com/photo-1508088062105-17d61307629d?auto=format&fit=crop&q=80&w=800' 
    };
    batch.set(doc(collection(db, 'teams', teamId, 'feedPosts')), { ...post, isDemo: true });
  } else {
    // Basic feed for Starter
    const post = { 
      teamId, content: 'Welcome to the squad feed. This is where we broadcast team updates.', 
      type: 'system', authorId: userId, author: { name: 'The Squad', avatar: '' }, 
      createdAt: now.toISOString(), isDemo: true 
    };
    batch.set(doc(collection(db, 'teams', teamId, 'feedPosts')), { ...post, isDemo: true });
  }

  await batch.commit();
}

/**
 * Creates a fresh demo team for a guest user session.
 */
export async function seedGuestDemoTeam(db: Firestore, userId: string, planId: string) {
  const timestamp = Date.now();
  const teamId = `demo_guest_${userId.slice(-6)}_${timestamp}`;
  const teamName = planId === 'starter_squad' ? 'Guest Grassroots Stars' : 
                   planId === 'squad_pro' ? 'Guest Pro Varsity' : 'City Central Academy (Club)';
  
  const code = teamId.slice(-6).toUpperCase();
  const isPro = planId !== 'starter_squad';
  const batch = writeBatch(db);
  
  // 1. Ensure User Profile
  batch.set(doc(db, 'users', userId), {
    id: userId, fullName: 'Guest Coordinator', email: 'guest@thesquad.io',
    notificationsEnabled: true, createdAt: new Date().toISOString(),
    isDemo: true, avatarUrl: `https://picsum.photos/seed/${userId}/150/150`
  }, { merge: true });

  // 2. Main Team
  batch.set(doc(db, 'teams', teamId), {
    id: teamId, teamName, teamCode: code, createdBy: userId,
    createdAt: new Date().toISOString(), members: { [userId]: 'Admin' },
    isPro, planId, sport: 'Multi-Sport', isDemo: true,
    description: planId === 'squad_organization' ? 'Elite multi-team development organization.' : 'Dynamic coordination for high-performance squads.'
  });
  
  batch.set(doc(db, 'users', userId, 'teamMemberships', teamId), {
    userId, teamId, teamName, teamCode: code, role: 'Admin', 
    isPro, planId, isDemo: true, 
    joinedAt: new Date().toISOString(), createdBy: userId
  });

  batch.set(doc(db, 'teams', teamId, 'members', userId), {
    id: userId, userId, teamId, name: 'Guest Coordinator', role: 'Admin',
    position: planId === 'squad_organization' ? 'Club Manager' : 'Coach', jersey: 'Staff',
    avatar: `https://picsum.photos/seed/${userId}/150/150`, joinedAt: new Date().toISOString(),
    phone: '(555) 000-1234', amountOwed: 0, feesPaid: true, isDemo: true
  });

  // 3. Club Sub-teams
  if (planId === 'squad_organization') {
    const subs = [
      { id: `demo_sub_${userId.slice(-6)}_1`, name: 'Guest U14 Development' },
      { id: `demo_sub_${userId.slice(-6)}_2`, name: 'Guest U16 Regional Select' }
    ];

    for (const sub of subs) {
      batch.set(doc(db, 'teams', sub.id), {
        id: sub.id, teamName: sub.name, teamCode: sub.id.slice(-6).toUpperCase(), createdBy: userId,
        createdAt: new Date().toISOString(), members: { [userId]: 'Admin' },
        isPro: true, planId: 'squad_organization', isDemo: true
      });
      batch.set(doc(db, 'users', userId, 'teamMemberships', sub.id), {
        userId, teamId: sub.id, teamName: sub.name, role: 'Admin', isPro: true, 
        planId: 'squad_organization', isDemo: true, joinedAt: new Date().toISOString(), createdBy: userId
      });
      batch.set(doc(db, 'teams', sub.id, 'members', userId), {
        id: userId, userId, teamId: sub.id, name: 'Guest Coordinator', role: 'Admin',
        position: 'Club Manager', avatar: `https://picsum.photos/seed/${userId}/150/150`, 
        isDemo: true, joinedAt: new Date().toISOString()
      });
    }
  }
  
  await batch.commit();
  
  // Seed realistic content
  await seedDemoData(db, teamId, planId, userId);
  if (planId === 'squad_organization') {
    await seedDemoData(db, `demo_sub_${userId.slice(-6)}_1`, 'squad_organization', userId);
    await seedDemoData(db, `demo_sub_${userId.slice(-6)}_2`, 'squad_organization', userId);
  }

  return teamId;
}

/**
 * Resiliently resets a demo environment by wiping and re-seeding subcollections via batches.
 */
export async function resetDemoEnvironment(db: Firestore, teamId: string, planId: string, userId: string) {
  try {
    const membershipsSnap = await getDocs(collection(db, 'users', userId, 'teamMemberships'));
    const teamIds = membershipsSnap.docs.map(d => d.id);

    const subcollections = ['events', 'games', 'drills', 'files', 'alerts', 'feedPosts', 'groupChats', 'members'];
    
    // Purge logic using batches
    for (const tid of teamIds) {
      for (const sub of subcollections) {
        const snap = await getDocs(collection(db, 'teams', tid, sub));
        if (snap.empty) continue;

        const batch = writeBatch(db);
        for (const docSnap of snap.docs) {
          // Safety: Don't delete the active manager's member record during the wipe
          if (sub === 'members' && docSnap.data().userId === userId) continue;
          
          // Handle nested subcollections
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

    // Reset user heartbeat
    await updateDoc(doc(db, 'users', userId), { 
      createdAt: new Date().toISOString() 
    });

    // Re-seed content
    for (const tid of teamIds) {
      await seedDemoData(db, tid, planId, userId);
    }
  } catch (error) {
    console.error("Atomic Demo Reset Failed:", error);
    throw error;
  }
}

/**
 * Launches global demo environments if they don't exist.
 */
export async function launchDemoEnvironments(db: Firestore, superAdminId: string) {
  const demoTeams = [
    { id: 'demo_starter_team', name: 'U10 Grassroots Stars', planId: 'starter_squad', sport: 'Soccer' },
    { id: 'demo_pro_team', name: 'Elite Solo Squad', planId: 'squad_pro', sport: 'Basketball' },
    { id: 'demo_club_team_1', name: 'City Central United', planId: 'squad_organization', sport: 'Football' }
  ];

  for (const dt of demoTeams) {
    const teamRef = doc(db, 'teams', dt.id);
    const snap = await getDocs(query(collection(db, 'teams'), where('id', '==', dt.id)));
    
    if (snap.empty) {
      const code = dt.id.slice(0, 6).toUpperCase();
      const batch = writeBatch(db);
      batch.set(teamRef, {
        id: dt.id, teamName: dt.name, teamCode: code, createdBy: superAdminId,
        createdAt: new Date().toISOString(), members: { [superAdminId]: 'Admin' },
        isPro: dt.planId !== 'starter_squad', planId: dt.planId, sport: dt.sport, isDemo: true
      });
      batch.set(doc(db, 'users', superAdminId, 'teamMemberships', dt.id), {
        userId: superAdminId, teamId: dt.id, teamName: dt.name, teamCode: code,
        role: 'Admin', isPro: dt.planId !== 'starter_squad', planId: dt.planId, isDemo: true, joinedAt: new Date().toISOString(),
        createdBy: superAdminId
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
