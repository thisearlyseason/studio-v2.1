
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
  orderBy,
  increment,
  collectionGroup,
  arrayUnion,
  getDoc
} from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { updateDocumentNonBlocking, addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { seedGuestDemoTeam } from '@/lib/db-seeder';

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
  tournamentCredits?: number;
};

export type PlayerProfile = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  ageGroup: string;
  isMinor: boolean;
  parentId: string | null;
  userId: string | null;
  hasLogin: boolean;
  createdAt: string;
  joinedTeamIds?: string[];
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

export type TeamAlert = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  createdBy: string;
};

export type TeamFile = {
  id: string;
  teamId: string;
  name: string;
  url: string;
  type: string;
  size: string;
  sizeBytes?: number;
  date: string;
  category: string;
  description?: string;
  uploadedBy?: string;
  viewedBy?: Record<string, boolean>;
  comments?: Array<{ id: string; authorName: string; text: string; date: string }>;
};

export type RegistrationEntry = {
  id: string;
  league_id: string;
  answers: Record<string, any>;
  status: 'pending' | 'accepted' | 'assigned' | 'declined';
  assigned_team_id: string | null;
  assigned_team_owner_id?: string;
  payment_received?: boolean;
  created_at: string;
};

export type LeagueRegistrationConfig = {
  league_id: string;
  title: string;
  description: string;
  is_active: boolean;
  registration_cost?: string;
  payment_instructions?: string;
  form_schema: RegistrationFormField[];
  form_version: number;
};

export type RegistrationFormField = {
  id: string;
  type: 'short_text' | 'long_text' | 'dropdown' | 'checkbox' | 'yes_no' | 'image' | 'header';
  label: string;
  required: boolean;
  options?: string[];
  description?: string;
};

export type EventType = 'game' | 'practice' | 'meeting' | 'tournament' | 'other';

export type TournamentGame = {
  id: string;
  team1: string;
  team2: string;
  score1: number;
  score2: number;
  date: string;
  time: string;
  isCompleted: boolean;
  winnerId?: string;
  location?: string;
  round?: number;
  pool?: string;
};

export type TeamEvent = {
  id: string;
  teamId: string;
  title: string;
  date: string;
  endDate?: string;
  startTime: string;
  location: string;
  description: string;
  eventType: EventType;
  isTournament?: boolean;
  isTournamentPaid?: boolean;
  tournamentTeams?: string[];
  tournamentTeamsMetadata?: Record<string, { coach: string; email: string }>;
  tournamentGames?: TournamentGame[];
  userRsvps?: Record<string, string>;
  gameRsvps?: Record<string, Record<string, string>>;
  requiresSpecialWaiver?: boolean;
  specialWaiverText?: string;
  specialWaiverResponses?: Record<string, { agreed: boolean; timestamp: string }>;
  teamWaiverText?: string;
  teamAgreements?: Record<string, { agreed: boolean; captainName: string; timestamp: string }>;
  coOrganizers?: Array<{ id: string; name: string; avatar: string }>;
  lastUpdated?: string;
};

export type League = {
  id: string;
  name: string;
  sport: string;
  creatorId: string;
  teams: Record<string, { teamName: string; teamLogoUrl: string; wins: number; losses: number; ties: number; points: number }>;
};

