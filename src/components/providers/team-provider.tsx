"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo, useRef } from 'react';
import { useUser, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { 
  collection, 
  query, 
  where, 
  doc, 
  getDocs,
  limit,
  setDoc,
  writeBatch,
  onSnapshot,
  deleteDoc,
  addDoc,
  updateDoc,
  orderBy
} from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { updateDocumentNonBlocking, setDocumentNonBlocking, addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Purchases } from '@revenuecat/purchases-js';
import { seedSubscriptionData, launchDemoEnvironments, resetDemoEnvironment, seedGuestDemoTeam } from '@/lib/db-seeder';
import { useSearchParams } from 'next/navigation';

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  createdAt?: string;
  isDemo?: boolean;
  activePlanId?: string | null;
  planSource?: 'free' | 'revenuecat' | 'manual';
  proTeamLimit?: number | null;
  revenueCatUserId?: string | null;
};

export type Team = {
  id: string;
  name: string;
  code: string;
  sport?: string;
  description?: string;
  teamLogoUrl?: string;
  heroImageUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  membersMap?: Record<string, string>;
  isPro?: boolean;
  proAssignedAt?: string | null;
  isProPendingRemoval?: boolean;
  planId?: string;
  role?: 'Admin' | 'Member';
  isDemo?: boolean;
  createdBy?: string;
  ownerUserId?: string;
};

export type TeamEvent = {
  id: string;
  teamId: string;
  title: string;
  date: any;
  endDate?: any;
  startTime: string;
  endTime?: string;
  location: string;
  description: string;
  userRsvp?: 'going' | 'maybe' | 'notGoing';
  userRsvps?: Record<string, string>;
  isTournament?: boolean;
  tournamentSchedule?: any[];
  allowExternalRegistration?: boolean;
  maxRegistrations?: number;
};

export type MemberPosition = 'Coach' | 'Team Lead' | 'Assistant Coach' | 'Squad Leader' | 'Player' | 'Parent' | string;

export type Member = {
  id: string;
  userId: string;
  teamId: string;
  name: string;
  role: 'Admin' | 'Member';
  position: MemberPosition;
  jersey: string;
  avatar: string;
  phone?: string;
  feesPaid?: boolean;
  amountOwed?: number;
  fees?: any[];
  birthdate?: string;
  parentName?: string;
  parentEmail?: string;
  parentPhone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  notes?: string;
};

export type TeamAlert = {
  id: string;
  teamId: string;
  title: string;
  message: string;
  createdBy: string;
  createdAt: string;
};

export type Message = {
  id: string;
  author: string;
  authorId: string;
  content: string;
  type: 'text' | 'image' | 'poll';
  imageUrl?: string;
  createdAt: string;
  poll?: {
    id: string;
    question: string;
    options: { text: string; imageUrl?: string; votes: number }[];
    totalVotes: number;
    voters: Record<string, number>;
    isClosed: boolean;
  };
};

export type Plan = {
  id: string;
  name: string;
  description: string;
  priceDisplay: string;
  billingCycle: string;
  isPublic: boolean;
  isContactOnly: boolean;
  billingType: 'free' | 'monthly' | 'annual' | 'manual';
  teamLimit: number | null;
  features: Record<string, boolean>;
  proTeamLimit: number;
};

export type Feature = {
  id: string;
  description: string;
  defaultEnabled: boolean;
};

export type Subscription = {
  userId: string;
  productId: string;
  entitlementActive: boolean;
  proTeamLimit: number;
  source: 'revenuecat' | 'manual';
  lastSyncedAt: string;
};

