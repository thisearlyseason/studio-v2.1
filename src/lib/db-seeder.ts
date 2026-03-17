'use client';

import { 
  Firestore, 
  doc, 
  writeBatch,
  collection,
  serverTimestamp
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
 * Pre-defined data structures to represent a fully functional hub.
 */
const GET_DEMO_DATA = (teamId: string, userId: string, teamSuffix: string = '') => {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000).toISOString();
  const tomorrow = new Date(now.getTime() + 86400000).toISOString();
  const later = new Date(now.getTime() + 172800000).toISOString();

  return {
    members: [
      { id: `m1_${teamId}`, userId: `u1_${teamId}`, playerId: `p_u1_${teamId}`, name: `Jordan Smith ${teamSuffix}`, role: 'Member', position: 'Forward', jersey: '10', medicalClearance: true, amountOwed: 0, feesPaid: true, totalFees: 1250, avatar: `https://picsum.photos/seed/m1${teamId}/150/150`, gradYear: '2026', gpa: '3.9', school: 'Metro Academy', highlightUrl: 'https://youtube.com/watch?v=demo1', notes: 'Elite finisher with explosive first step.', skills: ['Scoring', 'Speed', 'Agility'], achievements: ['State MVP', 'All-City First Team'] },
      { id: `m2_${teamId}`, userId: `u2_${teamId}`, playerId: `p_u2_${teamId}`, name: `Alex Rivera ${teamSuffix}`, role: 'Member', position: 'Midfield', jersey: '22', medicalClearance: true, amountOwed: 450, feesPaid: false, totalFees: 1250, avatar: `https://picsum.photos/seed/m2${teamId}/150/150`, gradYear: '2027', gpa: '3.7', school: 'Heights High', highlightUrl: 'https://youtube.com/watch?v=demo2', notes: 'Visionary playmaker with exceptional passing range.', skills: ['Vision', 'Passing', 'Control'], achievements: ['District Champion'] },
      { id: `m3_${teamId}`, userId: `u3_${teamId}`, playerId: `p_u3_${teamId}`, name: `Sam Taylor ${teamSuffix}`, role: 'Member', position: 'Defense', jersey: '04', medicalClearance: false, amountOwed: 1250, feesPaid: false, totalFees: 1250, avatar: `https://picsum.photos/seed/m3${teamId}/150/150`, gradYear: '2026', gpa: '3.8', school: 'Metro Academy', highlightUrl: 'https://youtube.com/watch?v=demo3', notes: 'Physical presence with strong aerial capability.', skills: ['Strength', 'Tackling', 'Heading'], achievements: ['Defensive Player of Year'] }
    ],
    games: [
      { id: `g1_${teamId}`, opponent: 'Tigers', date: yesterday, myScore: 12, opponentScore: 8, result: 'Win', location: 'City Arena' },
      { id: `g2_${teamId}`, opponent: 'Hawks', date: now.toISOString(), myScore: 0, opponentScore: 0, result: 'Tie', location: 'Home Field' }
    ],
    events: [
      { id: `e1_${teamId}`, teamId, title: `Championship Match ${teamSuffix}`, eventType: 'game', date: tomorrow, startTime: '10:00 AM', location: 'State Stadium', description: 'Final round coordination.' },
      { id: `e2_${teamId}`, teamId, title: `Tactical Drill Session ${teamSuffix}`, eventType: 'practice', date: later, startTime: '4:00 PM', location: 'Field 2', description: 'Focused on set pieces.' }
    ],
    drills: [
      { id: `d1_${teamId}`, title: `Zone Defense Protocol ${teamSuffix}`, description: 'Master the 3-2 alignment.', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9XcQp8' }
    ],
    scouting: [
      { id: `s1_${teamId}`, opponentName: 'The Jaguars', strengths: 'Fast transitions', weaknesses: 'High defensive line', keysToVictory: 'Exploit long balls.', date: yesterday }
    ],
    feed: [
      { id: `p1_${teamId}`, type: 'user', content: `Focus for Saturday, ${teamSuffix} squad!`, author: { name: 'Jordan Smith' }, authorId: `u1_${teamId}`, createdAt: yesterday, likes: [userId] },
      { id: `p2_${teamId}`, type: 'poll', content: 'Uniform choice?', author: { name: 'Coach Guest' }, authorId: userId, poll: { question: 'Uniform choice?', options: [{text: 'Home Red', votes: 12}, {text: 'Away White', votes: 5}], totalVotes: 17, voters: {}, isClosed: false }, createdAt: yesterday }
    ],
    documents: [
      { id: 'default_medical', teamId, title: 'Medical Clearance', content: 'Standard medical waiver.', type: 'waiver', isActive: true, assignedTo: ['all'], signatureCount: 0, createdAt: now.toISOString() },
      { id: 'default_parental', teamId, title: 'Parental Consent', content: 'Mandatory minor release.', type: 'waiver', isActive: true, assignedTo: ['all'], signatureCount: 0, createdAt: now.toISOString() }
    ],
    facilities: [
      { id: `fac1_${teamId}`, name: 'Elite Sports Complex', address: '100 Athlete Way', notes: 'Gate code: 1234', clubId: userId }
    ],
    alerts: [
      { id: `a1_${teamId}`, title: 'Venue Change', message: 'Match moved to Court 4 due to maintenance.', audience: 'everyone', createdAt: yesterday, createdBy: userId }
    ],
    equipment: [
      { id: `eq1_${teamId}`, name: 'Training Vests', category: 'Training Gear', totalQuantity: 20, availableQuantity: 20, status: 'Active', assignments: {} }
    ]
  };
};

/**
 * SEED GLOBAL PLANS
 */
const SEED_CATALOG = (batch: any, db: Firestore) => {
  const plans = [
    { 
      id: 'starter_squad', 
      name: 'Starter Squad', 
      billingType: 'free', 
      features: { 
        live_feed_read: true, 
        basic_scheduling: true 
      } 
    },
    { 
      id: 'squad_pro', 
      name: 'Squad Pro', 
      billingType: 'monthly', 
      features: { 
        live_feed_read: true, 
        live_feed_post: true, 
        tournament_itinerary: true, 
        film_compliance: true, 
        stats_basic: true, 
        scouting_ai: true 
      } 
    },
    { 
      id: 'elite_teams', 
      name: 'Elite Teams', 
      billingType: 'monthly', 
      features: { 
        live_feed_read: true, 
        live_feed_post: true, 
        tournament_itinerary: true, 
        film_compliance: true, 
        stats_basic: true, 
        scouting_ai: true, 
        club_hub: true, 
        equipment_vault: true, 
        facility_fleet: true 
      } 
    },
    { 
      id: 'elite_league', 
      name: 'Elite League', 
      billingType: 'monthly', 
      features: { 
        live_feed_read: true, 
        live_feed_post: true, 
        tournament_itinerary: true, 
        film_compliance: true, 
        stats_basic: true, 
        scouting_ai: true, 
        club_hub: true, 
        equipment_vault: true, 
        facility_fleet: true, 
        league_registration: true 
      } 
    }
  ];
  plans.forEach(p => batch.set(doc(db, 'plans', p.id), p));
};

/**
 * HIGH-SPEED ATOMIC SEEDER
 */
export async function seedGuestDemoTeam(db: Firestore, userId: string, planId: string) {
  const isParentDemo = planId === 'parent_demo';
  const isPlayerDemo = planId === 'player_demo';
  const isLeagueDemo = planId === 'elite_league';
  const isEliteDemo = ['elite_teams', 'elite_league', 'squad_organization'].includes(planId);
  const isProTier = planId !== 'starter_squad' && !isParentDemo && !isPlayerDemo;
  
  const actualPlanId = (isParentDemo || isPlayerDemo) ? 'squad_pro' : (isLeagueDemo ? 'elite_league' : (planId === 'squad_organization' ? 'elite_teams' : planId));
  const userRole = isParentDemo ? 'parent' : (isPlayerDemo ? 'adult_player' : 'coach');
  const pos = isParentDemo ? 'Parent' : (isPlayerDemo ? 'Player' : 'Coach');
  
  // Demos that need command access must have 'Admin' role
  const role = (isParentDemo || isPlayerDemo) ? 'Member' : 'Admin';

  const batch = writeBatch(db);
  const now = new Date().toISOString();

  // Seed Plans first so hasFeature works
  SEED_CATALOG(batch, db);

  // 1. Core Profile
  batch.set(doc(db, 'users', userId), clean({
    id: userId, fullName: `Guest ${pos}`, email: `${userRole}@thesquad.pro`,
    role: userRole, activePlanId: actualPlanId, proTeamLimit: isEliteDemo ? 20 : (isProTier ? 1 : 0), createdAt: now, isDemo: true, seenAlertIds: [],
    avatarUrl: `https://picsum.photos/seed/${userId}/150/150`
  }), { merge: true });

  const teamConfigs = isEliteDemo 
    ? [
        { id: `demo_a_${userId.slice(-4)}`, name: 'Metro Elite Alpha', suffix: 'Alpha', isPro: true, plan: actualPlanId },
        { id: `demo_b_${userId.slice(-4)}`, name: 'Metro Elite Beta', suffix: 'Beta', isPro: true, plan: actualPlanId }
      ]
    : [
        { id: `demo_${planId}_${userId.slice(-4)}`, name: isProTier ? 'Elite Demo Squad' : 'Grassroots Demo', suffix: '', isPro: isProTier, plan: actualPlanId }
      ];

  // 2. Seed each team
  teamConfigs.forEach(config => {
    const tid = config.id;
    
    batch.set(doc(db, 'teams', tid), clean({
      id: tid, teamName: config.name, teamCode: tid.slice(-6).toUpperCase(),
      ownerUserId: userId, isPro: config.isPro, planId: config.plan, sport: 'Multi-Sport', isDemo: true,
      parentCommentsEnabled: true, parentChatEnabled: true, createdAt: now, createdBy: userId,
      heroImageUrl: `https://picsum.photos/seed/${tid}hero/1200/400`,
      teamLogoUrl: `https://picsum.photos/seed/${tid}logo/200/200`
    }));

    // ACL SYNC
    batch.set(doc(db, 'team_memberships', `${tid}_${userId}`), clean({
      id: `${tid}_${userId}`, teamId: tid, userId, teamName: config.name, role, isPro: config.isPro, joinedAt: now
    }));

    batch.set(doc(db, 'users', userId, 'teamMemberships', tid), clean({
      teamId: tid, name: config.name, teamCode: tid.slice(-6).toUpperCase(), role,
      isPro: config.isPro, planId: config.plan, isDemo: true, joinedAt: now,
      ownerUserId: userId
    }));

    batch.set(doc(db, 'teams', tid, 'members', userId), clean({
      id: userId, userId, teamId: tid, playerId: `p_${userId}`, name: `Guest ${pos}`, role, position: pos, jersey: isParentDemo ? 'HQ' : '22',
      joinedAt: now, isDemo: true, avatar: `https://picsum.photos/seed/${userId}/150/150`,
      notes: 'Primary tactical coordinator for the demo squad.'
    }));

    // Static Blueprint Injection
    const data = GET_DEMO_DATA(tid, userId, config.suffix);
    data.members.forEach(m => batch.set(doc(db, 'teams', tid, 'members', m.id), clean({ ...m, teamId: tid, joinedAt: now })));
    data.games.forEach(g => batch.set(doc(db, 'teams', tid, 'games', g.id), clean(g)));
    data.events.forEach(e => batch.set(doc(db, 'teams', tid, 'events', e.id), clean({ ...e, teamId: tid, teamName: config.name })));
    data.drills.forEach(d => batch.set(doc(db, 'teams', tid, 'drills', d.id), clean(d)));
    data.feed.forEach(p => batch.set(doc(db, 'teams', tid, 'feedPosts', p.id), clean({ ...p, teamId: tid })));
    data.documents.forEach(d => batch.set(doc(db, 'teams', tid, 'documents', d.id), clean(d)));
    data.facilities.forEach(f => batch.set(doc(db, 'facilities', f.id), clean(f)));
    data.alerts.forEach(a => batch.set(doc(db, 'teams', tid, 'alerts', a.id), clean(a)));
    data.equipment.forEach(eq => batch.set(doc(db, 'teams', tid, 'equipment', eq.id), clean(eq)));

    if (isParentDemo) {
      const childId = `child_${tid}`;
      batch.set(doc(db, 'players', childId), clean({ id: childId, firstName: 'Junior', lastName: 'Guest', dateOfBirth: '2012-01-01', isMinor: true, parentId: userId, joinedTeamIds: [tid], createdAt: now }));
      batch.set(doc(db, 'teams', tid, 'members', childId), clean({ id: childId, userId: 'none', playerId: childId, teamId: tid, name: 'Junior Guest', role: 'Member', position: 'Player', jersey: '10', joinedAt: now, isMinor: true, amountOwed: 75, feesPaid: false, totalFees: 1250, avatar: `https://picsum.photos/seed/junior/150/150`, medicalClearance: true }));
    }
  });

  // 3. League Admin Specialization
  if (isLeagueDemo) {
    const lid = `league_${userId.slice(-4)}`;
    batch.set(doc(db, 'leagues', lid), clean({
      id: lid, name: 'Metro Premier League', creatorId: userId, sport: 'Multi-Sport',
      memberTeamIds: teamConfigs.map(c => c.id),
      teams: teamConfigs.reduce((acc, c) => ({ ...acc, [c.id]: { teamName: c.name, wins: 2, losses: 1, points: 6 } }), {}),
      inviteCode: 'LEAGUE1', createdAt: now
    }));
    batch.update(doc(db, 'teams', teamConfigs[0].id), { [`leagueIds.${lid}`]: true });
    
    // Seed an invite to global/invites to ensure permission evaluation
    const inviteId = `invite_${userId.slice(-4)}`;
    batch.set(doc(db, 'leagues', 'global', 'invites', inviteId), {
      id: inviteId,
      leagueId: lid,
      leagueName: 'Metro Premier League',
      invitedEmail: 'test@thesquad.pro',
      status: 'pending',
      createdAt: now
    });
  }

  await batch.commit();
  return teamConfigs[0].id;
}