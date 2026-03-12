
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
import { useRouter } from 'next/navigation';

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
  teamName?: string;
  isDemo?: boolean;
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
  isDemo?: boolean;
};

export type FeeItem = {
  id: string;
  title: string;
  amount: number;
  paid: boolean;
  createdAt: string;
};

export type TeamDocument = {
  id: string;
  teamId: string;
  title: string;
  content: string;
  type: 'waiver' | 'policy' | 'info';
  assignedTo: string[];
  signatureCount: number;
  createdAt: string;
};

export type DocumentSignature = {
  id: string;
  memberId: string;
  userId: string;
  userName: string;
  signedAt: string;
  signatureText: string;
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
  teamWaiverText?: string;
  teamAgreements?: Record<string, any>;
  fieldIds?: string[];
  manualLocations?: string[];
};

export type Message = {
  id: string;
  author: string;
  authorId: string;
  content: string;
  type: 'text' | 'image' | 'poll';
  imageUrl?: string;
  poll?: any;
  createdAt: string;
};

export type VolunteerOpportunity = {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  slots: number;
  hoursPerSlot: number;
  signups: Record<string, {
    userId: string;
    userName: string;
    status: 'pending' | 'verified';
    verifiedHours?: number;
  }>;
};

export type FundraisingOpportunity = {
  id: string;
  title: string;
  description: string;
  goalAmount: number;
  currentAmount: number;
  deadline: string;
  participants: Record<string, boolean>;
};

export type EquipmentItem = {
  id: string;
  name: string;
  category: string;
  totalQuantity: number;
  availableQuantity: number;
  description: string;
  status: 'Active' | 'Maintenance' | 'Retired';
  assignments: Record<string, {
    userId: string;
    userName: string;
    quantity: number;
    assignedAt: string;
  }>;
};

export type ScoutingReport = {
  id: string;
  opponentName: string;
  date: string;
  strengths: string;
  weaknesses: string;
  keysToVictory: string;
  videoUrl?: string;
};

export type TeamFile = {
  id: string;
  name: string;
  type: string;
  size: string;
  sizeBytes: number;
  url: string;
  category: string;
  description?: string;
  date: string;
  viewedBy?: Record<string, boolean>;
  comments?: Array<{ id: string; authorId: string; authorName: string; text: string; createdAt: string }>;
};

export type League = {
  id: string;
  name: string;
  sport: string;
  teams: Record<string, {
    teamName: string;
    teamLogoUrl?: string;
    wins: number;
    losses: number;
    ties: number;
    points: number;
  }>;
  creatorId: string;
  registrationEnabled?: boolean;
};

export type LeagueInvite = {
  id: string;
  leagueId: string;
  leagueName: string;
  invitedEmail: string;
  status: 'pending' | 'accepted' | 'declined';
};

export type RegistrationFormField = {
  id: string;
  type: 'short_text' | 'long_text' | 'dropdown' | 'checkbox' | 'yes_no' | 'image' | 'header';
  label: string;
  description?: string;
  required?: boolean;
  options?: string[];
};

export type LeagueRegistrationConfig = {
  title: string;
  description: string;
  registration_cost: string;
  payment_instructions: string;
  is_active: boolean;
  form_schema: RegistrationFormField[];
  form_version: number;
};

export type RegistrationEntry = {
  id: string;
  league_id: string;
  answers: Record<string, any>;
  status: 'pending' | 'assigned' | 'accepted' | 'declined';
  assigned_team_id?: string | null;
  assigned_team_owner_id?: string;
  payment_received?: boolean;
  created_at: string;
  form_version: number;
};