export type LeagueInvite = {
  id: string;
  leagueId: string;
  leagueName: string;
  invitedEmail: string;
  status: 'pending' | 'accepted' | 'declined';
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
  alerts: TeamAlert[];
  isRCInitialized: boolean;
  createNewTeam: (name: string, type: "adult" | "youth", pos: string, description?: string, planId?: string) => Promise<string>;
  joinTeamWithCode: (code: string, playerId: string, position: string) => Promise<boolean>;
  registerChild: (firstName: string, lastName: string, dob: string) => Promise<string>;
  upgradeChildToLogin: (playerId: string, email: string) => Promise<void>;
  myChildren: PlayerProfile[];
  signWaiver: (playerId: string, version: string) => Promise<void>;
  plans: any[];
  isPlansLoading: boolean;
  proQuotaStatus: { current: number; limit: number; remaining: number; exceeded: boolean };
  purchasePro: () => void;
  setIsPaywallOpen: (open: boolean) => void;
  isPaywallOpen: boolean;
  updateUser: (updates: Partial<UserProfile>) => Promise<void>;
  updateMember: (memberId: string, updates: Partial<Member>) => Promise<void>;
  updateTeamDetails: (updates: Partial<Team>) => Promise<void>;
  updateTeamPlan: (teamId: string, planId: string) => Promise<void>;
  manageSubscription: () => void;
  resetSeasonData: () => Promise<void>;
  createChat: (name: string, memberIds: string[]) => Promise<string>;
  addMessage: (chatId: string, author: string, content: string, type: any, imageUrl?: string, poll?: any) => Promise<void>;
  votePoll: (chatId: string, msgId: string, optIdx: number) => Promise<void>;
  formatTime: (date: string | Date) => string;
  submitLead: (data: any) => Promise<boolean>;
  hasFeature: (featureId: string) => boolean;
  createAlert: (title: string, message: string) => Promise<void>;
  updateTeamHero: (imageUrl: string) => Promise<void>;
  resolveQuota: (selectedTeamIds: string[]) => Promise<void>;
  addEvent: (payload: any) => Promise<void>;
  updateEvent: (eventId: string, updates: any) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  updateRSVP: (eventId: string, status: string, gameId?: string) => Promise<void>;
  addRegistration: (teamId: string, eventId: string, data: any) => Promise<boolean>;
  signTeamTournamentWaiver: (teamId: string, eventId: string, teamName: string) => Promise<void>;
  submitEventWaiver: (eventId: string, agreed: boolean) => Promise<void>;
  addCoOrganizerByEmail: (eventId: string, email: string) => Promise<void>;
  removeCoOrganizer: (eventId: string, organizerId: string) => Promise<void>;
  addDrill: (payload: any) => Promise<void>;
  deleteDrill: (drillId: string) => Promise<void>;
  addFile: (name: string, type: string, size: number, url: string, category: string, description: string) => Promise<void>;
  addExternalLink: (title: string, url: string, category: string, description: string) => Promise<void>;
  deleteFile: (fileId: string) => Promise<void>;
  markMediaAsViewed: (fileId: string) => Promise<void>;
  addMediaComment: (fileId: string, text: string) => Promise<void>;
  addGame: (payload: any) => Promise<void>;
  updateGame: (gameId: string, updates: any) => Promise<void>;
  createLeague: (name: string) => Promise<void>;
  inviteTeamToLeague: (leagueId: string, leagueName: string, email: string) => Promise<void>;
  manuallyAddTeamToLeague: (leagueId: string, teamName: string, coachEmail: string, logoUrl: string) => Promise<void>;
  acceptLeagueInvite: (inviteId: string, leagueId: string) => Promise<void>;
  saveLeagueRegistrationConfig: (leagueId: string, updates: any) => Promise<void>;
  assignEntryToTeam: (leagueId: string, entryId: string, teamId: string | null) => Promise<void>;
  toggleRegistrationPaymentStatus: (leagueId: string, entryId: string, received: boolean) => Promise<void>;
  submitRegistrationEntry: (leagueId: string, answers: any, version: number) => Promise<void>;
  signPublicTournamentWaiver: (teamId: string, eventId: string, selectedTeam: string, coachName: string) => Promise<boolean>;
  submitMatchScore: (teamId: string, eventId: string, gameId: string, isTeam1: boolean, s1: number, s2: number) => Promise<void>;
  respondToAssignment: (leagueId: string, entryId: string, status: 'accepted' | 'declined') => Promise<void>;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

/**
 * Sanitizes objects for Firestore by removing undefined values recursively.
 * Firestore does not support 'undefined' values.
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

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user: firebaseUser, isUserLoading } = useUser();
  const db = useFirestore();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [myChildren, setMyChildren] = useState<PlayerProfile[]>([]);
  const [isRCInitialized, setIsRCInitialized] = useState(false);
  const [isSeedingDemo, setIsSeedingDemo] = useState(false);
  
  const hasStartedSeeding = useRef<string | null>(null);

  const plansQuery = useMemoFirebase(() => db ? collection(db, 'plans') : null, [db]);
  const { data: plansData, isLoading: isPlansLoading } = useCollection(plansQuery);
  const plans = plansData || [];

  useEffect(() => {
    if (!firebaseUser?.uid || !db) return;
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
          isDemo: data.isDemo,
          tournamentCredits: data.tournamentCredits || 0
        });
      }
    });
  }, [firebaseUser?.uid, db]);

  useEffect(() => {
    if (!firebaseUser?.uid || !db || userProfile?.role !== 'parent') return;
    const q = query(collection(db, 'players'), where('parentId', '==', firebaseUser.uid));
    return onSnapshot(q, (snap) => {
      setMyChildren(snap.docs.map(d => ({ id: d.id, ...d.data() } as PlayerProfile)));
    });
  }, [firebaseUser?.uid, db, userProfile?.role]);

  useEffect(() => {
    const seedParam = searchParams.get('seed_demo');
    if (!seedParam || !firebaseUser?.uid || isSeedingDemo) return;

    const seedKey = `${firebaseUser.uid}_${seedParam}`;
    if (hasStartedSeeding.current === seedKey || sessionStorage.getItem(`squad_seeded_${seedKey}`)) return;

    const runSeed = async () => {
      hasStartedSeeding.current = seedKey;
      setIsSeedingDemo(true);
      
      const url = new URL(window.location.href);
      url.searchParams.delete('seed_demo');
      window.history.replaceState({}, '', url.toString());

      try {
        const tid = await seedGuestDemoTeam(db, firebaseUser.uid, seedParam);
        sessionStorage.setItem(`squad_seeded_${seedKey}`, 'true');
        setActiveTeamId(tid);
      } catch (e) {
        console.error("Seed failed", e);
      } finally {
        setTimeout(() => setIsSeedingDemo(false), 1000);
      }
    };
    runSeed();
  }, [searchParams, firebaseUser?.uid, db, isSeedingDemo]);

  const teamsQuery = useMemoFirebase(() => {
    if (!firebaseUser || !db) return null;
    return query(collection(db, 'users', firebaseUser.uid, 'teamMemberships'));
  }, [firebaseUser?.uid, db]);

  const { data: teamsData, isLoading: isTeamsLoading } = useCollection(teamsQuery);
  const teams = useMemo(() => {
    if (!teamsData) return [];
    return teamsData.map(m => ({
      id: m.teamId || m.id,
      name: m.teamName || 'Unnamed Team',
      code: m.teamCode || '......',
      type: m.type || 'adult',
      isPro: m.isPro || false,
      planId: m.planId || 'starter_squad',
      role: m.role || 'Member',
      ownerUserId: m.ownerUserId || '',
      sport: m.sport || 'Multi-Sport',
      parentChatEnabled: m.parentChatEnabled ?? true,
      parentCommentsEnabled: m.parentCommentsEnabled ?? true,
      heroImageUrl: m.heroImageUrl || '',
      teamLogoUrl: m.teamLogoUrl || '',
      leagueIds: m.leagueIds || []
    }));
  }, [teamsData]);

  const activeTeam = useMemo(() => {
    if (!teams.length) return null;
    return teams.find(t => t.id === activeTeamId) || teams[0];
  }, [teams, activeTeamId]);

  const membersQuery = useMemoFirebase(() => {
    if (!activeTeam?.id || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'members'));
  }, [activeTeam?.id, db]);
  const { data: membersData, isLoading: isMembersLoading } = useCollection<Member>(membersQuery);
  const members = useMemo(() => membersData || [], [membersData]);

  const alertsQuery = useMemoFirebase(() => {
    if (!activeTeam?.id || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'alerts'), orderBy('createdAt', 'desc'), limit(10));
  }, [activeTeam?.id, db]);
  const { data: alertsData } = useCollection<TeamAlert>(alertsQuery);
  const alerts = useMemo(() => alertsData || [], [alertsData]);

  useEffect(() => {
    setIsRCInitialized(true);
  }, []);

  const proQuotaStatus = useMemo(() => {
    const limitCount = userProfile?.proTeamLimit ?? 0;
    const ownedProTeams = teams.filter(t => t.ownerUserId === firebaseUser?.uid && t.isPro);
    const current = ownedProTeams.length;
    return { current, limit: limitCount, remaining: Math.max(0, limitCount - current), exceeded: current > limitCount };
  }, [teams, userProfile, firebaseUser?.uid]);

  const isStaff = activeTeam?.role === 'Admin';
  const isPro = activeTeam?.isPro || false;
  const isParent = userProfile?.role === 'parent';
  const isPlayer = userProfile?.role === 'adult_player';
  const isSuperAdmin = userProfile?.email === 'thisearlyseason@gmail.com' || userProfile?.email === 'test@gmail.com';
  const isClubManager = userProfile?.activePlanId?.includes('squad_organization');

  const hasFeature = (featureId: string) => {
    if (isSuperAdmin) return true;
    const plan = plans.find(p => p.id === activeTeam?.planId);
    return !!plan?.features?.[featureId];
  };

  const value = {
    user: userProfile,
    activeTeam,
    setActiveTeam: (t: Team) => setActiveTeamId(t.id),
    teams,
    isTeamsLoading,
    isSeedingDemo,
    members,
    isMembersLoading,
    currentMember: members.find(m => m.userId === firebaseUser?.uid) || null,
    isStaff,
    isPro,
    isParent,
    isPlayer,
    isSuperAdmin,
    isClubManager,
    alerts,
    isRCInitialized,
    hasFeature,
    createNewTeam: async (name: string, type: "adult" | "youth", pos: string, description?: string, planId?: string) => {
      if (!firebaseUser) return '';
      const tid = `team_${Date.now()}`;
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const pId = planId || 'starter_squad';
      const batch = writeBatch(db);
      const teamData = clean({ 
        id: tid, 
        teamName: name || 'Unnamed Team', 
        teamCode: code, 
        type, 
        createdBy: firebaseUser.uid, 
        ownerUserId: firebaseUser.uid, 
        createdAt: new Date().toISOString(), 
        isPro: pId !== 'starter_squad', 
        planId: pId, 
        parentChatEnabled: true, 
        parentCommentsEnabled: true, 
        description: description || '', 
        teamLogoUrl: '', 
        heroImageUrl: '', 
        sport: 'Multi-Sport' 
      });
      batch.set(doc(db, 'teams', tid), teamData);
      batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), clean({ id: firebaseUser.uid, userId: firebaseUser.uid, teamId: tid, role: 'Admin', position: pos, name: userProfile?.name || 'Coach', avatar: userProfile?.avatar || '', joinedAt: new Date().toISOString(), jersey: 'HQ' }));
      batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), clean({ teamId: tid, teamName: name || 'Unnamed Team', teamCode: code, type, role: 'Admin', isPro: pId !== 'starter_squad', planId: pId, ownerUserId: firebaseUser.uid, teamLogoUrl: '', sport: 'Multi-Sport' }));
      await batch.commit();
      return tid;
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
      
      // Add the child/player to the roster
      batch.set(doc(db, 'teams', tid, 'members', playerId), clean({ 
        id: playerId, 
        userId: firebaseUser.uid, 
        playerId, 
        teamId: tid, 
        role: 'Member', 
        position, 
        name: `${pData?.firstName || ''} ${pData?.lastName || ''}`, 
        avatar: '', 
        isMinor: !!pData?.isMinor, 
        joinedAt: new Date().toISOString(), 
        jersey: 'TBD' 
      }));
      
      // CRITICAL: Ensure the guardian is ALSO added to the team roster
      // This provides the 'Member' permissions needed to list chats and hubs
      if (playerId !== `p_${firebaseUser.uid}`) {
        batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), clean({
          id: firebaseUser.uid,
          userId: firebaseUser.uid,
          playerId: 'guardian',
          teamId: tid,
          role: 'Member',
          position: 'Parent',
          name: userProfile?.name || 'Guardian',
          avatar: userProfile?.avatar || '',
          joinedAt: new Date().toISOString(),
          jersey: 'HQ'
        }));
      }
      
      batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), clean({ 
        teamId: tid, 
        teamName: tData.teamName || 'Unnamed Team', 
        teamCode: (code || '').toUpperCase(), 
        type: tData.type || 'adult', 
        role: 'Member', 
        ownerUserId: tData.ownerUserId || '', 
        isPro: !!tData.isPro, 
        planId: tData.planId || 'starter_squad', 
        teamLogoUrl: tData.teamLogoUrl || '', 
        sport: tData.sport || 'Multi-Sport' 
      }));
      
      await batch.commit();
      toast({ title: "Welcome to the Squad!" });
      return true;
    },
    registerChild: async (firstName: string, lastName: string, dob: string) => {
      if (!firebaseUser) return '';
      const docRef = await addDoc(collection(db, 'players'), clean({ firstName: firstName || '', lastName: lastName || '', dateOfBirth: dob || '', isMinor: true, parentId: firebaseUser.uid, hasLogin: false, createdAt: new Date().toISOString(), joinedTeamIds: [] }));
      return docRef.id;
    },
    upgradeChildToLogin: async (playerId: string, email: string) => {
      if (!firebaseUser) return;
      await updateDoc(doc(db, 'players', playerId), { hasLogin: true, inviteEmail: (email || '').toLowerCase() });
      toast({ title: "Invite Dispatched", description: "Direct login instructions sent." });
    },
    myChildren,
    signWaiver: async (playerId: string, version: string) => {
      if (!firebaseUser) return;
      await addDoc(collection(db, 'waivers'), clean({ playerId, signedByUserId: firebaseUser.uid, signedByRole: userProfile?.role === 'parent' ? 'parent' : 'player', signedAt: new Date().toISOString(), version: version || '1.0' }));
    },
    plans,
    isPlansLoading,
    proQuotaStatus,
    purchasePro: () => setIsPaywallOpen(true),
    setIsPaywallOpen,
    isPaywallOpen,
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
    updateTeamPlan: async (teamId: string, planId: string) => {
      const plan = plans.find(p => p.id === planId);
      if (!plan) return;
      await updateDoc(doc(db, 'teams', teamId), clean({ planId, isPro: planId !== 'starter_squad' }));
    },
    manageSubscription: () => { window.open('https://billing.thesquad.pro', '_blank'); },
    resetSeasonData: async () => { if (!activeTeam) return; toast({ title: "Resetting Season..." }); },
    createChat: async (name: string, memberIds: string[]) => {
      if (!activeTeam || !firebaseUser) return '';
      const docRef = await addDoc(collection(db, 'teams', activeTeam.id, 'groupChats'), clean({ name: name || 'Team Chat', memberIds: [...memberIds, firebaseUser.uid], createdBy: firebaseUser.uid, createdAt: new Date().toISOString(), lastMessage: 'New channel established.' }));
      return docRef.id;
    },
    addMessage: async (chatId: string, author: string, content: string, type: any, imageUrl?: string, poll?: any) => {
      if (!activeTeam || !firebaseUser) return;
      await addDoc(collection(db, 'teams', activeTeam.id, 'groupChats', chatId, 'messages'), clean({ author: author || 'User', authorId: firebaseUser.uid, content: content || '', type: type || 'text', imageUrl: imageUrl || null, poll: poll || null, createdAt: new Date().toISOString() }));
      await updateDoc(doc(db, 'teams', activeTeam.id, 'groupChats', chatId), { lastMessage: type === 'poll' ? 'New Poll' : (content || 'Media attached'), lastMessageAt: new Date().toISOString() });
    },
    votePoll: async (chatId: string, msgId: string, optIdx: number) => {
      if (!activeTeam || !firebaseUser) return;
      const ref = doc(db, 'teams', activeTeam.id, 'groupChats', chatId, 'messages', msgId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const poll = snap.data().poll; const current = poll.voters?.[firebaseUser.uid];
      const u: any = { [`poll.voters.${firebaseUser.uid}`]: optIdx };
      if (current === undefined) { u[`poll.options.${optIdx}.votes`] = increment(1); u['poll.totalVotes'] = increment(1); }
      else if (current !== optIdx) { u[`poll.options.${current}.votes`] = increment(-1); u[`poll.options.${optIdx}.votes`] = increment(1); }
      await updateDoc(ref, u);
    },
    formatTime: (date: string | Date) => { return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); },
    submitLead: async (data: any) => { await addDoc(collection(db, 'leads'), clean({ ...data, createdAt: new Date().toISOString() })); toast({ title: "Inquiry Dispatched" }); return true; },
    createAlert: async (title: string, message: string) => {
      if (!activeTeam) return;
      await addDoc(collection(db, 'teams', activeTeam.id, 'alerts'), clean({ title: title || 'Alert', message: message || '', createdAt: new Date().toISOString(), createdBy: firebaseUser?.uid }));
    },
    updateTeamHero: async (imageUrl: string) => {
      if (!activeTeam) return;
      await updateDoc(doc(db, 'teams', activeTeam.id), clean({ heroImageUrl: imageUrl || '' }));
    },
    resolveQuota: async (selectedIds: string[]) => {
      if (!firebaseUser) return;
      const batch = writeBatch(db);
      teams.filter(t => t.ownerUserId === firebaseUser.uid).forEach(t => {
        const isSelected = selectedIds.includes(t.id);
        batch.update(doc(db, 'teams', t.id), clean({ isPro: isSelected, planId: isSelected ? t.planId : 'starter_squad' }));
        batch.update(doc(db, 'users', firebaseUser.uid, 'teamMemberships', t.id), clean({ isPro: isSelected, planId: isSelected ? t.planId : 'starter_squad' }));
      });
      await batch.commit();
    },
    addEvent: async (p: any) => { if (!activeTeam) return; await addDoc(collection(db, 'teams', activeTeam.id, 'events'), clean(p)); },
    updateEvent: async (id: string, u: any) => { if (!activeTeam) return; await updateDoc(doc(db, 'teams', activeTeam.id, 'events', id), clean(u)); },
    deleteEvent: async (id: string) => { if (!activeTeam) return; await deleteDoc(doc(db, 'teams', activeTeam.id, 'events', id)); },
    updateRSVP: async (id: string, s: string, gid?: string) => {
      if (!activeTeam || !firebaseUser) return;
      const update: any = gid ? { [`gameRsvps.${gid}.${firebaseUser.uid}`]: s } : { [`userRsvps.${firebaseUser.uid}`]: s };
      await updateDoc(doc(db, 'teams', activeTeam.id, 'events', id), update);
    },
    addRegistration: async (tid: string, eid: string, d: any) => {
      await addDoc(collection(db, 'teams', tid, 'events', eid, 'registrations'), clean({ ...d, createdAt: new Date().toISOString() }));
      return true;
    },
    signTeamTournamentWaiver: async (tid: string, eid: string, teamName: string) => {
      await updateDoc(doc(db, 'teams', tid, 'events', eid), { [`teamAgreements.${teamName}`]: { agreed: true, captainName: userProfile?.name || 'Representative', timestamp: new Date().toISOString() } });
    },
    submitEventWaiver: async (eid: string, a: boolean) => {
      if (!activeTeam || !firebaseUser) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'events', eid), { [`specialWaiverResponses.${firebaseUser.uid}`]: { agreed: a, timestamp: new Date().toISOString() } });
    },
    addCoOrganizerByEmail: async (eid: string, email: string) => {
      if (!activeTeam) return;
      const q = query(collection(db, 'teams', activeTeam.id, 'members'), where('parentEmail', '==', (email || '').toLowerCase()), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) { toast({ title: "User not found in roster", variant: "destructive" }); return; }
      const mem = snap.docs[0].data();
      await updateDoc(doc(db, 'teams', activeTeam.id, 'events', eid), { coOrganizers: arrayUnion({ id: mem.userId, name: mem.name || 'Staff', avatar: mem.avatar || '' }) });
    },
    removeCoOrganizer: async (eid: string, oid: string) => {
      if (!activeTeam) return;
      const snap = await getDoc(doc(db, 'teams', activeTeam.id, 'events', eid));
      const cos = snap.data()?.coOrganizers || [];
      await updateDoc(doc(db, 'teams', activeTeam.id, 'events', eid), { coOrganizers: cos.filter((c: any) => c.id !== oid) });
    },
    addDrill: async (p: any) => { if (!activeTeam) return; await addDoc(collection(db, 'teams', activeTeam.id, 'drills'), clean(p)); },
    deleteDrill: async (id: string) => { if (!activeTeam) return; await deleteDoc(doc(db, 'teams', activeTeam.id, 'drills', id)); },
    addFile: async (n: string, t: string, s: number, u: string, c: string, d: string) => {
      if (!activeTeam) return;
      await addDoc(collection(db, 'teams', activeTeam.id, 'files'), clean({ name: n || 'File', type: t || 'file', sizeBytes: s || 0, url: u || '', category: c || 'Other', description: d || '', date: new Date().toISOString(), uploadedBy: userProfile?.name || 'Unknown', viewedBy: {}, comments: [] }));
    },
    addExternalLink: async (t: string, u: string, c: string, d: string) => {
      if (!activeTeam) return;
      await addDoc(collection(db, 'teams', activeTeam.id, 'files'), clean({ name: t || 'Link', type: 'link', url: u || '', category: c || 'Other', description: d || '', date: new Date().toISOString(), uploadedBy: userProfile?.name || 'Unknown', viewedBy: {} }));
    },
    deleteFile: async (id: string) => { if (!activeTeam) return; await deleteDoc(doc(db, 'teams', activeTeam.id, 'files', id)); },
    markMediaAsViewed: async (id: string) => {
      if (!activeTeam || !firebaseUser) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'files', id), { [`viewedBy.${firebaseUser.uid}`]: true });
    },
    addMediaComment: async (id: string, t: string) => {
      if (!activeTeam || !userProfile) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'files', id), { comments: arrayUnion({ id: Date.now().toString(), authorName: userProfile.name || 'User', text: t || '', date: new Date().toISOString() }) });
    },
    addGame: async (p: any) => { if (!activeTeam) return; await addDoc(collection(db, 'teams', activeTeam.id, 'games'), clean(p)); },
    updateGame: async (id: string, u: any) => { if (!activeTeam) return; await updateDoc(doc(db, 'teams', activeTeam.id, 'games', id), clean(u)); },
    createLeague: async (n: string) => {
      if (!firebaseUser || !activeTeam) return;
      const lid = `league_${Date.now()}`;
      await setDoc(doc(db, 'leagues', lid), clean({ 
        id: lid, 
        name: n || 'New League', 
        creatorId: firebaseUser.uid, 
        createdAt: new Date().toISOString(), 
        sport: activeTeam?.sport || 'Multi-Sport', 
        teams: { 
          [activeTeam.id]: { 
            teamName: activeTeam?.name || 'Unnamed Squad', 
            teamLogoUrl: activeTeam?.teamLogoUrl || '', 
            wins: 0, 
            losses: 0, 
            ties: 0, 
            points: 0 
          } 
        } 
      }));
      await updateDoc(doc(db, 'teams', activeTeam.id), { leagueIds: arrayUnion(lid) });
    },
    inviteTeamToLeague: async (lid: string, lname: string, e: string) => {
      await addDoc(collection(db, 'leagues', 'global', 'invites'), clean({ leagueId: lid, leagueName: lname || 'League', invitedEmail: (e || '').toLowerCase(), status: 'pending', createdAt: new Date().toISOString() }));
    },
    manuallyAddTeamToLeague: async (lid: string, n: string, e: string, l: string) => {
      const mid = `manual_${Date.now()}`;
      await updateDoc(doc(db, 'leagues', lid), { 
        [`teams.${mid}`]: clean({ 
          teamName: n || 'Manual Team', 
          teamLogoUrl: l || '', 
          wins: 0, 
          losses: 0, 
          ties: 0, 
          points: 0 
        })
      });
    },
    acceptLeagueInvite: async (iid: string, lid: string) => {
      if (!activeTeam) return;
      await updateDoc(doc(db, 'leagues', lid), { 
        [`teams.${activeTeam.id}`]: clean({ 
          teamName: activeTeam?.name || 'Unnamed Squad', 
          teamLogoUrl: activeTeam?.teamLogoUrl || '', 
          wins: 0, 
          losses: 0, 
          ties: 0, 
          points: 0 
        })
      });
      await updateDoc(doc(db, 'leagues', 'global', 'invites', iid), { status: 'accepted' });
      await updateDoc(doc(db, 'teams', activeTeam.id), { leagueIds: arrayUnion(lid) });
    },
    saveLeagueRegistrationConfig: async (lid: string, u: any) => {
      await setDoc(doc(db, 'leagues', lid, 'registration', 'config'), clean({ league_id: lid, ...u }), { merge: true });
    },
    assignEntryToTeam: async (lid: string, eid: string, tid: string | null) => {
      if (!db) return;
      let ownerId = '';
      if (tid) {
        const tSnap = await getDoc(doc(db, 'teams', tid));
        ownerId = tSnap.data()?.ownerUserId || '';
      }
      await updateDoc(doc(db, 'leagues', lid, 'registrationEntries', eid), clean({ assigned_team_id: tid, assigned_team_owner_id: ownerId, status: tid ? 'assigned' : 'pending' }));
    },
    toggleRegistrationPaymentStatus: async (lid: string, eid: string, p: boolean) => {
      await updateDoc(doc(db, 'leagues', lid, 'registrationEntries', eid), { payment_received: !!p });
    },
    submitRegistrationEntry: async (lid: string, a: any, v: number) => {
      await addDoc(collection(db, 'leagues', lid, 'registrationEntries'), clean({ league_id: lid, answers: a || {}, form_version: v || 0, status: 'pending', created_at: new Date().toISOString(), payment_received: false }));
    },
    signPublicTournamentWaiver: async (tid: string, eid: string, tname: string, cname: string) => {
      await updateDoc(doc(db, 'teams', tid, 'events', eid), { [`teamAgreements.${tname}`]: { agreed: true, captainName: cname || 'Representative', timestamp: new Date().toISOString() } });
      return true;
    },
    submitMatchScore: async (tid: string, eid: string, gameId: string, isT1: boolean, s1: number, s2: number) => {
      const evRef = doc(db, 'teams', tid, 'events', eid);
      const snap = await getDoc(evRef);
      if (!snap.exists()) return;
      const games = snap.data().tournamentGames || [];
      const updated = games.map((g: any) => g.id === gameId ? { ...g, score1: s1 || 0, score2: s2 || 0, isCompleted: true } : g);
      await updateDoc(evRef, { tournamentGames: updated });
    },
    respondToAssignment: async (leagueId: string, entryId: string, status: 'accepted' | 'declined') => {
      if (!activeTeam) return;
      await updateDoc(doc(db, 'leagues', leagueId, 'registrationEntries', entryId), { status });
      if (status === 'accepted') toast({ title: "Player Recruited" });
    }
  };

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export const useTeam = () => {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within TeamProvider');
  return context;
};
