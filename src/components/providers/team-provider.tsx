
"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo, useCallback } from 'react';
import { useFirebase, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
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
  orderBy,
  increment,
  arrayUnion,
  getDoc,
  deleteField,
  collectionGroup
} from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { useRouter, useSearchParams } from 'next/navigation';

export type UserRole = "parent" | "adult_player" | "coach" | "admin";

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  role: UserRole;
  createdAt?: string;
  isDemo?: boolean;
  activePlanId?: string | null;
  proTeamLimit?: number | null;
};

export type PlayerProfile = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  ageGroup?: string;
  isMinor: boolean;
  parentId: string | null;
  userId: string | null;
  hasLogin: boolean;
  createdAt: string;
  joinedTeamIds?: string[];
};

export type Household = {
  id: string;
  parentIds: string[];
  playerIds: string[];
  billingEmail?: string;
  createdAt: string;
};

export type Team = {
  id: string;
  name: string;
  code: string;
  type: "adult" | "youth";
  sport?: string;
  description?: string;
  teamLogoUrl?: string;
  heroImageUrl?: string;
  isPro?: boolean;
  planId?: string;
  role?: 'Admin' | 'Member';
  ownerUserId?: string;
  parentChatEnabled?: boolean;
  parentCommentsEnabled?: boolean;
  contactEmail?: string;
  contactPhone?: string;
  leagueIds?: string[];
  createdBy?: string;
  createdAt?: string;
};

export type Member = {
  id: string;
  userId: string;
  playerId: string;
  teamId: string;
  name: string;
  role: 'Admin' | 'Member';
  position: string;
  jersey: string;
  avatar: string;
  isMinor?: boolean;
  feesPaid?: boolean;
  amountOwed?: number;
  fees?: FeeItem[];
  birthdate?: string;
  phone?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  notes?: string;
  waiverSigned?: boolean;
  transportationWaiverSigned?: boolean;
  medicalClearance?: boolean;
  mediaRelease?: boolean;
  joinedAt?: string;
};

export type FeeItem = {
  id: string;
  title: string;
  amount: number;
  paid: boolean;
  createdAt: string;
};

export type EventType = 'game' | 'practice' | 'meeting' | 'tournament' | 'other';

export type TeamEvent = {
  id: string;
  teamId: string;
  title: string;
  date: string;
  endDate?: string;
  startTime: string;
  endTime?: string;
  location: string;
  description: string;
  eventType: EventType;
  teamName?: string;
  isTournament?: boolean;
  tournamentTeams?: string[];
  tournamentGames?: any[];
  userRsvps?: Record<string, string>;
  createdBy?: string;
};

export type TeamAlert = {
  id: string;
  teamId: string;
  title: string;
  message: string;
  createdAt: string;
  createdBy: string;
};

