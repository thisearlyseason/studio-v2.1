
'use client';

import { 
  Firestore, 
  doc, 
  writeBatch,
  collection,
  serverTimestamp,
  setDoc
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
 */
const GET_DEMO_DATA = (teamId: string, userId: string, teamSuffix: string = '') => {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000).toISOString();
  const weekAgo = new Date(now.getTime() - 604800000).toISOString();
  const tomorrow = new Date(now.getTime() + 86400000).toISOString();
  const later = new Date(now.getTime() + 172800000).toISOString();

  return {
    members: [
      { id: `m1_${teamId}`, userId: `u1_${teamId}`, playerId: `p_u1_${teamId}`, name: `Jordan Smith ${teamSuffix}`, role: 'Member', position: 'Forward', jersey: '10', medicalClearance: true, amountOwed: 0, feesPaid: true, totalFees: 1250, avatar: `https://picsum.photos/seed/m1${teamId}/150/150`, gradYear: '2026', gpa: '3.9', school: 'Metro Academy' },
      { id: `m2_${teamId}`, userId: `u2_${teamId}`, playerId: `p_u2_${teamId}`, name: `Alex Rivera ${teamSuffix}`, role: 'Member', position: 'Midfield', jersey: '22', medicalClearance: true, amountOwed: 450, feesPaid: false, totalFees: 1250, avatar: `https://picsum.photos/seed/m2${teamId}/150/150`, gradYear: '2027', gpa: '3.7', school: 'Heights High' }
    ],
    games: [
      { id: `g1_${teamId}`, opponent: 'Tigers', date: yesterday, myScore: 12, opponentScore: 8, result: 'Win', location: 'City Arena' },
      { id: `g2_${teamId}`, opponent: 'Hawks', date: weekAgo, myScore: 5, opponentScore: 10, result: 'Loss', location: 'Home Field' }
    ],
    events: [
      { id: `e1_${teamId}`, teamId, title: `Championship Finals ${teamSuffix}`, eventType: 'tournament', isTournament: true, date: tomorrow, startTime: '10:00 AM', location: 'State Stadium', description: 'Final round coordination.', tournamentTeams: [`Team ${teamSuffix}`, 'Tigers', 'Hawks', 'Lions'] },
      { id: `e2_${teamId}`, teamId, title: `Tactical Drill Session ${teamSuffix}`, eventType: 'practice', date: later, startTime: '4:00 PM', location: 'Field 2', description: 'Focused on set pieces.' }
    ],
    drills: [
      { id: `d1_${teamId}`, title: `Zone Defense Protocol ${teamSuffix}`, description: 'Master the 3-2 alignment.', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9XcQp8', createdAt: now.toISOString() }
    ],
    feed: [
      { id: `p1_${teamId}`, type: 'user', content: `Focus for Saturday, ${teamSuffix} squad!`, author: { name: 'Jordan Smith' }, authorId: `u1_${teamId}`, createdAt: yesterday, likes: [userId] }
    ],
    documents: [
      { id: 'default_medical', teamId, title: 'Medical Clearance', content: 'Standard medical waiver.', type: 'waiver', isActive: true, assignedTo: ['all'], signatureCount: 0, createdAt: now.toISOString() }
    ],
    alerts: [
      { id: `a1_${teamId}`, title: 'Venue Change', message: 'Match moved to Court 4 due to maintenance.', audience: 'everyone', createdAt: yesterday, createdBy: userId }
    ]
  };
};

/**
 * HIGH-SPEED ATOMIC SEEDER
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
    role: userRole, activePlanId: actualPlanId, proTeamLimit: isEliteDemo ? 20 : 1, createdAt: now, isDemo: true, seenAlertIds: [],
    avatarUrl: `https://picsum.photos/seed/${userId}/150/150`
  }), { merge: true });

  const teamId = `demo_${planId}_${userId.slice(-4)}`;
  
  // 2. Team Hub
  batch.set(doc(db, 'teams', teamId), clean({
    id: teamId, teamName: isProTier ? 'Elite Demo Squad' : 'Grassroots Demo', teamCode: teamId.slice(-6).toUpperCase(),
    ownerUserId: userId, isPro: isProTier, planId: actualPlanId, sport: 'Multi-Sport', isDemo: true,
    createdAt: now, createdBy: userId,
    heroImageUrl: `https://picsum.photos/seed/${teamId}hero/1200/400`,
    teamLogoUrl: `https://picsum.photos/seed/${teamId}logo/200/200`
  }));

  batch.set(doc(db, 'users', userId, 'teamMemberships', teamId), clean({
    teamId, name: isProTier ? 'Elite Demo Squad' : 'Grassroots Demo', role, isPro: isProTier, planId: actualPlanId, isDemo: true, joinedAt: now
  }));

  batch.set(doc(db, 'teams', teamId, 'members', userId), clean({
    id: userId, userId, teamId, playerId: `p_${userId}`, name: `Guest ${pos}`, role, position: pos, jersey: '22',
    joinedAt: now, isDemo: true, avatar: `https://picsum.photos/seed/${userId}/150/150`
  }));

  // Explicitly allow team memberships at root for rules satisfaction
  batch.set(doc(db, 'team_memberships', `${teamId}_${userId}`), clean({
    id: `${teamId}_${userId}`, teamId, userId, role, joinedAt: now
  }));

  const data = GET_DEMO_DATA(teamId, userId);
  data.members.forEach(m => batch.set(doc(db, 'teams', teamId, 'members', m.id), clean({ ...m, teamId })));
  data.games.forEach(g => batch.set(doc(db, 'teams', teamId, 'games', g.id), clean(g)));
  data.events.forEach(e => batch.set(doc(db, 'teams', teamId, 'events', e.id), clean(e)));
  data.drills.forEach(d => batch.set(doc(db, 'teams', teamId, 'drills', d.id), clean(d)));
  data.feed.forEach(p => batch.set(doc(db, 'teams', teamId, 'feedPosts', p.id), clean(p)));
  data.documents.forEach(d => batch.set(doc(db, 'teams', teamId, 'documents', d.id), clean(d)));
  data.alerts.forEach(a => batch.set(doc(db, 'teams', teamId, 'alerts', a.id), clean(a)));

  await batch.commit();
  return teamId;
}
