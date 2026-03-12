
'use client';

import { 
  Firestore, 
  doc, 
  collection, 
  getDocs, 
  writeBatch,
  setDoc,
  updateDoc,
  arrayUnion,
  addDoc
} from 'firebase/firestore';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';

/**
 * Sanitizes objects for Firestore by removing undefined values recursively.
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
        { id: 'starter_squad', name: 'Starter Squad', description: 'Essential coordination for growing teams.', priceDisplay: '$0', billingType: 'free', features: starterFeatures, proTeamLimit: 0 },
        { id: 'squad_pro', name: 'Squad Pro', description: 'Full coordination for elite squads.', priceDisplay: '$19.99', billingType: 'monthly', features: proFeaturesMap, proTeamLimit: 1 },
        { id: 'elite_teams', name: 'Elite Teams', description: 'Club Hub for up to 8 squads.', priceDisplay: '$110', billingType: 'monthly', features: proFeaturesMap, proTeamLimit: 8 },
        { id: 'elite_league', name: 'Elite League', description: 'Institutional scale for 20 squads.', priceDisplay: '$279', billingType: 'monthly', features: proFeaturesMap, proTeamLimit: 20 },
        { id: 'squad_organization', name: 'Custom', description: 'Enterprise solutions for leagues.', priceDisplay: 'Custom', billingType: 'manual', features: proFeaturesMap, proTeamLimit: 100 }
      ];

      plans.forEach((p) => batch.set(doc(db, 'plans', p.id), p));
      await batch.commit();
    }
  } catch (error) {
    console.error("Critical seeding failure:", error);
  }
}

export async function seedDemoData(db: Firestore, teamId: string, demoTier: string, userId: string) {
  const batch = writeBatch(db);
  const now = new Date();
  const isPro = demoTier !== 'starter_squad';

  // 1. Roster Expansion
  const names = ['Jordan Smith', 'Alex Rivera', 'Sam Taylor', 'Casey Morgan', 'Riley Jones', 'Morgan Lee', 'Peyton Reed'];
  const positions = ['Forward', 'Midfield', 'Defender', 'Goalie', 'Midfield', 'Defender', 'Forward'];
  for (let i = 0; i < names.length; i++) {
    const mid = `demo_mem_${teamId}_${i}`;
    batch.set(doc(db, 'teams', teamId, 'members', mid), clean({
      id: mid, userId: `demo_user_${i}`, teamId, name: names[i], role: 'Member', position: positions[i], jersey: (i+10).toString(),
      avatar: `https://picsum.photos/seed/${mid}/150/150`, joinedAt: now.toISOString(), feesPaid: i < 3, amountOwed: i >= 3 ? 50 : 0,
      medicalClearance: i % 2 === 0
    }));
  }

  // 2. Comprehensive Match Ledger
  const opponents = ['Tigers', 'Lions', 'Hawks', 'Bears', 'Wolves', 'Eagles', 'Sharks'];
  for (let i = 0; i < opponents.length; i++) {
    const gid = `demo_game_${teamId}_${i}`;
    const result = i % 2 === 0 ? 'Win' : (i === 5 ? 'Tie' : 'Loss');
    batch.set(doc(db, 'teams', teamId, 'games', gid), clean({
      id: gid, opponent: opponents[i], date: new Date(now.getTime() - (86400000 * (i+1))).toISOString(),
      myScore: result === 'Win' ? 15 : (result === 'Tie' ? 10 : 8), 
      opponentScore: result === 'Win' ? 10 : (result === 'Tie' ? 10 : 15),
      result, location: 'Central Arena', notes: i === 0 ? 'Excellent coordination on the counter-attack. Defense held firm in the final 10 minutes.' : 'Needs improvement on set pieces.'
    }));
  }

  // 3. Multi-Type Itinerary
  const eventTypes: Array<{title: string, type: 'game' | 'practice' | 'meeting'}> = [
    { title: 'Championship Match', type: 'game' },
    { title: 'Tactical Drill Session', type: 'practice' },
    { title: 'Tournament Prep Meeting', type: 'meeting' }
  ];
  eventTypes.forEach((evt, idx) => {
    const eid = `demo_evt_${teamId}_${idx}`;
    batch.set(doc(db, 'teams', teamId, 'events', eid), clean({
      id: eid, teamId, title: evt.title, eventType: evt.type, 
      date: new Date(now.getTime() + (86400000 * (idx + 1))).toISOString(),
      startTime: `${10 + idx}:00 AM`, location: idx === 0 ? 'City Stadium' : 'Squad HQ Field 2',
      description: `Official ${evt.type} for the upcoming tournament phase.`, 
      userRsvps: { [userId]: 'going', [`demo_user_0`]: 'going', [`demo_user_1`]: 'maybe' }
    }));
  });

  // 4. Community Ops (Volunteers & Fundraisers)
  batch.set(doc(db, 'teams', teamId, 'volunteers', `demo_vol_${teamId}_1`), clean({
    id: `demo_vol_${teamId}_1`, title: 'Tournament Hospitality', date: new Date(now.getTime() + 172800000).toISOString(),
    location: 'Main Arena', slots: 5, hoursPerSlot: 4, 
    signups: { [userId]: { userId, userName: 'Guest User', status: 'pending' } }
  }));

  batch.set(doc(db, 'teams', teamId, 'fundraising', `demo_fund_${teamId}_1`), clean({
    id: `demo_fund_${teamId}_1`, title: 'Uniform Sponsorship', goalAmount: 2500, currentAmount: 1850, 
    deadline: new Date(now.getTime() + 604800000).toISOString(), 
    participants: { [userId]: true }
  }));

  // 5. Playbook & Scouting
  batch.set(doc(db, 'teams', teamId, 'drills', `demo_drill_${teamId}_1`), clean({
    id: `demo_drill_${teamId}_1`, title: 'Zone Defense Protocol', 
    description: 'Master the 3-2 defensive alignment. Focus on spatial awareness and rotating to the ball.',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 
    thumbnailUrl: 'https://picsum.photos/seed/drill1/400/300',
    createdAt: now.toISOString()
  }));

  batch.set(doc(db, 'teams', teamId, 'scouting', `demo_scout_${teamId}_1`), clean({
    id: `demo_scout_${teamId}_1`, opponentName: 'The Jaguars', date: now.toISOString(),
    strengths: 'Fast offensive transitions and high pressing intensity.',
    weaknesses: 'Vulnerable to long balls over the top and slow defensive recovery.',
    keysToVictory: 'Maintain possession in the middle third and exploit the Jaguars high defensive line.',
    createdAt: now.toISOString()
  }));

  // 6. Logistics & Equipment
  batch.set(doc(db, 'teams', teamId, 'equipment', `demo_eq_${teamId}_1`), clean({
    id: `demo_eq_${teamId}_1`, name: 'Match Day Jerseys', category: 'Uniforms', 
    totalQuantity: 20, availableQuantity: 15, status: 'Active',
    description: 'Official home kit. Keep in good condition.',
    assignments: {
      [`demo_user_0`]: { userId: 'demo_user_0', userName: 'Jordan Smith', quantity: 1, assignedAt: now.toISOString() }
    }
  }));

  // 7. Library & Files
  batch.set(doc(db, 'teams', teamId, 'files', `demo_file_${teamId}_1`), clean({
    id: `demo_file_${teamId}_1`, name: 'Season Handbook.pdf', type: 'pdf', 
    size: '1.2 MB', sizeBytes: 1200000, category: 'Compliance', 
    url: '#', date: now.toISOString(), 
    description: 'Official rules and conduct guide for the current season.'
  }));

  // 8. Live Feed Posts
  batch.set(doc(db, 'teams', teamId, 'feedPosts', `demo_post_${teamId}_1`), clean({
    id: `demo_post_${teamId}_1`, teamId, type: 'user', content: 'Huge win today, squad! The tactical adjustments really paid off in the second half. See everyone at training on Tuesday.',
    authorId: `demo_user_0`, author: { name: 'Jordan Smith', avatar: 'https://picsum.photos/seed/jordan/50/50' },
    createdAt: new Date(now.getTime() - 3600000).toISOString(), likes: [userId], comments: []
  }));

  batch.set(doc(db, 'teams', teamId, 'feedPosts', `demo_post_${teamId}_2`), clean({
    id: `demo_post_${teamId}_2`, teamId, type: 'poll', content: 'What is our preferred arrival time for Saturday?',
    poll: {
      id: 'p1', question: 'Arrival Time for Match',
      options: [
        { text: '60 Mins Before', votes: 12 },
        { text: '90 Mins Before', votes: 4 }
      ],
      totalVotes: 16, voters: { [`demo_user_0`]: 0 }, isClosed: false
    },
    authorId: userId, author: { name: 'Guest User', avatar: 'https://picsum.photos/seed/coach/50/50' },
    createdAt: now.toISOString()
  }));

  // 9. Documents (Waivers)
  if (isPro) {
    batch.set(doc(db, 'teams', teamId, 'documents', `demo_doc_${teamId}_1`), clean({
      id: `demo_doc_${teamId}_1`, teamId, title: 'Annual Liability Waiver', type: 'waiver', 
      content: 'I hereby release the squad and its organizers from all liability regarding participation in team activities. I verify that I am medically cleared for physical activity.',
      assignedTo: ['all'], signatureCount: 3, createdAt: now.toISOString()
    }));
  }

  await batch.commit();
}

export async function seedGuestDemoTeam(db: Firestore, userId: string, planId: string) {
  const timestamp = Date.now();
  const teamId = `demo_guest_${userId.slice(-4)}_${timestamp}`;
  const isParentDemo = planId === 'parent_demo';
  const isPlayerDemo = planId === 'player_demo';
  
  const actualPlanId = (isParentDemo || isPlayerDemo) ? 'squad_pro' : planId;
  const userRole = isParentDemo ? 'parent' : (isPlayerDemo ? 'adult_player' : 'coach');
  const position = isParentDemo ? 'Parent' : (isPlayerDemo ? 'Player' : 'Coach');
  const role = (isParentDemo || isPlayerDemo) ? 'Member' : 'Admin';

  const batch = writeBatch(db);
  const nowStr = new Date().toISOString();

  // User Profile
  batch.set(doc(db, 'users', userId), clean({
    id: userId, fullName: isParentDemo ? 'Guest Parent' : (isPlayerDemo ? 'Guest Athlete' : 'Guest Coach'), email: `${userRole}@thesquad.pro`,
    role: userRole, activePlanId: actualPlanId, proTeamLimit: (actualPlanId === 'elite_teams' ? 8 : (actualPlanId === 'elite_league' ? 20 : 1)), createdAt: nowStr, isDemo: true
  }), { merge: true });

  // Team
  batch.set(doc(db, 'teams', teamId), clean({
    id: teamId, teamName: 'Elite Demo Squad', teamCode: teamId.slice(-6).toUpperCase(),
    createdBy: 'system', ownerUserId: 'system', isPro: true, planId: actualPlanId, sport: 'Multi-Sport', isDemo: true,
    parentCommentsEnabled: true, parentChatEnabled: true, description: 'A high-performance tactical environment for professional coordination.'
  }));

  // Membership
  batch.set(doc(db, 'users', userId, 'teamMemberships', teamId), clean({
    teamId, teamName: 'Elite Demo Squad', teamCode: teamId.slice(-6).toUpperCase(), role,
    isPro: true, planId: actualPlanId, isDemo: true, joinedAt: nowStr, ownerUserId: 'system'
  }));

  // Member
  batch.set(doc(db, 'teams', teamId, 'members', userId), clean({
    id: userId, userId, teamId, name: isParentDemo ? 'Guest Parent' : (isPlayerDemo ? 'Guest Athlete' : 'Guest Coach'),
    role, position, jersey: isParentDemo ? 'HQ' : '22', joinedAt: nowStr, isDemo: true, 
    avatar: `https://picsum.photos/seed/${userId}/150/150`
  }));

  if (isParentDemo) {
    // Household & Children
    const childId = `demo_child_${userId.slice(-4)}`;
    batch.set(doc(db, 'households', userId), {
      id: userId, parentIds: [userId], playerIds: [childId], createdAt: nowStr
    });
    batch.set(doc(db, 'players', childId), clean({
      id: childId, firstName: 'Junior', lastName: 'Guest', dateOfBirth: '2012-01-01',
      isMinor: true, parentId: userId, joinedTeamIds: [teamId], createdAt: nowStr
    }));
    // Child as team member
    batch.set(doc(db, 'teams', teamId, 'members', childId), clean({
      id: childId, userId: 'none', playerId: childId, teamId, name: 'Junior Guest',
      role: 'Member', position: 'Player', jersey: '10', joinedAt: nowStr, isMinor: true,
      amountOwed: 75, feesPaid: false
    }));
  }

  await batch.commit();
  await seedDemoData(db, teamId, actualPlanId, userId);
  return teamId;
}
