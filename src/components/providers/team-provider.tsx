"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo, useCallback } from 'react';
import { useFirestore, useMemoFirebase, useUser, useCollection } from '@/firebase';
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
  collectionGroup,
  serverTimestamp,
  arrayRemove
} from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';

// --- TYPE DEFINITIONS ---
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
  seenAlertIds?: string[];
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
  recruitingProfileEnabled?: boolean;
  photoURL?: string;
};

export type RecruitingProfile = {
  playerId: string;
  status: "active" | "hidden" | "committed";
  primaryPosition: string;
  secondaryPosition?: string;
  height: string;
  weight: string;
  dominantHand: string;
  hometown: string;
  graduationYear: number;
  academicGPA: number;
  intendedMajor?: string;
  highlightVideo?: string;
  fullGameFilm?: string;
  skillsVideo?: string;
  bio: string;
  createdAt: any;
  updatedAt: any;
};

export type AthleticMetrics = {
  fortyYardDash?: number;
  verticalJump?: number;
  wingspan?: number;
  benchPress?: number;
  squat?: number;
  enduranceScore?: number;
  verified: boolean;
};

export type PlayerStat = {
  id: string;
  season: string;
  gamesPlayed: number;
  points: number;
  assists: number;
  rebounds: number;
  goals: number;
  tackles: number;
  customStats?: Record<string, any>;
};

export type PlayerEvaluation = {
  id: string;
  evaluatorId: string;
  evaluatorRole: "coach" | "scout";
  athleticism: number;
  skillLevel: number;
  gameIQ: number;
  competitiveness: number;
  coachability: number;
  leadership: number;
  notes: string;
  createdAt: any;
};

export type RecruitingContact = {
  playerEmail?: string;
  playerPhone?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  coachName?: string;
  coachEmail?: string;
  coachPhone?: string;
};

export type PlayerVideo = {
  id: string;
  title: string;
  type: "highlight" | "fullGame" | "skills";
  url: string;
  createdAt: any;
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
  registrationProtocolId?: string;
  leagueIds?: Record<string, boolean>;
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
  birthdate?: string;
  notes?: string;
  joinedAt?: string;
  amountOwed?: number;
  feesPaid?: boolean;
  totalFees?: number;
  parentEmail?: string;
  medicalClearance?: boolean;
  gradYear?: string;
  gpa?: string;
  school?: string;
  highlightUrl?: string;
  phone?: string;
  skills?: string[];
  achievements?: string[];
};

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
  eventType: string;
  isTournament?: boolean;
  tournamentTeams?: string[];
  tournamentGames?: any[];
  userRsvps?: Record<string, string>;
  teamWaiverText?: string;
  teamAgreements?: Record<string, any>;
  customFormFields?: any[];
};

export type TeamAlert = {
  id: string;
  title: string;
  message: string;
  audience: 'everyone' | 'coaches' | 'players' | 'parents';
  createdAt: string;
  createdBy: string;
};

export type TeamIncident = {
  id: string;
  teamId: string;
  teamName: string;
  title: string;
  date: string;
  location: string;
  description: string;
  emergencyServicesCalled: boolean;
  witnesses?: string;
  actionsTaken?: string;
  createdAt: string;
  reportedBy: string;
};

export type VolunteerOpportunity = {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  slots: number;
  hoursPerSlot: number;
  isShareable?: boolean;
  signups: Record<string, any>;
};

export type FundraisingOpportunity = {
  id: string;
  title: string;
  description: string;
  goalAmount: number;
  currentAmount: number;
  deadline: string;
  isShareable?: boolean;
  externalLink?: string;
  eTransferDetails?: string;
  finances?: Record<string, any>;
};

export type DonationEntry = {
  id: string;
  donorName: string;
  amount: number;
  method: 'external' | 'etransfer';
  status: 'pending' | 'verified';
  createdAt: string;
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
  teamId?: string;
  teamName?: string;
  memberId?: string;
  documentId?: string;
  waiverType?: string;
};

export type League = {
  id: string;
  name: string;
  sport: string;
  teams: Record<string, any>;
  memberTeamIds?: string[];
  finances: Record<string, any>;
  globalFees?: any;
  creatorId: string;
  schedule?: any[];
  inviteCode?: string;
  teamAgreements?: Record<string, any>;
};

export type LeagueInvite = {
  id: string;
  leagueId: string;
  leagueName: string;
  invitedEmail: string;
  teamName?: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
};

export type Facility = {
  id: string;
  name: string;
  address: string;
  clubId: string;
  notes?: string;
};

export type Field = {
  id: string;
  name: string;
  facilityId: string;
};

export type LeagueRegistrationConfig = {
  id: string;
  title: string;
  description: string;
  registration_cost: string;
  is_active: boolean;
  form_schema: any[];
  form_version: number;
  waiver_text?: string;
  confirmation_message?: string;
};

export type RegistrationEntry = {
  id: string;
  league_id: string;
  answers: Record<string, any>;
  created_at: string;
  status: 'pending' | 'assigned' | 'accepted' | 'declined';
  payment_received: boolean;
  assigned_team_id?: string;
  assigned_team_owner_id?: string;
  waiver_signed_text?: string;
};

export type EquipmentItem = {
  id: string;
  name: string;
  category: string;
  totalQuantity: number;
  availableQuantity: number;
  description?: string;
  status: string;
  assignments: Record<string, { userId: string; userName: string; quantity: number; date: string }>;
};

interface TeamContextType {
  db: any;
  user: UserProfile | null;
  activeTeam: Team | null;
  setActiveTeam: (team: Team) => void;
  teams: Team[];
  isTeamsLoading: boolean;
  members: Member[];
  isMembersLoading: boolean;
  currentMember: Member | null;
  isStaff: boolean;
  isPro: boolean;
  isParent: boolean;
  isPlayer: boolean;
  isSuperAdmin: boolean;
  isClubManager: boolean;
  householdEvents: TeamEvent[];
  householdBalance: number;
  alerts: TeamAlert[];
  unreadAlertsCount: number;
  markAlertAsSeen: (id: string) => void;
  markAllAlertsAsSeen: () => void;
  seenAlertIds: string[];
  plans: any[];
  proQuotaStatus: { current: number; limit: number; remaining: number; exceeded: boolean };
  isPaywallOpen: boolean;
  setIsPaywallOpen: (open: boolean) => void;
  myChildren: PlayerProfile[];
  hasFeature: (id: string) => boolean;
  isSeedingDemo: boolean;
  setIsSeedingDemo: (seeding: boolean) => void;
  