export type TournamentGame = {
  id: string;
  team1: string;
  team2: string;
  score1: number;
  score2: number;
  date: string;
  time: string;
  location?: string;
  isCompleted: boolean;
  isDisputed?: boolean;
  disputeNotes?: string;
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
  alerts: any[];
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
  upgradeChildToLogin: (childId: string) => Promise<void>;
  updateUser: (updates: Partial<UserProfile>) => Promise<void>;
  updateMember: (memberId: string, updates: Partial<Member>) => Promise<void>;
  updateTeamDetails: (updates: Partial<Team>) => Promise<void>;
  updateTeamHero: (url: string) => Promise<void>;
  updateTeamPlan: (teamId: string, planId: string) => Promise<void>;
  signTeamDocument: (docId: string, signatureText: string) => Promise<void>;
  createTeamDocument: (data: any) => Promise<void>;
  deleteTeamDocument: (docId: string) => Promise<void>;
  updateStaffEvaluation: (memberId: string, note: string) => Promise<void>;
  getStaffEvaluation: (memberId: string) => Promise<string>;
  addEvent: (data: any) => Promise<boolean>;
  updateEvent: (id: string, data: any) => Promise<boolean>;
  deleteEvent: (id: string) => Promise<void>;
  updateRSVP: (eventId: string, status: string) => Promise<void>;
  addMessage: (chatId: string, author: string, content: string, type: string, img?: string, poll?: any) => Promise<void>;
  votePoll: (chatId: string, msgId: string, optIdx: number) => Promise<void>;
  createChat: (name: string, members: string[]) => Promise<string>;
  deleteChat: (chatId: string) => Promise<void>;
  hideChatForUser: (chatId: string) => Promise<void>;
  formatTime: (date: string | Date) => string;
  resetSquadData: (categories: string[]) => Promise<void>;
  resetSeasonData: () => Promise<void>;
  addVolunteerOpportunity: (data: any) => Promise<void>;
  signUpForVolunteer: (oppId: string) => Promise<void>;
  verifyVolunteerHours: (oppId: string, userId: string, hours: number) => Promise<void>;
  deleteVolunteerOpportunity: (oppId: string) => Promise<void>;
  addFundraisingOpportunity: (data: any) => Promise<void>;
  signUpForFundraising: (fundId: string) => Promise<void>;
  updateFundraisingAmount: (fundId: string, amount: number) => Promise<void>;
  deleteFundraisingOpportunity: (fundId: string) => Promise<void>;
  addEquipmentItem: (data: any) => Promise<void>;
  updateEquipmentItem: (id: string, updates: any) => Promise<void>;
  deleteEquipmentItem: (id: string) => Promise<void>;
  assignEquipment: (itemId: string, userId: string, userName: string, qty: number) => Promise<void>;
  returnEquipment: (itemId: string, userId: string) => Promise<void>;
  addDrill: (data: any) => Promise<void>;
  deleteDrill: (id: string) => Promise<void>;
  addScoutingReport: (data: any) => Promise<void>;
  deleteScoutingReport: (id: string) => Promise<void>;
  addFile: (name: string, type: string, sizeBytes: number, url: string, category: string, desc?: string) => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
  markMediaAsViewed: (id: string) => Promise<void>;
  addMediaComment: (id: string, text: string) => Promise<void>;
  createLeague: (name: string) => Promise<string>;
  inviteTeamToLeague: (leagueId: string, leagueName: string, email: string) => Promise<void>;
  acceptLeagueInvite: (inviteId: string, leagueId: string) => Promise<void>;
  manuallyAddTeamToLeague: (leagueId: string, teamName: string, coachEmail?: string, logoUrl?: string) => Promise<void>;
  saveLeagueRegistrationConfig: (leagueId: string, updates: Partial<LeagueRegistrationConfig>) => Promise<void>;
  submitRegistrationEntry: (leagueId: string, answers: any, version: number) => Promise<void>;
  assignEntryToTeam: (leagueId: string, entryId: string, teamId: string | null) => Promise<void>;
  toggleRegistrationPaymentStatus: (leagueId: string, entryId: string, paid: boolean) => Promise<void>;
  respondToAssignment: (leagueId: string, entryId: string, status: 'accepted' | 'declined') => Promise<void>;
  addRegistration: (teamId: string, eventId: string, data: any) => Promise<boolean>;
  signTeamTournamentWaiver: (teamId: string, eventId: string, tournamentTeamName: string) => Promise<void>;
  signPublicTournamentWaiver: (teamId: string, eventId: string, tournamentTeamName: string, coachName: string) => Promise<boolean>;
  submitMatchScore: (teamId: string, eventId: string, gameId: string, isTeam1: boolean, score1: number, score2: number) => Promise<void>;
  disputeMatchScore: (teamId: string, eventId: string, gameId: string, notes: string) => Promise<void>;
  manageSubscription: () => Promise<void>;
  resolveQuota: (selectedTeamIds: string[]) => Promise<void>;
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

  useEffect(() => {
    if (!firebaseUser?.uid || !db || !isAuthResolved || userProfile?.role !== 'parent') return;
    const q = query(collection(db, 'players'), where('parentId', '==', firebaseUser.uid));
    return onSnapshot(q, (snap) => {
      setMyChildren(snap.docs.map(d => ({ id: d.id, ...d.data() } as PlayerProfile)));
    });
  }, [firebaseUser?.uid, db, userProfile?.role, isAuthResolved]);

  const teamsQuery = useMemoFirebase(() => (isAuthResolved && firebaseUser?.uid && db) ? query(collection(db, 'users', firebaseUser.uid, 'teamMemberships')) : null, [isAuthResolved, firebaseUser?.uid, db]);
  const { data: teamsData, isLoading: isTeamsLoading } = useCollection(teamsQuery);
  
  const teams = useMemo(() => (teamsData || []).map(m => ({ 
    ...m, 
    id: m.teamId || m.id,
    name: m.name || m.teamName || 'Squad'
  })), [teamsData]);

  const hasFeature = useCallback((featureId: string) => {
    if (isSuperAdmin) return true;
    const team = teams.find(t => t.id === activeTeamId) || teams[0];
    if (!team) return false;
    const plan = plans.find(p => p.id === (team.planId || 'starter_squad'));
    return !!plan?.features?.[featureId];
  }, [isSuperAdmin, activeTeamId, plans, teams]);

  const activeTeam = useMemo(() => teams.find(t => t.id === activeTeamId) || teams[0] || null, [teams, activeTeamId]);

  const membersQuery = useMemoFirebase(() => (isAuthResolved && activeTeam?.id && db) ? query(collection(db, 'teams', activeTeam.id, 'members')) : null, [isAuthResolved, activeTeam?.id, db]);
  const { data: membersData, isLoading: isMembersLoading } = useCollection<Member>(membersQuery);
  const members = useMemo(() => membersData || [], [membersData]);

  const proQuotaStatus = useMemo(() => {
    const limitCount = userProfile?.proTeamLimit ?? 0;
    const current = teams.filter(t => t.ownerUserId === firebaseUser?.uid && t.isPro).length;
    return { current, limit: limitCount, remaining: Math.max(0, limitCount - current), exceeded: current > limitCount };
  }, [teams, userProfile, firebaseUser?.uid]);

  useEffect(() => {
    if (!db || !isAuthResolved || !firebaseUser || !teams.length) return;

    const eventUnsubs = teams.map(team => {
      return onSnapshot(collection(db, 'teams', team.id, 'events'), (snap) => {
        const teamEvts = snap.docs.map(d => ({ id: d.id, ...d.data(), teamId: team.id } as TeamEvent));
        setHouseholdEvents(prev => {
          const otherTeams = prev.filter(e => e.teamId !== team.id);
          return [...otherTeams, ...teamEvts].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        });
      }, (err) => console.warn("Event sub failed", err));
    });

    const updateBalance = async () => {
      let total = 0;
      const playerIds = myChildren.map(c => c.id);
      for (const team of teams) {
        for (const pid of playerIds) {
          const memberDoc = await getDoc(doc(db, 'teams', team.id, 'members', pid));
          if (memberDoc.exists()) total += (memberDoc.data().amountOwed || 0);
        }
      }
      setHouseholdBalance(total);
    };
    updateBalance();

    return () => {
      eventUnsubs.forEach(u => u());
    };
  }, [teams, myChildren, db, isAuthResolved, firebaseUser]);

  const value = {
    user: userProfile, activeTeam, setActiveTeam: (t: Team) => setActiveTeamId(t.id), teams, isTeamsLoading, isSeedingDemo, members, isMembersLoading,
    currentMember: members.find(m => m.userId === firebaseUser?.uid) || null,
    isStaff: activeTeam?.role === 'Admin', isPro: activeTeam?.isPro || false, isParent: userProfile?.role === 'parent', isPlayer: userProfile?.role === 'adult_player',
    isSuperAdmin, isClubManager: ['elite_teams', 'elite_league', 'squad_organization'].includes(userProfile?.activePlanId || ''), household, householdEvents, householdBalance, myChildren, plans, isPlansLoading, proQuotaStatus,
    isPaywallOpen, setIsPaywallOpen, purchasePro: () => setIsPaywallOpen(true), hasFeature, alerts: [],
    formatTime: (date: string | Date) => { try { return new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return 'TBD'; } },
    
    createNewTeam: async (name: string, type: "adult" | "youth", pos: string, description?: string, planId?: string) => {
      if (!firebaseUser) return '';
      const tid = `team_${Date.now()}`;
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const pId = planId || 'starter_squad';
      const batch = writeBatch(db);
      batch.set(doc(db, 'teams', tid), clean({ id: tid, teamName: name, teamCode: code, type, createdBy: firebaseUser.uid, ownerUserId: firebaseUser.uid, createdAt: new Date().toISOString(), isPro: pId !== 'starter_squad', planId: pId, members: { [firebaseUser.uid]: 'admin' } }));
      batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), clean({ id: firebaseUser.uid, userId: firebaseUser.uid, teamId: tid, role: 'Admin', position: pos, name: userProfile?.name || 'Coach', avatar: userProfile?.avatar || '', joinedAt: new Date().toISOString(), jersey: 'HQ' }));
      batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), clean({ teamId: tid, teamName: name, teamCode: code, type, role: 'Admin', isPro: pId !== 'starter_squad', planId: pId, ownerUserId: firebaseUser.uid }));
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
      batch.set(doc(db, 'teams', tid, 'members', playerId), clean({ id: playerId, userId: firebaseUser.uid, playerId, teamId: tid, role: 'Member', position, name: `${pData?.firstName || ''} ${pData?.lastName || ''}`, isMinor: !!pData?.isMinor, joinedAt: new Date().toISOString(), jersey: 'TBD' }));
      if (playerId !== `p_${firebaseUser.uid}`) {
        batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), clean({ id: firebaseUser.uid, userId: firebaseUser.uid, playerId: 'guardian', teamId: tid, role: 'Member', position: 'Parent', name: userProfile?.name || 'Guardian', avatar: userProfile?.avatar || '', joinedAt: new Date().toISOString(), jersey: 'HQ' }));
      }
      batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), clean({ teamId: tid, teamName: tData.teamName, teamCode: (code || '').toUpperCase(), role: 'Member', ownerUserId: tData.ownerUserId || '', isPro: !!tData.isPro, planId: tData.planId || 'starter_squad' }));
      await batch.commit(); return true;
    },
    
    registerChild: async (firstName: string, lastName: string, dob: string) => {
      if (!firebaseUser) return '';
      const docRef = await addDoc(collection(db, 'players'), clean({ firstName, lastName, dateOfBirth: dob, isMinor: true, parentId: firebaseUser.uid, createdAt: new Date().toISOString(), joinedTeamIds: [] }));
      return docRef.id;
    },
    
    upgradeChildToLogin: async (childId: string) => {
      if (!db || !firebaseUser) return;
      await updateDoc(doc(db, 'players', childId), { hasLogin: true });
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

    updateTeamPlan: async (teamId: string, planId: string) => {
      const plan = plans.find(p => p.id === planId);
      const isPro = planId !== 'starter_squad';
      await updateDoc(doc(db, 'teams', teamId), { planId, isPro });
      // Update memberships for all users in this team (simplified for MVP)
      const memberships = await getDocs(collectionGroup(db, 'teamMemberships'));
      const batch = writeBatch(db);
      memberships.docs.forEach(m => {
        if (m.id === teamId) batch.update(m.ref, { planId, isPro });
      });
      await batch.commit();
    },
    
    signTeamDocument: async (docId: string, signatureText: string) => {
      if (!activeTeam || !userProfile || !value.currentMember) return;
      const batch = writeBatch(db);
      const sigId = `sig_${userProfile.id}`;
      batch.set(doc(db, 'teams', activeTeam.id, 'documents', docId, 'signatures', sigId), clean({
        id: sigId, memberId: value.currentMember.id, userId: userProfile.id, userName: userProfile.name,
        signedAt: new Date().toISOString(), signatureText
      }));
      batch.update(doc(db, 'teams', activeTeam.id, 'documents', docId), { signatureCount: increment(1) });
      await batch.commit(); toast({ title: "Document Signed & Filed" });
    },
    
    createTeamDocument: async (data: any) => {
      if (!activeTeam) return;
      await addDoc(collection(db, 'teams', activeTeam.id, 'documents'), clean({ ...data, teamId: activeTeam.id, signatureCount: 0, createdAt: new Date().toISOString() }));
    },
    
    deleteTeamDocument: async (docId: string) => {
      if (!activeTeam) return;
      await deleteDoc(doc(db, 'teams', activeTeam.id, 'documents', docId));
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
      await addDoc(collection(db, 'teams', activeTeam.id, 'events'), clean({ ...data, teamId: activeTeam.id, createdBy: firebaseUser?.uid }));
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

    deleteChat: async (chatId: string) => {
      if (!activeTeam) return;
      await deleteDoc(doc(db, 'teams', activeTeam.id, 'groupChats', chatId));
    },

    hideChatForUser: async (chatId: string) => {
      if (!activeTeam || !firebaseUser) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'groupChats', chatId), { [`hiddenFor.${firebaseUser.uid}`]: true });
    },
    
    resetSquadData: async (categories: string[]) => {
      if (!activeTeam || !db || !firebaseUser) return;
      const batch = writeBatch(db);
      for (const cat of categories) {
        let collPath = '';
        if (cat === 'games') collPath = `teams/${activeTeam.id}/games`;
        else if (cat === 'events') collPath = `teams/${activeTeam.id}/events`;
        else if (cat === 'scouting') collPath = `teams/${activeTeam.id}/scouting`;
        else if (cat === 'feed') collPath = `teams/${activeTeam.id}/feedPosts`;
        else if (cat === 'volunteers') collPath = `teams/${activeTeam.id}/volunteers`;
        else if (cat === 'fundraising') collPath = `teams/${activeTeam.id}/fundraising`;
        else if (cat === 'members') {
          const membersSnap = await getDocs(collection(db, `teams/${activeTeam.id}/members`));
          membersSnap.docs.forEach(d => {
            if (d.id !== firebaseUser.uid) batch.delete(d.ref);
          });
          continue;
        }
        else if (cat === 'facilities') {
          const facSnap = await getDocs(query(collection(db, 'facilities'), where('clubId', '==', firebaseUser.uid)));
          facSnap.docs.forEach(d => batch.delete(d.ref));
          continue;
        }

        if (collPath) {
          const snap = await getDocs(collection(db, collPath));
          snap.docs.forEach(d => batch.delete(d.ref));
        }
      }
      await batch.commit();
      toast({ title: "Strategic Purge Complete" });
    },

    resetSeasonData: async () => {
      if (!activeTeam) return;
      await value.resetSquadData(['games', 'events', 'scouting', 'feed']);
    },

    addVolunteerOpportunity: async (data: any) => {
      if (!activeTeam) return;
      await addDoc(collection(db, 'teams', activeTeam.id, 'volunteers'), clean({ ...data, signups: {}, createdAt: new Date().toISOString() }));
    },

    signUpForVolunteer: async (oppId: string) => {
      if (!activeTeam || !userProfile) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), {
        [`signups.${userProfile.id}`]: { userId: userProfile.id, userName: userProfile.name, status: 'pending' }
      });
    },

    verifyVolunteerHours: async (oppId: string, userId: string, hours: number) => {
      if (!activeTeam) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), {
        [`signups.${userId}.status`]: 'verified',
        [`signups.${userId}.verifiedHours`]: hours
      });
    },

    deleteVolunteerOpportunity: async (oppId: string) => {
      if (!activeTeam) return;
      await deleteDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId));
    },

    addFundraisingOpportunity: async (data: any) => {
      if (!activeTeam) return;
      await addDoc(collection(db, 'teams', activeTeam.id, 'fundraising'), clean({ ...data, currentAmount: 0, participants: {}, createdAt: new Date().toISOString() }));
    },

    signUpForFundraising: async (fundId: string) => {
      if (!activeTeam || !userProfile) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'fundraising', fundId), {
        [`participants.${userProfile.id}`]: true
      });
    },

    updateFundraisingAmount: async (fundId: string, amount: number) => {
      if (!activeTeam) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'fundraising', fundId), { currentAmount: increment(amount) });
    },

    deleteFundraisingOpportunity: async (fundId: string) => {
      if (!activeTeam) return;
      await deleteDoc(doc(db, 'teams', activeTeam.id, 'fundraising', fundId));
    },

    addEquipmentItem: async (data: any) => {
      if (!activeTeam) return;
      await addDoc(collection(db, 'teams', activeTeam.id, 'equipment'), clean({ ...data, availableQuantity: data.totalQuantity, assignments: {}, status: 'Active' }));
    },

    updateEquipmentItem: async (id: string, updates: any) => {
      if (!activeTeam) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'equipment', id), clean(updates));
    },

    deleteEquipmentItem: async (id: string) => {
      if (!activeTeam) return;
      await deleteDoc(doc(db, 'teams', activeTeam.id, 'equipment', id));
    },

    assignEquipment: async (itemId: string, userId: string, userName: string, qty: number) => {
      if (!activeTeam) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'equipment', itemId), {
        [`assignments.${userId}`]: { userId, userName, quantity: qty, assignedAt: new Date().toISOString() },
        availableQuantity: increment(-qty)
      });
    },

    returnEquipment: async (itemId: string, userId: string) => {
      if (!activeTeam) return;
      const ref = doc(db, 'teams', activeTeam.id, 'equipment', itemId);
      const snap = await getDoc(ref);
      const qty = snap.data()?.assignments?.[userId]?.quantity || 0;
      await updateDoc(ref, {
        [`assignments.${userId}`]: deleteField(),
        availableQuantity: increment(qty)
      });
    },

    addDrill: async (data: any) => {
      if (!activeTeam) return;
      await addDoc(collection(db, 'teams', activeTeam.id, 'drills'), clean(data));
    },

    deleteDrill: async (id: string) => {
      if (!activeTeam) return;
      await deleteDoc(doc(db, 'teams', activeTeam.id, 'drills', id));
    },

    addScoutingReport: async (data: any) => {
      if (!activeTeam) return;
      await addDoc(collection(db, 'teams', activeTeam.id, 'scouting'), clean(data));
    },

    deleteScoutingReport: async (id: string) => {
      if (!activeTeam) return;
      await deleteDoc(doc(db, 'teams', activeTeam.id, 'scouting', id));
    },

    addFile: async (name: string, type: string, sizeBytes: number, url: string, category: string, desc?: string) => {
      if (!activeTeam) return;
      const size = (sizeBytes / (1024 * 1024)).toFixed(2) + ' MB';
      await addDoc(collection(db, 'teams', activeTeam.id, 'files'), clean({ name, type, size, sizeBytes, url, category, description: desc, date: new Date().toISOString() }));
    },

    deleteFile: async (id: string) => {
      if (!activeTeam) return;
      await deleteDoc(doc(db, 'teams', activeTeam.id, 'files', id));
    },

    markMediaAsViewed: async (id: string) => {
      if (!activeTeam || !userProfile) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'files', id), { [`viewedBy.${userProfile.id}`]: true });
    },

    addMediaComment: async (id: string, text: string) => {
      if (!activeTeam || !userProfile) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'files', id), {
        comments: arrayUnion({ id: `c_${Date.now()}`, authorId: userProfile.id, authorName: userProfile.name, text, createdAt: new Date().toISOString() })
      });
    },

    createLeague: async (name: string) => {
      if (!firebaseUser || !activeTeam) return '';
      const tid = activeTeam.id;
      const tName = activeTeam.name;
      const batch = writeBatch(db);
      
      const leagueRef = doc(collection(db, 'leagues'));
      const leagueId = leagueRef.id;
      
      batch.set(leagueRef, clean({ 
        id: leagueId, 
        name, 
        sport: activeTeam.sport || 'Multi-Sport', 
        teams: { 
          [tid]: { teamName: tName, wins: 0, losses: 0, ties: 0, points: 0, teamLogoUrl: activeTeam.teamLogoUrl || null } 
        }, 
        creatorId: firebaseUser.uid, 
        registrationEnabled: true 
      }));
      
      batch.update(doc(db, 'teams', tid), { leagueIds: arrayUnion(leagueId) });
      batch.update(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), { leagueIds: arrayUnion(leagueId) });
      
      await batch.commit(); 
      return leagueId;
    },

    inviteTeamToLeague: async (leagueId: string, leagueName: string, email: string) => {
      await addDoc(collection(db, 'leagues', 'global', 'invites'), clean({ leagueId, leagueName, invitedEmail: email, status: 'pending', createdAt: new Date().toISOString() }));
      toast({ title: "Invite Dispatched" });
    },

    acceptLeagueInvite: async (inviteId: string, leagueId: string) => {
      if (!activeTeam) return;
      const batch = writeBatch(db);
      batch.update(doc(db, 'leagues', 'global', 'invites', inviteId), { status: 'accepted' });
      batch.update(doc(db, 'leagues', leagueId), { [`teams.${activeTeam.id}`]: { teamName: activeTeam.name, wins: 0, losses: 0, ties: 0, points: 0 } });
      batch.update(doc(db, 'teams', activeTeam.id), { leagueIds: arrayUnion(leagueId) });
      await batch.commit();
      toast({ title: "Joined League" });
    },

    manuallyAddTeamToLeague: async (leagueId: string, teamName: string, coachEmail?: string, logoUrl?: string) => {
      const tid = `manual_${Date.now()}`;
      await updateDoc(doc(db, 'leagues', leagueId), {
        [`teams.${tid}`]: { teamName, coachEmail, teamLogoUrl: logoUrl, wins: 0, losses: 0, ties: 0, points: 0 }
      });
    },

    saveLeagueRegistrationConfig: async (leagueId: string, updates: Partial<LeagueRegistrationConfig>) => {
      await setDoc(doc(db, 'leagues', leagueId, 'registration', 'config'), clean(updates), { merge: true });
      toast({ title: "Portal Config Synchronized" });
    },

    submitRegistrationEntry: async (leagueId: string, answers: any, version: number) => {
      await addDoc(collection(db, 'leagues', leagueId, 'registrationEntries'), clean({ league_id: leagueId, answers, status: 'pending', created_at: new Date().toISOString(), form_version: version }));
    },

    assignEntryToTeam: async (leagueId: string, entryId: string, teamId: string | null) => {
      const entryRef = doc(db, 'leagues', leagueId, 'registrationEntries', entryId);
      const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
      const creatorId = leagueSnap.data()?.creatorId || '';
      await updateDoc(entryRef, { 
        assigned_team_id: teamId, 
        status: teamId ? 'assigned' : 'pending',
        assigned_team_owner_id: creatorId 
      });
      toast({ title: "Submission Assigned" });
    },

    toggleRegistrationPaymentStatus: async (leagueId: string, entryId: string, paid: boolean) => {
      await updateDoc(doc(db, 'leagues', leagueId, 'registrationEntries', entryId), { payment_received: paid });
    },

    respondToAssignment: async (leagueId: string, entryId: string, status: 'accepted' | 'declined') => {
      if (!activeTeam) return;
      const entryRef = doc(db, 'leagues', leagueId, 'registrationEntries', entryId);
      const entrySnap = await getDoc(entryRef);
      if (!entrySnap.exists()) return;
      
      const batch = writeBatch(db);
      batch.update(entryRef, { status });
      
      if (status === 'accepted') {
        const answers = entrySnap.data().answers;
        const name = answers['name'] || answers['fullName'] || 'New Recruit';
        const mid = `recruit_${Date.now()}`;
        batch.set(doc(db, 'teams', activeTeam.id, 'members', mid), clean({
          id: mid, userId: 'none', teamId: activeTeam.id, name, role: 'Member', position: 'Player',
          jersey: 'TBD', joinedAt: new Date().toISOString()
        }));
      }
      await batch.commit();
      toast({ title: status === 'accepted' ? "Recruit Enrolled" : "Assignment Declined" });
    },

    addRegistration: async (teamId: string, eventId: string, data: any) => {
      await addDoc(collection(db, 'teams', teamId, 'events', eventId, 'registrations'), clean({ ...data, createdAt: new Date().toISOString() }));
      return true;
    },

    signTeamTournamentWaiver: async (teamId: string, eventId: string, tournamentTeamName: string) => {
      if (!userProfile) return;
      await updateDoc(doc(db, 'teams', teamId, 'events', eventId), {
        [`teamAgreements.${tournamentTeamName}`]: { agreed: true, signedAt: new Date().toISOString(), captainName: userProfile.name, userId: userProfile.id }
      });
      toast({ title: "Compliance Verified" });
    },

    signPublicTournamentWaiver: async (teamId: string, eventId: string, tournamentTeamName: string, coachName: string) => {
      await updateDoc(doc(db, 'teams', teamId, 'events', eventId), {
        [`teamAgreements.${tournamentTeamName}`]: { agreed: true, signedAt: new Date().toISOString(), captainName: coachName, userId: 'public' }
      });
      return true;
    },

    submitMatchScore: async (teamId: string, eventId: string, gameId: string, isTeam1: boolean, score1: number, score2: number) => {
      const ref = doc(db, 'teams', teamId, 'events', eventId);
      const snap = await getDoc(ref);
      const games = (snap.data()?.tournamentGames || []) as TournamentGame[];
      const updated = games.map(g => g.id === gameId ? { ...g, score1, score2, isCompleted: true } : g);
      await updateDoc(ref, { tournamentGames: updated });
    },

    disputeMatchScore: async (teamId: string, eventId: string, gameId: string, notes: string) => {
      const ref = doc(db, 'teams', teamId, 'events', eventId);
      const snap = await getDoc(ref);
      const games = (snap.data()?.tournamentGames || []) as TournamentGame[];
      const updated = games.map(g => g.id === gameId ? { ...g, isDisputed: true, disputeNotes: notes } : g);
      await updateDoc(ref, { tournamentGames: updated });
    },

    manageSubscription: async () => {
      router.push('/pricing');
    },

    resolveQuota: async (selectedTeamIds: string[]) => {
      if (!firebaseUser) return;
      const batch = writeBatch(db);
      const ownedProTeams = teams.filter(t => t.ownerUserId === firebaseUser.uid && t.isPro);
      ownedProTeams.forEach(t => {
        const isStillPro = selectedTeamIds.includes(t.id);
        batch.update(doc(db, 'teams', t.id), { isPro: isStillPro, planId: isStillPro ? t.planId : 'starter_squad' });
        batch.update(doc(db, 'users', firebaseUser.uid, 'teamMemberships', t.id), { isPro: isStillPro, planId: isStillPro ? t.planId : 'starter_squad' });
      });
      await batch.commit();
      toast({ title: "Squad Tiers Synchronized" });
    }
  };

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export const useTeam = () => {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within TeamProvider');
  return context;
};
