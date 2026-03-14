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

/**
 * STATIC BLUEPRINTS
 * Pre-defined data structures to eliminate loop processing time during guest initialization.
 */
const GET_DEMO_DATA = (teamId: string, userId: string) => {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000).toISOString();
  const tomorrow = new Date(now.getTime() + 86400000).toISOString();
  const later = new Date(now.getTime() + 172800000).toISOString();

  return {
    members: [
      { id: `m1_${teamId}`, userId: `u1_${teamId}`, name: 'Jordan Smith', role: 'Member', position: 'Forward', jersey: '10', medicalClearance: true, amountOwed: 0 },
      { id: `m2_${teamId}`, userId: `u2_${teamId}`, name: 'Alex Rivera', role: 'Member', position: 'Midfield', jersey: '22', medicalClearance: true, amountOwed: 50 },
      { id: `m3_${teamId}`, userId: `u3_${teamId}`, name: 'Sam Taylor', role: 'Member', position: 'Defender', jersey: '04', medicalClearance: false, amountOwed: 125 }
    ],
    games: [
      { id: `g1_${teamId}`, opponent: 'Tigers', date: yesterday, myScore: 12, opponentScore: 8, result: 'Win', location: 'City Arena' }
    ],
    events: [
      { id: `e1_${teamId}`, title: 'Championship Match', eventType: 'game', date: tomorrow, startTime: '10:00 AM', location: 'State Stadium', description: 'Final round coordination.' },
      { id: `e2_${teamId}`, title: 'Tactical Drill Session', eventType: 'practice', date: later, startTime: '4:00 PM', location: 'Field 2', description: 'Focused on set pieces.' }
    ],
    drills: [
      { id: `d1_${teamId}`, title: 'Zone Defense Protocol', description: 'Master the 3-2 alignment.', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
    ],
    scouting: [
      { id: `s1_${teamId}`, opponentName: 'The Jaguars', strengths: 'Fast transitions', weaknesses: 'High defensive line', keysToVictory: 'Exploit long balls.', date: yesterday }
    ],
    feed: [
      { id: `p1_${teamId}`, type: 'user', content: 'Focus for Saturday, squad!', author: { name: 'Jordan Smith' }, createdAt: yesterday, likes: [userId] },
      { id: `p2_${teamId}`, type: 'poll', content: 'Uniform choice?', poll: { question: 'Uniform choice?', options: [{text: 'Home Red', votes: 12}, {text: 'Away White', votes: 5}], totalVotes: 17, voters: {}, isClosed: false }, createdAt: yesterday }
    ]
  };
};

/**
 * Optimized Global Seeding
 * Seeds the standard plans and features if they are missing.
 */
export async function seedSubscriptionData(db: Firestore) {
  const plans = [
    { id: 'starter_squad', name: 'Starter Squad', billingType: 'free', features: { schedule_basic: true, live_feed_read: true }, proTeamLimit: 0 },
    { id: 'squad_pro', name: 'Squad Pro', billingType: 'monthly', features: { schedule_basic: true, schedule_elite: true, tournament_basic: true, tournament_elite: true, live_feed_read: true, live_feed_post: true, stats_basic: true, media_uploads: true }, proTeamLimit: 1 },
    { id: 'elite_teams', name: 'Elite Teams', billingType: 'monthly', features: { schedule_basic: true, schedule_elite: true, tournament_basic: true, tournament_elite: true, live_feed_read: true, live_feed_post: true, stats_basic: true, media_uploads: true, leagues: true, league_registration: true }, proTeamLimit: 8 },
    { id: 'elite_league', name: 'Elite League', billingType: 'monthly', features: { schedule_basic: true, schedule_elite: true, tournament_basic: true, tournament_elite: true, live_feed_read: true, live_feed_post: true, stats_basic: true, media_uploads: true, leagues: true, league_registration: true }, proTeamLimit: 20 }
  ];

  const batch = writeBatch(db);
  plans.forEach(p => batch.set(doc(db, 'plans', p.id), p, { merge: true }));
  await batch.commit();
}

