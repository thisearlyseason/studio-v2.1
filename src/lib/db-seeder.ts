
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
        { id: 'squad_pro', name: 'Squad Pro', description: 'Full coordination for elite squads.', priceDisplay: '$12.99', billingType: 'monthly', features: proFeaturesMap, proTeamLimit: 1 },
        { id: 'squad_organization', name: 'Club Custom', description: 'Enterprise solutions for leagues.', priceDisplay: 'Custom', billingType: 'manual', features: proFeaturesMap, proTeamLimit: 100 }
      ];

      plans.forEach((p) => batch.set(doc(db, 'plans', p.id), p));
      await batch.commit();
    }
  } catch (error) {}
}

export async function seedDemoData(db: Firestore, teamId: string, demoTier: string, userId: string) {
  const batch = writeBatch(db);
  const now = new Date();
  const isPro = demoTier !== 'starter_squad';

  // Seeding Roster
  const names = ['Jordan Smith', 'Alex Rivera', 'Sam Taylor', 'Casey Morgan', 'Riley Jones'];
  for (let i = 0; i < names.length; i++) {
    const mid = `demo_mem_${teamId}_${i}`;
    batch.set(doc(db, 'teams', teamId, 'members', mid), clean({
      id: mid, userId: `demo_user_${i}`, teamId, name: names[i], role: 'Member', position: 'Player', jersey: (i+10).toString(),
      avatar: `https://picsum.photos/seed/${mid}/150/150`, joinedAt: now.toISOString(), feesPaid: i < 3, amountOwed: i >= 3 ? 50 : 0
    }));
  }

  // Seeding Events
  batch.set(doc(db, 'teams', teamId, 'events', `demo_evt_${teamId}_1`), clean({
    id: `demo_evt_${teamId}_1`, teamId, title: 'Championship Match', eventType: 'game', date: new Date(now.getTime() + 86400000).toISOString(),
    startTime: '10:00 AM', location: 'City Stadium', description: 'Season finale.', userRsvps: { [userId]: 'going' }
  }));

  // Seeding Volunteers & Fundraisers
  batch.set(doc(db, 'teams', teamId, 'volunteers', `demo_vol_${teamId}_1`), clean({
    id: `demo_vol_${teamId}_1`, title: 'Tournament Hospitality', date: new Date(now.getTime() + 172800000).toISOString(),
    location: 'Main Arena', slots: 5, hoursPerSlot: 4, signups: {}
  }));

  batch.set(doc(db, 'teams', teamId, 'fundraising', `demo_fund_${teamId}_1`), clean({
    id: `demo_fund_${teamId}_1`, title: 'Uniform Sponsorship', goalAmount: 2500, currentAmount: 1200, 
    deadline: new Date(now.getTime() + 604800000).toISOString(), participants: {}
  }));

  // Seeding Documents (Waivers)
  if (isPro) {
    batch.set(doc(db, 'teams', teamId, 'documents', `demo_doc_${teamId}_1`), clean({
      id: `demo_doc_${teamId}_1`, teamId, title: 'Annual Liability Waiver', type: 'waiver', content: 'Official liability terms for the season.',
      assignedTo: ['all'], signatureCount: 0, createdAt: now.toISOString()
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
    id: userId, fullName: isParentDemo ? 'Guest Parent' : 'Guest User', email: `${userRole}@thesquad.pro`,
    role: userRole, activePlanId: actualPlanId, proTeamLimit: 1, createdAt: nowStr, isDemo: true
  }), { merge: true });

  // Team
  batch.set(doc(db, 'teams', teamId), clean({
    id: teamId, teamName: 'Demo Elite Squad', teamCode: teamId.slice(-6).toUpperCase(),
    createdBy: 'system', ownerUserId: 'system', isPro: true, planId: actualPlanId, sport: 'Multi-Sport', isDemo: true
  }));

  // Membership
  batch.set(doc(db, 'users', userId, 'teamMemberships', teamId), clean({
    teamId, teamName: 'Demo Elite Squad', teamCode: teamId.slice(-6).toUpperCase(), role,
    isPro: true, planId: actualPlanId, isDemo: true, joinedAt: nowStr
  }));

  // Member
  batch.set(doc(db, 'teams', teamId, 'members', userId), clean({
    id: userId, userId, teamId, name: isParentDemo ? 'Guest Parent' : 'Guest User',
    role, position, jersey: isParentDemo ? 'HQ' : '22', joinedAt: nowStr, isDemo: true
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
      role: 'Member', position: 'Player', jersey: '10', joinedAt: nowStr, isMinor: true
    }));
  }

  await batch.commit();
  await seedDemoData(db, teamId, actualPlanId, userId);
  return teamId;
}
