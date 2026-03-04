
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
  arrayRemove
} from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { updateDocumentNonBlocking, setDocumentNonBlocking, addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Purchases } from '@revenuecat/purchases-js';
import { seedSubscriptionData, seedGuestDemoTeam, resetDemoEnvironment } from '@/lib/db-seeder';
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
  tournamentCredits?: number;
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
  leagueIds?: string[];
  parentCommentsEnabled?: boolean;
  parentChatEnabled?: boolean;
};

export type League = {
  id: string;
  name: string;
  creatorId: string;
  createdAt: string;
  sport?: string;
  teams: Record<string, {
    teamName: string;
    teamLogoUrl: string;
    wins: number;
    losses: number;
    ties: number;
    points: number;
    coachEmail?: string;
  }>;
};

export type LeagueInvite = {
  id: string;
  leagueId: string;
  leagueName: string;
  invitedEmail: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
};

export type RegistrationFormFieldType = 'short_text' | 'long_text' | 'dropdown' | 'checkbox' | 'yes_no' | 'image' | 'header';

export type RegistrationFormField = {
  id: string;
  type: RegistrationFormFieldType;
  label: string;
  description?: string;
  required?: boolean;
  options?: string[];
};

export type LeagueRegistrationConfig = {
  league_id: string;
  title: string;
  description: string;
  registration_cost?: string;
  payment_instructions?: string;
  is_active: boolean;
  shareable_slug: string;
  created_by: string;
  form_schema: RegistrationFormField[];
  form_version: number;
};

export type RegistrationEntry = {
  id: string;
  league_registration_id: string;
  league_id: string;
  form_version: number;
  answers: Record<string, any>;
  status: 'pending' | 'accepted' | 'assigned' | 'declined';
  payment_received?: boolean;
  assigned_team_id: string | null;
  created_at: string;
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
  waiverSigned?: boolean;
  transportationWaiverSigned?: boolean;
  medicalClearance?: boolean;
  mediaRelease?: boolean;
};

export type TournamentGame = {
  id: string;
  team1: string;
  team2: string;
  score1: number;
  score2: number;
  date: string;
  time: string;
  winnerId?: string;
  isCompleted: boolean;
  pool?: string;
  round?: number;
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
  userRsvps?: Record<string, string>;
  isTournament?: boolean;
  isTournamentPaid?: boolean;
  tournamentSchedule?: any[];
  tournamentGames?: TournamentGame[];
  tournamentTeams?: string[];
  tournamentTeamsMetadata?: Record<string, { coach: string; email: string }>;
  teamAgreements?: Record<string, { agreed: boolean; captainName: string; timestamp: string }>;
  allowExternalRegistration?: boolean;
  isRegistrationRequired?: boolean;
  customFormFields?: any[];
  requiresSpecialWaiver?: boolean;
  specialWaiverText?: string;
  specialWaiverResponses?: Record<string, { agreed: boolean; timestamp: string }>;
  teamWaiverText?: string;
  lastUpdated?: string;
};

export type MediaComment = {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
};

export type VideoAnnotation = {
  id: string;
  timestamp: number;
  label: string;
  description?: string;
};

export type TeamFile = {
  id: string;
  name: string;
  type: string;
  size: string;
  sizeBytes: number;
  url: string;
  teamId: string;
  uploadedBy: string;
  uploaderId: string;
  date: string;
  category: 'Game Tape' | 'Practice Session' | 'Highlights' | 'Compliance' | 'Other';
  description?: string;
  complianceType?: string;
  tags?: string[];
  comments?: MediaComment[];
  annotations?: VideoAnnotation[];
  viewedBy?: Record<string, boolean>;
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
  isOpponentCoach?: boolean;
  opponentTeamName?: string;
  poll?: any;
};

export type Feature = {
  id: string;
  description: string;
  defaultEnabled: boolean;
};

