
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

    // 2. Seed Plans if missing
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
          id: 'starter_squad', name: 'Starter Squad', description: 'Basic coordination essentials for growing teams.',
          priceDisplay: 'Free', billingCycle: '', isPublic: true, isContactOnly: false,
          billingType: 'free', teamLimit: 1, features: starterFeatures
        },
        {
          id: 'squad_pro', name: 'Squad Pro', description: 'Full-scale coordination and analytics for elite squads.',
          priceDisplay: '$9.99', billingCycle: '/mo', isPublic: true, isContactOnly: false,
          billingType: 'monthly', teamLimit: 5, features: proFeaturesMap
        },
        {
          id: 'club_custom', name: 'Club / Custom', description: 'Enterprise solutions for leagues and multi-team organizations.',
          priceDisplay: 'Custom', billingCycle: '', isPublic: true, isContactOnly: true,
          billingType: 'manual', teamLimit: null, features: proFeaturesMap
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
  const count = planId === 'starter_squad' ? 12 : 18;
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
      isDemo: true, notes: planId !== 'starter_squad' ? 'Strong performance in regional qualifiers.' : ''
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

  // 3. Setup Games & Stats
  if (planId !== 'starter_squad') {
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
  if (planId !== 'starter_squad') {
    const cid = `demo_chat_${teamId}`;
    batch.set(doc(db, 'teams', teamId, 'groupChats', cid), { id: cid, teamId, name: 'Tactical Planning', memberIds: [userId], createdBy: userId, createdAt: now.toISOString(), lastMessage: 'Reviewing the tape now.', isDemo: true });
    
    const post = { 
      teamId, content: 'Check the new defensive drills in the library. Essential for this weekend!', 
      type: 'user', authorId: userId, author: { name: 'Guest Coordinator', avatar: `https://picsum.photos/seed/${userId}/150/150` }, 
      createdAt: now.toISOString(), likes: [userId], imageUrl: 'https://images.unsplash.com/photo-1508088062105-17d61307629d?auto=format&fit=crop&q=80&w=800' 
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
    isPro: planId !== 'starter_squad', planId, sport: 'Multi-Sport', isDemo: true,
    description: planId === 'club_custom' ? 'Elite multi-team development organization.' : 'Dynamic coordination for high-performance squads.'
  });
  
  batch.set(doc(db, 'users', userId, 'teamMemberships', teamId), {
    userId, teamId, teamName, teamCode: code, role: 'Admin', 
    isPro: planId !== 'starter_squad', planId, isDemo: true, 
    joinedAt: new Date().toISOString(), createdBy: userId
  });

  batch.set(doc(db, 'teams', teamId, 'members', userId), {
    id: userId, userId, teamId, name: 'Guest Coordinator', role: 'Admin',
    position: planId === 'club_custom' ? 'Club Manager' : 'Coach', jersey: 'Staff',
    avatar: `https://picsum.photos/seed/${userId}/150/150`, joinedAt: new Date().toISOString(),
    phone: '(555) 000-1234', amountOwed: 0, feesPaid: true, isDemo: true
  });

  // 3. Club Sub-teams
  if (planId === 'club_custom') {
    const subs = [
      { id: `demo_sub_${userId.slice(-6)}_1`, name: 'Guest U14 Select' },
      { id: `demo_sub_${userId.slice(-6)}_2`, name: 'Guest U16 Regional' }
    ];

    for (const sub of subs) {
      batch.set(doc(db, 'teams', sub.id), {
        id: sub.id, teamName: sub.name, teamCode: sub.id.slice(-6).toUpperCase(), createdBy: userId,
        createdAt: new Date().toISOString(), members: { [userId]: 'Admin' },
        isPro: true, planId: 'club_custom', isDemo: true
      });
      batch.set(doc(db, 'users', userId, 'teamMemberships', sub.id), {
        userId, teamId: sub.id, teamName: sub.name, role: 'Admin', isPro: true, 
        planId: 'club_custom', isDemo: true, joinedAt: new Date().toISOString(), createdBy: userId
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
  if (planId === 'club_custom') {
    await seedDemoData(db, `demo_sub_${userId.slice(-6)}_1`, 'club_custom', userId);
    await seedDemoData(db, `demo_sub_${userId.slice(-6)}_2`, 'club_custom', userId);
  }

  return teamId;
}

/**
 * Resets a demo environment by wiping and re-seeding.
 */
export async function resetDemoEnvironment(db: Firestore, teamId: string, planId: string, userId: string) {
  const membershipsSnap = await getDocs(collection(db, 'users', userId, 'teamMemberships'));
  const teamIds = membershipsSnap.docs.map(d => d.id);

  const subcollections = ['members', 'events', 'games', 'drills', 'files', 'alerts', 'feedPosts', 'groupChats'];
  
  for (const tid of teamIds) {
    for (const sub of subcollections) {
      const snap = await getDocs(collection(db, 'teams', tid, sub));
      for (const d of snap.docs) {
        if (sub === 'groupChats') {
          const msgs = await getDocs(collection(db, 'teams', tid, sub, d.id, 'messages'));
          for (const m of msgs.docs) await deleteDoc(m.ref);
        }
        if (sub === 'events') {
          const regs = await getDocs(collection(db, 'teams', tid, sub, d.id, 'registrations'));
          for (const r of regs.docs) await deleteDoc(r.ref);
        }
        await deleteDoc(d.ref);
      }
    }
  }

  // Reset user
  await setDoc(doc(db, 'users', userId), {
    id: userId, fullName: 'Guest Coordinator', email: 'guest@thesquad.io',
    notificationsEnabled: true, createdAt: new Date().toISOString(),
    isDemo: true, avatarUrl: `https://picsum.photos/seed/${userId}/150/150`
  }, { merge: true });

  // Re-seed all
  for (const tid of teamIds) {
    await setDoc(doc(db, 'teams', tid, 'members', userId), {
      id: userId, userId, teamId: tid, name: 'Guest Coordinator', role: 'Admin',
      position: planId === 'club_custom' ? 'Club Manager' : 'Coach', jersey: 'Staff',
      avatar: `https://picsum.photos/seed/${userId}/150/150`, joinedAt: new Date().toISOString(),
      phone: '(555) 000-1234', amountOwed: 0, feesPaid: true, isDemo: true
    });
    await seedDemoData(db, tid, planId, userId);
  }
}

/**
 * Launches global demo environments if they don't exist.
 */
export async function launchDemoEnvironments(db: Firestore, superAdminId: string) {
  const demoTeams = [
    { id: 'demo_starter_team', name: 'U10 Grassroots Stars', planId: 'starter_squad', sport: 'Soccer' },
    { id: 'demo_pro_team', name: 'Elite Varsity Squad', planId: 'squad_pro', sport: 'Basketball' },
    { id: 'demo_club_team_1', name: 'City Central United', planId: 'club_custom', sport: 'Football' }
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
