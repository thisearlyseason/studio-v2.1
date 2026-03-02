
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
import { useSearchParams, useRouter } from 'next/navigation';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

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
  isMembersLoading: boolean;
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
  updateMember: (memberId: string, updates: Partial<Member>) => void;
  submitLead: (data: any) => Promise<boolean>;
  alerts: TeamAlert[];
  createAlert: (title: string, message: string) => Promise<void>;
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
const DEMO_RESET_INTERVAL_MS = 5 * 60 * 1000;

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user: firebaseUser, isUserLoading } = useUser();
  const db = useFirestore();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isProEntitlementActive, setIsProEntitlementActive] = useState(false);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [isRCInitialized, setIsRCInitialized] = useState(false);
  const [simulationPlanId, setSimulationPlanId] = useState<string | null>(null);
  const [isSeedingDemo, setIsSeedingDemo] = useState(false);
  const [secondsUntilReset, setSecondsUntilReset] = useState<number | null>(null);
  const [alerts, setAlerts] = useState<TeamAlert[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [isMembersLoading, setIsMembersLoading] = useState(false);
  
  const seedingRef = useRef(false);
  const resetLockRef = useRef(false);
  const rcInitRef = useRef(false);

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

  useEffect(() => {
    if (!activeTeam?.id || !db) {
      setAlerts([]);
      return;
    }
    const q = query(collection(db, 'teams', activeTeam.id, 'alerts'), orderBy('createdAt', 'desc'), limit(10));
    const unsub = onSnapshot(q, (snap) => {
      setAlerts(snap.docs.map(d => ({ id: d.id, ...d.data() } as TeamAlert)));
    }, (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `teams/${activeTeam.id}/alerts`, operation: 'list' }));
    });
    return () => unsub();
  }, [activeTeam?.id, db]);

  useEffect(() => {
    if (!activeTeam?.id || !db) {
      setMembers([]);
      setIsMembersLoading(false);
      return;
    }
    setIsMembersLoading(true);
    const q = query(collection(db, 'teams', activeTeam.id, 'members'), orderBy('name', 'asc'), limit(100));
    const unsub = onSnapshot(q, (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
      setIsMembersLoading(false);
    }, (error) => {
      setIsMembersLoading(false);
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `teams/${activeTeam.id}/members`, operation: 'list' }));
    });
    return () => unsub();
  }, [activeTeam?.id, db]);

  const proQuotaStatus = useMemo(() => {
    const limitCount = userProfile?.proTeamLimit ?? 0;
    const ownedProTeams = teams.filter(t => t.ownerUserId === firebaseUser?.uid && t.isPro);
    const current = ownedProTeams.length;
    return {
      current,
      limit: limitCount,
      remaining: Math.max(0, limitCount - current),
      exceeded: current > limitCount
    };
  }, [teams, userProfile, firebaseUser?.uid]);

  const canAddProTeam = useMemo(() => {
    if (isSuperAdmin) return true;
    return proQuotaStatus.remaining > 0;
  }, [isSuperAdmin, proQuotaStatus]);

  const activePlanFeatures = useMemo(() => {
    const pid = simulationPlanId || activeTeam?.planId;
    if (!pid) return {};
    
    // Static base features for core plans to prevent loading flicker
    const baseFeatures: Record<string, boolean> = {};
    
    if (pid === 'squad_organization') {
      return {
        schedule_games_events: true, tournaments: true, basic_roster: true,
        full_roster_details: true, attendance_tracking: true, live_feed_read: true,
        live_feed_post: true, group_chat: true, score_tracking: true,
        media_uploads: true, high_priority_alerts: true
      };
    }

    const plan = plans.find(p => p.id === pid);
    return { ...(plan?.features || {}) };
  }, [activeTeam, plans, simulationPlanId]);

  const isPro = useMemo(() => {
    if (simulationPlanId === 'starter_squad') return false;
    if (simulationPlanId === 'squad_pro' || simulationPlanId === 'squad_organization') return true;
    if (isSuperAdmin && !activeTeam?.isDemo) return true;
    if (isProEntitlementActive) return true;
    
    const pid = activeTeam?.planId;
    if (!pid || pid === 'starter_squad') return false;
    return true;
  }, [activeTeam, isProEntitlementActive, isSuperAdmin, simulationPlanId]);

  const isClubManager = useMemo(() => {
    if (simulationPlanId === 'squad_organization') return true;
    if (simulationPlanId === 'starter_squad' || simulationPlanId === 'squad_pro') return false;
    if (!activeTeam) return false;
    return activeTeam.planId === 'squad_organization' && activeTeam.role === 'Admin';
  }, [simulationPlanId, activeTeam]);

  useEffect(() => {
    if (!userProfile?.isDemo || !userProfile?.createdAt) {
      setSecondsUntilReset(null);
      return;
    }

    const checkReset = async () => {
      const start = new Date(userProfile.createdAt!).getTime();
      const now = Date.now();
      const elapsed = now - start;
      const remaining = DEMO_RESET_INTERVAL_MS - (elapsed % DEMO_RESET_INTERVAL_MS);
      
      setSecondsUntilReset(Math.ceil(remaining / 1000));

      if (remaining < 1000 && !resetLockRef.current) {
        resetLockRef.current = true;
        try {
          const pid = userProfile.activePlanId || 'starter_squad';
          await resetDemoEnvironment(db, activeTeamId || '', pid, userProfile.id);
          toast({ title: "Demo Reset Complete", description: "Environment has been restored to baseline." });
        } catch (e) {
          console.error("Heartbeat Reset Error:", e);
        } finally {
          resetLockRef.current = false;
        }
      }
    };

    const interval = setInterval(checkReset, 1000);
    return () => clearInterval(interval);
  }, [userProfile, activeTeamId, db]);

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
        } catch (e) {
          console.error("Failed to seed guest demo:", e);
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
      }, (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `users/${firebaseUser.uid}`, operation: 'get' }));
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
    updateTeamDetails: async (updates: Partial<Team>) => { if (activeTeam?.id && firebaseUser) { const f: any = {}; if (updates.name) f.teamName = updates.name; if (updates.sport) f.sport = updates.sport; if (updates.description) f.description = updates.description; if (updates.teamLogoUrl) f.teamLogoUrl = updates.teamLogoUrl; if (Object.keys(f).length > 0) { updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id), f); updateDocumentNonBlocking(doc(db, 'users', firebaseUser.uid, 'teamMemberships', activeTeam.id), f); } } },
    updateTeamPlan: async (tid: string, pid: string) => { 
      if (db) { 
        const p = plans.find(p => p.id === pid);
        const isTurningPro = p?.billingType !== 'free';
        
        if (isTurningPro && !canAddProTeam && activeTeam?.planId === 'starter_squad') {
          toast({ title: "Quota Reached", description: "You have reached your Pro team limit. Please upgrade your plan.", variant: "destructive" });
          return;
        }

        updateDocumentNonBlocking(doc(db, 'teams', tid), { planId: pid, isPro: isTurningPro, proAssignedAt: new Date().toISOString(), isProPendingRemoval: false }); 
        updateDocumentNonBlocking(doc(db, 'users', firebaseUser?.uid || '', 'teamMemberships', tid), { planId: pid, isPro: isTurningPro, proAssignedAt: new Date().toISOString(), isProPendingRemoval: false });
      } 
    },
    teams, 
    isTeamsLoading,
    members,
    isMembersLoading,
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
      
      try {
        await batch.commit(); 
        setActiveTeamId(tid);
        return tid;
      } catch (e) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `teams/${tid}`, operation: 'create', requestResourceData: { teamName: name } }));
        return '';
      }
    },
    joinTeamWithCode: async (code: string, pos: string) => { 
      if (!firebaseUser || !userProfile) return false; 
      try {
        const qT = query(collection(db, 'teams'), where('teamCode', '==', code.toUpperCase()), limit(1)); 
        const snap = await getDocs(qT); 
        if (snap.empty) return false; 
        const tDoc = snap.docs[0]; 
        const tData = tDoc.data(); 
        const tid = tDoc.id; 
        const batch = writeBatch(db); 
        batch.update(doc(db, 'teams', tid), { [`members.${firebaseUser.uid}`]: 'Member' }); 
        batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), { userId: firebaseUser.uid, teamId: tid, role: 'Member', position: pos || 'Player', name: userProfile.name, avatar: userProfile.avatar, joinedAt: new Date().toISOString() }); 
        batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), { userId: firebaseUser.uid, teamId: tid, teamName: tData.teamName, teamCode: code.toUpperCase(), role: 'Member', isPro: tData.isPro || false, planId: tData.planId || (tData.isPro ? 'squad_pro' : 'starter_squad'), joinedAt: new Date().toISOString(), createdBy: tData.createdBy, ownerUserId: tData.ownerUserId || tData.createdBy }); 
        await batch.commit(); 
        setActiveTeamId(tid); 
        return true; 
      } catch (e) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `teams`, operation: 'list' }));
        return false;
      }
    },
    addEvent: (e: any) => activeTeam?.id && addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'events'), { ...e, teamId: activeTeam.id, createdBy: firebaseUser?.uid, createdAt: new Date().toISOString(), userRsvps: {} }),
    updateEvent: (id: string, e: any) => activeTeam?.id && updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'events', id), e),
    deleteEvent: (id: string) => activeTeam?.id && deleteDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'events', id)),
    addGame: (g: any) => activeTeam?.id && addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'games'), { ...g, teamId: activeTeam.id, createdBy: firebaseUser?.uid, createdAt: new Date().toISOString() }),
    updateGame: (id: string, g: any) => activeTeam?.id && updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'games', id), g),
    addDrill: (d: any) => activeTeam?.id && addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'drills'), { ...d, teamId: activeTeam.id, createdBy: firebaseUser?.uid, createdAt: new Date().toISOString() }),
    deleteDrill: (id: string) => activeTeam?.id && deleteDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'drills', id)),
    addFile: (n: string, t: string, s: string, u: string) => activeTeam?.id && addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'files'), { name: n, type: t, size: s, url: u, teamId: activeTeam.id, uploadedBy: userProfile?.name, uploaderId: firebaseUser?.uid, date: new Date().toISOString() }),
    deleteFile: (id: string) => activeTeam?.id && deleteDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'files', id)),
    createChat: async (name: string, memberIds: string[]) => { 
      if (!activeTeam?.id || !firebaseUser) return ''; 
      try {
        const docRef = await addDoc(collection(db, 'teams', activeTeam.id, 'groupChats'), { teamId: activeTeam.id, name, memberIds: [...memberIds, firebaseUser.uid], createdBy: firebaseUser.uid, createdAt: new Date().toISOString(), lastMessage: '', unread: 0 }); 
        return docRef.id; 
      } catch (e) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `teams/${activeTeam.id}/groupChats`, operation: 'create' }));
        return '';
      }
    },
    addMessage: (cid: string, auth: string, content: string, type: string, img?: string, poll?: any) => activeTeam?.id && addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'groupChats', cid, 'messages'), { author: auth, authorId: firebaseUser?.uid, content, type, imageUrl: img || null, poll: poll || null, createdAt: new Date().toISOString() }),
    votePoll: async (cid: string, mid: string, oidx: number) => { 
      if (!activeTeam?.id || !firebaseUser) return; 
      try {
        const ref = doc(db, 'teams', activeTeam.id, 'groupChats', cid, 'messages', mid); 
        const snap = await getDocs(query(collection(db, 'teams', activeTeam.id, 'groupChats', cid, 'messages'), where('__name__', '==', mid))); 
        if (snap.empty) return; 
        const poll = snap.docs[0].data().poll; 
        const current = poll.voters?.[firebaseUser.uid]; 
        const u: any = { [`poll.voters.${firebaseUser.uid}`]: oidx }; 
        if (current === undefined) { u[`poll.options.${oidx}.votes`] = poll.options[oidx].votes + 1; u['poll.totalVotes'] = poll.totalVotes + 1; } else if (current !== oidx) { u[`poll.options.${current}.votes`] = poll.options[current].votes - 1; u[`poll.options.${oidx}.votes`] = poll.options[oidx].votes + 1; } 
        updateDocumentNonBlocking(ref, u); 
      } catch (e) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `teams/${activeTeam.id}/groupChats/${cid}/messages/${mid}`, operation: 'update' }));
      }
    },
    updateRSVP: (eid: string, s: string) => { 
      if (activeTeam?.id && firebaseUser) { 
        const ref = doc(db, 'teams', activeTeam.id, 'events', eid); 
        updateDocumentNonBlocking(ref, { [`userRsvps.${firebaseUser.uid}`]: s }); 
      } 
    },
    addRegistration: async (tid: string, eid: string, d: any) => { try { await addDoc(collection(db, 'teams', tid, 'events', eid, 'registrations'), { ...d, status: 'pending', createdAt: new Date().toISOString() }); return true; } catch { return false; } },
    promoteToRoster: async (tid: string, eid: string, reg: any) => { 
      if (!firebaseUser) return; 
      try { 
        const mid = `member_${Date.now()}`; 
        await setDoc(doc(db, 'teams', tid, 'members', mid), { userId: `ext_${Date.now()}`, teamId: tid, name: reg.name, role: 'Member', position: 'Player', avatar: '', joinedAt: new Date().toISOString() }); 
        await deleteDoc(doc(db, 'teams', tid, 'events', eid, 'registrations', reg.id)); 
        toast({ title: "Promoted to Roster" }); 
      } catch (e) { 
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `teams/${tid}/members`, operation: 'create' }));
      } 
    },
    updateMember: (mid: string, updates: Partial<Member>) => {
      if (activeTeam?.id) {
        updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'members', mid), updates);
      }
    },
    submitLead: async (data: any) => { try { await addDoc(collection(db, 'leads'), { ...data, createdAt: new Date().toISOString() }); return true; } catch { return false; } },
    alerts,
    createAlert: async (title: string, message: string) => {
      if (!activeTeam?.id || !firebaseUser) return;
      addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'alerts'), {
        teamId: activeTeam.id,
        title,
        message,
        createdBy: firebaseUser.uid,
        createdAt: new Date().toISOString()
      });
    },
    isLoading: isUserLoading, 
    isSuperAdmin,
    isPro,
    hasFeature: (key: string) => !!activePlanFeatures[key] || (isSuperAdmin && !simulationPlanId),
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
    resetDemo: async () => { if (userProfile?.isDemo && db && firebaseUser) { await resetDemoEnvironment(db, activeTeamId || '', userProfile.activePlanId || 'starter_squad', firebaseUser.uid); toast({ title: "Environment Re-seeded" }); } },
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

      try {
        await batch.commit();
        toast({ title: "Quota Resolved" });
      } catch (e) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `teams`, operation: 'update' }));
      }
    },
    assignManualPlan: async (targetUserId: string, planId: string, limit: number) => {
      if (!isSuperAdmin || !db) return;
      
      try {
        const timestamp = new Date().toISOString();
        const batch = writeBatch(db);
        
        batch.update(doc(db, 'users', targetUserId), {
          activePlanId: planId,
          proTeamLimit: limit,
          planSource: 'manual'
        });

        batch.set(doc(db, 'subscriptions', targetUserId), {
          userId: targetUserId,
          productId: planId,
          entitlementActive: true,
          proTeamLimit: limit,
          source: 'manual',
          lastSyncedAt: timestamp
        }, { merge: true });

        await batch.commit();
        toast({ title: "Organization Assigned" });
      } catch (e) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `users/${targetUserId}`, operation: 'update' }));
      }
    }
  }), [userProfile, activeTeam, teams, isTeamsLoading, members, isMembersLoading, isUserLoading, isSuperAdmin, isPaywallOpen, isRCInitialized, db, firebaseUser, activePlanFeatures, plans, simulationPlanId, isSeedingDemo, isClubManager, secondsUntilReset, isPro, proQuotaStatus, canAddProTeam, alerts, router]);

  return <TeamContext.Provider value={contextValue}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (context === undefined) throw new Error('useTeam must be used within a TeamProvider');
  return context;
}
