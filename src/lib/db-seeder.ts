
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
  addDoc,
  getDoc
} from 'firebase/firestore';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';

/**
 * Sanitizes objects for Firestore by removing undefined values recursively.
 * Ensures data integrity for all demo and initialization writes.
 */
const clean = (obj: any): any => {
  if (Array.isArray(obj)) return obj.map(v => clean(v));
  if (obj !== null && typeof obj === 'object') {
    const newObj: any = {};
    Object.keys(obj).forEach(key => {
      const val = obj[key];
      if (val !== undefined) {
        newObj[key] = clean(val);
      }
    });
    return newObj;
  }
  return obj ?? null;
};

/**
 * Centrally defines the subscription plans and features.
 */
export async function seedSubscriptionData(db: Firestore) {
  try {
    const featuresSnapshot = await getDocs(collection(db, 'features'));
    if (featuresSnapshot.empty) {
      const batch = writeBatch(db);
      
      const defaultFeatures = [
        { id: 'schedule_basic', description: 'Plan and coordinate team matches.', defaultEnabled: true },
        { id: 'schedule_elite', description: 'Plan meetings, events, and advanced facility coordination.', defaultEnabled: false },
        { id: 'tournament_basic', description: 'Manage basic tournament series.', defaultEnabled: true },
        { id: 'tournament_elite', description: 'Advanced brackets, live scores, and public portal hub.', defaultEnabled: false },
        { id: 'basic_roster', description: 'Manage a basic list of team members.', defaultEnabled: true },
        { id: 'full_roster_details', description: 'Track medical info, emergency contacts, and coaching notes.', defaultEnabled: false },
        { id: 'attendance_tracking', description: 'Track RSVPs and real-time attendance for events.', defaultEnabled: false },
        { id: 'live_feed_read', description: 'View the squad activity feed.', defaultEnabled: true },
        { id: 'live_feed_post', description: 'Post updates, photos, and polls to the squad.', defaultEnabled: false },
        { id: 'group_chat', description: 'Real-time messaging channels for coordination.', defaultEnabled: true },
        { id: 'score_tracking', description: 'Record game results and season progress.', defaultEnabled: true },
        { id: 'stats_basic', description: 'Basic performance metrics and trends.', defaultEnabled: false },
        { id: 'media_uploads', description: 'Upload and share playbooks, photos, and files.', defaultEnabled: false },
        { id: 'history_unlimited', description: 'Retain full history of posts, chats, and results.', defaultEnabled: false },
        { id: 'high_priority_alerts', description: 'Broadcast urgent team-wide popups.', defaultEnabled: false },
        { id: 'leagues', description: 'Participate in and manage competitive leagues.', defaultEnabled: false },
        { id: 'league_registration', description: 'Accept and manage new player signups for leagues.', defaultEnabled: false },
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
        schedule_basic: true, schedule_elite: true, tournament_basic: true, tournament_elite: true,
        basic_roster: true, full_roster_details: true, attendance_tracking: true, 
        live_feed_read: true, live_feed_post: true, group_chat: true,
        score_tracking: true, stats_basic: true, media_uploads: true, history_unlimited: true,
        high_priority_alerts: true, leagues: true, league_registration: true
      };

      const starterFeatures = {
        schedule_basic: true, tournament_basic: true, basic_roster: true, 
        live_feed_read: true, score_tracking: true, group_chat: true
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

/**
 * UNIFIED SEEDER: Reuses the same dataset for all demos, only changing dates and Elite status.
 */
export async function seedDemoData(db: Firestore, teamId: string, demoTier: string, userId: string) {
  const batch = writeBatch(db);
  const now = new Date();
  
  // Tier flags
  const isStarter = demoTier === 'starter_squad';
  const isEliteTournamentDemo = demoTier === 'tournament_pro' || demoTier === 'squad_pro' || demoTier === 'squad_organization';
  const isPro = !isStarter;

  // Unified Roster
  const names = [
    'Jordan Smith', 'Alex Rivera', 'Sam Taylor', 'Casey Morgan', 'Riley Jones', 
    'Morgan Lee', 'Taylor Quinn', 'Chris Brooks', 'Jamie Day', 'Robin Hood',
    'Sidney Vane', 'Blake Bell', 'Charlie Reed', 'Avery Hill', 'Parker Pen'
  ];
  
  for (let i = 0; i < 12; i++) {
    const mid = `demo_mem_${teamId}_${i}`;
    batch.set(doc(db, 'teams', teamId, 'members', mid), clean({
      id: mid, userId: `demo_user_${teamId}_${i}`, teamId, name: names[i] || `Teammate ${i+1}`, 
      role: 'Member', position: i === 0 ? 'Team Lead' : 'Player', jersey: (i + 10).toString(),
      avatar: `https://picsum.photos/seed/demo_v3_${i}_${teamId}/150/150`, 
      joinedAt: now.toISOString(), amountOwed: i > 8 ? 50 : 0, feesPaid: i <= 8, isDemo: true,
      waiverSigned: isPro, medicalClearance: isPro && i % 2 === 0
    }));
  }

  // Unified Tournament Hub (Regional Championship)
  const tid_tournament = `demo_tournament_${teamId}`;
  const day1Date = now; 
  const day3Date = new Date(now.getTime() + (86400000 * 3)); 

  const day1Str = day1Date.toISOString().split('T')[0];
  const day2Str = new Date(now.getTime() + 86400000).toISOString().split('T')[0];

  batch.set(doc(db, 'teams', teamId, 'events', tid_tournament), clean({
    id: tid_tournament, teamId, 
    title: 'Regional Season Championship', 
    eventType: 'tournament',
    date: day1Date.toISOString(),
    endDate: day3Date.toISOString(),
    startTime: '09:00 AM', location: 'Metropolitan Stadium', 
    description: 'The premier regional coordination event of the season.',
    isTournament: true,
    isTournamentPaid: isEliteTournamentDemo, 
    tournamentTeams: ['Westside Warriors', 'Eastside Elite', 'Northside Knights', 'Southside Strikers', 'Metro Stars', 'City Rangers'],
    tournamentGames: [
      { id: 'g1', team1: 'Westside Warriors', team2: 'Eastside Elite', score1: 4, score2: 2, date: day1Str, time: '10:00 AM', isCompleted: true, winnerId: 'Westside Warriors' },
      { id: 'g2', team1: 'Northside Knights', team2: 'Southside Strikers', score1: 1, score2: 1, date: day1Str, time: '12:00 PM', isCompleted: true },
      { id: 'g3', team1: 'Metro Stars', team2: 'City Rangers', score1: 0, score2: 0, date: day2Str, time: '09:00 AM', isCompleted: false }
    ],
    userRsvps: { [userId]: 'going' }, isDemo: true, createdAt: now.toISOString(), lastUpdated: now.toISOString()
  }));

  // Unified Standard Match
  const matchId = `demo_match_standard_${teamId}`;
  batch.set(doc(db, 'teams', teamId, 'events', matchId), clean({
    id: matchId, teamId, title: 'Season Match vs Wildcats',
    eventType: 'game',
    date: new Date(now.getTime() + 86400000).toISOString(), 
    startTime: '06:00 PM', location: 'Westside Community Field',
    description: 'Standard season match. Arrive 30 minutes early for warmups.',
    isTournament: false, isTournamentPaid: false, userRsvps: { [userId]: 'going' },
    isDemo: true, createdAt: now.toISOString(), lastUpdated: now.toISOString()
  }));

  // Unified Match Ledger (Recent results)
  const matches = [
    { opponent: 'Wildcats', result: 'Win', myScore: 4, opponentScore: 2, offsetDays: 2 },
    { opponent: 'Storm', result: 'Loss', myScore: 1, opponentScore: 3, offsetDays: 5 }
  ];
  matches.forEach((m, i) => {
    const gid = `demo_game_${teamId}_${i}`;
    batch.set(doc(db, 'teams', teamId, 'games', gid), clean({
      id: gid, teamId, opponent: m.opponent, result: m.result, myScore: m.myScore, opponentScore: m.opponentScore,
      date: new Date(now.getTime() - 86400000 * m.offsetDays).toISOString(),
      location: 'City Arena Central', notes: isPro ? 'Exceptional execution of the primary tactical play.' : '', isDemo: true, createdAt: now.toISOString()
    }));
  });

  // Unified Drills (only for Pro/Club)
  if (isPro) {
    const did = `demo_drill_${teamId}_1`;
    batch.set(doc(db, 'teams', teamId, 'drills', did), clean({
      id: did, teamId, title: 'Full Court Coordination Drill',
      description: 'Defensive coordination focusing on zone transitions and communication protocols.',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      thumbnailUrl: 'https://picsum.photos/seed/drill_v3/400/300',
      primaryMedia: 'video', createdAt: now.toISOString(), isDemo: true
    }));
  }

  // Unified Files (only for Pro/Club)
  if (isPro) {
    const fid = `demo_file_${teamId}_1`;
    batch.set(doc(db, 'teams', teamId, 'files', fid), clean({
      id: fid, teamId, name: 'Season Playbook Master.pdf', type: 'pdf', size: '2.4 MB',
      url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      uploadedBy: 'Coach Sam', uploaderId: 'system', date: now.toISOString(), category: 'file', isDemo: true
    }));
  }

  // Unified Broadcast Post (only for Pro/Club)
  if (isPro) {
    const pid = `demo_post_${teamId}_1`;
    batch.set(doc(db, 'teams', teamId, 'feedPosts', pid), clean({
      id: pid, teamId, type: 'user', content: 'Huge win recently squad! Let’s keep this momentum for the Regional Championship.',
      author: { name: 'Coach Alex', avatar: 'https://picsum.photos/seed/coach_v3/100/100' }, authorId: 'demo_coach', 
      createdAt: now.toISOString(), likes: [userId], isDemo: true
    }));
  }

  // Unified Alerts
  const aid = `demo_alert_${teamId}_1`;
  batch.set(doc(db, 'teams', teamId, 'alerts', aid), clean({
    id: aid, teamId, title: 'Regional Championship Update',
    message: 'Review the updated tournament bracket. Pool play starts at 09:00 AM.',
    createdBy: 'system', createdAt: now.toISOString(), isDemo: true
  }));

  // Unified Chat
  const cid = `demo_chat_${teamId}`;
  batch.set(doc(db, 'teams', teamId, 'groupChats', cid), clean({
    id: cid, teamId, name: 'Tactical Command Hub', memberIds: [userId], createdBy: userId, 
    createdAt: now.toISOString(), lastMessage: 'Review the Regional Championship bracket before tomorrow.', unread: 0, isDemo: true
  }));

  try {
    await batch.commit();
  } catch (error: any) {
    throw error;
  }
}

export async function seedGuestDemoTeam(db: Firestore, userId: string, planId: string) {
  const timestamp = Date.now();
  const teamId = `demo_guest_${userId.slice(-4)}_${timestamp}`;
  
  const isPlayerDemo = planId === 'player_demo';
  const isParentDemo = planId === 'parent_demo';
  
  const actualPlanId = (isPlayerDemo || isParentDemo) ? 'squad_pro' : 
                       (planId === 'tournament_pro' ? 'squad_pro' : planId);
  
  const isPro = actualPlanId !== 'starter_squad';
  const role = (isPlayerDemo || isParentDemo) ? 'Member' : 'Admin';
  const position = isPlayerDemo ? 'Player' : (isParentDemo ? 'Parent' : (planId === 'squad_organization' ? 'Club Manager' : 'Coach'));
  
  const userRole = isPlayerDemo ? 'adult_player' : (isParentDemo ? 'parent' : 'coach');
  const ownerId = (isPlayerDemo || isParentDemo) ? 'system_demo_admin' : userId;

  const teamName = planId === 'starter_squad' ? 'Guest Grassroots Stars' : 
                   planId === 'squad_pro' ? 'Guest Pro Elite' : 
                   planId === 'player_demo' ? 'Metro Elite Teammate Hub' :
                   planId === 'parent_demo' ? 'Academy Guardian Portal' :
                   planId === 'tournament_pro' ? 'Regional Tournament Hub' : 'Metro Academy Hub';
  
  const code = teamId.slice(-6).toUpperCase();
  const batch = writeBatch(db);
  const nowStr = new Date().toISOString();
  
  batch.set(doc(db, 'users', userId), clean({
    id: userId, 
    fullName: isPlayerDemo ? 'Guest Teammate' : (isParentDemo ? 'Guest Guardian' : 'Guest Coordinator'), 
    email: isPlayerDemo ? 'teammate@thesquad.pro' : (isParentDemo ? 'parent@thesquad.pro' : 'guest@thesquad.pro'),
    role: userRole,
    notificationsEnabled: true, 
    createdAt: nowStr, 
    isDemo: true, 
    avatarUrl: `https://picsum.photos/seed/${userId}/150/150`,
    activePlanId: (isPlayerDemo || isParentDemo) ? 'starter_squad' : actualPlanId, 
    proTeamLimit: planId === 'squad_organization' ? 15 : 1,
    planSource: 'free'
  }), { merge: true });

  batch.set(doc(db, 'teams', teamId), clean({
    id: teamId, teamName, teamCode: code, createdBy: ownerId, ownerUserId: ownerId,
    createdAt: nowStr,
    isPro, planId: actualPlanId, sport: 'Multi-Sport', isDemo: true,
    description: planId === 'squad_organization' ? 'Enterprise organization management demo.' : 'Professional coordination suite demo.',
    teamLogoUrl: '', heroImageUrl: ''
  }));
  
  batch.set(doc(db, 'users', userId, 'teamMemberships', teamId), clean({
    userId, teamId, teamName, teamCode: code, role, 
    isPro, planId: actualPlanId, isDemo: true, 
    joinedAt: nowStr, createdBy: ownerId, ownerUserId: ownerId,
    sport: 'Multi-Sport', teamLogoUrl: ''
  }));

  batch.set(doc(db, 'teams', teamId, 'members', userId), clean({
    id: userId, userId, teamId, name: isPlayerDemo ? 'Guest Teammate' : (isParentDemo ? 'Guest Guardian' : 'Guest Coordinator'), 
    role, position, jersey: isPlayerDemo ? '22' : 'HQ',
    avatar: `https://picsum.photos/seed/${userId}/150/150`, joinedAt: nowStr,
    phone: '(555) 000-9999', amountOwed: 0, feesPaid: true, isDemo: true
  }));

  try {
    await batch.commit();
    await seedDemoData(db, teamId, planId, userId);
    return teamId;
  } catch (error: any) {
    // Provide the actual Firestore Error message for better debugging
    const contextualError = new FirestorePermissionError({
      path: `teams/${teamId}`,
      operation: 'write',
      requestResourceData: { message: error.message || 'Demo squad initialization failure' }
    });
    errorEmitter.emit('permission-error', contextualError);
    throw error;
  }
}
