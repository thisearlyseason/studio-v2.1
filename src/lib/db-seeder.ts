
'use client';

import { 
  Firestore, 
  doc, 
  writeBatch,
  collection
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
 * Pre-defined data structures to eliminate procedural generation latency.
 */
const GET_DEMO_DATA = (teamId: string, userId: string, teamSuffix: string = '') => {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000).toISOString();
  const tomorrow = new Date(now.getTime() + 86400000).toISOString();
  const later = new Date(now.getTime() + 172800000).toISOString();

  return {
    members: [
      { id: `m1_${teamId}`, userId: `u1_${teamId}`, name: `Jordan Smith ${teamSuffix}`, role: 'Member', position: 'Forward', jersey: '10', medicalClearance: true, amountOwed: 0, avatar: `https://picsum.photos/seed/m1${teamId}/150/150`, gradYear: '2026', gpa: '3.9', school: 'Metro Academy', highlightUrl: 'https://youtube.com/watch?v=demo1', notes: 'Elite finisher with explosive first step.', skills: ['Scoring', 'Speed', 'Agility'], achievements: ['State MVP', 'All-City First Team'] },
      { id: `m2_${teamId}`, userId: `u2_${teamId}`, name: `Alex Rivera ${teamSuffix}`, role: 'Member', position: 'Midfield', jersey: '22', medicalClearance: true, amountOwed: 50, avatar: `https://picsum.photos/seed/m2${teamId}/150/150`, gradYear: '2027', gpa: '3.7', school: 'Heights High', highlightUrl: 'https://youtube.com/watch?v=demo2', notes: 'Visionary playmaker with exceptional passing range.', skills: ['Vision', 'Passing', 'Control'], achievements: ['District Champion'] },
      { id: `m3_${teamId}`, userId: `u3_${teamId}`, name: `Sam Taylor ${teamSuffix}`, role: 'Member', position: 'Defender', jersey: '04', medicalClearance: false, amountOwed: 125, avatar: `https://picsum.photos/seed/m3${teamId}/150/150`, gradYear: '2026', gpa: '3.8', school: 'Metro Academy', highlightUrl: 'https://youtube.com/watch?v=demo3', notes: 'Physical presence with strong aerial capability.', skills: ['Strength', 'Tackling', 'Heading'], achievements: ['Defensive Player of Year'] }
    ],
    games: [
      { id: `g1_${teamId}`, opponent: 'Tigers', date: yesterday, myScore: 12, opponentScore: 8, result: 'Win', location: 'City Arena' }
    ],
    events: [
      { id: `e1_${teamId}`, title: `Championship Match ${teamSuffix}`, eventType: 'game', date: tomorrow, startTime: '10:00 AM', location: 'State Stadium', description: 'Final round coordination.' },
      { id: `e2_${teamId}`, title: `Tactical Drill Session ${teamSuffix}`, eventType: 'practice', date: later, startTime: '4:00 PM', location: 'Field 2', description: 'Focused on set pieces.' }
    ],
    drills: [
      { id: `d1_${teamId}`, title: `Zone Defense Protocol ${teamSuffix}`, description: 'Master the 3-2 alignment.', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
    ],
    scouting: [
      { id: `s1_${teamId}`, opponentName: 'The Jaguars', strengths: 'Fast transitions', weaknesses: 'High defensive line', keysToVictory: 'Exploit long balls.', date: yesterday }
    ],
    feed: [
      { id: `p1_${teamId}`, type: 'user', content: `Focus for Saturday, ${teamSuffix} squad!`, author: { name: 'Jordan Smith' }, createdAt: yesterday, likes: [userId] },
      { id: `p2_${teamId}`, type: 'poll', content: 'Uniform choice?', poll: { question: 'Uniform choice?', options: [{text: 'Home Red', votes: 12}, {text: 'Away White', votes: 5}], totalVotes: 17, voters: {}, isClosed: false }, createdAt: yesterday }
    ],
    documents: [
      { id: `doc1_${teamId}`, teamId, title: '2024 Liability Waiver', content: 'Standard participation agreement and medical release.', type: 'waiver', assignedTo: ['all'], signatureCount: 0, createdAt: now.toISOString() }
    ],
    facilities: [
      { id: `fac1_${teamId}`, name: 'Elite Sports Complex', address: '100 Athlete Way', notes: 'Gate code: 1234', clubId: userId }
    ]
  };
};

/**
 * HIGH-SPEED ATOMIC SEEDER
 * Merges all initialization tasks into a single batch commit for near-instant preparation.
 */
export async function seedGuestDemoTeam(db: Firestore, userId: string, planId: string) {
  const isParentDemo = planId === 'parent_demo';
  const isPlayerDemo = planId === 'player_demo';
  const isEliteDemo = ['elite_teams', 'elite_league', 'squad_organization'].includes(planId);
  const isProTier = planId !== 'starter_squad' && !isParentDemo && !isPlayerDemo;
  
  const actualPlanId = (isParentDemo || isPlayerDemo) ? 'squad_pro' : planId;
  const userRole = isParentDemo ? 'parent' : (isPlayerDemo ? 'adult_player' : 'coach');
  const pos = isParentDemo ? 'Parent' : (isPlayerDemo ? 'Player' : 'Coach');
  const role = (isParentDemo || isPlayerDemo) ? 'Member' : 'Admin';

  const batch = writeBatch(db);
  const now = new Date().toISOString();

  // 1. Core Profile
  batch.set(doc(db, 'users', userId), clean({
    id: userId, fullName: `Guest ${pos}`, email: `${userRole}@thesquad.pro`,
    role: userRole, activePlanId: actualPlanId, proTeamLimit: isEliteDemo ? 20 : (isProTier ? 1 : 0), createdAt: now, isDemo: true
  }), { merge: true });

  // Define team configurations
  const teamConfigs = isEliteDemo 
    ? [
        { id: `demo_a_${userId.slice(-4)}`, name: 'Metro Elite Alpha', suffix: 'Alpha', isPro: true },
        { id: `demo_b_${userId.slice(-4)}`, name: 'Metro Elite Beta', suffix: 'Beta', isPro: true }
      ]
    : [
        { id: `demo_${planId}_${userId.slice(-4)}`, name: isProTier ? 'Elite Demo Squad' : 'Grassroots Demo', suffix: '', isPro: isProTier }
      ];

  // 2. Seed each team
  teamConfigs.forEach(config => {
    const tid = config.id;
    
    batch.set(doc(db, 'teams', tid), clean({
      id: tid, teamName: config.name, teamCode: tid.slice(-6).toUpperCase(),
      ownerUserId: userId, isPro: config.isPro, planId: config.isPro ? actualPlanId : 'starter_squad', sport: 'Multi-Sport', isDemo: true,
      parentCommentsEnabled: true, parentChatEnabled: true, createdAt: now, createdBy: userId
    }));

    batch.set(doc(db, 'users', userId, 'teamMemberships', tid), clean({
      teamId: tid, teamName: config.name, teamCode: tid.slice(-6).toUpperCase(), role,
      isPro: config.isPro, planId: config.isPro ? actualPlanId : 'starter_squad', isDemo: true, joinedAt: now
    }));

    batch.set(doc(db, 'teams', tid, 'members', userId), clean({
      id: userId, userId, teamId: tid, name: `Guest ${pos}`, role, position: pos, jersey: isParentDemo ? 'HQ' : '22',
      joinedAt: now, isDemo: true, avatar: `https://picsum.photos/seed/${userId}/150/150`,
      notes: 'Primary tactical coordinator for the demo squad.'
    }));

    // Static Blueprint Injection
    const data = GET_DEMO_DATA(tid, userId, config.suffix);
    data.members.forEach(m => batch.set(doc(db, 'teams', tid, 'members', m.id), clean({ ...m, teamId: tid, joinedAt: now })));
    data.games.forEach(g => batch.set(doc(db, 'teams', tid, 'games', g.id), clean(g)));
    data.events.forEach(e => batch.set(doc(db, 'teams', tid, 'events', e.id), clean({ ...e, teamId: tid, teamName: config.name })));
    data.drills.forEach(d => batch.set(doc(db, 'teams', tid, 'drills', d.id), clean(d)));
    data.scouting.forEach(s => batch.set(doc(db, 'teams', tid, 'scouting', s.id), clean(s)));
    data.feed.forEach(p => batch.set(doc(db, 'teams', tid, 'feedPosts', p.id), clean({ ...p, teamId: tid })));
    data.documents.forEach(d => batch.set(doc(db, 'teams', tid, 'documents', d.id), clean(d)));
    data.facilities.forEach(f => batch.set(doc(db, 'facilities', f.id), clean(f)));

    if (isParentDemo) {
      const childId = `child_${tid}`;
      batch.set(doc(db, 'players', childId), clean({ id: childId, firstName: 'Junior', lastName: 'Guest', dateOfBirth: '2012-01-01', isMinor: true, parentId: userId, joinedTeamIds: [tid], createdAt: now }));
      batch.set(doc(db, 'teams', tid, 'members', childId), clean({ id: childId, userId: 'none', playerId: childId, teamId: tid, name: 'Junior Guest', role: 'Member', position: 'Player', jersey: '10', joinedAt: now, isMinor: true, amountOwed: 75, avatar: `https://picsum.photos/seed/junior/150/150`, medicalClearance: true }));
    }
  });

  await batch.commit();
  return teamConfigs[0].id;
}