interface TeamContextType {
  user: UserProfile | null;
  activeTeam: Team | null;
  setActiveTeam: (team: Team) => void;
  teams: Team[];
  isTeamsLoading: boolean;
  isSeedingDemo: boolean;
  members: Member[];
  isMembersLoading: boolean;
  currentMember: Member | null;
  isStaff: boolean;
  isPro: boolean;
  isParent: boolean;
  isPlayer: boolean;
  isSuperAdmin: boolean;
  isClubManager: boolean;
  household: Household | null;
  householdEvents: TeamEvent[];
  householdBalance: number;
  alerts: TeamAlert[];
  plans: any[];
  isPlansLoading: boolean;
  proQuotaStatus: { current: number; limit: number; remaining: number; exceeded: boolean };
  isPaywallOpen: boolean;
  setIsPaywallOpen: (open: boolean) => void;
  myChildren: PlayerProfile[];
  hasFeature: (id: string) => boolean;
  createNewTeam: (name: string, type: "adult" | "youth", pos: string, description?: string, planId?: string) => Promise<string>;
  joinTeamWithCode: (code: string, playerId: string, position: string) => Promise<boolean>;
  registerChild: (firstName: string, lastName: string, dob: string) => Promise<string>;
  upgradeChildToLogin: (playerId: string, email: string) => Promise<void>;
  updateUser: (updates: Partial<UserProfile>) => Promise<void>;
  updateMember: (memberId: string, updates: Partial<Member>) => Promise<void>;
  updateTeamDetails: (updates: Partial<Team>) => Promise<void>;
  updateTeamHero: (url: string) => Promise<void>;
  updateTeamPlan: (teamId: string, planId: string) => Promise<void>;
  createAlert: (title: string, message: string) => Promise<void>;
  purchasePro: () => void;
  manageSubscription: () => void;
  resetSeasonData: () => Promise<void>;
  updateStaffEvaluation: (memberId: string, note: string) => Promise<void>;
  getStaffEvaluation: (memberId: string) => Promise<string>;
  addEvent: (data: any) => Promise<boolean>;
  updateEvent: (id: string, data: any) => Promise<boolean>;
  deleteEvent: (id: string) => Promise<void>;
  updateRSVP: (eventId: string, status: string) => Promise<void>;
  addRegistration: (teamId: string, eventId: string, data: any) => Promise<boolean>;
  signTeamTournamentWaiver: (teamId: string, eventId: string, teamName: string) => Promise<void>;
  signPublicTournamentWaiver: (teamId: string, eventId: string, teamName: string, coachName: string) => Promise<boolean>;
  submitMatchScore: (teamId: string, eventId: string, gameId: string, isTeam1: boolean, s1: number, s2: number) => Promise<void>;
  disputeMatchScore: (teamId: string, eventId: string, gameId: string, notes: string) => Promise<void>;
  addDrill: (data: any) => Promise<void>;
  deleteDrill: (id: string) => Promise<void>;
  addFile: (name: string, type: string, size: number, url: string, cat: string, desc: string) => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
  addMediaComment: (fileId: string, text: string) => Promise<void>;
  markMediaAsViewed: (fileId: string) => Promise<void>;
  addScoutingReport: (data: any) => Promise<void>;
  deleteScoutingReport: (id: string) => Promise<void>;
  addEquipmentItem: (data: any) => Promise<void>;
  returnEquipment: (id: string, userId: string) => Promise<void>;
  assignEquipment: (id: string, userId: string, userName: string, qty: number) => Promise<void>;
  deleteEquipmentItem: (id: string) => Promise<void>;
  addFundraisingOpportunity: (data: any) => Promise<void>;
  signUpForFundraising: (id: string) => Promise<void>;
  updateFundraisingAmount: (id: string, amt: number) => Promise<void>;
  deleteFundraisingOpportunity: (id: string) => Promise<void>;
  addGame: (data: any) => Promise<void>;
  updateGame: (id: string, data: any) => Promise<void>;
  createLeague: (name: string) => Promise<void>;
  inviteTeamToLeague: (id: string, name: string, email: string) => Promise<void>;
  manuallyAddTeamToLeague: (id: string, name: string, email: string, logo: string) => Promise<void>;
  acceptLeagueInvite: (inviteId: string, leagueId: string) => Promise<void>;
  saveLeagueRegistrationConfig: (leagueId: string, data: any) => Promise<void>;
  assignEntryToTeam: (leagueId: string, entryId: string, teamId: string | null) => Promise<void>;
  toggleRegistrationPaymentStatus: (leagueId: string, entryId: string, paid: boolean) => Promise<void>;
  submitRegistrationEntry: (leagueId: string, answers: any, version: number) => Promise<void>;
  respondToAssignment: (leagueId: string, entryId: string, status: 'accepted' | 'declined') => Promise<void>;
  addVolunteerOpportunity: (data: any) => Promise<void>;
  signUpForVolunteer: (id: string) => Promise<void>;
  verifyVolunteerHours: (oppId: string, userId: string, hours: number) => Promise<void>;
  deleteVolunteerOpportunity: (id: string) => Promise<void>;
  addMessage: (chatId: string, author: string, content: string, type: string, img?: string, poll?: any) => Promise<void>;
  votePoll: (chatId: string, msgId: string, optIdx: number) => Promise<void>;
  createChat: (name: string, members: string[]) => Promise<string>;
  deleteChat: (chatId: string) => Promise<void>;
  hideChatForUser: (chatId: string) => Promise<void>;
  resolveQuota: (selectedIds: string[]) => Promise<void>;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

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

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user: firebaseUser, isAuthResolved } = useFirebase();
  const db = useFirestore();
  const router = useRouter();
  
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [myChildren, setMyChildren] = useState<PlayerProfile[]>([]);
  const [isSeedingDemo, setIsSeedingDemo] = useState(false);
  const [household, setHousehold] = useState<Household | null>(null);
  const [householdEvents, setHouseholdEvents] = useState<TeamEvent[]>([]);
  const [householdBalance, setHouseholdBalance] = useState(0);

  const plansQuery = useMemoFirebase(() => (db && isAuthResolved && firebaseUser) ? collection(db, 'plans') : null, [db, isAuthResolved, firebaseUser]);
  const { data: plansData, isLoading: isPlansLoading } = useCollection(plansQuery);
  const plans = plansData || [];

  const isSuperAdmin = useMemo(() => userProfile?.email === 'thisearlyseason@gmail.com' || userProfile?.email === 'test@gmail.com', [userProfile?.email]);

  const hasFeature = useCallback((featureId: string) => {
    if (isSuperAdmin) return true;
    if (!activeTeamId) return false;
    const team = teamsData?.find(t => (t.teamId || t.id) === activeTeamId);
    if (!team) return false;
    const plan = plans.find(p => p.id === (team.planId || 'starter_squad'));
    return !!plan?.features?.[featureId];
  }, [isSuperAdmin, activeTeamId, plans, plansData]);

  // Sync User
  useEffect(() => {
    if (!firebaseUser?.uid || !db || !isAuthResolved) return;
    return onSnapshot(doc(db, 'users', firebaseUser.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUserProfile({
          id: firebaseUser.uid,
          name: data.fullName || data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          avatar: data.avatarUrl || data.avatar || '',
          role: data.role || 'adult_player',
          activePlanId: data.activePlanId,
          proTeamLimit: data.proTeamLimit || 0,
          createdAt: data.createdAt,
          isDemo: data.isDemo
        });
      }
    });
  }, [firebaseUser?.uid, db, isAuthResolved]);

  // Sync Household
  useEffect(() => {
    if (!firebaseUser?.uid || !db || !isAuthResolved || userProfile?.role !== 'parent') return;
    return onSnapshot(doc(db, 'households', firebaseUser.uid), async (snap) => {
      if (snap.exists()) {
        setHousehold({ id: snap.id, ...snap.data() } as Household);
      } else {
        await setDoc(doc(db, 'households', firebaseUser.uid), {
          id: firebaseUser.uid, parentIds: [firebaseUser.uid], playerIds: [], createdAt: new Date().toISOString()
        });
      }
    });
  }, [firebaseUser?.uid, db, userProfile?.role, isAuthResolved]);

  // Sync Children
  useEffect(() => {
    if (!firebaseUser?.uid || !db || !isAuthResolved || userProfile?.role !== 'parent') return;
    const q = query(collection(db, 'players'), where('parentId', '==', firebaseUser.uid));
    return onSnapshot(q, (snap) => {
      const children = snap.docs.map(d => ({ id: d.id, ...d.data() } as PlayerProfile));
      setMyChildren(children);
    });
  }, [firebaseUser?.uid, db, userProfile?.role, isAuthResolved]);

  // Household Aggregate Data
  useEffect(() => {
    if (!myChildren.length || !db) return;
    const allTeamIds = Array.from(new Set(myChildren.flatMap(c => c.joinedTeamIds || [])));
    if (!allTeamIds.length) { setHouseholdEvents([]); setHouseholdBalance(0); return; }

    const eventsQ = query(collectionGroup(db, 'events'), where('teamId', 'in', allTeamIds.slice(0, 30)));
    const unsubEvents = onSnapshot(eventsQ, (snap) => {
      setHouseholdEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as TeamEvent)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    });

    const membersQ = query(collectionGroup(db, 'members'), where('playerId', 'in', myChildren.map(c => c.id)));
    const unsubMembers = onSnapshot(membersQ, (snap) => {
      setHouseholdBalance(snap.docs.reduce((sum, d) => sum + (d.data().amountOwed || 0), 0));
    });

    return () => { unsubEvents(); unsubMembers(); };
  }, [myChildren, db]);

  const teamsQuery = useMemoFirebase(() => (isAuthResolved && firebaseUser?.uid && db) ? query(collection(db, 'users', firebaseUser.uid, 'teamMemberships')) : null, [isAuthResolved, firebaseUser?.uid, db]);
  const { data: teamsData, isLoading: isTeamsLoading } = useCollection(teamsQuery);
  const teams = useMemo(() => (teamsData || []).map(m => ({
    id: m.teamId || m.id, name: m.teamName, code: m.teamCode, type: m.type, isPro: m.isPro, planId: m.planId, role: m.role,
    ownerUserId: m.ownerUserId, sport: m.sport, parentChatEnabled: m.parentChatEnabled ?? true, parentCommentsEnabled: m.parentCommentsEnabled ?? true,
    heroImageUrl: m.heroImageUrl, teamLogoUrl: m.teamLogoUrl, leagueIds: m.leagueIds, createdBy: m.createdBy
  })), [teamsData]);

  const activeTeam = useMemo(() => teams.find(t => t.id === activeTeamId) || teams[0] || null, [teams, activeTeamId]);

  const membersQuery = useMemoFirebase(() => (isAuthResolved && activeTeam?.id && db) ? query(collection(db, 'teams', activeTeam.id, 'members')) : null, [isAuthResolved, activeTeam?.id, db]);
  const { data: membersData, isLoading: isMembersLoading } = useCollection<Member>(membersQuery);
  const members = useMemo(() => membersData || [], [membersData]);

  const alertsQuery = useMemoFirebase(() => (isAuthResolved && activeTeam?.id && db) ? query(collection(db, 'teams', activeTeam.id, 'alerts'), orderBy('createdAt', 'desc'), limit(10)) : null, [isAuthResolved, activeTeam?.id, db]);
  const { data: alertsData } = useCollection<TeamAlert>(alertsQuery);
  const alerts = alertsData || [];

  const proQuotaStatus = useMemo(() => {
    const limitCount = userProfile?.proTeamLimit ?? 0;
    const current = teams.filter(t => t.ownerUserId === firebaseUser?.uid && t.isPro).length;
    return { current, limit: limitCount, remaining: Math.max(0, limitCount - current), exceeded: current > limitCount };
  }, [teams, userProfile, firebaseUser?.uid]);

  const value = {
    user: userProfile, activeTeam, setActiveTeam: (t: Team) => setActiveTeamId(t.id), teams, isTeamsLoading, isSeedingDemo, members, isMembersLoading, alerts,
    currentMember: members.find(m => m.userId === firebaseUser?.uid) || null,
    isStaff: activeTeam?.role === 'Admin', isPro: activeTeam?.isPro || false, isParent: userProfile?.role === 'parent', isPlayer: userProfile?.role === 'adult_player',
    isSuperAdmin, isClubManager: !!userProfile?.activePlanId?.includes('squad_organization'), household, householdEvents, householdBalance, myChildren, plans, isPlansLoading, proQuotaStatus,
    isPaywallOpen, setIsPaywallOpen, purchasePro: () => setIsPaywallOpen(true), hasFeature,
    createNewTeam: async (name: string, type: "adult" | "youth", pos: string, description?: string, planId?: string) => {
      if (!firebaseUser) return '';
      const tid = `team_${Date.now()}`;
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const pId = planId || 'starter_squad';
      const batch = writeBatch(db);
      const teamData = clean({ id: tid, teamName: name, teamCode: code, type, createdBy: firebaseUser.uid, ownerUserId: firebaseUser.uid, createdAt: new Date().toISOString(), isPro: pId !== 'starter_squad', planId: pId, sport: 'Multi-Sport', members: { [firebaseUser.uid]: 'admin' } });
      batch.set(doc(db, 'teams', tid), teamData);
      batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), clean({ id: firebaseUser.uid, userId: firebaseUser.uid, teamId: tid, role: 'Admin', position: pos, name: userProfile?.name || 'Coach', avatar: userProfile?.avatar || '', joinedAt: new Date().toISOString(), jersey: 'HQ' }));
      batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), clean({ teamId: tid, teamName: name, teamCode: code, type, role: 'Admin', isPro: pId !== 'starter_squad', planId: pId, ownerUserId: firebaseUser.uid, teamLogoUrl: '', sport: 'Multi-Sport' }));
      await batch.commit(); return tid;
    },
    joinTeamWithCode: async (code: string, playerId: string, position: string) => {
      if (!firebaseUser || !db) return false;
      const q = query(collection(db, 'teams'), where('teamCode', '==', (code || '').toUpperCase()), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) { toast({ title: "Invalid Code", variant: "destructive" }); return false; }
      const tDoc = snap.docs[0]; const tid = tDoc.id; const tData = tDoc.data();
      const playerSnap = await getDoc(doc(db, 'players', playerId)); const pData = playerSnap.data();
      const batch = writeBatch(db);
      batch.update(doc(db, 'players', playerId), { joinedTeamIds: arrayUnion(tid) });
      batch.set(doc(db, 'teams', tid, 'members', playerId), clean({ id: playerId, userId: firebaseUser.uid, playerId, teamId: tid, role: 'Member', position, name: `${pData?.firstName || ''} ${pData?.lastName || ''}`, avatar: '', isMinor: !!pData?.isMinor, joinedAt: new Date().toISOString(), jersey: 'TBD' }));
      if (playerId !== `p_${firebaseUser.uid}`) {
        batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), clean({ id: firebaseUser.uid, userId: firebaseUser.uid, playerId: 'guardian', teamId: tid, role: 'Member', position: 'Parent', name: userProfile?.name || 'Guardian', avatar: userProfile?.avatar || '', joinedAt: new Date().toISOString(), jersey: 'HQ' }));
      }
      batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), clean({ teamId: tid, teamName: tData.teamName, teamCode: (code || '').toUpperCase(), type: tData.type, role: 'Member', ownerUserId: tData.ownerUserId || '', isPro: !!tData.isPro, planId: tData.planId || 'starter_squad', teamLogoUrl: tData.teamLogoUrl || '', sport: tData.sport || 'Multi-Sport' }));
      batch.update(doc(db, 'teams', tid), { [`members.${firebaseUser.uid}`]: 'member' });
      await batch.commit(); toast({ title: "Welcome to the Squad!" }); return true;
    },
    registerChild: async (firstName: string, lastName: string, dob: string) => {
      if (!firebaseUser) return '';
      const docRef = await addDoc(collection(db, 'players'), clean({ firstName, lastName, dateOfBirth: dob, isMinor: true, parentId: firebaseUser.uid, hasLogin: false, createdAt: new Date().toISOString(), joinedTeamIds: [] }));
      return docRef.id;
    },
    upgradeChildToLogin: async (playerId: string, email: string) => {
      if (!firebaseUser) return;
      await updateDoc(doc(db, 'players', playerId), { hasLogin: true, inviteEmail: (email || '').toLowerCase() });
      toast({ title: "Invite Dispatched" });
    },
    updateUser: async (updates: Partial<UserProfile>) => {
      if (!firebaseUser) return;
      await updateDoc(doc(db, 'users', firebaseUser.uid), clean(updates));
    },
    updateMember: async (memberId: string, updates: Partial<Member>) => {
      if (!activeTeam) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'members', memberId), clean(updates));
    },
    updateTeamDetails: async (updates: Partial<Team>) => {
      if (!activeTeam) return;
      await updateDoc(doc(db, 'teams', activeTeam.id), clean(updates));
    },
    updateTeamHero: async (url: string) => {
      if (!activeTeam) return;
      await updateDoc(doc(db, 'teams', activeTeam.id), { heroImageUrl: url });
    },
    updateTeamPlan: async (tid: string, pid: string) => {
      const plan = plans.find(p => p.id === pid);
      await updateDoc(doc(db, 'teams', tid), { planId: pid, isPro: pid !== 'starter_squad' });
      await updateDoc(doc(db, 'users', firebaseUser!.uid, 'teamMemberships', tid), { planId: pid, isPro: pid !== 'starter_squad' });
    },
    createAlert: async (title: string, message: string) => {
      if (!activeTeam || !firebaseUser) return;
      await addDoc(collection(db, 'teams', activeTeam.id, 'alerts'), { title, message, createdAt: new Date().toISOString(), createdBy: firebaseUser.uid });
      toast({ title: "Alert Broadcasted" });
    },
    manageSubscription: () => router.push('/pricing'),
    resetSeasonData: async () => {
      if (!activeTeam) return;
      const batch = writeBatch(db);
      const gs = await getDocs(collection(db, 'teams', activeTeam.id, 'games'));
      gs.forEach(d => batch.delete(d.ref));
      const es = await getDocs(collection(db, 'teams', activeTeam.id, 'events'));
      es.forEach(d => batch.delete(d.ref));
      await batch.commit(); toast({ title: "Season Reset Complete" });
    },
    updateStaffEvaluation: async (mid: string, note: string) => {
      if (!activeTeam) return;
      await setDoc(doc(db, 'teams', activeTeam.id, 'members', mid, 'private', 'evaluation'), { note, updatedAt: new Date().toISOString() });
    },
    getStaffEvaluation: async (mid: string) => {
      if (!activeTeam) return '';
      const s = await getDoc(doc(db, 'teams', activeTeam.id, 'members', mid, 'private', 'evaluation'));
      return s.exists() ? s.data().note : '';
    },
    addEvent: async (data: any) => {
      if (!activeTeam) return false;
      await addDoc(collection(db, 'teams', activeTeam.id, 'events'), clean({ ...data, teamId: activeTeam.id }));
      return true;
    },
    updateEvent: async (id: string, data: any) => {
      if (!activeTeam) return false;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'events', id), clean(data));
      return true;
    },
    deleteEvent: async (id: string) => {
      if (!activeTeam) return;
      await deleteDoc(doc(db, 'teams', activeTeam.id, 'events', id));
    },
    updateRSVP: async (eid: string, status: string) => {
      if (!activeTeam || !firebaseUser) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'events', eid), { [`userRsvps.${firebaseUser.uid}`]: status });
    },
    addRegistration: async (tid: string, eid: string, data: any) => {
      await addDoc(collection(db, 'teams', tid, 'events', eid, 'registrations'), clean({ ...data, createdAt: new Date().toISOString() }));
      return true;
    },
    signTeamTournamentWaiver: async (tid: string, eid: string, tname: string) => {
      await updateDoc(doc(db, 'teams', tid, 'events', eid), { [`teamAgreements.${tname}`]: { agreed: true, signedAt: new Date().toISOString() } });
    },
    signPublicTournamentWaiver: async (tid: string, eid: string, tname: string, cname: string) => {
      await updateDoc(doc(db, 'teams', tid, 'events', eid), { [`teamAgreements.${tname}`]: { agreed: true, signedAt: new Date().toISOString(), coachName: cname } });
      return true;
    },
    submitMatchScore: async (tid: string, eid: string, gid: string, isT1: boolean, s1: number, s2: number) => {
      const e = await getDoc(doc(db, 'teams', tid, 'events', eid));
      const gs = e.data()?.tournamentGames || [];
      const updated = gs.map((g: any) => g.id === gid ? { ...g, score1: s1, score2: s2, isCompleted: true } : g);
      await updateDoc(doc(db, 'teams', tid, 'events', eid), { tournamentGames: updated });
    },
    disputeMatchScore: async (tid: string, eid: string, gid: string, notes: string) => {
      const e = await getDoc(doc(db, 'teams', tid, 'events', eid));
      const gs = e.data()?.tournamentGames || [];
      const updated = gs.map((g: any) => g.id === gid ? { ...g, isDisputed: true, disputeNotes: notes } : g);
      await updateDoc(doc(db, 'teams', tid, 'events', eid), { tournamentGames: updated });
    },
    addDrill: async (data: any) => {
      if (!activeTeam) return;
      await addDoc(collection(db, 'teams', activeTeam.id, 'drills'), clean(data));
    },
    deleteDrill: async (id: string) => {
      if (!activeTeam) return;
      await deleteDoc(doc(db, 'teams', activeTeam.id, 'drills', id));
    },
    addFile: async (name: string, type: string, size: number, url: string, cat: string, desc: string) => {
      if (!activeTeam) return;
      await addDoc(collection(db, 'teams', activeTeam.id, 'files'), clean({ name, type, sizeBytes: size, url, category: cat, description: desc, date: new Date().toISOString() }));
    },
    deleteFile: async (id: string) => {
      if (!activeTeam) return;
      await deleteDoc(doc(db, 'teams', activeTeam.id, 'files', id));
    },
    addMediaComment: async (fid: string, text: string) => {
      if (!activeTeam || !userProfile) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'files', fid), { comments: arrayUnion({ id: Date.now().toString(), text, authorName: userProfile.name, createdAt: new Date().toISOString() }) });
    },
    markMediaAsViewed: async (fid: string) => {
      if (!activeTeam || !firebaseUser) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'files', fid), { [`viewedBy.${firebaseUser.uid}`]: true });
    },
    addScoutingReport: async (data: any) => {
      if (!activeTeam) return;
      await addDoc(collection(db, 'teams', activeTeam.id, 'scouting'), clean(data));
    },
    deleteScoutingReport: async (id: string) => {
      if (!activeTeam) return;
      await deleteDoc(doc(db, 'teams', activeTeam.id, 'scouting', id));
    },
    addEquipmentItem: async (data: any) => {
      if (!activeTeam) return;
      await addDoc(collection(db, 'teams', activeTeam.id, 'equipment'), clean({ ...data, availableQuantity: data.totalQuantity, status: 'Active' }));
    },
    returnEquipment: async (id: string, uid: string) => {
      if (!activeTeam) return;
      const ref = doc(db, 'teams', activeTeam.id, 'equipment', id);
      const s = await getDoc(ref); const qty = s.data()?.assignments?.[uid]?.quantity || 0;
      await updateDoc(ref, { [`assignments.${uid}`]: deleteField(), availableQuantity: increment(qty) });
    },
    assignEquipment: async (id: string, uid: string, uname: string, qty: number) => {
      if (!activeTeam) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'equipment', id), { [`assignments.${uid}`]: { userId: uid, userName: uname, quantity: qty, date: new Date().toISOString() }, availableQuantity: increment(-qty) });
    },
    deleteEquipmentItem: async (id: string) => {
      if (!activeTeam) return;
      await deleteDoc(doc(db, 'teams', activeTeam.id, 'equipment', id));
    },
    addFundraisingOpportunity: async (data: any) => {
      if (!activeTeam) return;
      await addDoc(collection(db, 'teams', activeTeam.id, 'fundraising'), clean({ ...data, currentAmount: 0 }));
    },
    signUpForFundraising: async (id: string) => {
      if (!activeTeam || !userProfile) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'fundraising', id), { [`participants.${userProfile.id}`]: { userId: userProfile.id, name: userProfile.name, joinedAt: new Date().toISOString() } });
    },
    updateFundraisingAmount: async (id: string, amt: number) => {
      if (!activeTeam) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'fundraising', id), { currentAmount: increment(amt) });
    },
    deleteFundraisingOpportunity: async (id: string) => {
      if (!activeTeam) return;
      await deleteDoc(doc(db, 'teams', activeTeam.id, 'fundraising', id));
    },
    addGame: async (data: any) => {
      if (!activeTeam) return;
      await addDoc(collection(db, 'teams', activeTeam.id, 'games'), clean({ ...data, teamId: activeTeam.id }));
    },
    updateGame: async (id: string, data: any) => {
      if (!activeTeam) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'games', id), clean(data));
    },
    createLeague: async (name: string) => {
      if (!firebaseUser) return;
      const lid = `league_${Date.now()}`;
      await setDoc(doc(db, 'leagues', lid), clean({ id: lid, name, creatorId: firebaseUser.uid, createdAt: new Date().toISOString(), teams: {} }));
    },
    inviteTeamToLeague: async (lid: string, lname: string, email: string) => {
      await addDoc(collection(db, 'leagues', 'global', 'invites'), clean({ leagueId: lid, leagueName: lname, invitedEmail: email, status: 'pending', createdAt: new Date().toISOString() }));
      toast({ title: "Invite Dispatched" });
    },
    manuallyAddTeamToLeague: async (lid: string, tname: string, email: string, logo: string) => {
      await updateDoc(doc(db, 'leagues', lid), { [`teams.manual_${Date.now()}`]: { teamName: tname, coachEmail: email, teamLogoUrl: logo, wins: 0, losses: 0, ties: 0, points: 0 } });
    },
    acceptLeagueInvite: async (iid: string, lid: string) => {
      if (!activeTeam) return;
      await updateDoc(doc(db, 'leagues', lid), { [`teams.${activeTeam.id}`]: { teamName: activeTeam.name, teamLogoUrl: activeTeam.teamLogoUrl || '', wins: 0, losses: 0, ties: 0, points: 0 } });
      await updateDoc(doc(db, 'leagues', 'global', 'invites', iid), { status: 'accepted' });
      await updateDoc(doc(db, 'teams', activeTeam.id), { leagueIds: arrayUnion(lid) });
    },
    saveLeagueRegistrationConfig: async (lid: string, data: any) => {
      await setDoc(doc(db, 'leagues', lid, 'registration', 'config'), clean(data), { merge: true });
    },
    assignEntryToTeam: async (lid: string, eid: string, tid: string | null) => {
      await updateDoc(doc(db, 'leagues', lid, 'registrationEntries', eid), { assigned_team_id: tid, status: tid ? 'assigned' : 'pending' });
    },
    toggleRegistrationPaymentStatus: async (lid: string, eid: string, paid: boolean) => {
      await updateDoc(doc(db, 'leagues', lid, 'registrationEntries', eid), { payment_received: paid });
    },
    submitRegistrationEntry: async (lid: string, answers: any, version: number) => {
      await addDoc(collection(db, 'leagues', lid, 'registrationEntries'), clean({ answers, form_version: version, status: 'pending', created_at: new Date().toISOString(), league_id: lid }));
    },
    respondToAssignment: async (lid: string, eid: string, status: 'accepted' | 'declined') => {
      if (!activeTeam) return;
      await updateDoc(doc(db, 'leagues', lid, 'registrationEntries', eid), { status });
      if (status === 'accepted') {
        const e = await getDoc(doc(db, 'leagues', lid, 'registrationEntries', eid));
        const answers = e.data()?.answers || {};
        await addDoc(collection(db, 'teams', activeTeam.id, 'members'), clean({ id: `reg_${eid}`, name: answers.name || answers.fullName, role: 'Member', position: answers.position || 'Player', jersey: 'TBD', avatar: '', joinedAt: new Date().toISOString() }));
      }
    },
    addVolunteerOpportunity: async (data: any) => {
      if (!activeTeam) return;
      await addDoc(collection(db, 'teams', activeTeam.id, 'volunteers'), clean(data));
    },
    signUpForVolunteer: async (id: string) => {
      if (!activeTeam || !userProfile) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', id), { [`signups.${userProfile.id}`]: { userId: userProfile.id, userName: userProfile.name, status: 'pending' } });
    },
    verifyVolunteerHours: async (oppId: string, uid: string, hours: number) => {
      if (!activeTeam) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), { [`signups.${uid}.status`]: 'verified', [`signups.${uid}.verifiedHours`]: hours });
    },
    deleteVolunteerOpportunity: async (id: string) => {
      if (!activeTeam) return;
      await deleteDoc(doc(db, 'teams', activeTeam.id, 'volunteers', id));
    },
    addMessage: async (cid: string, author: string, content: string, type: string, img?: string, poll?: any) => {
      if (!activeTeam) return;
      await addDoc(collection(db, 'teams', activeTeam.id, 'groupChats', cid, 'messages'), clean({ author, authorId: firebaseUser?.uid, content, type, imageUrl: img, poll, createdAt: new Date().toISOString() }));
    },
    votePoll: async (cid: string, mid: string, oidx: number) => {
      if (!activeTeam || !firebaseUser) return;
      const ref = doc(db, 'teams', activeTeam.id, 'groupChats', cid, 'messages', mid);
      const s = await getDoc(ref); const p = s.data()?.poll; const cur = p.voters?.[firebaseUser.uid];
      const u: any = { [`poll.voters.${firebaseUser.uid}`]: oidx };
      if (cur === undefined) { u[`poll.options.${oidx}.votes`] = increment(1); u['poll.totalVotes'] = increment(1); }
      else if (cur !== oidx) { u[`poll.options.${cur}.votes`] = increment(-1); u[`poll.options.${oidx}.votes`] = increment(1); }
      await updateDoc(ref, u);
    },
    createChat: async (name: string, ms: string[]) => {
      if (!activeTeam || !firebaseUser) return '';
      const ref = await addDoc(collection(db, 'teams', activeTeam.id, 'groupChats'), clean({ name, memberIds: [...ms, firebaseUser.uid], createdBy: firebaseUser.uid, createdAt: new Date().toISOString() }));
      return ref.id;
    },
    deleteChat: async (cid: string) => {
      if (!activeTeam) return;
      await deleteDoc(doc(db, 'teams', activeTeam.id, 'groupChats', cid));
    },
    hideChatForUser: async (cid: string) => {
      if (!activeTeam || !firebaseUser) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'groupChats', cid), { [`memberIds`]: arrayUnion() }); // Logic varies, usually filter out
    },
    resolveQuota: async (ids: string[]) => {
      if (!firebaseUser) return;
      const batch = writeBatch(db);
      teams.forEach(t => {
        if (t.ownerUserId === firebaseUser.uid) {
          const isSelected = ids.includes(t.id);
          batch.update(doc(db, 'teams', t.id), { isPro: isSelected });
          batch.update(doc(db, 'users', firebaseUser.uid, 'teamMemberships', t.id), { isPro: isSelected });
        }
      });
      await batch.commit();
    }
  };

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export const useTeam = () => {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within TeamProvider');
  return context;
};