  getRecruitingProfile: (playerId: string) => Promise<RecruitingProfile | null>;
  updateRecruitingProfile: (playerId: string, data: Partial<RecruitingProfile>) => Promise<void>;
  getAthleticMetrics: (playerId: string) => Promise<AthleticMetrics | null>;
  updateAthleticMetrics: (playerId: string, data: Partial<AthleticMetrics>) => Promise<void>;
  getPlayerStats: (playerId: string) => Promise<PlayerStat[]>;
  addPlayerStat: (playerId: string, data: Partial<PlayerStat>) => Promise<void>;
  deletePlayerStat: (playerId: string, statId: string) => Promise<void>;
  getEvaluations: (playerId: string) => Promise<PlayerEvaluation[]>;
  addEvaluation: (playerId: string, data: Partial<PlayerEvaluation>) => Promise<void>;
  getRecruitingContact: (playerId: string) => Promise<RecruitingContact | null>;
  updateRecruitingContact: (playerId: string, data: Partial<RecruitingContact>) => Promise<void>;
  getPlayerVideos: (playerId: string) => Promise<PlayerVideo[]>;
  addPlayerVideo: (playerId: string, data: Partial<PlayerVideo>) => Promise<void>;
  deletePlayerVideo: (playerId: string, videoId: string) => Promise<void>;
  toggleRecruitingProfile: (playerId: string, enabled: boolean) => Promise<void>;
  updateStaffEvaluation: (memberId: string, notes: string) => Promise<void>;
  getStaffEvaluation: (memberId: string) => Promise<string>;

  createNewTeam: (name: string, type: "adult" | "youth", pos: string, description?: string, planId?: string) => Promise<string>;
  joinTeamWithCode: (code: string, playerId: string, position: string) => Promise<boolean>;
  updateUser: (updates: Partial<UserProfile>) => Promise<void>;
  updateMember: (memberId: string, updates: Partial<Member>) => Promise<void>;
  updateTeamDetails: (updates: Partial<Team>) => Promise<void>;
  updateTeamHero: (url: string) => Promise<void>;
  updateTeamPlan: (teamId: string, planId: string) => Promise<void>;
  signTeamDocument: (docId: string, signatureText: string, targetMemberId: string) => Promise<boolean>;
  createTeamDocument: (data: any) => Promise<void>;
  updateTeamDocument: (docId: string, data: any) => Promise<void>;
  addEvent: (data: any) => Promise<boolean>;
  updateEvent: (id: string, data: any) => Promise<boolean>;
  deleteEvent: (id: string) => Promise<void>;
  updateRSVP: (eventId: string, status: string) => Promise<void>;
  addMessage: (chatId: string, author: string, content: string, type: string, img?: string, poll?: any) => Promise<void>;
  createChat: (name: string, members: string[]) => Promise<string>;
  resetSquadData: (categories: string[]) => Promise<void>;
  addVolunteerOpportunity: (data: any) => Promise<void>;
  signUpForVolunteer: (oppId: string) => Promise<void>;
  verifyVolunteerHours: (oppId: string, userId: string, hours: number) => Promise<void>;
  confirmVolunteerAttendance: (oppId: string, userId: string, confirmed: boolean) => Promise<void>;
  addFundraisingOpportunity: (data: any) => Promise<void>;
  signUpForFundraising: (fundId: string) => Promise<void>;
  confirmExternalDonation: (fundId: string, donationId: string, amount: number) => Promise<void>;
  addEquipmentItem: (data: any) => Promise<void>;
  updateEquipmentItem: (id: string, updates: any) => Promise<void>;
  deleteEquipmentItem: (id: string) => Promise<void>;
  assignEquipment: (id: string, userId: string, userName: string, qty: number) => Promise<void>;
  returnEquipment: (id: string, userId: string) => Promise<void>;
  addDrill: (data: any) => Promise<void>;
  addFile: (name: string, type: string, sBytes: number, url: string, category: string, desc?: string) => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
  addFacility: (data: any) => Promise<void>;
  deleteFacility: (id: string) => Promise<void>;
  addField: (facilityId: string, name: string) => Promise<void>;
  deleteField: (facilityId: string, fieldId: string) => Promise<void>;
  createLeague: (name: string) => Promise<string>;
  updateLeagueSchedule: (leagueId: string, schedule: any[]) => Promise<void>;
  inviteTeamToLeague: (leagueId: string, leagueName: string, email: string, teamName?: string) => Promise<void>;
  saveLeagueRegistrationConfig: (leagueId: string, updates: Partial<LeagueRegistrationConfig>) => Promise<void>;
  submitRegistrationEntry: (targetId: string, protocolId: string, answers: any, version: number, signature?: string, targetType?: 'leagues' | 'teams') => Promise<void>;
  assignEntryToTeam: (leagueId: string, entryId: string, teamId: string | null) => Promise<void>;
  toggleRegistrationPaymentStatus: (leagueId: string, entryId: string, paid: boolean) => Promise<void>;
  respondToAssignment: (contextId: string, entryId: string, status: 'accepted' | 'declined') => Promise<void>;
  signPublicTournamentWaiver: (teamId: string, eventId: string, tournamentTeamName: string, coachName: string) => Promise<boolean>;
  submitMatchScore: (teamId: string, eventId: string, gameId: string, isTeam1: boolean, score1: number, score2: number) => Promise<void>;
  submitLeagueMatchScore: (leagueId: string, gameId: string, isTeam1: boolean, score1: number, score2: number) => Promise<void>;
  disputeMatchScore: (teamId: string, eventId: string, gameId: string, notes: string) => Promise<void>;
  manageSubscription: () => Promise<void>;
  resolveQuota: (selectedTeamIds: string[]) => Promise<void>;
  createAlert: (title: string, message: string, audience: TeamAlert['audience']) => Promise<void>;
  deleteAlert: (alertId: string) => Promise<void>;
  exportAttendanceCSV: (eventId: string) => Promise<void>;
  exportTournamentStandingsCSV: (tournamentId: string) => Promise<void>;
  addIncident: (data: any) => Promise<void>;
  addLeaguePayment: (leagueId: string, teamId: string, data: any) => Promise<void>;
  updateLeagueGlobalFees: (leagueId: string, fees: any) => Promise<void>;
  purchasePro: () => void;
  updateLeagueTeamDetails: (leagueId: string, teamId: string, updates: any) => Promise<void>;
  manuallyAddTeamToLeague: (leagueId: string, name: string, email?: string) => Promise<void>;
  deleteLeagueInvite: (id: string) => Promise<void>;
  addRegistration: (teamId: string, eventId: string, data: any) => Promise<boolean>;
  deleteChat: (chatId: string) => Promise<void>;
  hideChatForUser: (chatId: string) => Promise<void>;
  votePoll: (chatId: string, messageId: string, optionIdx: number) => Promise<void>;
  formatTime: (iso: string) => string;
  updateChat: (chatId: string, data: any) => Promise<void>;
  deployClubProtocol: (data: any, teamIds: string[]) => Promise<void>;
  deleteTeam: (teamId: string) => Promise<void>;
  markMediaAsViewed: (fileId: string) => Promise<void>;
  upgradeChildToLogin: (childId: string) => Promise<void>;
  registerChild: (first: string, last: string, dob: string) => Promise<void>;
  assignManualPlan: (uid: string, planId: string, limit: number) => Promise<void>;
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
  const { user: firebaseUser, isAuthResolved } = useUser();
  const db = useFirestore();
  const router = useRouter();
  
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [myChildren, setMyChildren] = useState<PlayerProfile[]>([]);
  const [householdEvents, setHouseholdEvents] = useState<TeamEvent[]>([]);
  const [householdBalance, setHouseholdBalance] = useState(0);
  const [isSeedingDemo, setIsSeedingDemo] = useState(false);

