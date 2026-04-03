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
 * Using fixed content for stable resets.
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
      { id: `e1_${teamId}`, teamId, title: `Tourney Invitational`, eventType: 'tournament', isTournament: true, date: tomorrow, endDate: later, startTime: '09:00 AM', endTime: '5:00 PM', location: 'Regional Sports Complex', description: 'Two-day institutional tournament.', tournamentTeams: [`Team ${teamSuffix}`, 'Tigers', 'Hawks', 'Lions'] },
      { id: `e2_${teamId}`, teamId, title: `Academy Training`, eventType: 'practice', date: later, startTime: '3:30 PM', location: 'Main Training Facility', description: 'Drill-focused training session.' },
      { id: `e2b_${teamId}`, teamId, title: `Tactical Lab`, eventType: 'practice', date: tomorrow, startTime: '4:00 PM', location: 'Performance Gym', description: 'Strength and conditioning.' },
      { id: `e3_${teamId}`, teamId, title: `Squad Strategy Review`, eventType: 'meeting', date: later, startTime: '7:00 PM', location: 'Meeting Room A', description: 'Film study and strategy review.' },
      { id: `e4_${teamId}`, teamId, title: `League Match (A)`, eventType: 'game', date: tomorrow, startTime: '6:00 PM', location: 'Home Stadium', description: 'Primary season match.' },
      { id: `e4b_${teamId}`, teamId, title: `Exhibition Game`, eventType: 'game', date: later, startTime: '12:00 PM', location: 'City Park', description: 'Friendly match.' }
    ],
    eventBrackets: [
      {
        eventId: `e1_${teamId}`,
        brackets: [
          { id: 'b1', title: 'Championship Bracket', matchups: {
            "1": { match: 1, round: 1, team1: `Team ${teamSuffix}`, team2: 'Hawks', score1: 15, score2: 12, status: 'Completed', winner: `Team ${teamSuffix}` },
            "2": { match: 2, round: 1, team1: 'Tigers', team2: 'Lions', status: 'Scheduled' }
          }}
        ]
      }
    ],
    drills: [
      { id: `d1_${teamId}`, title: `Zone Defense Protocol ${teamSuffix}`, description: 'Master the 3-2 alignment.', videoUrl: 'https://www.youtube.com/watch?v=Fj2N220hV2Y', additionalMedia: ['https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=800&q=80'], estimatedTime: '15 mins', createdAt: now.toISOString() }
    ],
    feed: [
      { id: `p1_${teamId}`, type: 'user', content: `Focus for Saturday, ${teamSuffix} squad!`, author: { name: 'Jordan Smith' }, authorId: `u1_${teamId}`, createdAt: yesterday, likes: [userId] }
    ],
    documents: [
      { id: `w1_${teamId}`, teamId, title: 'Annual Liability Waiver', content: 'Standard liability waiver for the season.', type: 'waiver', isActive: true, assignedTo: ['all'], signatureCount: 0, required: true, createdAt: now.toISOString() },
      { id: `w2_${teamId}`, teamId, title: 'Media Release Form', content: 'Release for photos/video recording.', type: 'waiver', isActive: true, assignedTo: ['all'], signatureCount: 0, required: false, createdAt: weekAgo }
    ],
    alerts: [
      { id: `a1_${teamId}`, title: 'Venue Change', message: 'Match moved to Court 4 due to maintenance.', audience: 'everyone', createdAt: yesterday, createdBy: userId }
    ],
    facilities: [
      { id: `fac1_${teamId}`, name: `Main Sports Complex`, address: '123 Stadium Dr', type: 'Facility', clubId: userId, notes: 'Primary venue' }
    ],
    facilityFields: [
      { id: `fld1_${teamId}`, facilityId: `fac1_${teamId}`, name: 'Field 1 - Turf' },
      { id: `fld2_${teamId}`, facilityId: `fac1_${teamId}`, name: 'Field 2 - Grass' }
    ],
    incidents: [
      { id: `inc1_${teamId}`, title: 'Rolled Ankle', date: yesterday, time: '14:30', location: 'Field 1', description: 'Player rolled ankle during standard drill.', severity: 'Minor', treatmentProvided: 'Ice and rest.', reportedBy: 'Coach Default', emergencyServicesCalled: false, createdAt: yesterday }
    ],
    volunteers: [
      { id: `vol1_${teamId}`, title: 'Tournament Concessions', description: 'Help run the stand during the multi-day event.', date: tomorrow, startTime: '09:00', endTime: '15:00', slots: 5, hoursPerSlot: 2, pointsPerSlot: 10, signups: { [`u1_${teamId}`]: { userId: `u1_${teamId}`, userName: 'Jordan Smith', status: 'pending', createdAt: yesterday } } }
    ],
    fundraising: [
      { id: `fund1_${teamId}`, title: 'New Uniform Drive', description: 'Raising money for away kits.', goalAmount: 5000, currentAmount: 1200, deadline: later, finances: {} }
    ],
    chats: [
      {
        id: `chat1_${teamId}`,
        name: 'Squad Main Channel',
        createdBy: userId,
        memberIds: [userId, `u1_${teamId}`, `u2_${teamId}`],
        isDeleted: false,
        teamId: teamId,
        createdAt: weekAgo,
        messages: [
          { id: `m1`, author: 'Jordan Smith', authorId: `u1_${teamId}`, content: 'Ready for the tourneys this weekend!', type: 'text', createdAt: yesterday }
        ]
      }
    ]
  };
};