export type Plan = {
  id: string;
  name: string;
  description: string;
  priceDisplay: string;
  annualPriceDisplay?: string;
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
  currentMember: Member | null;
  isStaff: boolean;
  isPlayer: boolean;
  isParent: boolean;
  createNewTeam: (name: string, organizerPosition: string, description?: string, planId?: string) => Promise<string>;
  joinTeamWithCode: (code: string, position: string) => Promise<boolean>;
  addEvent: (event: any) => void;
  updateEvent: (id: string, event: any) => void;
  deleteEvent: (id: string) => void;
  submitEventWaiver: (eventId: string, agreed: boolean) => Promise<void>;
  signTeamTournamentWaiver: (hostTeamId: string, eventId: string, teamName: string) => Promise<void>;
  signPublicTournamentWaiver: (hostTeamId: string, eventId: string, teamName: string, coachName: string) => Promise<boolean>;
  addGame: (game: any) => void;
  updateGame: (id: string, game: any) => void;
  addDrill: (drill: any) => void;
  deleteDrill: (id: string) => void;
  addFile: (name: string, type: string, sizeBytes: number, url: string, category?: string, description?: string, complianceType?: string) => void;
  addExternalLink: (name: string, url: string, category?: string, description?: string, complianceType?: string) => void;
  deleteFile: (id: string) => void;
  markMediaAsViewed: (fileId: string) => void;
  addMediaComment: (fileId: string, text: string) => void;
  addMediaTag: (fileId: string, tag: string) => void;
  addMediaAnnotation: (fileId: string, timestamp: number, label: string, description?: string) => void;
  createChat: (name: string, memberIds: string[]) => Promise<string>;
  addMessage: (chatId: string, author: string, content: string, type: string, imageUrl?: string, poll?: any, isOpponentCoach?: boolean, opponentTeamName?: string) => void;
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
  isPlansLoading: boolean;
  simulationPlanId: string | null;
  setSimulationPlanId: (pid: string | null) => void;
  resetDemo: () => Promise<void>;
  resetSeasonData: () => Promise<void>;
  isSeedingDemo: boolean;
  isClubManager: boolean;
  secondsUntilReset: number | null;
  proQuotaStatus: { current: number; limit: number; remaining: number; exceeded: boolean };
  canAddProTeam: boolean;
  resolveQuota: (selectedTeamIds: string[]) => Promise<void>;
  assignManualPlan: (targetUserId: string, planId: string, limit: number) => Promise<void>;
  createLeague: (name: string, sport?: string) => Promise<string>;
  inviteTeamToLeague: (leagueId: string, leagueName: string, email: string) => Promise<void>;
  acceptLeagueInvite: (inviteId: string, leagueId: string) => Promise<void>;
  manuallyAddTeamToLeague: (leagueId: string, teamName: string, email: string, logoUrl?: string) => Promise<void>;
  saveLeagueRegistrationConfig: (leagueId: string, config: Partial<LeagueRegistrationConfig>) => Promise<void>;
  submitRegistrationEntry: (leagueId: string, answers: Record<string, any>, version: number) => Promise<void>;
  assignEntryToTeam: (leagueId: string, entryId: string, teamId: string | null) => Promise<void>;
  respondToAssignment: (leagueId: string, entryId: string, status: 'accepted' | 'declined') => Promise<void>;
  toggleRegistrationPaymentStatus: (leagueId: string, entryId: string, status: boolean) => Promise<void>;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

const SUPER_ADMIN_EMAILS = ['thisearlyseason@gmail.com', 'test@gmail.com'];

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

  // Section 2: Aggressive Caching for Plans/Features
  const [cachedPlans, setCachedPlans] = useState<Plan[]>([]);
  useEffect(() => {
    const cached = localStorage.getItem('squad_plans_cache');
    if (cached) {
      try {
        const { data, expiry } = JSON.parse(cached);
        if (expiry > Date.now()) setCachedPlans(data);
      } catch (e) {}
    }
  }, []);

  const plansQuery = useMemoFirebase(() => db ? collection(db, 'plans') : null, [db]);
  const { data: plansData, isLoading: isPlansLoading } = useCollection(plansQuery);
  const plans = useMemo(() => {
    if (plansData?.length) {
      localStorage.setItem('squad_plans_cache', JSON.stringify({ data: plansData, expiry: Date.now() + 3600000 }));
      return plansData as Plan[];
    }
    return cachedPlans;
  }, [plansData, cachedPlans]);

  const isSuperAdmin = useMemo(() => {
    const email = firebaseUser?.email?.toLowerCase();
    return email ? SUPER_ADMIN_EMAILS.includes(email) : false;
  }, [firebaseUser?.email]);

  // Section 1: Read Optimization - Explicit Limits
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
        sport: m.sport || 'General',
        description: m.description || '',
        teamLogoUrl: m.teamLogoUrl,
        heroImageUrl: m.heroImageUrl,
        isPro: m.isPro || false,
        proAssignedAt: m.proAssignedAt,
        isProPendingRemoval: m.isProPendingRemoval || false,
        planId: m.planId || (m.isPro ? 'squad_pro' : 'starter_squad'),
        role: m.role || (isSuperAdmin ? 'Admin' : 'Member'),
        isDemo: m.isDemo || false,
        createdBy: m.createdBy || m.userId,
        ownerUserId: m.ownerUserId || m.createdBy || m.userId,
        leagueIds: m.leagueIds || [],
        parentCommentsEnabled: m.parentCommentsEnabled ?? false,
        parentChatEnabled: m.parentChatEnabled ?? true
      };
    });
  }, [teamsRawData, isSuperAdmin]);

  const activeTeam = useMemo(() => {
    if (!teams.length) return null;
    return teams.find(t => t.id === activeTeamId) || teams[0];
  }, [teams, activeTeamId]);

  // Handle Seeding Demo
  useEffect(() => {
    const seedDemoId = searchParams.get('seed_demo');
    if (seedDemoId && firebaseUser && !seedingRef.current) {
      seedingRef.current = true;
      setIsSeedingDemo(true);
      
      seedGuestDemoTeam(db, firebaseUser.uid, seedDemoId)
        .then((tid) => {
          setActiveTeamId(tid);
          setIsSeedingDemo(false);
          const url = new URL(window.location.href);
          url.searchParams.delete('seed_demo');
          window.history.replaceState({}, '', url.toString());
        })
        .catch((err) => {
          console.error("Demo seeding failed:", err);
          setIsSeedingDemo(false);
          seedingRef.current = false;
        });
    }
  }, [firebaseUser, searchParams, db]);

  // Listen to User Profile for plan limits
  useEffect(() => {
    if (!firebaseUser?.uid || !db) {
      setUserProfile(null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'users', firebaseUser.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUserProfile({
          id: firebaseUser.uid,
          name: data.fullName || data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          avatar: data.avatarUrl || data.avatar || '',
          isDemo: data.isDemo || false,
          activePlanId: data.activePlanId,
          planSource: data.planSource,
          proTeamLimit: data.proTeamLimit,
          tournamentCredits: data.tournamentCredits || 0
        });
      }
    });
    return () => unsub();
  }, [firebaseUser?.uid, db]);

  useEffect(() => {
    if (!activeTeam?.id || !db) {
      setAlerts([]);
      return;
    }
    // Optimization: Low-latency query with tight limit
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
    // Optimization: Limited roster sync
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

  const currentMember = useMemo(() => {
    if (!firebaseUser || !members.length) return null;
    return members.find(m => m.userId === firebaseUser.uid) || null;
  }, [firebaseUser, members]);

  const isStaff = useMemo(() => {
    return activeTeam?.role === 'Admin' || isSuperAdmin;
  }, [activeTeam?.role, isSuperAdmin]);

  const isPlayer = useMemo(() => {
    return currentMember?.position === 'Player';
  }, [currentMember?.position]);

  const isParent = useMemo(() => {
    return currentMember?.position === 'Parent';
  }, [currentMember?.position]);

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
    
    const proDefaults = {
      schedule_games_events: true, tournaments: true, basic_roster: true,
      full_roster_details: true, attendance_tracking: true, live_feed_read: true,
      live_feed_post: true, group_chat: true, score_tracking: true,
      stats_basic: true, media_uploads: true, history_unlimited: true,
      high_priority_alerts: true, leagues: true, league_registration: true
    };

    if (pid === 'squad_organization') return proDefaults;
    if (pid === 'squad_pro' || pid === 'tournament_pro') return proDefaults;
    if (pid === 'starter_squad') return {
      schedule_games_events: true, basic_roster: true, live_feed_read: true,
      score_tracking: true, group_chat: true
    };

    const plan = plans.find(p => p.id === pid);
    return { ...(plan?.features || {}) };
  }, [activeTeam, plans, simulationPlanId]);

  const isPro = useMemo(() => {
    if (simulationPlanId === 'starter_squad') return false;
    if (simulationPlanId === 'squad_pro' || simulationPlanId === 'squad_organization' || simulationPlanId === 'tournament_pro') return true;
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
    if (db && firebaseUser && !isPlansLoading && plans.length === 0) {
      seedSubscriptionData(db);
    }
  }, [db, firebaseUser, isPlansLoading, plans.length]);

  const performCreateNewTeam = async (name: string, pos: string, description?: string, planId?: string): Promise<string> => {
    if (!firebaseUser) return ''; 
    const tid = `team_${Date.now()}`; 
    const code = Math.random().toString(36).substring(2, 8).toUpperCase(); 
    const pId = planId || 'starter_squad';
    const isP = pId !== 'starter_squad';
    
    if (isP && !canAddProTeam) {
      toast({ title: "Pro Quota Reached", description: "Team created as Starter Squad.", variant: "destructive" });
      return performCreateNewTeam(name, pos, description, 'starter_squad');
    }

    const batch = writeBatch(db); 
    batch.set(doc(db, 'teams', tid), { id: tid, teamName: name, description: description || '', teamCode: code, createdBy: firebaseUser.uid, ownerUserId: firebaseUser.uid, createdAt: new Date().toISOString(), members: { [firebaseUser.uid]: 'Admin' }, isPro: isP, planId: pId, proAssignedAt: isP ? new Date().toISOString() : null, leagueIds: [], sport: 'General', parentCommentsEnabled: false, parentChatEnabled: true }); 
    batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), { userId: firebaseUser.uid, teamId: tid, role: 'Admin', position: pos || 'Coach', name: userProfile?.name || 'Organizer', avatar: userProfile?.avatar || '', joinedAt: new Date().toISOString() }); 
    batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), { userId: firebaseUser.uid, teamId: tid, teamName: name, description: description || '', teamCode: code, role: 'Admin', isPro: isP, planId: pId, joinedAt: new Date().toISOString(), createdBy: firebaseUser.uid, ownerUserId: firebaseUser.uid, leagueIds: [], sport: 'General' }); 
    
    try { 
      await batch.commit(); 
      setActiveTeamId(tid); 
      return tid; 
    } catch (e) { 
      return ''; 
    }
  };

  // Section 4: Storage Optimization - Client-side compression
  const compressImage = (dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = dataUrl;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 800;
        let width = img.width;
        let height = img.height;
        if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
        else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); // 70% quality compression
      };
    });
  };

  const contextValue = useMemo(() => ({
    user: userProfile, 
    updateUser: async (updates: Partial<UserProfile>) => { 
      if (firebaseUser) {
        if (updates.avatar) updates.avatar = await compressImage(updates.avatar);
        updateDocumentNonBlocking(doc(db, 'users', firebaseUser.uid), updates); 
      }
    },
    activeTeam, 
    setActiveTeam: (t: Team) => setActiveTeamId(t.id),
    updateTeamHero: async (url: string) => { 
      if (activeTeam?.id && firebaseUser) { 
        const compressed = await compressImage(url);
        updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id), { heroImageUrl: compressed }); 
        updateDocumentNonBlocking(doc(db, 'users', firebaseUser.uid, 'teamMemberships', activeTeam.id), { heroImageUrl: compressed }); 
      } 
    },
    updateTeamDetails: async (updates: Partial<Team>) => { if (activeTeam?.id && firebaseUser) { 
      const f: any = {}; 
      if (updates.name) f.teamName = updates.name; 
      if (updates.sport) f.sport = updates.sport; 
      if (updates.description) f.description = updates.description; 
      if (updates.teamLogoUrl) f.teamLogoUrl = await compressImage(updates.teamLogoUrl); 
      if (updates.parentCommentsEnabled !== undefined) f.parentCommentsEnabled = updates.parentCommentsEnabled;
      if (updates.parentChatEnabled !== undefined) f.parentChatEnabled = updates.parentChatEnabled;
      
      if (Object.keys(f).length > 0) { 
        updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id), f); 
        updateDocumentNonBlocking(doc(db, 'users', firebaseUser.uid, 'teamMemberships', activeTeam.id), f); 
      } 
    } },
    updateTeamPlan: async (tid: string, pid: string) => { 
      if (db) { 
        const p = plans.find(p => p.id === pid);
        const isTurningPro = p?.billingType !== 'free';
        if (isTurningPro && !canAddProTeam && activeTeam?.planId === 'starter_squad') {
          toast({ title: "Quota Reached", description: "You have reached your Pro team limit.", variant: "destructive" });
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
    currentMember,
    isStaff,
    isPlayer,
    isParent,
    createNewTeam: performCreateNewTeam,
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
        batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), { userId: firebaseUser.uid, teamId: tid, teamName: tData.teamName, teamCode: code.toUpperCase(), role: 'Member', isPro: tData.isPro || false, planId: tData.planId || (tData.isPro ? 'squad_pro' : 'starter_squad'), joinedAt: new Date().toISOString(), createdBy: tData.createdBy, ownerUserId: tData.ownerUserId || tData.createdBy, leagueIds: tData.leagueIds || [], sport: tData.sport || 'General' }); 
        await batch.commit(); setActiveTeamId(tid); return true; 
      } catch (e) { return false; }
    },
    addEvent: (e: any) => activeTeam?.id && addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'events'), { ...e, teamId: activeTeam.id, createdBy: firebaseUser?.uid, createdAt: new Date().toISOString(), userRsvps: {}, specialWaiverResponses: {}, teamAgreements: {}, lastUpdated: new Date().toISOString() }),
    updateEvent: (id: string, e: any) => activeTeam?.id && updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'events', id), { ...e, lastUpdated: new Date().toISOString() }),
    deleteEvent: (id: string) => activeTeam?.id && deleteDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'events', id)),
    submitEventWaiver: async (eid: string, agreed: boolean) => {
      if (!activeTeam?.id || !firebaseUser) return;
      const ref = doc(db, 'teams', activeTeam.id, 'events', eid);
      updateDocumentNonBlocking(ref, { [`specialWaiverResponses.${firebaseUser.uid}`]: { agreed, timestamp: new Date().toISOString() } });
    },
    signTeamTournamentWaiver: async (hostTeamId: string, eventId: string, teamName: string) => {
      if (!firebaseUser || !userProfile) return;
      const ref = doc(db, 'teams', hostTeamId, 'events', eventId);
      updateDocumentNonBlocking(ref, {
        [`teamAgreements.${teamName}`]: {
          agreed: true,
          captainName: userProfile.name,
          timestamp: new Date().toISOString()
        }
      });
      toast({ title: "Waiver Verified", description: `You have officially signed for ${teamName}.` });
    },
    signPublicTournamentWaiver: async (hostTeamId: string, eventId: string, teamName: string, coachName: string) => {
      try {
        const ref = doc(db, 'teams', hostTeamId, 'events', eventId);
        await updateDoc(ref, {
          [`teamAgreements.${teamName}`]: {
            agreed: true,
            captainName: coachName,
            timestamp: new Date().toISOString()
          }
        });
        return true;
      } catch (error) {
        return false;
      }
    },
    addGame: (g: any) => {
      if (!activeTeam?.id) return;
      addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'games'), { ...g, teamId: activeTeam.id, createdBy: firebaseUser?.uid, createdAt: new Date().toISOString() });
    },
    updateGame: (id: string, g: any) => activeTeam?.id && updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'games', id), g),
    addDrill: (d: any) => activeTeam?.id && addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'drills'), { ...d, teamId: activeTeam.id, createdBy: firebaseUser?.uid, createdAt: new Date().toISOString() }),
    deleteDrill: (id: string) => activeTeam?.id && deleteDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'drills', id)),
    addFile: async (n: string, t: string, sb: number, u: string, cat?: string, desc?: string, ct?: string) => {
      if (!activeTeam?.id) return;
      let finalUrl = u;
      if (t === 'jpg' || t === 'png' || t === 'jpeg') finalUrl = await compressImage(u);
      addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'files'), { name: n, type: t, size: (sb / 1024 / 1024).toFixed(1) + ' MB', sizeBytes: sb, url: finalUrl, teamId: activeTeam.id, uploadedBy: userProfile?.name, uploaderId: firebaseUser?.uid, date: new Date().toISOString(), category: cat || 'Other', description: desc || '', complianceType: ct || 'none', tags: [], comments: [], annotations: [], viewedBy: {} });
    },
    addExternalLink: (n: string, u: string, cat?: string, desc?: string, ct?: string) => activeTeam?.id && addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'files'), { name: n, type: 'link', size: 'URL', sizeBytes: 0, url: u, teamId: activeTeam.id, uploadedBy: userProfile?.name, uploaderId: firebaseUser?.uid, date: new Date().toISOString(), category: cat || 'Other', description: desc || '', complianceType: ct || 'none', tags: [], comments: [], annotations: [], viewedBy: {} }),
    deleteFile: (id: string) => activeTeam?.id && deleteDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'files', id)),
    markMediaAsViewed: (fid: string) => {
      if (!activeTeam?.id || !firebaseUser) return;
      const ref = doc(db, 'teams', activeTeam.id, 'files', fid);
      updateDocumentNonBlocking(ref, { [`viewedBy.${firebaseUser.uid}`]: true });
    },
    addMediaComment: (fid: string, txt: string) => {
      if (!activeTeam?.id || !userProfile) return;
      const ref = doc(db, 'teams', activeTeam.id, 'files', fid);
      updateDocumentNonBlocking(ref, { comments: arrayUnion({ id: 'c' + Date.now(), authorId: userProfile.id, authorName: userProfile.name, text: txt, createdAt: new Date().toISOString() }) });
    },
    addMediaTag: (fid: string, tag: string) => {
      if (!activeTeam?.id) return;
      const ref = doc(db, 'teams', activeTeam.id, 'files', fid);
      updateDocumentNonBlocking(ref, { tags: arrayUnion(tag) });
    },
    addMediaAnnotation: (fid: string, ts: number, lbl: string, desc?: string) => {
      if (!activeTeam?.id) return;
      const ref = doc(db, 'teams', activeTeam.id, 'files', fid);
      updateDocumentNonBlocking(ref, { annotations: arrayUnion({ id: 'a' + Date.now(), timestamp: ts, label: lbl, description: desc }) });
    },
    createChat: async (name: string, memberIds: string[]) => { 
      if (!activeTeam?.id || !firebaseUser) return ''; 
      try { const docRef = await addDoc(collection(db, 'teams', activeTeam.id, 'groupChats'), { teamId: activeTeam.id, name, memberIds: [...memberIds, firebaseUser.uid], createdBy: firebaseUser.uid, createdAt: new Date().toISOString(), lastMessage: '', unread: 0 }); return docRef.id; } catch (e) { return ''; }
    },
    addMessage: async (cid: string, auth: string, content: string, type: string, img?: string, poll?: any, isOpponentCoach?: boolean, opponentTeamName?: string) => {
      if (!activeTeam?.id) return;
      let finalImg = img;
      if (img) finalImg = await compressImage(img);
      addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'groupChats', cid, 'messages'), { author: auth, authorId: firebaseUser?.uid, content, type, imageUrl: finalImg || null, poll: poll || null, createdAt: new Date().toISOString(), isOpponentCoach: isOpponentCoach || false, opponentTeamName: opponentTeamName || null });
    },
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
      } catch (e) { return; }
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
      try { const mid = `member_${Date.now()}`; await setDoc(doc(db, 'teams', tid, 'members', mid), { userId: `unlinked_${Date.now()}`, teamId: tid, name: reg.name, role: 'Member', position: 'Player', avatar: '', joinedAt: new Date().toISOString() }); await deleteDoc(doc(db, 'teams', tid, 'events', eid, 'registrations', reg.id)); toast({ title: "Promoted to Roster" }); } catch (e) { return; } 
    },
    updateMember: (mid: string, updates: Partial<Member>) => { if (activeTeam?.id) updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'members', mid), updates); },
    submitLead: async (data: any) => { try { await addDoc(collection(db, 'leads'), { ...data, createdAt: new Date().toISOString() }); return true; } catch { return false; } },
    alerts,
    createAlert: async (title: string, message: string) => { if (activeTeam?.id && firebaseUser) addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'alerts'), { teamId: activeTeam.id, title, message, createdBy: firebaseUser.uid, createdAt: new Date().toISOString() }); },
    isLoading: isUserLoading, 
    isSuperAdmin,
    isPro,
    hasFeature: (key: string) => !!activePlanFeatures[key] || (isSuperAdmin && !simulationPlanId),
    purchasePro: async () => setIsPaywallOpen(true),
    manageSubscription: async () => { if (!isRCInitialized) return; try { await Purchases.getSharedInstance().openCustomerCenter(); } catch { return; } },
    isPaywallOpen, setIsPaywallOpen,
    isRCInitialized,
    formatTime: (d: any) => (typeof d === 'string' ? new Date(d) : d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }),
    plans,
    isPlansLoading,
    simulationPlanId, setSimulationPlanId,
    resetDemo: async () => { if (userProfile?.isDemo && db && firebaseUser) { await resetDemoEnvironment(db, activeTeamId || '', userProfile.activePlanId || 'starter_squad', firebaseUser.uid); toast({ title: "Environment Re-seeded" }); } },
    resetSeasonData: async () => {
      if (!activeTeam?.id || !db) return;
      try {
        const batch = writeBatch(db);
        const gamesSnap = await getDocs(collection(db, 'teams', activeTeam.id, 'games'));
        const eventsSnap = await getDocs(collection(db, 'teams', activeTeam.id, 'events'));
        gamesSnap.forEach(d => batch.delete(d.ref));
        eventsSnap.forEach(d => batch.delete(d.ref));
        await batch.commit();
        toast({ title: "Season Reset", description: "Games and schedule data has been cleared." });
      } catch (e) {
        toast({ title: "Reset Failed", variant: "destructive" });
      }
    },
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
        const updates = { isPro: isStillPro, planId: isStillPro ? t.planId : 'starter_squad', isProPendingRemoval: false };
        batch.update(doc(db, 'teams', t.id), updates);
        batch.update(doc(db, 'users', firebaseUser.uid, 'teamMemberships', t.id), updates);
      });
      try { await batch.commit(); toast({ title: "Quota Resolved" }); } catch (e) { return; }
    },
    assignManualPlan: async (targetUserId: string, planId: string, limit: number) => {
      if (!isSuperAdmin || !db) return;
      try {
        const timestamp = new Date().toISOString();
        const batch = writeBatch(db);
        batch.update(doc(db, 'users', targetUserId), { activePlanId: planId, proTeamLimit: limit, planSource: 'manual' });
        batch.set(doc(db, 'subscriptions', targetUserId), { userId: targetUserId, productId: planId, entitlementActive: true, proTeamLimit: limit, source: 'manual', lastSyncedAt: timestamp }, { merge: true });
        await batch.commit(); toast({ title: "Organization Assigned" });
      } catch (e) { return; }
    },
    createLeague: async (name: string, sport?: string) => {
      if (!firebaseUser || !activeTeam) return '';
      const lid = `league_${Date.now()}`;
      const lData: League = {
        id: lid,
        name,
        creatorId: firebaseUser.uid,
        createdAt: new Date().toISOString(),
        sport: sport || activeTeam.sport || 'General',
        teams: { [activeTeam.id]: { teamName: activeTeam.name, teamLogoUrl: activeTeam.teamLogoUrl || '', wins: 0, losses: 0, ties: 0, points: 0 } }
      };
      await setDoc(doc(db, 'leagues', lid), lData);
      updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id), { leagueIds: [...(activeTeam.leagueIds || []), lid] });
      updateDocumentNonBlocking(doc(db, 'users', firebaseUser.uid, 'teamMemberships', activeTeam.id), { leagueIds: [...(activeTeam.leagueIds || []), lid] });
      return lid;
    },
    inviteTeamToLeague: async (leagueId: string, leagueName: string, email: string) => {
      const inviteId = `inv_${Date.now()}`;
      await setDoc(doc(db, 'leagues', leagueId, 'invites', inviteId), { id: inviteId, leagueId, leagueName, invitedEmail: email, status: 'pending', createdAt: new Date().toISOString() });
      toast({ title: "Invite Sent" });
    },
    acceptLeagueInvite: async (inviteId: string, leagueId: string) => {
      if (!activeTeam || !firebaseUser) return;
      const batch = writeBatch(db);
      batch.update(doc(db, 'leagues', leagueId), { [`teams.${activeTeam.id}`]: { teamName: activeTeam.name, teamLogoUrl: activeTeam.teamLogoUrl || '', wins: 0, losses: 0, ties: 0, points: 0 } });
      batch.update(doc(db, 'leagues', leagueId, 'invites', inviteId), { status: 'accepted' });
      batch.update(doc(db, 'teams', activeTeam.id), { leagueIds: [...(activeTeam.leagueIds || []), leagueId] });
      batch.update(doc(db, 'users', firebaseUser.uid, 'teamMemberships', activeTeam.id), { leagueIds: [...(activeTeam.leagueIds || []), leagueId] });
      await batch.commit(); toast({ title: "Joined League" });
    },
    manuallyAddTeamToLeague: async (leagueId: string, teamName: string, email: string, logoUrl?: string) => {
      const teamId = `manual_${Date.now()}`;
      await updateDoc(doc(db, 'leagues', leagueId), {
        [`teams.${teamId}`]: {
          teamName,
          teamLogoUrl: logoUrl || '',
          wins: 0,
          losses: 0,
          ties: 0,
          points: 0,
          coachEmail: email
        }
      });
      toast({ title: "Squad Enrolled", description: `${teamName} added to ledger.` });
    },
    saveLeagueRegistrationConfig: async (leagueId: string, updates: Partial<LeagueRegistrationConfig>) => {
      const ref = doc(db, 'leagues', leagueId, 'registration', 'config');
      await setDoc(ref, { ...updates, league_id: leagueId, created_by: firebaseUser?.uid, updated_at: new Date().toISOString() }, { merge: true });
      toast({ title: "Config Saved", description: "Registration protocols updated." });
    },
    submitRegistrationEntry: async (leagueId: string, answers: Record<string, any>, version: number) => {
      const col = collection(db, 'leagues', leagueId, 'registrationEntries');
      await addDoc(col, { league_id: leagueId, form_version: version, answers, status: 'pending', assigned_team_id: null, created_at: new Date().toISOString(), payment_received: false });
      toast({ title: "Registration Dispatched", description: "Your squad application has been sent." });
    },
    assignEntryToTeam: async (leagueId: string, entryId: string, teamId: string | null) => {
      const ref = doc(db, 'leagues', leagueId, 'registrationEntries', entryId);
      await updateDoc(ref, { assigned_team_id: teamId, status: teamId ? 'assigned' : 'pending' });
      toast({ title: teamId ? "Tactical Assignment" : "Assignment Cleared", description: "Entry status synchronized." });
    },
    respondToAssignment: async (leagueId: string, entryId: string, status: 'accepted' | 'declined') => {
      const ref = doc(db, 'leagues', leagueId, 'registrationEntries', entryId);
      await updateDoc(ref, { status });
      if (status === 'accepted' && activeTeam) {
        const entrySnap = await getDocs(query(collection(db, 'leagues', leagueId, 'registrationEntries'), where('__name__', '==', entryId)));
        if (!entrySnap.empty) {
          const entryData = entrySnap.docs[0].data();
          const name = entryData.answers['name'] || entryData.answers['fullName'] || 'New Player';
          const mid = `member_reg_${Date.now()}`;
          await setDoc(doc(db, 'teams', activeTeam.id, 'members', mid), { id: mid, userId: `unlinked_${Date.now()}`, teamId: activeTeam.id, name, role: 'Member', position: 'Player', jersey: 'TBD', avatar: '', joinedAt: new Date().toISOString(), feesPaid: false, amountOwed: 0 });
          toast({ title: "Roster Enrolled", description: `${name} has joined the squad.` });
        }
      } else if (status === 'declined') {
        toast({ title: "Assignment Relinquished", description: "Entry returned to league pool." });
      }
    },
    toggleRegistrationPaymentStatus: async (leagueId: string, entryId: string, status: boolean) => {
      const ref = doc(db, 'leagues', leagueId, 'registrationEntries', entryId);
      await updateDoc(ref, { payment_received: status });
      toast({ title: status ? "Payment Logged" : "Payment Pending", description: "Financial ledger updated." });
    }
  }), [userProfile, activeTeam, teams, isTeamsLoading, members, isMembersLoading, currentMember, isStaff, isPlayer, isParent, isUserLoading, isSuperAdmin, isPaywallOpen, isRCInitialized, db, firebaseUser, activePlanFeatures, plans, isPlansLoading, simulationPlanId, isSeedingDemo, isClubManager, secondsUntilReset, isPro, proQuotaStatus, canAddProTeam, alerts, router, performCreateNewTeam, cachedPlans]);

  return <TeamContext.Provider value={contextValue}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (context === undefined) throw new Error('useTeam must be used within a TeamProvider');
  return context;
}
