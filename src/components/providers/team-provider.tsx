
"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo } from 'react';
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
  addDoc
} from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { updateDocumentNonBlocking, setDocumentNonBlocking, addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Purchases } from '@revenuecat/purchases-js';
import { seedSubscriptionData, launchDemoEnvironments, resetDemoEnvironment, seedGuestDemoTeam } from '@/lib/db-seeder';
import { useSearchParams } from 'next/navigation';

const REVENUECAT_PUBLIC_API_KEY = 'test_zvlronFHqIFQuWTkgaeWrdyYnkZ';
const PRO_ENTITLEMENT_ID = 'The Squad Pro';

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
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
  planId?: string;
  role?: 'Admin' | 'Member';
  isDemo?: boolean;
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
};

export type Feature = {
  id: string;
  description: string;
  defaultEnabled: boolean;
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
  createNewTeam: (name: string, organizerPosition: string, description?: string) => Promise<void>;
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
  formatTime: (date: string | Date) => string;
  plans: Plan[];
  simulationPlanId: string | null;
  setSimulationPlanId: (pid: string | null) => void;
  resetDemo: () => Promise<void>;
  isSeedingDemo: boolean;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

const SUPER_ADMIN_EMAILS = ['thisearlyseason@gmail.com', 'test@gmail.com'];

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

  const isSuperAdmin = useMemo(() => {
    const email = firebaseUser?.email?.toLowerCase();
    return email ? SUPER_ADMIN_EMAILS.includes(email) : false;
  }, [firebaseUser?.email]);

  useEffect(() => {
    if (isSuperAdmin && db && firebaseUser) {
      seedSubscriptionData(db);
      launchDemoEnvironments(db, firebaseUser.uid);
    }
  }, [isSuperAdmin, db, firebaseUser]);

  // Handle Guest Demo Seeding via URL param
  useEffect(() => {
    const demoIntent = searchParams.get('seed_demo');
    if (demoIntent && firebaseUser && !isSeedingDemo) {
      const runSeeding = async () => {
        setIsSeedingDemo(true);
        try {
          const tid = await seedGuestDemoTeam(db, firebaseUser.uid, demoIntent);
          setActiveTeamId(tid);
          toast({ title: "Demo Ready", description: `You are now exploring the ${demoIntent.replace('_', ' ')} environment.` });
        } catch (e) {
          console.error("Demo seeding failed", e);
        } finally {
          setIsSeedingDemo(false);
        }
      };
      runSeeding();
    }
  }, [searchParams, firebaseUser, db]);

  useEffect(() => {
    if (firebaseUser && !isRCInitialized) {
      try {
        Purchases.configure(REVENUECAT_PUBLIC_API_KEY, firebaseUser.uid);
        const purchases = Purchases.getSharedInstance();
        purchases.getCustomerInfo().then(info => {
          setIsProEntitlementActive(!!info.entitlements.active[PRO_ENTITLEMENT_ID]);
        }).catch(() => {});
        setIsRCInitialized(true);
      } catch (e) { setIsRCInitialized(true); }
    }
  }, [firebaseUser, isRCInitialized]);

  useEffect(() => {
    if (firebaseUser) {
      const unsub = onSnapshot(doc(db, 'users', firebaseUser.uid), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserProfile({
            id: firebaseUser.uid,
            name: data.fullName || firebaseUser.displayName || 'Anonymous Guest',
            email: data.email || firebaseUser.email || '',
            phone: data.phone || '',
            avatar: data.avatarUrl || `https://picsum.photos/seed/${firebaseUser.uid}/150/150`
          });
        }
      });
      return () => unsub();
    }
  }, [firebaseUser, db]);

  const teamsQuery = useMemoFirebase(() => {
    if (!firebaseUser || !db) return null;
    const base = isSuperAdmin ? collection(db, 'teams') : collection(db, 'users', firebaseUser.uid, 'teamMemberships');
    return query(base, limit(50));
  }, [firebaseUser?.uid, db, isSuperAdmin]);

  const { data: teamsRawData, isLoading: isTeamsLoading } = useCollection(teamsQuery);
  const teams = useMemo(() => {
    if (!teamsRawData) return [];
    return teamsRawData.map(m => {
      // Use document ID as primary fallback for team ID
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
        planId: m.planId || (m.isPro ? 'squad_pro' : 'starter_squad'),
        role: m.role || (isSuperAdmin ? 'Admin' : 'Member'),
        isDemo: m.isDemo || false
      };
    });
  }, [teamsRawData, isSuperAdmin]);

  const activeTeam = useMemo(() => {
    if (!teams.length) return null;
    return teams.find(t => t.id === activeTeamId) || teams[0];
  }, [teams, activeTeamId]);

  const plansQuery = useMemoFirebase(() => {
    if (!db) return null;
    return collection(db, 'plans');
  }, [db]);
  const { data: plansData } = useCollection(plansQuery);
  const plans = useMemo(() => (plansData || []) as Plan[], [plansData]);
  
  const activePlanFeatures = useMemo(() => {
    const pid = simulationPlanId || activeTeam?.planId;
    if (!pid || !plans) return {};
    const plan = plans.find(p => p.id === pid);
    return plan?.features || {};
  }, [activeTeam, plans, simulationPlanId]);

  const membersQuery = useMemoFirebase(() => {
    if (!activeTeam?.id || !db) return null;
    return collection(db, 'teams', activeTeam.id, 'members');
  }, [activeTeam?.id, db]);
  const { data: membersData } = useCollection(membersQuery);
  const members = useMemo(() => (membersData || []).map(m => ({
    id: m.id, userId: m.userId, teamId: m.teamId, name: m.name || 'Member', role: m.role, position: m.position || 'Player', jersey: m.jersey || 'TBD', avatar: m.avatar || `https://picsum.photos/seed/${m.userId}/150/150`, phone: m.phone, feesPaid: m.feesPaid || false, amountOwed: m.amountOwed || 0, fees: m.fees || [], birthdate: m.birthdate, parentName: m.parentName, parentEmail: m.parentEmail, parentPhone: m.parentPhone, emergencyContactName: m.emergencyContactName, emergencyContactPhone: m.emergencyContactPhone, notes: m.notes
  })), [membersData]);

  const alertsQuery = useMemoFirebase(() => {
    if (!activeTeam?.id || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'alerts'), limit(5));
  }, [activeTeam?.id, db]);
  const { data: alertsData } = useCollection(alertsQuery);
  const alerts = useMemo(() => (alertsData || []).map(a => ({ id: a.id, teamId: a.teamId, title: a.title, message: a.message, createdBy: a.createdBy, createdAt: a.createdAt })), [alertsData]);

  const contextValue = useMemo(() => ({
    user: userProfile, 
    updateUser: (updates: Partial<UserProfile>) => { if (firebaseUser) updateDocumentNonBlocking(doc(db, 'users', firebaseUser.uid), updates); },
    activeTeam, 
    setActiveTeam: (t: Team) => setActiveTeamId(t.id),
    updateTeamHero: async (url: string) => { if (activeTeam?.id && firebaseUser) { updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id), { heroImageUrl: url }); updateDocumentNonBlocking(doc(db, 'users', firebaseUser.uid, 'teamMemberships', activeTeam.id), { heroImageUrl: url }); } },
    updateTeamDetails: async (updates: Partial<Team>) => { if (activeTeam?.id && firebaseUser) { const f: any = {}; if (updates.name) f.teamName = updates.name; if (updates.sport) f.sport = updates.sport; if (updates.description) f.description = updates.description; if (updates.teamLogoUrl) f.teamLogoUrl = updates.teamLogoUrl; if (Object.keys(f).length > 0) { updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id), f); updateDocumentNonBlocking(doc(db, 'users', firebaseUser.uid, 'teamMemberships', activeTeam.id), f); } toast({ title: "Squad Updated" }); } },
    updateTeamPlan: async (tid: string, pid: string) => { if (db) { const tRef = doc(db, 'teams', tid); const p = plans.find(p => p.id === pid); updateDocumentNonBlocking(tRef, { planId: pid, isPro: p?.billingType !== 'free' }); const memberships = await getDocs(query(collection(db, 'users'), limit(100))); memberships.forEach(async (uDoc) => { const memRef = doc(db, 'users', uDoc.id, 'teamMemberships', tid); try { await setDoc(memRef, { planId: pid, isPro: p?.billingType !== 'free' }, { merge: true }); } catch {} }); toast({ title: "Plan Synchronized" }); } },
    teams, 
    isTeamsLoading,
    members, 
    updateMember: (id: string, u: any) => activeTeam?.id && updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'members', id), u),
    alerts, 
    createAlert: (t: string, m: string) => { if (activeTeam?.id && firebaseUser) { setDocumentNonBlocking(doc(collection(db, 'teams', activeTeam.id, 'alerts')), { teamId: activeTeam.id, title: t, message: m, createdBy: firebaseUser.uid, createdAt: new Date().toISOString() }, { merge: true }); } },
    createNewTeam: async (name: string, pos: string, description?: string) => { if (!firebaseUser) return; const tid = `team_${Date.now()}`; const code = Math.random().toString(36).substring(2, 8).toUpperCase(); const batch = writeBatch(db); batch.set(doc(db, 'teams', tid), { id: tid, teamName: name, description: description || '', teamCode: code, createdBy: firebaseUser.uid, createdAt: new Date().toISOString(), members: { [firebaseUser.uid]: 'Admin' }, isPro: false, planId: 'starter_squad' }); batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), { userId: firebaseUser.uid, teamId: tid, role: 'Admin', position: pos || 'Coach', name: userProfile?.name || 'Organizer', avatar: userProfile?.avatar || '', joinedAt: new Date().toISOString() }); batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), { userId: firebaseUser.uid, teamId: tid, teamName: name, description: description || '', teamCode: code, role: 'Admin', isPro: false, planId: 'starter_squad', joinedAt: new Date().toISOString() }); await batch.commit(); setActiveTeamId(tid); },
    joinTeamWithCode: async (code: string, pos: string) => { if (!firebaseUser || !userProfile) return false; const qT = query(collection(db, 'teams'), where('teamCode', '==', code.toUpperCase()), limit(1)); const snap = await getDocs(qT); if (snap.empty) return false; const tDoc = snap.docs[0]; const tData = tDoc.data(); const tid = tDoc.id; const batch = writeBatch(db); batch.update(doc(db, 'teams', tid), { [`members.${firebaseUser.uid}`]: 'Member' }); batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), { userId: firebaseUser.uid, teamId: tid, role: 'Member', position: pos || 'Player', name: userProfile.name, avatar: userProfile.avatar, joinedAt: new Date().toISOString() }); batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), { userId: firebaseUser.uid, teamId: tid, teamName: tData.teamName, teamCode: code.toUpperCase(), role: 'Member', isPro: tData.isPro || false, planId: tData.planId || (tData.isPro ? 'squad_pro' : 'starter_squad'), joinedAt: new Date().toISOString() }); await batch.commit(); setActiveTeamId(tid); return true; },
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
    isPro: (activeTeam?.isPro || isProEntitlementActive || isSuperAdmin) || (simulationPlanId !== 'starter_squad' && simulationPlanId !== null),
    hasFeature: (featureKey: string) => { if (isSuperAdmin && !simulationPlanId) return true; return !!activePlanFeatures[featureKey]; },
    purchasePro: async () => setIsPaywallOpen(true),
    manageSubscription: async () => { try { await Purchases.getSharedInstance().openCustomerCenter(); } catch { toast({ title: "Error", description: "Failed to open settings.", variant: "destructive" }); } },
    isPaywallOpen, setIsPaywallOpen,
    formatTime: (d: any) => (typeof d === 'string' ? new Date(d) : d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }),
    plans,
    simulationPlanId, setSimulationPlanId,
    resetDemo: async () => { if (activeTeam?.isDemo && db && firebaseUser) { await resetDemoEnvironment(db, activeTeam.id, activeTeam.planId!, firebaseUser.uid); toast({ title: "Environment Reset", description: "Demo data has been restored." }); } },
    isSeedingDemo
  }), [userProfile, activeTeam, teams, isTeamsLoading, members, alerts, isUserLoading, isProEntitlementActive, isSuperAdmin, isPaywallOpen, db, firebaseUser, activePlanFeatures, plans, simulationPlanId, isSeedingDemo]);

  return <TeamContext.Provider value={contextValue}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (context === undefined) throw new Error('useTeam must be used within a TeamProvider');
  return context;
}