/**
 * HIGH-SPEED ATOMIC SEEDER
 * Ensures a stable, predictable reset for demo users.
 */
export async function seedGuestDemoTeam(db: Firestore, userId: string, planId: string) {
  const isParentDemo = planId === 'parent_demo';
  const isPlayerDemo = planId === 'player_demo';
  const isEliteDemo = ['elite_teams', 'elite_league', 'squad_organization'].includes(planId);
  const isSchoolDemo = planId === 'school_demo' || planId === 'school';
  const isProTier = planId !== 'starter_squad' && !isParentDemo && !isPlayerDemo && !isSchoolDemo;
  
  const actualPlanId = (isParentDemo || isPlayerDemo) ? 'squad_pro' : (isSchoolDemo ? 'squad_organization' : planId);
  const userRole = isSchoolDemo ? 'admin' : (isParentDemo ? 'parent' : (isPlayerDemo ? 'adult_player' : 'coach'));
  const pos = isParentDemo ? 'Parent' : (isPlayerDemo ? 'Player' : (isSchoolDemo ? 'Principal' : 'Coach'));
  const role = (isParentDemo || isPlayerDemo) ? 'Member' : 'Admin';

  const batch = writeBatch(db);
  const now = new Date().toISOString();

  // 1. Core Profile Reset
  batch.set(doc(db, 'users', userId), clean({
    id: userId, 
    fullName: `Guest ${pos}`, 
    email: `${userRole}@thesquad.pro`,
    role: userRole, 
    activePlanId: actualPlanId, 
    proTeamLimit: (isEliteDemo || isSchoolDemo) ? 20 : 1, 
    createdAt: now, 
    isDemo: true, 
    seenAlertIds: [],
    avatarUrl: `https://picsum.photos/seed/${userId}/150/150`,
    clubDescription: isEliteDemo ? 'Precision performance at a professional scale.' : (isSchoolDemo ? 'K-12 Academic & Athletic Program' : undefined),
    schoolAdminIds: isSchoolDemo ? [userId] : [],
    isPrimaryClubAuthority: isEliteDemo || (isSchoolDemo && !isPlayerDemo && !isParentDemo),
    clubName: isSchoolDemo ? 'Springfield High School' : (isEliteDemo ? 'Elite Academy' : 'Squad Sports Hub'),
    isStaff: true
  }), { merge: true });

  // 1.5 Optional: Seed Plan definitions if they don't exist (to unlock features in UI)
  const plans = [
    { id: 'starter_squad', name: 'Starter', features: { live_feed_read: true, basic_scheduling: true } },
    { id: 'squad_pro', name: 'Pro', isPro: true, features: { feed_post: true, tournaments_view: true, tournaments_manage: true, payments_collect: true, incidents_report: true, volunteers_manage: true, fundraising_manage: true, chats_unlimited: true, roster_unlimited: true, advanced_scheduling: true, media_library: true } },
    { id: 'squad_organization', name: 'Organization', isPro: true, features: { feed_post: true, tournaments_view: true, tournaments_manage: true, payments_collect: true, incidents_report: true, volunteers_manage: true, fundraising_manage: true, chats_unlimited: true, roster_unlimited: true, advanced_scheduling: true, media_library: true, multi_team_management: true, school_hub: true, facility_management: true } }
  ];
  plans.forEach(p => batch.set(doc(db, 'plans', p.id), clean(p), { merge: true }));

  // 2. Identify Primary Demo Suffixes
  const teamVariants = isEliteDemo ? ['North', 'South', 'Academy'] : (isSchoolDemo ? ['Springfield High', 'Varsity', 'Junior Varsity', 'Freshman'] : ['']);
  
  let primarySchoolId = '';

  for (let i = 0; i < teamVariants.length; i++) {
    const variant = teamVariants[i];
    const isPrimary = i === 0;
    
    let teamId = '';
    let name = '';
    let teamType = 'youth';
    let schoolId = undefined;

    if (isSchoolDemo) {
        if (isPrimary) {
            teamId = `demo_${planId}_${userId.slice(-4)}`;
            name = 'Springfield High School';
            teamType = 'school';
            primarySchoolId = teamId;
        } else {
            teamId = `demo_${planId}_${userId.slice(-4)}_${variant.toLowerCase().replace(' ', '')}`;
            name = `Springfield ${variant}`;
            teamType = 'school_squad';
            schoolId = primarySchoolId;
        }
    } else {
        teamId = `demo_${planId}_${userId.slice(-4)}${variant ? '_' + variant.toLowerCase() : ''}`;
        name = variant ? `Elite Squad - ${variant}` : (isProTier ? 'Elite Demo Squad' : 'Grassroots Demo');
    }

    // Squad Identity
    batch.set(doc(db, 'teams', teamId), clean({ 
      id: teamId, 
      teamName: name, 
      code: teamId.slice(-6).toUpperCase(),
      teamCode: teamId.slice(-6).toUpperCase(),
      ownerUserId: userId, 
      isPro: true, 
      planId: actualPlanId, 
      sport: isSchoolDemo ? 'Basketball' : 'Multi-Sport', 
      isDemo: true,
      type: teamType,
      schoolId: schoolId,
      createdAt: now, 
      createdBy: userId,
      heroImageUrl: `https://picsum.photos/seed/${teamId}hero/1200/400`,
      teamLogoUrl: `https://picsum.photos/seed/${teamId}logo/200/200`
    }));

    // User Membership
    batch.set(doc(db, 'users', userId, 'teamMemberships', teamId), clean({
      teamId, 
      name, 
      role, 
      isPro: true, 
      planId: actualPlanId, 
      isDemo: true, 
      joinedAt: now,
      ownerUserId: userId, 
      type: teamType,
      schoolId: schoolId
    }));

    // Local Member Profile
    batch.set(doc(db, 'teams', teamId, 'members', userId), clean({
      id: userId, userId, teamId, playerId: `p_${userId}_${teamId}`, name: `Guest ${pos}`, role, position: pos, jersey: '22',
      joinedAt: now, isDemo: true, avatar: `https://picsum.photos/seed/${userId}/150/150`,
      ownerUserId: userId,
      medicalClearance: true,
      schoolId: schoolId || primarySchoolId
    }));

    // Add Coaches for School Hub and Squads
    if (isSchoolDemo) {
        if (isPrimary) {
            // Add Primary Coaches to School Hub
            const coaches = [
                { id: `coach_ad_${teamId}`, name: 'Marcus Miller', pos: 'Athletic Director', email: 'ad@springfield.edu' },
                { id: `coach_head_${teamId}`, name: 'Sarah Thompson', pos: 'Head Coach', email: 'varsity@springfield.edu' },
                { id: `coach_asst_${teamId}`, name: 'David Chen', pos: 'Assistant Coach', email: 'asst@springfield.edu' }
            ];
            coaches.forEach(c => {
                batch.set(doc(db, 'teams', teamId, 'members', c.id), clean({
                    id: c.id, userId: c.id, teamId, playerId: null, name: c.name, role: 'Member', position: c.pos, jersey: '-',
                    joinedAt: now, isDemo: true, ownerUserId: userId, email: c.email, avatar: `https://picsum.photos/seed/coach${c.id}/150/150`,
                    schoolId: primarySchoolId
                }));
            });
        } else {
            // Add Squad Specific Coaches
            const coachId = `coach_${teamId}`;
            batch.set(doc(db, 'teams', teamId, 'members', coachId), clean({
                id: coachId, userId: coachId, teamId, playerId: null, name: `${variant} Coach`, role: 'Member', position: 'Coach', jersey: '10',
                joinedAt: now, isDemo: true, ownerUserId: userId, email: `${variant.toLowerCase()}@springfield.edu`,
                schoolId: schoolId || primarySchoolId
            }));
            
            // Link back to hub: All squads should be visible in Hub's roster or specific lists
            // (Assumes TeamProvider handles discovery via schoolId or membership)
        }
    }

    // Create Sample Programs for School Squads
    if (isSchoolDemo && !isPrimary) {
        const lid = `prog_${teamId}_2024`;
        batch.set(doc(db, 'leagues', lid), clean({
            id: lid,
            name: `${name} Fall Program 2024`,
            creatorId: userId,
            sport: 'Basketball',
            teams: { [teamId]: { teamName: name, wins: 0, losses: 0, ties: 0, points: 0, status: 'accepted' } },
            memberTeamIds: [teamId],
            finances: {},
            inviteCode: lid.slice(-6).toUpperCase(),
            createdAt: now
        }));
        batch.update(doc(db, 'teams', teamId), { [`leagueIds.${lid}`]: true });
    } 
    
    if (variant || isPrimary) {
       // Population Data
       const data = GET_DEMO_DATA(teamId, userId, variant || 'Principal');
       data.members.forEach(m => batch.set(doc(db, 'teams', teamId, 'members', m.id), clean({ ...m, teamId, ownerUserId: userId, medicalClearance: true })));
       data.games.forEach(g => batch.set(doc(db, 'teams', teamId, 'games', g.id), clean(g)));
       
       // Force a match, meeting, and practice for EVERY squad
       data.events.forEach(e => {
         let shouldAdd = false;
         
         if (isSchoolDemo) {
            // All squads MUST have at least one match, one meeting, and one practice
            if (e.eventType === 'game' || e.eventType === 'practice' || e.eventType === 'meeting') {
                shouldAdd = true;
            }
            // Tournaments are for squads. Varsity gets the 2-day invitational.
            if (e.isTournament && variant === 'Varsity') {
                shouldAdd = true;
            }
         } else {
            // Non-school demo logic
            if (e.isTournament) {
               if (variant !== 'Academy' && !isEliteDemo) return;
            }
            shouldAdd = true;
         }
         
         if (shouldAdd) {
            batch.set(doc(db, 'teams', teamId, 'events', e.id), clean(e));
         }
       });

       data.eventBrackets.forEach(eb => {
         // Only add brackets for those that got the tournament
         if (variant === 'Varsity' || (!isSchoolDemo && eb.eventId.includes('e1'))) {
            eb.brackets.forEach(b => batch.set(doc(db, 'teams', teamId, 'events', eb.eventId, 'brackets', b.id), clean(b)));
         }
       });
       
       data.drills.forEach(d => batch.set(doc(db, 'teams', teamId, 'drills', d.id), clean(d)));
       data.feed.forEach(p => batch.set(doc(db, 'teams', teamId, 'feedPosts', p.id), clean(p)));
       data.documents.forEach(d => batch.set(doc(db, 'teams', teamId, 'documents', d.id), clean({ ...d, ownerUserId: userId })));
       data.alerts.forEach(a => batch.set(doc(db, 'teams', teamId, 'alerts', a.id), clean(a)));
       
       // New Feature Demo Data
       data.facilities.forEach(f => batch.set(doc(db, 'facilities', f.id), clean(f)));
       data.facilityFields.forEach(ff => batch.set(doc(db, 'facilities', ff.facilityId, 'fields', ff.id), clean(ff)));
       data.incidents.forEach(inc => batch.set(doc(db, 'teams', teamId, 'incidents', inc.id), clean({ ...inc, ownerUserId: userId, teamName: name })));
       data.volunteers.forEach(v => batch.set(doc(db, 'teams', teamId, 'volunteers', v.id), clean(v)));
       data.fundraising.forEach(f => batch.set(doc(db, 'teams', teamId, 'fundraising', f.id), clean(f)));
       data.chats.forEach(c => {
         batch.set(doc(db, 'teams', teamId, 'groupChats', c.id), clean({ id: c.id, name: c.name, createdBy: c.createdBy, memberIds: c.memberIds, isDeleted: c.isDeleted, teamId: c.teamId, createdAt: c.createdAt }));
         c.messages.forEach(m => batch.set(doc(db, 'teams', teamId, 'groupChats', c.id, 'messages', m.id), clean(m)));
       });
    }
  }

  // 3. Specialized Parent Demo Data
  if (isParentDemo) {
    const childId = `c_${userId}`;
    batch.set(doc(db, 'players', childId), clean({
      id: childId, firstName: 'Junior', lastName: 'Guest', isMinor: true, parentId: userId, userId: null,
      hasLogin: false, createdAt: now, joinedTeamIds: [`demo_${planId}_${userId.slice(-4)}`],
      medicalClearance: true
    }));
  }

  await batch.commit();
  return isSchoolDemo ? primarySchoolId : `demo_${planId}_${userId.slice(-4)}${teamVariants[0] ? '_' + teamVariants[0].toLowerCase() : ''}`;
}