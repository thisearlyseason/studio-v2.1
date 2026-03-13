
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
 * PRE-DEFINED DEMO BLUEPRINTS
 * Using static objects instead of loops significantly reduces compute time during seeding.
 */
const DEMO_TEMPLATE = (teamId: string, userId: string) => {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);
  const tomorrow = new Date(now.getTime() + 86400000);

  return {
    members: [
      { id: `m1_${teamId}`, userId: `u1_${teamId}`, name: 'Jordan Smith', role: 'Member', position: 'Forward', jersey: '10', medicalClearance: true, amountOwed: 0 },
      { id: `m2_${teamId}`, userId: `u2_${teamId}`, name: 'Alex Rivera', role: 'Member', position: 'Midfield', jersey: '22', medicalClearance: true, amountOwed: 50 },
      { id: `m3_${teamId}`, userId: `u3_${teamId}`, name: 'Sam Taylor', role: 'Member', position: 'Defender', jersey: '04', medicalClearance: false, amountOwed: 125 }
    ],
    games: [
      { id: `g1_${teamId}`, opponent: 'Tigers', date: yesterday.toISOString(), myScore: 12, opponentScore: 8, result: 'Win', location: 'City Arena' },
      { id: `g2_${teamId}`, opponent: 'Hawks', date: now.toISOString(), myScore: 10, opponentScore: 10, result: 'Tie', location: 'Squad HQ' }
    ],
    events: [
      { id: `e1_${teamId}`, title: 'Championship Match', eventType: 'game', date: tomorrow.toISOString(), startTime: '10:00 AM', location: 'State Stadium', description: 'Final round coordination.' },
      { id: `e2_${teamId}`, title: 'Tactical Drill Session', eventType: 'practice', date: new Date(now.getTime() + 172800000).toISOString(), startTime: '4:00 PM', location: 'Field 2', description: 'Focused on set pieces.' }
    ],
    drills: [
      { id: `d1_${teamId}`, title: 'Zone Defense Protocol', description: 'Master the 3-2 alignment. Focus on spatial awareness.', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', thumbnailUrl: 'https://picsum.photos/seed/drill1/400/300' }
    ],
    scouting: [
      { id: `s1_${teamId}`, opponentName: 'The Jaguars', strengths: 'Fast transitions', weaknesses: 'High defensive line', keysToVictory: 'Exploit long balls.', date: yesterday.toISOString() }
    ],
    feed: [
      { id: `p1_${teamId}`, type: 'user', content: 'Excellent win today, squad! Keep the focus for Saturday.', author: { name: 'Jordan Smith' }, createdAt: yesterday.toISOString(), likes: [userId] },
      { id: `p2_${teamId}`, type: 'poll', content: 'Jersey choice for Nationals?', poll: { question: 'Jersey choice?', options: [{text: 'Black/Red', votes: 12}, {text: 'White/Gold', votes: 5}], totalVotes: 17, voters: {}, isClosed: false }, createdAt: now.toISOString() }
    ]
  };
};

export async function seedSubscriptionData(db: Firestore) {
  try {
    const featuresSnapshot = await getDocs(collection(db, 'features'));
    if (!featuresSnapshot.empty) return;

    const batch = writeBatch(db);
    const defaultFeatures = [
      { id: 'schedule_basic', description: 'Basic matches.', defaultEnabled: true },
      { id: 'schedule_elite', description: 'Advanced coordination.', defaultEnabled: false },
      { id: 'tournament_basic', description: 'Basic brackets.', defaultEnabled: true },
      { id: 'tournament_elite', description: 'Elite series.', defaultEnabled: false },
      { id: 'live_feed_read', description: 'View feed.', defaultEnabled: true },
      { id: 'live_feed_post', description: 'Post to feed.', defaultEnabled: false },
      { id: 'stats_basic', description: 'Basic analytics.', defaultEnabled: false },
      { id: 'media_uploads', description: 'Media study.', defaultEnabled: false },
      { id: 'leagues', description: 'League access.', defaultEnabled: false },
      { id: 'league_registration', description: 'Recruit portal.', defaultEnabled: false },
    ];

    defaultFeatures.forEach(f => batch.set(doc(db, 'features', f.id), f));

    const proFeatures = defaultFeatures.reduce((acc, f) => ({ ...acc, [f.id]: true }), {});
    const starterFeatures = { schedule_basic: true, tournament_basic: true, live_feed_read: true };

    const plans = [
      { id: 'starter_squad', name: 'Starter Squad', billingType: 'free', features: starterFeatures, proTeamLimit: 0 },
      { id: 'squad_pro', name: 'Squad Pro', billingType: 'monthly', features: proFeatures, proTeamLimit: 1 },
      { id: 'elite_teams', name: 'Elite Teams', billingType: 'monthly', features: proFeatures, proTeamLimit: 8 },
      { id: 'elite_league', name: 'Elite League', billingType: 'monthly', features: proFeatures, proTeamLimit: 20 }
    ];

    plans.forEach(p => batch.set(doc(db, 'plans', p.id), p));
    await batch.commit();
  } catch (e) {
    console.error("Seeding error:", e);
  }
}

export async function seedGuestDemoTeam(db: Firestore, userId: string, planId: string) {
  const timestamp = Date.now();
  const teamId = `demo_${planId}_${userId.slice(-4)}`;
  const isParentDemo = planId === 'parent_demo';
  const isPlayerDemo = planId === 'player_demo';
  
  const actualPlanId = (isParentDemo || isPlayerDemo) ? 'squad_pro' : planId;
  const userRole = isParentDemo ? 'parent' : (isPlayerDemo ? 'adult_player' : 'coach');
  const pos = isParentDemo ? 'Parent' : (isPlayerDemo ? 'Player' : 'Coach');
  const role = (isParentDemo || isPlayerDemo) ? 'Member' : 'Admin';

  const batch = writeBatch(db);
  const now = new Date().toISOString();

  // 1. User Profile & Memberships
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

  // 2. Load Template Data
  const data = DEMO_TEMPLATE(teamId, userId);
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