  // 1. Initial State Derived Variables
  const seenAlertIds = useMemo(() => userProfile?.seenAlertIds || [], [userProfile?.seenAlertIds]);

  // 2. Core Profile Listener
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
          isDemo: data.isDemo,
          seenAlertIds: data.seenAlertIds || []
        });
      }
    });
  }, [firebaseUser?.uid, db, isAuthResolved]);

  // 3. Base Queries & Data
  const teamsQuery = useMemoFirebase(() => (isAuthResolved && firebaseUser?.uid && db) ? query(collection(db, 'users', firebaseUser.uid, 'teamMemberships')) : null, [isAuthResolved, firebaseUser?.uid, db]);
  const { data: teamsData, isLoading: isTeamsLoading } = useCollection(teamsQuery);
  const teamsRaw = useMemo(() => (teamsData || []).map(m => ({ ...m, id: m.teamId || m.id, name: m.name || m.teamName || 'Squad' })), [teamsData]);

  useEffect(() => {
    if (teamsRaw.length > 0 && !activeTeamId) setActiveTeamId(teamsRaw[0].id);
  }, [teamsRaw, activeTeamId]);

  const activeTeam = useMemo(() => teamsRaw.find(t => t.id === activeTeamId) || teamsRaw[0] || null, [teamsRaw, activeTeamId]);

  const membersQuery = useMemoFirebase(() => (isAuthResolved && activeTeam?.id && db) ? query(collection(db, 'teams', activeTeam.id, 'members')) : null, [isAuthResolved, activeTeam?.id, db]);
  const { data: membersData, isLoading: isMembersLoading } = useCollection<Member>(membersQuery);
  const members = useMemo(() => membersData || [], [membersData]);

  const alertsQuery = useMemoFirebase(() => (isAuthResolved && activeTeam?.id && db) ? query(collection(db, 'teams', activeTeam.id, 'alerts'), orderBy('createdAt', 'desc'), limit(10)) : null, [isAuthResolved, activeTeam?.id, db]);
  const { data: alertsData } = useCollection<TeamAlert>(alertsQuery);
  const alerts = alertsData || [];

  const plansQuery = useMemoFirebase(() => (db && isAuthResolved) ? collection(db, 'plans') : null, [db, isAuthResolved]);
  const { data: plansData } = useCollection(plansQuery);
  const plans = plansData || [];

  const unreadAlertsCount = useMemo(() => alerts.filter(a => !seenAlertIds.includes(a.id)).length, [alerts, seenAlertIds]);

  const isStaff = useMemo(() => {
    if (!activeTeam || !firebaseUser) return false;
    if (activeTeam.role === 'Admin') return true;
    const currentMember = members.find(m => m.userId === firebaseUser.uid);
    return ['Coach', 'Assistant Coach', 'Team Representative', 'Manager'].includes(currentMember?.position || '');
  }, [activeTeam, firebaseUser, members]);

  const isClubManager = useMemo(() => ['elite_teams', 'elite_league'].includes(userProfile?.activePlanId || ''), [userProfile?.activePlanId]);
  const isSuperAdmin = useMemo(() => userProfile?.email === 'thisearlyseason@gmail.com', [userProfile?.email]);

  // 4. Tactical Methods (useCallback definitions)
  const getRecruitingProfile = useCallback(async (playerId: string) => {
    if (!playerId || !db) return null;
    const s = await getDoc(doc(db, 'players', playerId, 'recruitingProfile', 'profile'));
    return s.exists() ? (s.data() as RecruitingProfile) : null;
  }, [db]);

  const updateRecruitingProfile = useCallback(async (playerId: string, data: Partial<RecruitingProfile>) => {
    if (!playerId || !db) return;
    await setDoc(doc(db, 'players', playerId, 'recruitingProfile', 'profile'), clean({ ...data, playerId, updatedAt: serverTimestamp() }), { merge: true });
  }, [db]);

  const getAthleticMetrics = useCallback(async (playerId: string) => {
    if (!playerId || !db) return null;
    const s = await getDoc(doc(db, 'players', playerId, 'recruitingProfile', 'metrics'));
    return s.exists() ? (s.data() as AthleticMetrics) : null;
  }, [db]);

  const updateAthleticMetrics = useCallback(async (playerId: string, data: Partial<AthleticMetrics>) => {
    if (!playerId || !db) return;
    await setDoc(doc(db, 'players', playerId, 'recruitingProfile', 'metrics'), clean(data), { merge: true });
  }, [db]);

  const getPlayerStats = useCallback(async (playerId: string) => {
    if (!playerId || !db) return [];
    const s = await getDocs(collection(db, 'players', playerId, 'recruitingProfile', 'stats'));
    return s.docs.map(d => ({ id: d.id, ...d.data() } as PlayerStat));
  }, [db]);

  const addPlayerStat = useCallback(async (playerId: string, data: Partial<PlayerStat>) => {
    if (!playerId || !db) return;
    await addDoc(collection(db, 'players', playerId, 'recruitingProfile', 'stats'), clean(data));
  }, [db]);

  const deletePlayerStat = useCallback(async (playerId: string, statId: string) => {
    if (!playerId || !db) return;
    await deleteDoc(doc(db, 'players', playerId, 'recruitingProfile', 'stats', statId));
  }, [db]);

  const getEvaluations = useCallback(async (playerId: string) => {
    if (!playerId || !db) return [];
    const s = await getDocs(collection(db, 'players', playerId, 'evaluations'));
    return s.docs.map(d => ({ id: d.id, ...d.data() } as PlayerEvaluation));
  }, [db]);

  const addEvaluation = useCallback(async (playerId: string, data: Partial<PlayerEvaluation>) => {
    if (!playerId || !db) return;
    await addDoc(collection(db, 'players', playerId, 'evaluations'), clean({ ...data, evaluatorId: firebaseUser?.uid, createdAt: serverTimestamp() }));
  }, [db, firebaseUser?.uid]);

  const getRecruitingContact = useCallback(async (playerId: string) => {
    if (!playerId || !db) return null;
    const s = await getDoc(doc(db, 'players', playerId, 'recruitingProfile', 'contact'));
    return s.exists() ? (s.data() as RecruitingContact) : null;
  }, [db]);

  const updateRecruitingContact = useCallback(async (playerId: string, data: Partial<RecruitingContact>) => {
    if (!playerId || !db) return;
    await setDoc(doc(db, 'players', playerId, 'recruitingProfile', 'contact'), clean(data), { merge: true });
  }, [db]);

  const getPlayerVideos = useCallback(async (playerId: string) => {
    if (!playerId || !db) return [];
    const s = await getDocs(collection(db, 'players', playerId, 'videos'));
    return s.docs.map(d => ({ id: d.id, ...d.data() } as PlayerVideo));
  }, [db]);

  const addPlayerVideo = useCallback(async (playerId: string, data: Partial<PlayerVideo>) => {
    if (!playerId || !db) return;
    await addDoc(collection(db, 'players', playerId, 'videos'), clean({ ...data, createdAt: serverTimestamp() }));
  }, [db]);

  const deletePlayerVideo = useCallback(async (playerId: string, videoId: string) => {
    if (!playerId || !db) return;
    await deleteDoc(doc(db, 'players', playerId, 'videos', videoId));
  }, [db]);

  const toggleRecruitingProfile = useCallback(async (playerId: string, enabled: boolean) => {
    if (!playerId || !db) return;
    await updateDoc(doc(db, 'players', playerId), { recruitingProfileEnabled: enabled });
  }, [db]);

  const updateStaffEvaluation = useCallback(async (memberId: string, notes: string) => {
    if (!activeTeam?.id || !db) return;
    await updateDoc(doc(db, 'teams', activeTeam.id, 'members', memberId), { notes });
  }, [db, activeTeam?.id]);

  const getStaffEvaluation = useCallback(async (memberId: string) => {
    if (!activeTeam?.id || !db) return '';
    const snap = await getDoc(doc(db, 'teams', activeTeam.id, 'members', memberId));
    return snap.exists() ? (snap.data().notes || '') : '';
  }, [db, activeTeam?.id]);

  const createNewTeam = useCallback(async (name: string, type: any, pos: string, description?: string, planId?: string) => {
    if (!firebaseUser || !db) return '';
    const tid = `team_${Date.now()}`;
    const batch = writeBatch(db);
    batch.set(doc(db, 'teams', tid), clean({ id: tid, teamName: name, teamCode: tid.slice(-6).toUpperCase(), type, sport: 'General', description, createdBy: firebaseUser.uid, ownerUserId: firebaseUser.uid, planId: planId || 'starter_squad', isPro: planId !== 'starter_squad', createdAt: new Date().toISOString() }));
    batch.set(doc(db, 'team_memberships', `${tid}_${firebaseUser.uid}`), clean({ teamId: tid, userId: firebaseUser.uid, role: 'Admin', joinedAt: new Date().toISOString() }));
    batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), clean({ teamId: tid, name, role: 'Admin', joinedAt: new Date().toISOString() }));
    batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), clean({ id: firebaseUser.uid, userId: firebaseUser.uid, playerId: `p_${firebaseUser.uid}`, name: firebaseUser.displayName, role: 'Admin', position: pos, joinedAt: new Date().toISOString(), avatar: userProfile?.avatar || '' }));
    await batch.commit();
    return tid;
  }, [firebaseUser, db, userProfile?.avatar]);

  const joinTeamWithCode = useCallback(async (code: string, playerId: string, position: string) => {
    if (!firebaseUser || !db) return false;
    const q = query(collection(db, 'teams'), where('teamCode', '==', code), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return false;
    const teamDoc = snap.docs[0];
    const tid = teamDoc.id;
    const batch = writeBatch(db);
    batch.set(doc(db, 'team_memberships', `${tid}_${firebaseUser.uid}`), clean({ teamId: tid, userId: firebaseUser.uid, role: 'Member', joinedAt: new Date().toISOString() }));
    batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), clean({ teamId: tid, name: teamDoc.data().teamName, role: 'Member', joinedAt: new Date().toISOString() }));
    batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), clean({ id: firebaseUser.uid, userId: firebaseUser.uid, playerId, name: firebaseUser.displayName, role: 'Member', position, joinedAt: new Date().toISOString(), avatar: userProfile?.avatar || '' }));
    await batch.commit();
    return true;
  }, [firebaseUser, db, userProfile?.avatar]);

  const createLeague = useCallback(async (name: string) => {
    if (!firebaseUser || !db || !activeTeam) return '';
    const id = `league_${Date.now()}`;
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const leagueData = { 
      id, name, sport: activeTeam.sport || 'General', creatorId: firebaseUser.uid, 
      inviteCode, memberTeamIds: [activeTeam.id], 
      teams: { [activeTeam.id]: { teamName: activeTeam.name, teamLogoUrl: activeTeam.teamLogoUrl || '', wins: 0, losses: 0, ties: 0, points: 0 } }, 
      finances: { [activeTeam.id]: { totalOwed: 0, totalPaid: 0, status: 'paid', payments: [] } }, 
      globalFees: { registration: 0 }, createdAt: new Date().toISOString() 
    };
    await setDoc(doc(db, 'leagues', id), clean(leagueData));
    await updateDoc(doc(db, 'teams', activeTeam.id), { [`leagueIds.${id}`]: true });
    return id;
  }, [firebaseUser, db, activeTeam]);

  const signUpForVolunteer = useCallback(async (oppId: string) => {
    if (!activeTeam?.id || !firebaseUser || !db) return;
    await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), { [`signups.${firebaseUser.uid}`]: { userId: firebaseUser.uid, userName: firebaseUser.displayName, email: firebaseUser.email, status: 'pending', createdAt: new Date().toISOString() } });
  }, [activeTeam?.id, firebaseUser, db]);

  const signUpForFundraising = useCallback(async (fundId: string) => {
    if (!activeTeam?.id || !firebaseUser || !db) return;
    await updateDoc(doc(db, 'teams', activeTeam.id, 'fundraising', fundId), {
      [`finances.${firebaseUser.uid}`]: {
        userId: firebaseUser.uid,
        userName: firebaseUser.displayName,
        status: 'joined',
        contributed: 0,
        createdAt: new Date().toISOString()
      }
    });
  }, [activeTeam?.id, firebaseUser, db]);

  const toggleRegistrationPaymentStatus = useCallback(async (leagueId: string, entryId: string, paid: boolean) => {
    if (!db) return;
    await updateDoc(doc(db, 'leagues', leagueId, 'registrationEntries', entryId), { payment_received: paid });
  }, [db]);

  const respondToAssignment = useCallback(async (contextId: string, entryId: string, status: 'accepted' | 'declined') => {
    if (!db) return;
    await updateDoc(doc(db, 'leagues', contextId, 'registrationEntries', entryId), { status });
  }, [db]);

  const assignEntryToTeam = useCallback(async (leagueId: string, entryId: string, teamId: string | null) => {
    if (!db) return;
    await updateDoc(doc(db, 'leagues', leagueId, 'registrationEntries', entryId), { assigned_team_id: teamId, status: teamId ? 'assigned' : 'pending' });
  }, [db]);

  const addVolunteerOpportunity = useCallback(async (data: any) => {
    if (!activeTeam?.id || !db) return;
    await addDoc(collection(db, 'teams', activeTeam.id, 'volunteers'), clean({ ...data, signups: {} }));
  }, [activeTeam?.id, db]);

  const verifyVolunteerHours = useCallback(async (oppId: string, userId: string, hours: number) => {
    if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), { [`signups.${userId}.status`]: 'verified', [`signups.${userId}.verifiedHours`]: hours });
  }, [activeTeam?.id, db]);

  const confirmVolunteerAttendance = useCallback(async (oppId: string, userId: string, confirmed: boolean) => {
    if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), { [`signups.${userId}.isConfirmed`]: confirmed });
  }, [activeTeam?.id, db]);

  const addFundraisingOpportunity = useCallback(async (data: any) => {
    if (activeTeam?.id && db) await addDoc(collection(db, 'teams', activeTeam.id, 'fundraising'), clean({ ...data, currentAmount: 0 }));
  }, [activeTeam?.id, db]);

  const confirmExternalDonation = useCallback(async (fundId: string, donationId: string, amount: number) => {
    if (!activeTeam || !db) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'teams', activeTeam.id, 'fundraising', fundId, 'donations', donationId), { status: 'verified', amount });
    batch.update(doc(db, 'teams', activeTeam.id, 'fundraising', fundId), { currentAmount: increment(amount) });
    await batch.commit();
  }, [db, activeTeam]);

  const addEquipmentItem = useCallback(async (data: any) => {
    if (!activeTeam?.id || !db) return;
    await addDoc(collection(db, 'teams', activeTeam.id, 'equipment'), clean({ ...data, availableQuantity: data.totalQuantity, assignments: {}, status: 'Active' }));
  }, [activeTeam?.id, db]);

  const updateEquipmentItem = useCallback(async (id: string, updates: any) => {
    if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'equipment', id), clean(updates));
  }, [activeTeam?.id, db]);

  const deleteEquipmentItem = useCallback(async (id: string) => {
    if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'equipment', id));
  }, [activeTeam?.id, db]);

  const assignEquipment = useCallback(async (id: string, userId: string, userName: string, qty: number) => {
    if (activeTeam?.id && db) {
      await updateDoc(doc(db, 'teams', activeTeam.id, 'equipment', id), {
        [`assignments.${userId}`]: { userId, userName, quantity: qty, date: new Date().toISOString() },
        availableQuantity: increment(-qty)
      });
    }
  }, [activeTeam?.id, db]);

  const returnEquipment = useCallback(async (id: string, userId: string) => {
    if (activeTeam?.id && db) {
      const snap = await getDoc(doc(db, 'teams', activeTeam.id, 'equipment', id));
      if (snap.exists()) {
        const qty = snap.data().assignments[userId]?.quantity || 0;
        const batch = writeBatch(db);
        batch.update(doc(db, 'teams', activeTeam.id, 'equipment', id), {
          [`assignments.${userId}`]: arrayRemove(snap.data().assignments[userId]) as any,
          availableQuantity: increment(qty)
        });
        await batch.commit();
      }
    }
  }, [activeTeam?.id, db]);

  const addDrill = useCallback(async (d: any) => { if (activeTeam?.id && db) await addDoc(collection(db, 'teams', activeTeam.id, 'drills'), clean(d)); }, [activeTeam?.id, db]);
  const addFile = useCallback(async (n: string, t: string, sb: number, u: string, c: string, d?: string) => { if (activeTeam?.id && db) await addDoc(collection(db, 'teams', activeTeam.id, 'files'), clean({ name: n, type: t, sizeBytes: sb, size: `${Math.round(sb/1024)}KB`, url: u, category: c, description: d, date: new Date().toISOString() })); }, [activeTeam?.id, db]);
  const deleteFile = useCallback(async (id: string) => { if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'files', id)); }, [activeTeam?.id, db]);
  const addFacility = useCallback(async (d: any) => { if (firebaseUser && db) await addDoc(collection(db, 'facilities'), clean({ ...d, clubId: firebaseUser.uid })); }, [db, firebaseUser]);
  const deleteFacility = useCallback(async (id: string) => { if(db) await deleteDoc(doc(db, 'facilities', id)); }, [db]);
  const addField = useCallback(async (fid: string, n: string) => { if(db) await addDoc(collection(db, 'facilities', fid, 'fields'), { name: n, facilityId: fid }); }, [db]);
  const deleteField = useCallback(async (fid: string, id: string) => { if(db) await deleteDoc(doc(db, 'facilities', fid, 'fields', id)); }, [db]);

  const updateLeagueSchedule = useCallback(async (lId: string, schedule: any[]) => { if (db) await updateDoc(doc(db, 'leagues', lId), { schedule: clean(schedule) }); }, [db]);
  const inviteTeamToLeague = useCallback(async (lId: string, lName: string, email: string, tName?: string) => { if (db) await addDoc(collection(db, 'leagues', 'global', 'invites'), clean({ leagueId: lId, leagueName: lName, invitedEmail: email, teamName: tName, status: 'pending', createdAt: new Date().toISOString() })); }, [db]);
  const manuallyAddTeamToLeague = useCallback(async (lId: string, name: string, email?: string) => { if (db) await updateDoc(doc(db, 'leagues', lId), { [`teams.manual_${Date.now()}`]: { teamName: name, coachEmail: email, wins: 0, losses: 0, ties: 0, points: 0 } }); }, [db]);
  const deleteLeagueInvite = useCallback(async (id: string) => { if (db) await deleteDoc(doc(db, 'leagues', 'global', 'invites', id)); }, [db]);
  const updateLeagueTeamDetails = useCallback(async (leagueId: string, teamId: string, updates: any) => { if (db) await updateDoc(doc(db, 'leagues', leagueId), { [`teams.${teamId}`]: clean(updates) }); }, [db]);
  const addLeaguePayment = useCallback(async (leagueId: string, teamId: string, data: any) => { if (db) await updateDoc(doc(db, 'leagues', leagueId), { [`finances.${teamId}.payments`]: arrayUnion(data), [`finances.${teamId}.totalPaid`]: increment(data.amount) }); }, [db]);
  const updateLeagueGlobalFees = useCallback(async (leagueId: string, fees: any) => { if (db) await updateDoc(doc(db, 'leagues', leagueId), { globalFees: clean(fees) }); }, [db]);
  const addRegistration = useCallback(async (teamId: string, eventId: string, data: any) => { if(db) await addDoc(collection(db, 'teams', teamId, 'events', eventId, 'registrations'), clean({ ...data, createdAt: new Date().toISOString() })); return true; }, [db]);
  const assignManualPlan = useCallback(async (uid: string, pid: string, lim: number) => { if(db) await updateDoc(doc(db, 'users', uid), { activePlanId: pid, proTeamLimit: lim, planSource: 'manual' }); }, [db]);

  const saveLeagueRegistrationConfig = useCallback(async (leagueId: string, updates: Partial<LeagueRegistrationConfig>) => {
    if (db) await setDoc(doc(db, 'leagues', leagueId, 'registration', updates.id || 'config'), clean(updates), { merge: true });
  }, [db]);

  const submitRegistrationEntry = useCallback(async (targetId: string, protocolId: string, answers: any, version: number, signature?: string, targetType?: 'leagues' | 'teams') => {
    if (db) await addDoc(collection(db, targetType || 'leagues', targetId, 'registrationEntries'), clean({ answers, form_version: version, status: 'pending', payment_received: false, waiver_signed_text: signature, created_at: new Date().toISOString() }));
  }, [db]);

  const signPublicTournamentWaiver = useCallback(async (tId: string, eId: string, teamName: string, cName: string) => {
    if (db) { await updateDoc(doc(db, 'teams', tId, 'events', eId), { [`teamAgreements.${teamName}`]: { agreed: true, captainName: cName, signedAt: new Date().toISOString() } }); return true; } return false;
  }, [db]);

  const submitMatchScore = useCallback(async (tId: string, eId: string, gId: string, isT1: boolean, s1: number, s2: number) => {
    if (db) {
      const snap = await getDoc(doc(db, 'teams', tId, 'events', eId));
      if (!snap.exists()) return;
      const games = snap.data().tournamentGames || [];
      const idx = games.findIndex((g: any) => g.id === gId);
      if (idx === -1) return;
      games[idx] = { ...games[idx], score1: s1, score2: s2, isCompleted: true };
      await updateDoc(doc(db, 'teams', tId, 'events', eId), { tournamentGames: games });
    }
  }, [db]);

  const submitLeagueMatchScore = useCallback(async (lId: string, gId: string, isT1: boolean, s1: number, s2: number) => {
    if (db) {
      const snap = await getDoc(doc(db, 'leagues', lId));
      if (!snap.exists()) return;
      const games = snap.data().schedule || [];
      const idx = games.findIndex((g: any) => g.id === gId);
      if (idx === -1) return;
      games[idx] = { ...games[idx], score1: s1, score2: s2, isCompleted: true };
      await updateDoc(doc(db, 'leagues', lId), { schedule: games });
    }
  }, [db]);

  const disputeMatchScore = useCallback(async (tId: string, eId: string, gId: string, notes: string) => {
    if (db) {
      const snap = await getDoc(doc(db, 'teams', tId, 'events', eId));
      if (!snap.exists()) return;
      const games = snap.data().tournamentGames || [];
      const idx = games.findIndex((g: any) => g.id === gId);
      if (idx === -1) return;
      games[idx] = { ...games[idx], isDisputed: true, disputeNotes: notes };
      await updateDoc(doc(db, 'teams', tId, 'events', eId), { tournamentGames: games });
    }
  }, [db]);

  const createAlert = useCallback(async (t: string, m: string, a: any) => {
    if (activeTeam?.id && firebaseUser && db) await addDoc(collection(db, 'teams', activeTeam.id, 'alerts'), clean({ title: t, message: m, audience: a, createdAt: new Date().toISOString(), createdBy: firebaseUser.uid }));
  }, [activeTeam?.id, db, firebaseUser]);

  const deleteAlert = useCallback(async (id: string) => { if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'alerts', id)); }, [activeTeam?.id, db]);

  const addIncident = useCallback(async (data: any) => {
    if (activeTeam?.id && firebaseUser && db) await addDoc(collection(db, 'teams', activeTeam.id, 'incidents'), clean({ ...data, teamId: activeTeam.id, teamName: activeTeam.name, reportedBy: firebaseUser.uid, createdAt: new Date().toISOString() }));
  }, [activeTeam?.id, db, firebaseUser]);

  const addMessage = useCallback(async (chatId: string, author: string, content: string, type: string, img?: string, poll?: any) => {
    if (activeTeam && db) await addDoc(collection(db, 'teams', activeTeam.id, 'groupChats', chatId, 'messages'), clean({ author, content, type, imageUrl: img, poll, createdAt: new Date().toISOString(), authorId: firebaseUser?.uid }));
  }, [db, activeTeam, firebaseUser]);

  const createChat = useCallback(async (name: string, mIds: string[]) => {
    if(activeTeam && firebaseUser && db) {
      const id = `chat_${Date.now()}`;
      await setDoc(doc(db, 'teams', activeTeam.id, 'groupChats', id), clean({ id, name, memberIds: [...mIds, firebaseUser.uid], createdAt: new Date().toISOString(), createdBy: firebaseUser.uid }));
      return id;
    }
    return '';
  }, [db, activeTeam, firebaseUser]);

  const resetSquadData = useCallback(async (categories: string[]) => {
    if (!activeTeam || !db) return;
    const batch = writeBatch(db);
    if (categories.includes('games')) { const games = await getDocs(collection(db, 'teams', activeTeam.id, 'games')); games.docs.forEach(d => batch.delete(d.ref)); }
    if (categories.includes('events')) { const events = await getDocs(collection(db, 'teams', activeTeam.id, 'events')); events.docs.forEach(d => batch.delete(d.ref)); }
    await batch.commit();
  }, [db, activeTeam]);

  const updateUser = useCallback(async (u: any) => { if (firebaseUser) await updateDoc(doc(db, 'users', firebaseUser.uid), clean(u)); }, [db, firebaseUser]);
  const updateMember = useCallback(async (mid: string, u: any) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id, 'members', mid), clean(u)); }, [db, activeTeam?.id]);
  const updateTeamDetails = useCallback(async (u: any) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id), clean(u)); }, [db, activeTeam?.id]);
  const updateTeamHero = useCallback(async (url: string) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id), { heroImageUrl: url }); }, [db, activeTeam?.id]);
  const updateTeamPlan = useCallback(async (tid: string, pid: string) => { if(db) await updateDoc(doc(db, 'teams', tid), { planId: pid, isPro: pid !== 'starter_squad' }); }, [db]);

  const signTeamDocument = useCallback(async (docId: string, sig: string, mid: string) => {
    if (!activeTeam || !firebaseUser || !db) return false;
    const certId = `cert_${Date.now()}`;
    const batch = writeBatch(db);
    batch.set(doc(db, 'teams', activeTeam.id, 'members', mid, 'signatures', docId), { docId, signature: sig, signedAt: new Date().toISOString() });
    batch.set(doc(db, 'teams', activeTeam.id, 'files', certId), { id: certId, name: `Signed Certificate: ${docId}`, category: 'Signed Certificate', url: '#', type: 'cert', size: '1kb', date: new Date().toISOString(), memberId: mid, documentId: docId });
    await batch.commit();
    return true;
  }, [db, activeTeam, firebaseUser]);

  const createTeamDocument = useCallback(async (data: any) => { if (activeTeam && db) await setDoc(doc(db, 'teams', activeTeam.id, 'documents', data.id || `doc_${Date.now()}`), clean(data)); }, [db, activeTeam]);
  const updateTeamDocument = useCallback(async (docId: string, data: any) => { if (activeTeam && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'documents', docId), clean(data)); }, [db, activeTeam]);
  const addEvent = useCallback(async (data: any) => { if (activeTeam && db) { await addDoc(collection(db, 'teams', activeTeam.id, 'events'), clean(data)); return true; } return false; }, [db, activeTeam]);
  const updateEvent = useCallback(async (id: string, data: any) => { if (activeTeam && db) { await updateDoc(doc(db, 'teams', activeTeam.id, 'events', id), clean(data)); return true; } return false; }, [db, activeTeam]);
  const deleteEvent = useCallback(async (id: string) => { if (activeTeam && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'events', id)); }, [db, activeTeam]);
  const updateRSVP = useCallback(async (eventId: string, status: string) => { if (activeTeam && firebaseUser && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'events', eventId), { [`userRsvps.${firebaseUser.uid}`]: status }); }, [db, activeTeam, firebaseUser]);

  const markAlertAsSeen = useCallback(async (id: string) => {
    if (firebaseUser && db) await updateDoc(doc(db, 'users', firebaseUser.uid), { seenAlertIds: arrayUnion(id) });
  }, [db, firebaseUser]);

  const markAllAlertsAsSeen = useCallback(async () => {
    if (firebaseUser && alerts.length > 0 && db) await updateDoc(doc(db, 'users', firebaseUser.uid), { seenAlertIds: alerts.map(a => a.id) });
  }, [db, firebaseUser, alerts]);

  const upgradeChildToLogin = useCallback(async (childId: string) => {
    if (db) await updateDoc(doc(db, 'players', childId), { hasLogin: true });
  }, [db]);

  const registerChild = useCallback(async (first: string, last: string, dob: string) => {
    if (firebaseUser && db) {
      await addDoc(collection(db, 'players'), clean({ 
        firstName: first, lastName: last, dateOfBirth: dob, 
        parentId: firebaseUser.uid, isMinor: true, hasLogin: false, 
        createdAt: new Date().toISOString() 
      }));
    }
  }, [db, firebaseUser]);

  const deleteChat = useCallback(async (chatId: string) => {
    if (activeTeam && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'groupChats', chatId));
  }, [db, activeTeam]);

  const hideChatForUser = useCallback(async (chatId: string) => {
    // Logic for hiding chat locally
  }, []);

  const votePoll = useCallback(async (chatId: string, messageId: string, optionIdx: number) => {
    if (!activeTeam || !firebaseUser || !db) return;
    const ref = doc(db, 'teams', activeTeam.id, 'groupChats', chatId, 'messages', messageId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const poll = snap.data().poll;
    const current = poll.voters?.[firebaseUser.uid];
    const u: any = { [`poll.voters.${firebaseUser.uid}`]: optionIdx };
    if (current === undefined) { 
      u[`poll.options.${optionIdx}.votes`] = increment(1); 
      u['poll.totalVotes'] = increment(1); 
    }
    else if (current !== optionIdx) { 
      u[`poll.options.${current}.votes`] = increment(-1); 
      u[`poll.options.${optionIdx}.votes`] = increment(1); 
    }
    await updateDoc(ref, u);
  }, [db, activeTeam, firebaseUser]);

  const updateChat = useCallback(async (chatId: string, data: any) => {
    if (activeTeam && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'groupChats', chatId), clean(data));
  }, [db, activeTeam]);

  const deployClubProtocol = useCallback(async (data: any, teamIds: string[]) => {
    if (!db) return;
    const batch = writeBatch(db);
    teamIds.forEach(tid => {
      const docRef = doc(db, 'teams', tid, 'documents', `club_${Date.now()}`);
      batch.set(docRef, clean({ ...data, isClubMaster: true, createdAt: new Date().toISOString() }));
    });
    await batch.commit();
  }, [db]);

  const deleteTeam = useCallback(async (teamId: string) => {
    if (db) await deleteDoc(doc(db, 'teams', teamId));
  }, [db]);

  // 5. Build Context
  const contextValue = useMemo(() => ({
    db, user: userProfile, activeTeam, setActiveTeam: (t: Team) => setActiveTeamId(t.id), teams: teamsRaw, isTeamsLoading, members, isMembersLoading,
    currentMember: members.find(m => m.userId === firebaseUser?.uid) || null,
    isStaff,
    isPro: activeTeam?.isPro || false, isParent: userProfile?.role === 'parent', isPlayer: userProfile?.role === 'adult_player',
    isSuperAdmin, isClubManager,
    householdEvents, householdBalance, myChildren, plans, proQuotaStatus: { current: 0, limit: 0, remaining: 0, exceeded: false },
    isPaywallOpen, setIsPaywallOpen, purchasePro: () => setIsPaywallOpen(true),
    hasFeature: (id: string) => true, alerts, unreadAlertsCount,
    markAlertAsSeen, markAllAlertsAsSeen, seenAlertIds, isSeedingDemo, setIsSeedingDemo,
    getRecruitingProfile, updateRecruitingProfile, getAthleticMetrics, updateAthleticMetrics,
    getPlayerStats, addPlayerStat, deletePlayerStat, getEvaluations, addEvaluation,
    getRecruitingContact, updateRecruitingContact, getPlayerVideos, addPlayerVideo, deletePlayerVideo,
    toggleRecruitingProfile, updateStaffEvaluation, getStaffEvaluation,
    createNewTeam, joinTeamWithCode, createLeague, signUpForVolunteer, addEquipmentItem,
    respondToAssignment, assignEntryToTeam, toggleRegistrationPaymentStatus, updateLeagueSchedule,
    inviteTeamToLeague, manuallyAddTeamToLeague, deleteLeagueInvite, updateLeagueTeamDetails,
    addLeaguePayment, updateLeagueGlobalFees, deleteChat, hideChatForUser, votePoll, updateChat,
    deployClubProtocol, deleteTeam, markMediaAsViewed: async (fId: string) => {}, upgradeChildToLogin, registerChild,
    updateUser, updateMember, updateTeamDetails, updateTeamHero, updateTeamPlan,
    signTeamDocument, createTeamDocument, updateTeamDocument, addEvent, updateEvent,
    deleteEvent, updateRSVP, addMessage, resetSquadData, verifyVolunteerHours,
    confirmVolunteerAttendance, addFundraisingOpportunity, signUpForFundraising,
    confirmExternalDonation, addIncident, addRegistration, assignManualPlan,
    saveLeagueRegistrationConfig, submitRegistrationEntry, createChat,
    signPublicTournamentWaiver, submitMatchScore, submitLeagueMatchScore, disputeMatchScore,
    createAlert, deleteAlert, addDrill, addFile, deleteFile, addFacility, deleteFacility,
    addField, deleteField, addVolunteerOpportunity, updateEquipmentItem, deleteEquipmentItem,
    assignEquipment, returnEquipment,
    formatTime: (iso: string) => format(new Date(iso), 'h:mm a'),
    manageSubscription: async () => {},
    resolveQuota: async () => {},
    exportAttendanceCSV: async () => {},
    exportTournamentStandingsCSV: async () => {}
  }), [
    userProfile, activeTeam, teamsRaw, isTeamsLoading, members, isMembersLoading, firebaseUser, db, 
    householdEvents, householdBalance, myChildren, plans, isPaywallOpen, isSeedingDemo, seenAlertIds, alerts, unreadAlertsCount, isStaff,
    isSuperAdmin, isClubManager, getRecruitingProfile, updateRecruitingProfile, getAthleticMetrics, updateAthleticMetrics,
    getPlayerStats, addPlayerStat, deletePlayerStat, getEvaluations, addEvaluation,
    getRecruitingContact, updateRecruitingContact, getPlayerVideos, addPlayerVideo, deletePlayerVideo,
    toggleRecruitingProfile, updateStaffEvaluation, getStaffEvaluation, createNewTeam, joinTeamWithCode,
    createLeague, signUpForVolunteer, addEquipmentItem, respondToAssignment, assignEntryToTeam, 
    toggleRegistrationPaymentStatus, updateLeagueSchedule, inviteTeamToLeague, manuallyAddTeamToLeague, 
    deleteLeagueInvite, updateLeagueTeamDetails, addLeaguePayment, updateLeagueGlobalFees, deleteChat, 
    hideChatForUser, votePoll, updateChat, deployClubProtocol, deleteTeam, upgradeChildToLogin, registerChild, markAlertAsSeen, markAllAlertsAsSeen,
    updateUser, updateMember, updateTeamDetails, updateTeamHero, updateTeamPlan,
    signTeamDocument, createTeamDocument, updateTeamDocument, addEvent, updateEvent,
    deleteEvent, updateRSVP, addMessage, resetSquadData, verifyVolunteerHours,
    confirmVolunteerAttendance, addFundraisingOpportunity, signUpForFundraising,
    confirmExternalDonation, addIncident, addRegistration, assignManualPlan,
    saveLeagueRegistrationConfig, submitRegistrationEntry, createChat,
    signPublicTournamentWaiver, submitMatchScore, submitLeagueMatchScore, disputeMatchScore,
    createAlert, deleteAlert, addDrill, addFile, deleteFile, addFacility, deleteFacility,
    addField, deleteField, addVolunteerOpportunity, updateEquipmentItem, deleteEquipmentItem,
    assignEquipment, returnEquipment
  ]);

  return <TeamContext.Provider value={contextValue}>{children}</TeamContext.Provider>;
}

export const useTeam = () => {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within a TeamProvider');
  return context;
};