/**
 * HIGH-SPEED ATOMIC SEEDER
 * Combines all demo operations into a single batch commit.
 */
export async function seedGuestDemoTeam(db: Firestore, userId: string, planId: string) {
  const teamId = `demo_${planId}_${userId.slice(-4)}`;
  const isParentDemo = planId === 'parent_demo';
  const isPlayerDemo = planId === 'player_demo';
  
  const actualPlanId = (isParentDemo || isPlayerDemo) ? 'squad_pro' : planId;
  const userRole = isParentDemo ? 'parent' : (isPlayerDemo ? 'adult_player' : 'coach');
  const pos = isParentDemo ? 'Parent' : (isPlayerDemo ? 'Player' : 'Coach');
  const role = (isParentDemo || isPlayerDemo) ? 'Member' : 'Admin';

  const batch = writeBatch(db);
  const now = new Date().toISOString();

  // 1. Core Profile & Context
  batch.set(doc(db, 'users', userId), clean({
    id: userId, fullName: `Guest ${pos}`, email: `${userRole}@thesquad.pro`,
    role: userRole, activePlanId: actualPlanId, proTeamLimit: 1, createdAt: now, isDemo: true
  }), { merge: true });

  batch.set(doc(db, 'teams', teamId), clean({
    id: teamId, teamName: 'Elite Demo Squad', teamCode: teamId.slice(-6).toUpperCase(),
    ownerUserId: 'system', isPro: true, planId: actualPlanId, sport: 'Multi-Sport', isDemo: true,
    parentCommentsEnabled: true, parentChatEnabled: true, createdAt: now
  }));

  batch.set(doc(db, 'users', userId, 'teamMemberships', teamId), clean({
    teamId, teamName: 'Elite Demo Squad', teamCode: teamId.slice(-6).toUpperCase(), role,
    isPro: true, planId: actualPlanId, isDemo: true, joinedAt: now
  }));

  batch.set(doc(db, 'teams', teamId, 'members', userId), clean({
    id: userId, userId, teamId, name: `Guest ${pos}`, role, position: pos, jersey: isParentDemo ? 'HQ' : '22',
    joinedAt: now, isDemo: true, avatar: `https://picsum.photos/seed/${userId}/150/150`
  }));

  // 2. Blueprint Data Injection
  const data = GET_DEMO_DATA(teamId, userId);
  data.members.forEach(m => batch.set(doc(db, 'teams', teamId, 'members', m.id), clean({ ...m, teamId, joinedAt: now, avatar: `https://picsum.photos/seed/${m.id}/150/150` })));
  data.games.forEach(g => batch.set(doc(db, 'teams', teamId, 'games', g.id), clean(g)));
  data.events.forEach(e => batch.set(doc(db, 'teams', teamId, 'events', e.id), clean({ ...e, teamId, teamName: 'Elite Demo Squad' })));
  data.drills.forEach(d => batch.set(doc(db, 'teams', teamId, 'drills', d.id), clean(d)));
  data.scouting.forEach(s => batch.set(doc(db, 'teams', teamId, 'scouting', s.id), clean(s)));
  data.feed.forEach(p => batch.set(doc(db, 'teams', teamId, 'feedPosts', p.id), clean({ ...p, teamId })));

  if (isParentDemo) {
    const childId = `child_${teamId}`;
    batch.set(doc(db, 'players', childId), clean({ id: childId, firstName: 'Junior', lastName: 'Guest', dateOfBirth: '2012-01-01', isMinor: true, parentId: userId, joinedTeamIds: [teamId], createdAt: now }));
    batch.set(doc(db, 'teams', teamId, 'members', childId), clean({ id: childId, userId: 'none', playerId: childId, teamId, name: 'Junior Guest', role: 'Member', position: 'Player', jersey: '10', joinedAt: now, isMinor: true, amountOwed: 75 }));
  }

  await batch.commit();
  return teamId;
}