interface TeamContextType {
  user: UserProfile | null;
  updateUser: (updates: Partial<UserProfile>) => void;
  activeTeam: Team | null;
  setActiveTeam: (team: Team) => void;
  updateTeamHero: (url: string) => Promise<void>;
  updateTeamDetails: (updates: Partial<Team>) => Promise<void>;
  updateTeamPlan: (teamId: string, planId: string) => Promise<void>;
  teams: Team[];
  isTeamsLoading: boolean;
  members: Member[];
  updateMember: (id: string, updates: Partial<Member>) => void;
  alerts: TeamAlert[];
  createAlert: (title: string, message: string) => void;
  createNewTeam: (name: string, organizerPosition: string, description?: string, planId?: string) => Promise<string>;
  joinTeamWithCode: (code: string, position: string) => Promise<boolean>;
  addEvent: (event: any) => void;
  updateEvent: (id: string, event: any) => void;
  deleteEvent: (id: string) => void;
  addGame: (game: any) => void;
  updateGame: (id: string, game: any) => void;
  addDrill: (drill: any) => void;
  deleteDrill: (id: string) => void;
  addFile: (name: string, type: string, size: string, url: string) => void;
  deleteFile: (id: string) => void;
  createChat: (name: string, memberIds: string[]) => Promise<string>;
  addMessage: (chatId: string, author: string, content: string, type: string, imageUrl?: string, poll?: any) => void;
  votePoll: (chatId: string, messageId: string, optionIdx: number) => Promise<void>;
  updateRSVP: (eventId: string, status: string) => void;
  addRegistration: (teamId: string, eventId: string, data: any) => Promise<boolean>;
  promoteToRoster: (teamId: string, eventId: string, reg: any) => Promise<void>;
  submitLead: (data: any) => Promise<boolean>;
  isLoading: boolean;
  isSuperAdmin: boolean;
  isPro: boolean;
  hasFeature: (featureKey: string) => boolean;
  purchasePro: () => Promise<void>;
  manageSubscription: () => Promise<void>;
  isPaywallOpen: boolean;
  setIsPaywallOpen: (open: boolean) => void;
  isRCInitialized: boolean;
  formatTime: (date: string | Date) => string;
  plans: Plan[];
  simulationPlanId: string | null;
  setSimulationPlanId: (pid: string | null) => void;
  resetDemo: () => Promise<void>;
  isSeedingDemo: boolean;
  isClubManager: boolean;
  secondsUntilReset: number | null;
  proQuotaStatus: { current: number; limit: number; remaining: number; exceeded: boolean };
  canAddProTeam: boolean;
  resolveQuota: (selectedTeamIds: string[]) => Promise<void>;
  assignManualPlan: (targetUserId: string, planId: string, limit: number) => Promise<void>;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

const SUPER_ADMIN_EMAILS = ['thisearlyseason@gmail.com', 'test@gmail.com'];
const DEMO_RESET_INTERVAL_MS = 5 * 60 * 1000; // 5 Minutes

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user: firebaseUser, isUserLoading } = useUser();
  const db = useFirestore();
  const searchParams = useSearchParams();
  
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isProEntitlementActive, setIsProEntitlementActive] = useState(false);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [isRCInitialized, setIsRCInitialized] = useState(false);
  const [simulationPlanId, setSimulationPlanId] = useState<string | null>(null);
  const [isSeedingDemo, setIsSeedingDemo] = useState(false);
  const [secondsUntilReset, setSecondsUntilReset] = useState<number | null>(null);
  
  const seedingRef = useRef(false);
  const resetLockRef = useRef(false);
  const rcInitRef = useRef(false);

  // 1. Core Data
  const plansQuery = useMemoFirebase(() => db ? collection(db, 'plans') : null, [db]);
  const { data: plansData } = useCollection(plansQuery);
  const plans = useMemo(() => (plansData || []) as Plan[], [plansData]);

  const isSuperAdmin = useMemo(() => {
    const email = firebaseUser?.email?.toLowerCase();
    return email ? SUPER_ADMIN_EMAILS.includes(email) : false;
  }, [firebaseUser?.email]);

  const teamsQuery = useMemoFirebase(() => {
    if (!firebaseUser || !db) return null;
    const base = isSuperAdmin ? collection(db, 'teams') : collection(db, 'users', firebaseUser.uid, 'teamMemberships');
    return query(base, limit(50));
  }, [firebaseUser?.uid, db, isSuperAdmin]);

  const { data: teamsRawData, isLoading: isTeamsLoading } = useCollection(teamsQuery);
  const teams = useMemo(() => {
    if (!teamsRawData) return [];
    return teamsRawData.map(m => {
      const tid = isSuperAdmin ? m.id : (m.teamId || m.id);
      return {
        id: tid,
        name: m.teamName || m.name || 'Unnamed Team',
        code: m.teamCode || m.code || '......',
        sport: m.sport,
        description: m.description,
        teamLogoUrl: m.teamLogoUrl,
        heroImageUrl: m.heroImageUrl,
        isPro: m.isPro || false,
        proAssignedAt: m.proAssignedAt,
        isProPendingRemoval: m.isProPendingRemoval || false,
        planId: m.planId || (m.isPro ? 'squad_pro' : 'starter_squad'),
        role: m.role || (isSuperAdmin ? 'Admin' : 'Member'),
        isDemo: m.isDemo || false,
        createdBy: m.createdBy || m.userId,
        ownerUserId: m.ownerUserId || m.createdBy || m.userId
      };
    });
  }, [teamsRawData, isSuperAdmin]);

  const activeTeam = useMemo(() => {
    if (!teams.length) return null;
    return teams.find(t => t.id === activeTeamId) || teams[0];
  }, [teams, activeTeamId]);

  // Quota Calculation
  const proQuotaStatus = useMemo(() => {
    const limit = userProfile?.proTeamLimit ?? 0;
    const ownedProTeams = teams.filter(t => t.ownerUserId === firebaseUser?.uid && t.isPro);
    const current = ownedProTeams.length;
    return {
      current,
      limit,
      remaining: Math.max(0, limit - current),
      exceeded: current > limit
    };
  }, [teams, userProfile, firebaseUser?.uid]);

  const canAddProTeam = useMemo(() => {
    if (isSuperAdmin) return true;
    return proQuotaStatus.remaining > 0;
  }, [isSuperAdmin, proQuotaStatus]);

  // Handle Quota Decrease (Mark excess as pending)
  useEffect(() => {
    if (!firebaseUser || !userProfile || isTeamsLoading || proQuotaStatus.limit === null) return;
    
    if (proQuotaStatus.exceeded) {
      // Find Pro teams that are not yet marked as pending removal
      const ownedProTeams = teams
        .filter(t => t.ownerUserId === firebaseUser.uid && t.isPro)
        .sort((a, b) => {
          // Sort by assignment date, newest first
          const dateA = a.proAssignedAt ? new Date(a.proAssignedAt).getTime() : 0;
          const dateB = b.proAssignedAt ? new Date(b.proAssignedAt).getTime() : 0;
          return dateB - dateA;
        });

      const excessCount = proQuotaStatus.current - proQuotaStatus.limit;
      const excessTeams = ownedProTeams.slice(0, excessCount).filter(t => !t.isProPendingRemoval);

      if (excessTeams.length > 0) {
        excessTeams.forEach(t => {
          updateDocumentNonBlocking(doc(db, 'teams', t.id), { isProPendingRemoval: true });
          updateDocumentNonBlocking(doc(db, 'users', firebaseUser.uid, 'teamMemberships', t.id), { isProPendingRemoval: true });
        });
        toast({ 
          title: "Pro Quota Exceeded", 
          description: "Your limit has changed. Please select which teams should remain Pro.",
          variant: "destructive"
        });
      }
    }
  }, [proQuotaStatus.limit, proQuotaStatus.current, teams, firebaseUser, userProfile, isTeamsLoading, db]);

  // 2. Feature Gating Logic
  const activePlanFeatures = useMemo(() => {
    const pid = simulationPlanId || activeTeam?.planId;
    if (!pid || !plans) return {};
    const plan = plans.find(p => p.id === pid);
    const baseFeatures = { ...(plan?.features || {}) };

    // Dynamic Club Scaling
    if (pid === 'club_custom') {
      const teamCount = teams.length;
      if (teamCount >= 2) {
        baseFeatures.multi_team_admin_dashboard = true;
        baseFeatures.cross_team_announcements = true;
      }
      if (teamCount >= 4) baseFeatures.priority_support = true;
      if (teamCount >= 8) {
        baseFeatures.early_feature_access = true;
        baseFeatures.custom_permissions = true;
      }
    }

    return baseFeatures;
  }, [activeTeam, plans, simulationPlanId, teams.length]);

  const isPro = useMemo(() => {
    if (simulationPlanId === 'starter_squad') return false;
    if (simulationPlanId === 'squad_pro' || simulationPlanId === 'club_custom') return true;
    if (isSuperAdmin && !activeTeam?.isDemo) return true;
    if (isProEntitlementActive) return true;
    
    const pid = activeTeam?.planId;
    if (!pid || pid === 'starter_squad') return false;
    return true;
  }, [activeTeam, isProEntitlementActive, isSuperAdmin, simulationPlanId]);

  const isClubManager = useMemo(() => {
    if (simulationPlanId === 'club_custom') return true;
    if (simulationPlanId === 'starter_squad' || simulationPlanId === 'squad_pro') return false;
    if (!activeTeam) return false;
    if (activeTeam.planId === 'club_custom' && activeTeam.role === 'Admin') return true;
    return false;
  }, [simulationPlanId, activeTeam]);

  // Members
  const membersQuery = useMemoFirebase(() => {
    if (!activeTeam?.id || !db) return null;
    return collection(db, 'teams', activeTeam.id, 'members');
  }, [activeTeam?.id, db]);
  const { data: membersData } = useCollection(membersQuery);
  const members = useMemo(() => (membersData || []).map(m => ({
    id: m.id, userId: m.userId, teamId: m.teamId, name: m.name || 'Member', role: m.role, position: m.position || 'Player', jersey: m.jersey || 'TBD', avatar: m.avatar || `https://picsum.photos/seed/${m.userId}/150/150`, phone: m.phone, feesPaid: m.feesPaid || false, amountOwed: m.amountOwed || 0, fees: m.fees || [], birthdate: m.birthdate, parentName: m.parentName, parentEmail: m.parentEmail, parentPhone: m.parentPhone, emergencyContactName: m.emergencyContactName, emergencyContactPhone: m.emergencyContactPhone, notes: m.notes
  })), [membersData]);

  // Alerts
  const alertsQuery = useMemoFirebase(() => {
    if (!activeTeam?.id || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'alerts'), limit(5));
  }, [activeTeam?.id, db]);
  const { data: alertsData } = useCollection(alertsQuery);
  const alerts = useMemo(() => (alertsData || []).map(a => ({ id: a.id, teamId: a.teamId, title: a.title, message: a.message, createdBy: a.createdBy, createdAt: a.createdAt })), [alertsData]);

  // Demo Heartbeat
  useEffect(() => {
    if (!userProfile?.isDemo || !userProfile?.createdAt || !activeTeamId) {
      setSecondsUntilReset(null);
      return;
    }

    const checkReset = async () => {
      if (!userProfile?.createdAt) return;
      const start = new Date(userProfile.createdAt!).getTime();
      const now = Date.now();
      const elapsed = now - start;
      const remaining = DEMO_RESET_INTERVAL_MS - (elapsed % DEMO_RESET_INTERVAL_MS);
      
      setSecondsUntilReset(Math.ceil(remaining / 1000));

      if (remaining < 1000 && !resetLockRef.current) {
        resetLockRef.current = true;
        toast({ title: "Environment Resetting", description: "Demo session expired. Restoring baseline data..." });
        
        try {
          const planId = teams.find(t => t.id === activeTeamId)?.planId || 'starter_squad';
          await resetDemoEnvironment(db, activeTeamId, planId, userProfile.id);
          toast({ title: "Reset Complete", description: "Welcome back to the baseline squad." });
        } catch (e) {
          console.error("Auto reset failed", e);
        } finally {
          resetLockRef.current = false;
        }
      }
    };

    const interval = setInterval(checkReset, 1000);
    return () => clearInterval(interval);
  }, [userProfile, activeTeamId, db, teams]);

  useEffect(() => {
    if (isSuperAdmin && db && firebaseUser) {
      seedSubscriptionData(db);
      launchDemoEnvironments(db, firebaseUser.uid);
    }
  }, [isSuperAdmin, db, firebaseUser]);

  useEffect(() => {
    const demoIntent = searchParams.get('seed_demo');
    if (demoIntent && firebaseUser && !isSeedingDemo && !seedingRef.current) {
      const runSeeding = async () => {
        seedingRef.current = true;
        setIsSeedingDemo(true);
        try {
          const tid = await seedGuestDemoTeam(db, firebaseUser.uid, demoIntent);
          setActiveTeamId(tid);
          const url = new URL(window.location.href);
          url.searchParams.delete('seed_demo');
          window.history.replaceState({}, '', url.toString());
          toast({ title: "Demo Ready", description: `Exploring the ${demoIntent.replace('_', ' ')} environment.` });
        } catch (e) {
          console.error("Demo seeding failed", e);
          seedingRef.current = false;
        } finally {
          setIsSeedingDemo(false);
        }
      };
      runSeeding();
    }
  }, [searchParams, firebaseUser, db, isSeedingDemo]);

  useEffect(() => {
    if (firebaseUser && !rcInitRef.current) {
      rcInitRef.current = true;
      try {
        Purchases.configure('goog_vqlronFHqIFQuWTkgaeWrdyYnkZ', firebaseUser.uid);
        const purchases = Purchases.getSharedInstance();
        purchases.getCustomerInfo().then(info => {
          setIsProEntitlementActive(!!info.entitlements.active['The Squad Pro']);
          setIsRCInitialized(true);
        }).catch(() => {
          setIsRCInitialized(true); 
        });
      } catch (e) { 
        setIsRCInitialized(true); 
      }
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (firebaseUser) {
      const unsub = onSnapshot(doc(db, 'users', firebaseUser.uid), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserProfile({
            id: firebaseUser.uid,
            name: data.fullName || firebaseUser.displayName || 'Guest Coordinator',
            email: data.email || firebaseUser.email || '',
            phone: data.phone || '',
            avatar: data.avatarUrl || `https://picsum.photos/seed/${firebaseUser.uid}/150/150`,
            createdAt: data.createdAt,
            isDemo: data.isDemo || false,
            activePlanId: data.activePlanId || null,
            planSource: data.planSource || 'free',
            proTeamLimit: data.proTeamLimit || 0,
            revenueCatUserId: data.revenueCatUserId || null
          });
        }
      });
      return () => unsub();
    }
  }, [firebaseUser, db]);

  const contextValue = useMemo(() => ({
    user: userProfile, 
    updateUser: (updates: Partial<UserProfile>) => { if (firebaseUser) updateDocumentNonBlocking(doc(db, 'users', firebaseUser.uid), updates); },
    activeTeam, 
    setActiveTeam: (t: Team) => setActiveTeamId(t.id),
    updateTeamHero: async (url: string) => { if (activeTeam?.id && firebaseUser) { updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id), { heroImageUrl: url }); updateDocumentNonBlocking(doc(db, 'users', firebaseUser.uid, 'teamMemberships', activeTeam.id), { heroImageUrl: url }); } },
    updateTeamDetails: async (updates: Partial<Team>) => { if (activeTeam?.id && firebaseUser) { const f: any = {}; if (updates.name) f.teamName = updates.name; if (updates.sport) f.sport = updates.sport; if (updates.description) f.description = updates.description; if (updates.teamLogoUrl) f.teamLogoUrl = updates.teamLogoUrl; if (Object.keys(f).length > 0) { updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id), f); updateDocumentNonBlocking(doc(db, 'users', firebaseUser.uid, 'teamMemberships', activeTeam.id), f); } toast({ title: "Squad Updated" }); } },
    updateTeamPlan: async (tid: string, pid: string) => { 
      if (db) { 
        const p = plans.find(p => p.id === pid);
        const isTurningPro = p?.billingType !== 'free';
        
        if (isTurningPro && !canAddProTeam && activeTeam?.planId === 'starter_squad') {
          toast({ title: "Quota Reached", description: "You have reached your Pro team limit. Please upgrade your plan.", variant: "destructive" });
          return;
        }

        const tRef = doc(db, 'teams', tid); 
        updateDocumentNonBlocking(tRef, { planId: pid, isPro: isTurningPro, proAssignedAt: new Date().toISOString(), isProPendingRemoval: false }); 
        const memRef = doc(db, 'users', firebaseUser?.uid || '', 'teamMemberships', tid);
        updateDocumentNonBlocking(memRef, { planId: pid, isPro: isTurningPro, proAssignedAt: new Date().toISOString(), isProPendingRemoval: false });
        toast({ title: "Plan Synchronized" }); 
      } 
    },
    teams, 
    isTeamsLoading,
    members, 
    updateMember: (id: string, u: any) => activeTeam?.id && updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'members', id), u),
    alerts, 
    createAlert: (t: string, m: string) => { if (activeTeam?.id && firebaseUser) { setDocumentNonBlocking(doc(collection(db, 'teams', activeTeam.id, 'alerts')), { teamId: activeTeam.id, title: t, message: m, createdBy: firebaseUser.uid, createdAt: new Date().toISOString() }, { merge: true }); } },
    createNewTeam: async (name: string, pos: string, description?: string, planId?: string) => { 
      if (!firebaseUser) return ''; 
      const tid = `team_${Date.now()}`; 
      const code = Math.random().toString(36).substring(2, 8).toUpperCase(); 
      const pId = planId || 'starter_squad';
      const isP = pId !== 'starter_squad';

      if (isP && !canAddProTeam) {
        toast({ title: "Pro Quota Reached", description: "This team will be created as a Starter Squad.", variant: "destructive" });
        return await contextValue.createNewTeam(name, pos, description, 'starter_squad');
      }

      const batch = writeBatch(db); 
      batch.set(doc(db, 'teams', tid), { id: tid, teamName: name, description: description || '', teamCode: code, createdBy: firebaseUser.uid, ownerUserId: firebaseUser.uid, createdAt: new Date().toISOString(), members: { [firebaseUser.uid]: 'Admin' }, isPro: isP, planId: pId, proAssignedAt: isP ? new Date().toISOString() : null }); 
      batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), { userId: firebaseUser.uid, teamId: tid, role: 'Admin', position: pos || 'Coach', name: userProfile?.name || 'Organizer', avatar: userProfile?.avatar || '', joinedAt: new Date().toISOString() }); 
      batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), { userId: firebaseUser.uid, teamId: tid, teamName: name, description: description || '', teamCode: code, role: 'Admin', isPro: isP, planId: pId, joinedAt: new Date().toISOString(), createdBy: firebaseUser.uid, ownerUserId: firebaseUser.uid }); 
      await batch.commit(); 
      setActiveTeamId(tid);
      return tid;
    },
    joinTeamWithCode: async (code: string, pos: string) => { if (!firebaseUser || !userProfile) return false; const qT = query(collection(db, 'teams'), where('teamCode', '==', code.toUpperCase()), limit(1)); const snap = await getDocs(qT); if (snap.empty) return false; const tDoc = snap.docs[0]; const tData = tDoc.data(); const tid = tDoc.id; const batch = writeBatch(db); batch.update(doc(db, 'teams', tid), { [`members.${firebaseUser.uid}`]: 'Member' }); batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), { userId: firebaseUser.uid, teamId: tid, role: 'Member', position: pos || 'Player', name: userProfile.name, avatar: userProfile.avatar, joinedAt: new Date().toISOString() }); batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), { userId: firebaseUser.uid, teamId: tid, teamName: tData.teamName, teamCode: code.toUpperCase(), role: 'Member', isPro: tData.isPro || false, planId: tData.planId || (tData.isPro ? 'squad_pro' : 'starter_squad'), joinedAt: new Date().toISOString(), createdBy: tData.createdBy, ownerUserId: tData.ownerUserId || tData.createdBy }); await batch.commit(); setActiveTeamId(tid); return true; },
    addEvent: (e: any) => activeTeam?.id && addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'events'), { ...e, teamId: activeTeam.id, createdBy: firebaseUser?.uid, createdAt: new Date().toISOString(), userRsvps: {} }),
    updateEvent: (id: string, e: any) => activeTeam?.id && updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'events', id), e),
    deleteEvent: (id: string) => activeTeam?.id && deleteDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'events', id)),
    addGame: (g: any) => activeTeam?.id && addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'games'), { ...g, teamId: activeTeam.id, createdBy: firebaseUser?.uid, createdAt: new Date().toISOString() }),
    updateGame: (id: string, g: any) => activeTeam?.id && updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'games', id), g),
    addDrill: (d: any) => activeTeam?.id && addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'drills'), { ...d, teamId: activeTeam.id, createdBy: firebaseUser?.uid, createdAt: new Date().toISOString() }),
    deleteDrill: (id: string) => activeTeam?.id && deleteDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'drills', id)),
    addFile: (n: string, t: string, s: string, u: string) => activeTeam?.id && addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'files'), { name: n, type: t, size: s, url: u, teamId: activeTeam.id, uploadedBy: userProfile?.name, uploaderId: firebaseUser?.uid, date: new Date().toISOString() }),
    deleteFile: (id: string) => activeTeam?.id && deleteDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'files', id)),
    createChat: async (name: string, memberIds: string[]) => { if (!activeTeam?.id || !firebaseUser) return ''; const docRef = await addDoc(collection(db, 'teams', activeTeam.id, 'groupChats'), { teamId: activeTeam.id, name, memberIds: [...memberIds, firebaseUser.uid], createdBy: firebaseUser.uid, createdAt: new Date().toISOString(), lastMessage: '', unread: 0 }); return docRef.id; },
    addMessage: (cid: string, auth: string, content: string, type: string, img?: string, poll?: any) => activeTeam?.id && addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'groupChats', cid, 'messages'), { author: auth, authorId: firebaseUser?.uid, content, type, imageUrl: img || null, poll: poll || null, createdAt: new Date().toISOString() }),
    votePoll: async (cid: string, mid: string, oidx: number) => { if (!activeTeam?.id || !firebaseUser) return; const ref = doc(db, 'teams', activeTeam.id, 'groupChats', cid, 'messages', mid); const snap = await getDocs(query(collection(db, 'teams', activeTeam.id, 'groupChats', cid, 'messages'), where('__name__', '==', mid))); if (snap.empty) return; const poll = snap.docs[0].data().poll; const current = poll.voters?.[firebaseUser.uid]; const u: any = { [`poll.voters.${firebaseUser.uid}`]: oidx }; if (current === undefined) { u[`poll.options.${oidx}.votes`] = poll.options[oidx].votes + 1; u['poll.totalVotes'] = poll.totalVotes + 1; } else if (current !== oidx) { u[`poll.options.${current}.votes`] = poll.options[current].votes - 1; u[`poll.options.${oidx}.votes`] = poll.options[oidx].votes + 1; } updateDocumentNonBlocking(ref, u); },
    updateRSVP: (eid: string, s: string) => { if (activeTeam?.id && firebaseUser) { const ref = doc(db, 'teams', activeTeam.id, 'events', eid); updateDocumentNonBlocking(ref, { [`userRsvps.${firebaseUser.uid}`]: s }); toast({ title: `RSVP Updated: ${s}` }); } },
    addRegistration: async (tid: string, eid: string, d: any) => { try { await addDoc(collection(db, 'teams', tid, 'events', eid, 'registrations'), { ...d, status: 'pending', createdAt: new Date().toISOString() }); return true; } catch { return false; } },
    promoteToRoster: async (tid: string, eid: string, reg: any) => { if (!firebaseUser) return; try { const mid = `member_${Date.now()}`; await setDoc(doc(db, 'teams', tid, 'members', mid), { userId: `ext_${Date.now()}`, teamId: tid, name: reg.name, role: 'Member', position: 'Player', avatar: '', joinedAt: new Date().toISOString() }); await deleteDoc(doc(db, 'teams', tid, 'events', eid, 'registrations', reg.id)); toast({ title: "Promoted to Roster" }); } catch { toast({ title: "Promotion Failed", variant: "destructive" }); } },
    submitLead: async (data: any) => { try { await addDoc(collection(db, 'leads'), { ...data, createdAt: new Date().toISOString() }); toast({ title: "Inquiry Sent", description: "Our team will reach out shortly." }); return true; } catch { toast({ title: "Submission Failed", variant: "destructive" }); return false; } },
    isLoading: isUserLoading, 
    isSuperAdmin,
    isPro,
    hasFeature: (featureKey: string) => { 
      if (isSuperAdmin && !simulationPlanId && !activeTeam?.isDemo) return true; 
      return !!activePlanFeatures[featureKey]; 
    },
    purchasePro: async () => setIsPaywallOpen(true),
    manageSubscription: async () => { 
      if (!isRCInitialized) { toast({ title: "Please wait", description: "Subscription service is initializing." }); return; }
      try { await Purchases.getSharedInstance().openCustomerCenter(); } 
      catch { toast({ title: "Error", description: "Failed to open settings.", variant: "destructive" }); } 
    },
    isPaywallOpen, setIsPaywallOpen,
    isRCInitialized,
    formatTime: (d: any) => (typeof d === 'string' ? new Date(d) : d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }),
    plans,
    simulationPlanId, setSimulationPlanId,
    resetDemo: async () => { if (activeTeam?.isDemo && db && firebaseUser) { await resetDemoEnvironment(db, activeTeam.id, activeTeam.planId!, firebaseUser.uid); toast({ title: "Environment Reset", description: "Demo data has been restored." }); } },
    isSeedingDemo,
    isClubManager,
    secondsUntilReset,
    proQuotaStatus,
    canAddProTeam,
    resolveQuota: async (selectedTeamIds: string[]) => {
      if (!firebaseUser || !db) return;
      const batch = writeBatch(db);
      const ownedTeams = teams.filter(t => t.ownerUserId === firebaseUser.uid && t.isPro);
      
      ownedTeams.forEach(t => {
        const isStillPro = selectedTeamIds.includes(t.id);
        const updates = {
          isPro: isStillPro,
          planId: isStillPro ? t.planId : 'starter_squad',
          isProPendingRemoval: false
        };
        batch.update(doc(db, 'teams', t.id), updates);
        batch.update(doc(db, 'users', firebaseUser.uid, 'teamMemberships', t.id), updates);
      });

      await batch.commit();
      toast({ title: "Quota Resolved", description: "Your Elite Squad assignments have been updated." });
    },
    assignManualPlan: async (targetUserId: string, planId: string, limit: number) => {
      if (!isSuperAdmin || !db) return;
      
      try {
        const timestamp = new Date().toISOString();
        const batch = writeBatch(db);
        
        // Update User Profile
        batch.update(doc(db, 'users', targetUserId), {
          activePlanId: planId,
          proTeamLimit: limit,
          planSource: 'manual'
        });

        // Update Subscription Record
        batch.set(doc(db, 'subscriptions', targetUserId), {
          userId: targetUserId,
          productId: planId,
          entitlementActive: true,
          proTeamLimit: limit,
          source: 'manual',
          lastSyncedAt: timestamp
        }, { merge: true });

        await batch.commit();
        toast({ title: "Organization Assigned", description: `Plan ${planId} (Limit: ${limit}) assigned to user.` });
      } catch (e) {
        toast({ title: "Assignment Failed", variant: "destructive" });
        console.error("Manual Provisioning Error:", e);
      }
    }
  }), [userProfile, activeTeam, teams, isTeamsLoading, members, alerts, isUserLoading, isSuperAdmin, isPaywallOpen, isRCInitialized, db, firebaseUser, activePlanFeatures, plans, simulationPlanId, isSeedingDemo, isClubManager, secondsUntilReset, isPro, proQuotaStatus, canAddProTeam]);

  return <TeamContext.Provider value={contextValue}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (context === undefined) throw new Error('useTeam must be used within a TeamProvider');
  return context;
}
