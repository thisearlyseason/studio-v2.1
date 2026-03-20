
"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo, useCallback } from 'react';
import { useFirestore, useMemoFirebase, useUser, useCollection, useDoc } from '@/firebase';
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
  deleteField,
  arrayRemove
} from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

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
  clubName?: string;
  clubDescription?: string;
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
  bio: string;
  updatedAt: any;
};

export type AthleticMetrics = {
  fortyYardDash?: number;
  verticalJump?: number;
  wingspan?: number;
  benchPress?: number;
  squat?: number;
  verified: boolean;
};

export type PlayerStat = {
  id: string;
  season: string;
  gamesPlayed: number;
  points: number;
  assists: number;
};

export type PlayerEvaluation = {
  id: string;
  evaluatorId: string;
  notes: string;
  createdAt: any;
  athleticism?: number;
  skillLevel?: number;
  gameIQ?: number;
  leadership?: number;
};

export type RecruitingContact = {
  playerEmail?: string;
  parentEmail?: string;
};

export type PlayerVideo = {
  id: string;
  title: string;
  type: "highlight" | "fullGame" | "skills";
  url: string;
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
  birthdate?: string;
  notes?: string;
  amountOwed?: number;
  feesPaid?: boolean;
  totalFees?: number;
  parentEmail?: string;
  medicalClearance?: boolean;
  gradYear?: string;
  gpa?: string;
  school?: string;
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
  location: string;
  description: string;
  eventType: string;
  isTournament?: boolean;
  isLeagueGame?: boolean;
  leagueId?: string;
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
  type: 'player' | 'team';
};

export type RegistrationEntry = {
  id: string;
  league_id: string;
  protocol_id: string;
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

export type TournamentGame = {
  id: string;
  team1: string;
  team2: string;
  team1Id?: string;
  team2Id?: string;
  score1: number;
  score2: number;
  date: string;
  time: string;
  location?: string;
  isCompleted: boolean;
  isDisputed?: boolean;
  disputeNotes?: string;
  updatedAt?: string;
};

export type Message = {
  id: string;
  author: string;
  authorId: string;
  content: string;
  type: 'text' | 'image' | 'poll';
  imageUrl?: string;
  poll?: {
    id: string;
    question: string;
    options: Array<{ text: string; votes: number }>;
    totalVotes: number;
    voters: Record<string, number>;
    isClosed: boolean;
  };
  createdAt: string;
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
  isPlansLoading: boolean;
  proQuotaStatus: { current: number; limit: number; remaining: number; exceeded: boolean };
  isPaywallOpen: boolean;
  setIsPaywallOpen: (open: boolean) => void;
  myChildren: PlayerProfile[];
  hasFeature: (id: string) => boolean;
  isSeedingDemo: boolean;
  setIsSeedingDemo: (seeding: boolean) => void;
  isRCInitialized: boolean;
  
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
  deleteChat: (chatId: string) => Promise<void>;
  hideChatForUser: (chatId: string) => Promise<void>;
  votePoll: (chatId: string, messageId: string, optionIdx: number) => Promise<void>;
  updateChat: (chatId: string, data: any) => Promise<void>;
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
  removeTeamFromLeague: (leagueId: string, teamId: string) => Promise<void>;
  inviteTeamToLeague: (leagueId: string, leagueName: string, email: string, teamName?: string) => Promise<void>;
  saveLeagueRegistrationConfig: (leagueId: string, protocolId: string, updates: Partial<LeagueRegistrationConfig>) => Promise<void>;
  submitRegistrationEntry: (targetId: string, protocolId: string, answers: any, version: number, signature?: string, targetType?: 'leagues' | 'teams') => Promise<void>;
  assignEntryToTeam: (leagueId: string, entryId: string, teamId: string | null) => Promise<void>;
  toggleRegistrationPaymentStatus: (leagueId: string, entryId: string, paid: boolean) => Promise<void>;
  respondToAssignment: (contextId: string, entryId: string, status: 'accepted' | 'declined') => Promise<void>;
  signPublicTournamentWaiver: (teamId: string, eventId: string, tournamentTeamName: string, coachName: string) => Promise<boolean>;
  submitMatchScore: (teamId: string, eventId: string, gameId: string, isTeam1: boolean, score1: number, score2: number) => Promise<void>;
  submitLeagueMatchScore: (leagueId: string, gameId: string, isTeam1: boolean, score1: number, score2: number) => Promise<void>;
  disputeMatchScore: (teamId: string, eventId: string, gameId: string, notes: string) => Promise<void>;
  disputeLeagueMatchScore: (leagueId: string, gameId: string, notes: string) => Promise<void>;
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
  formatTime: (iso: string) => string;
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
  
  const [activeTeamId, setManualActiveTeamId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [isSeedingDemo, setIsSeedingDemo] = useState(false);

  useEffect(() => {
    if (!firebaseUser || !db) { setUserProfile(null); return; }
    const userRef = doc(db, 'users', firebaseUser.uid);
    return onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUserProfile({ 
          ...data, 
          id: snap.id,
          name: data.fullName || data.name || 'User',
          avatar: data.avatarUrl || data.avatar || `https://picsum.photos/seed/${snap.id}/150/150`
        } as UserProfile);
      }
    }, (error) => {
      // Propagate permission error to the listener
      const permissionError = new FirestorePermissionError({
        path: `users/${firebaseUser.uid}`,
        operation: 'get'
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  }, [firebaseUser, db]);

  const teamsQuery = useMemoFirebase(() => (isAuthResolved && firebaseUser?.uid && db) ? query(collection(db, 'users', firebaseUser.uid, 'teamMemberships')) : null, [isAuthResolved, firebaseUser?.uid, db]);
  const { data: teamsData, isLoading: isTeamsLoading } = useCollection(teamsQuery);
  
  const teamsRaw = useMemo(() => (teamsData || []).map(m => ({ 
    ...m, 
    id: m.teamId || m.id, 
    name: m.name || m.teamName || 'Squad' 
  })), [teamsData]);

  const activeTeam = useMemo(() => teamsRaw.find(t => t.id === activeTeamId) || teamsRaw[0] || null, [teamsRaw, activeTeamId]);

  const membersQuery = useMemoFirebase(() => (isAuthResolved && activeTeam?.id && db) ? query(collection(db, 'teams', activeTeam.id, 'members')) : null, [isAuthResolved, activeTeam?.id, db]);
  const { data: membersData, isLoading: isMembersLoading } = useCollection<Member>(membersQuery);
  const members = useMemo(() => membersData || [], [membersData]);

  const alertsQuery = useMemoFirebase(() => (isAuthResolved && activeTeam?.id && db) ? query(collection(db, 'teams', activeTeam.id, 'alerts'), orderBy('createdAt', 'desc'), limit(10)) : null, [isAuthResolved, activeTeam?.id, db]);
  const { data: alertsData } = useCollection<TeamAlert>(alertsQuery);
  const alerts = useMemo(() => alertsData || [], [alertsData]);
  
  const seenAlertIds = useMemo(() => userProfile?.seenAlertIds || [], [userProfile?.seenAlertIds]);
  const unreadAlertsCount = useMemo(() => alerts.filter(a => !seenAlertIds.includes(a.id)).length, [alerts, seenAlertIds]);

  const plansQuery = useMemoFirebase(() => (db && isAuthResolved) ? collection(db, 'plans') : null, [db, isAuthResolved]);
  const { data: plansData, isLoading: isPlansLoading } = useCollection(plansQuery);
  const plans = useMemo(() => plansData || [], [plansData]);

  const childrenQuery = useMemoFirebase(() => (db && firebaseUser?.uid) ? query(collection(db, 'players'), where('parentId', '==', firebaseUser.uid)) : null, [db, firebaseUser?.uid]);
  const { data: myChildrenRaw } = useCollection<PlayerProfile>(childrenQuery);
  const myChildren = useMemo(() => myChildrenRaw || [], [myChildrenRaw]);

  const householdEventsQuery = useMemoFirebase(() => {
    if (!db || !firebaseUser?.uid || !teamsData || teamsData.length === 0) return null;
    const teamIds = (teamsData || []).map(t => t.teamId).filter(Boolean);
    if (teamIds.length === 0) return null;
    // TACTICAL LIMIT: CollectionGroup with 'in' is restricted to 10 items.
    return query(collectionGroup(db, 'events'), where('teamId', 'in', teamIds.slice(0, 10)));
  }, [db, firebaseUser?.uid, teamsData]);
  const { data: householdEventsData } = useCollection<TeamEvent>(householdEventsQuery);
  const householdEvents = useMemo(() => householdEventsData || [], [householdEventsData]);

  const isSuperAdmin = useMemo(() => {
    if (!firebaseUser?.uid) return false;
    const superAdminUids = [
      '3Dybqi6vkHNUQQM66jiEZWfmwsW2',
      'wnvOuvwmoUhS5U4kdaBrZz7tGbF3',
      'PtT54iDDtUML1wslbZzxjDgbrFp1',
      'zGh7D5JfrFOkxhVJr79gtbzHPVC3',
      'E4EqTVTsEdfLI4rLEkMPHjeyxeJ2'
    ];
    return userProfile?.email === 'thisearlyseason@gmail.com' || superAdminUids.includes(firebaseUser.uid);
  }, [userProfile?.email, firebaseUser?.uid]);

  const isStaff = useMemo(() => {
    if (!firebaseUser) return false;
    if (isSuperAdmin) return true;
    if (userProfile?.role === 'coach' || userProfile?.role === 'admin') return true; 
    if (activeTeam?.role === 'Admin') return true;
    const currentMember = members.find(m => m.userId === firebaseUser.uid);
    const staffPositions = ['Coach', 'Assistant Coach', 'Team Representative', 'Manager', 'Squad Leader', 'Coach Guest'];
    return staffPositions.includes(currentMember?.position || '');
  }, [activeTeam, firebaseUser, members, userProfile, isSuperAdmin]);

  const isClubManager = useMemo(() => ['elite_teams', 'elite_league'].includes(userProfile?.activePlanId || '') || isSuperAdmin, [userProfile?.activePlanId, isSuperAdmin]);

  const proQuotaStatus = useMemo(() => {
    if (!userProfile?.id) return { current: 0, limit: 0, exceeded: false, remaining: 0 };
    const ownedProTeams = teamsRaw.filter(t => t.ownerUserId === userProfile.id && t.isPro);
    const limit = userProfile.proTeamLimit || 0;
    return { current: ownedProTeams.length, limit, exceeded: ownedProTeams.length > limit && limit > 0, remaining: Math.max(0, limit - ownedProTeams.length) };
  }, [teamsRaw, userProfile]);

  const isPro = useMemo(() => {
    if (isSuperAdmin) return true;
    return activeTeam?.isPro || userProfile?.activePlanId === 'squad_pro' || false;
  }, [activeTeam, userProfile, isSuperAdmin]);

  const hasFeature = useCallback((featureId: string) => {
    if (isSuperAdmin) return true;
    const currentPlanId = activeTeam?.planId || userProfile?.activePlanId || 'starter_squad';
    const plan = plans.find(p => p.id === currentPlanId);
    if (plan) return !!plan.features?.[featureId];
    return ['live_feed_read', 'basic_scheduling'].includes(featureId);
  }, [activeTeam, userProfile, plans, isSuperAdmin]);

  const formatTime = (iso: string) => { try { return format(new Date(iso), 'h:mm a'); } catch (e) { return '--:--'; } };

  // --- TACTICAL METHODS ---
  const getRecruitingProfile = useCallback(async (playerId: string) => { if (!db) return null; const snap = await getDoc(doc(db, 'players', playerId, 'recruitingProfile', 'profile')); return snap.exists() ? (snap.data() as RecruitingProfile) : null; }, [db]);
  const updateRecruitingProfile = useCallback(async (playerId: string, data: Partial<RecruitingProfile>) => { if (!db) return; await setDoc(doc(db, 'players', playerId, 'recruitingProfile', 'profile'), { ...clean(data), updatedAt: serverTimestamp() }, { merge: true }); }, [db]);
  const getAthleticMetrics = useCallback(async (playerId: string) => { if (!db) return null; const snap = await getDoc(doc(db, 'players', playerId, 'recruitingProfile', 'metrics')); return snap.exists() ? (snap.data() as AthleticMetrics) : null; }, [db]);
  const updateAthleticMetrics = useCallback(async (playerId: string, data: Partial<any>) => { if (!db) return; await setDoc(doc(db, 'players', playerId, 'recruitingProfile', 'metrics'), clean(data), { merge: true }); }, [db]);
  const getPlayerStats = useCallback(async (playerId: string) => { if (!db) return []; const snap = await getDocs(collection(db, 'players', playerId, 'recruitingProfile', 'stats')); return snap.docs.map(d => ({ ...d.data(), id: d.id } as PlayerStat)); }, [db]);
  const addPlayerStat = useCallback(async (playerId: string, data: Partial<PlayerStat>) => { if (!db) return; await addDoc(collection(db, 'players', playerId, 'recruitingProfile', 'stats'), clean(data)); }, [db]);
  const deletePlayerStat = useCallback(async (playerId: string, statId: string) => { if (!db) return; await deleteDoc(doc(db, 'players', playerId, 'recruitingProfile', 'stats', statId)); }, [db]);
  const getEvaluations = useCallback(async (playerId: string) => { if (!db) return []; const snap = await getDocs(query(collection(db, 'players', playerId, 'evaluations'), orderBy('createdAt', 'desc'))); return snap.docs.map(d => ({ ...d.data(), id: d.id } as PlayerEvaluation)); }, [db]);
  const addEvaluation = useCallback(async (playerId: string, data: Partial<PlayerEvaluation>) => { if (!db || !firebaseUser) return; await addDoc(collection(db, 'players', playerId, 'evaluations'), { ...clean(data), evaluatorId: firebaseUser.uid, createdAt: serverTimestamp() }); }, [db, firebaseUser]);
  const getRecruitingContact = useCallback(async (playerId: string) => { if (!db) return null; const snap = await getDoc(doc(db, 'players', playerId, 'recruitingContact', 'contact')); return snap.exists() ? (snap.data() as RecruitingContact) : null; }, [db]);
  const updateRecruitingContact = useCallback(async (playerId: string, data: Partial<RecruitingContact>) => { if (!db) return; await setDoc(doc(db, 'players', playerId, 'recruitingContact', 'contact'), clean(data), { merge: true }); }, [db]);
  const getPlayerVideos = useCallback(async (playerId: string) => { if (!db) return []; const snap = await getDocs(query(collection(db, 'players', playerId, 'videos'), orderBy('createdAt', 'desc'))); return snap.docs.map(d => ({ ...d.data(), id: d.id } as PlayerVideo)); }, [db]);
  const addPlayerVideo = useCallback(async (playerId: string, data: Partial<PlayerVideo>) => { if (!db) return; await addDoc(collection(db, 'players', playerId, 'videos'), { ...clean(data), createdAt: serverTimestamp() }); }, [db]);
  const deletePlayerVideo = useCallback(async (playerId: string, videoId: string) => { if (!db) return; await deleteDoc(doc(db, 'players', playerId, 'videos', videoId)); }, [db]);
  const toggleRecruitingProfile = useCallback(async (playerId: string, enabled: boolean) => { if (!db) return; await updateDoc(doc(db, 'players', playerId), { recruitingProfileEnabled: enabled }); }, [db]);
  const updateStaffEvaluation = useCallback(async (memberId: string, notes: string) => { if (!activeTeam?.id || !db) return; await setDoc(doc(db, 'teams', activeTeam.id, 'members', memberId, 'staffEvaluation', 'current'), { notes, updatedAt: new Date().toISOString() }); }, [activeTeam, db]);
  const getStaffEvaluation = useCallback(async (memberId: string) => { if (!activeTeam?.id || !db) return ''; const snap = await getDoc(doc(db, 'teams', activeTeam.id, 'members', memberId, 'staffEvaluation', 'current')); return snap.exists() ? (snap.data()?.notes || '') : ''; }, [activeTeam, db]);

  const createNewTeam = useCallback(async (name: string, type: any, pos: string, description?: string, planId?: string) => { if (!firebaseUser || !db || !userProfile) return ''; const tid = `team_${Date.now()}`; const batch = writeBatch(db); batch.set(doc(db, 'teams', tid), clean({ id: tid, teamName: name, teamCode: tid.slice(-6).toUpperCase(), type, sport: 'General', description, createdBy: firebaseUser.uid, ownerUserId: firebaseUser.uid, planId: planId || 'starter_squad', isPro: planId !== 'starter_squad', createdAt: new Date().toISOString() })); batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), clean({ teamId: tid, name, role: 'Admin', joinedAt: new Date().toISOString() })); batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), clean({ id: firebaseUser.uid, userId: firebaseUser.uid, playerId: `p_${firebaseUser.uid}`, name: firebaseUser.displayName, role: 'Admin', position: pos, joinedAt: new Date().toISOString(), avatar: userProfile?.avatar || '' })); await batch.commit(); return tid; }, [firebaseUser, db, userProfile]);
  const joinTeamWithCode = useCallback(async (code: string, playerId: string, position: string) => { if (!firebaseUser || !db || !userProfile) return false; const q = query(collection(db, 'teams'), where('teamCode', '==', code), limit(1)); const snap = await getDocs(q); if (snap.empty) return false; const teamDoc = snap.docs[0]; const tid = teamDoc.id; const batch = writeBatch(db); batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), clean({ teamId: tid, name: teamDoc.data().teamName, role: 'Member', joinedAt: new Date().toISOString() })); batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), clean({ id: firebaseUser.uid, userId: firebaseUser.uid, playerId, name: firebaseUser.displayName, role: 'Member', position, joinedAt: new Date().toISOString(), avatar: userProfile?.avatar || '' })); await batch.commit(); return true; }, [firebaseUser, db, userProfile]);

  const updateUser = useCallback(async (u: any) => { if (firebaseUser) await updateDoc(doc(db, 'users', firebaseUser.uid), clean(u)); }, [db, firebaseUser]);
  const updateMember = useCallback(async (mid: string, u: any) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id, 'members', mid), clean(u)); }, [db, activeTeam]);
  const updateTeamDetails = useCallback(async (u: any) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id), clean(u)); }, [db, activeTeam]);
  const updateTeamHero = useCallback(async (url: string) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id), { heroImageUrl: url }); }, [db, activeTeam]);
  const updateTeamPlan = useCallback(async (tid: string, pid: string) => { if(db) await updateDoc(doc(db, 'teams', tid), { planId: pid, isPro: pid !== 'starter_squad' }); }, [db]);

  const signTeamDocument = useCallback(async (docId: string, sig: string, mid: string) => { if (!activeTeam?.id || !firebaseUser || !db) return false; const certId = `cert_${Date.now()}`; const batch = writeBatch(db); batch.set(doc(db, 'teams', activeTeam.id, 'members', mid, 'signatures', docId), { docId, signature: sig, signedAt: new Date().toISOString() }); batch.set(doc(db, 'teams', activeTeam.id, 'files', certId), { id: certId, name: `Signed Certificate: ${docId}`, category: 'Signed Certificate', url: '#', type: 'cert', size: '1kb', date: new Date().toISOString(), memberId: mid, documentId: docId }); await batch.commit(); return true; }, [db, activeTeam, firebaseUser]);
  const createTeamDocument = useCallback(async (data: any) => { if (activeTeam?.id && db) await setDoc(doc(db, 'teams', activeTeam.id, 'documents', data.id), clean({ ...data, createdAt: new Date().toISOString() })); }, [db, activeTeam]);
  const updateTeamDocument = useCallback(async (docId: string, data: any) => { if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'documents', docId), clean(data)); }, [db, activeTeam]);

  const addEvent = useCallback(async (data: any) => { if (activeTeam?.id && db) { await addDoc(collection(db, 'teams', activeTeam.id, 'events'), clean(data)); return true; } return false; }, [db, activeTeam]);
  const updateEvent = useCallback(async (id: string, data: any) => { if (activeTeam?.id && db) { await updateDoc(doc(db, 'teams', activeTeam.id, 'events', id), clean(data)); return true; } return false; }, [db, activeTeam]);
  const deleteEvent = useCallback(async (id: string) => { if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'events', id)); }, [db, activeTeam]);
  const updateRSVP = useCallback(async (eventId: string, status: string) => { if (activeTeam?.id && firebaseUser && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'events', eventId), { [`userRsvps.${firebaseUser.uid}`]: status }); }, [db, activeTeam, firebaseUser]);

  const addMessage = useCallback(async (chatId: string, author: string, content: string, type: string, img?: string, poll?: any) => { if (activeTeam?.id && firebaseUser && db) await addDoc(collection(db, 'teams', activeTeam.id, 'groupChats', chatId, 'messages'), clean({ author, authorId: firebaseUser.uid, content, type, imageUrl: img, poll, createdAt: new Date().toISOString() })); }, [activeTeam, firebaseUser, db]);
  const createChat = useCallback(async (name: string, members: string[]) => { if (!activeTeam?.id || !firebaseUser || !db) return ''; const cid = `chat_${Date.now()}`; await setDoc(doc(db, 'teams', activeTeam.id, 'groupChats', cid), clean({ id: cid, name, createdBy: firebaseUser.uid, memberIds: [...members, firebaseUser.uid], createdAt: new Date().toISOString(), isDeleted: false, teamId: activeTeam.id })); return cid; }, [activeTeam, firebaseUser, db]);
  const deleteChat = useCallback(async (chatId: string) => { if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'groupChats', chatId), { isDeleted: true }); }, [activeTeam, db]);
  const hideChatForUser = useCallback(async (chatId: string) => { if (!firebaseUser || !db) return; await setDoc(doc(db, 'users', firebaseUser.uid, 'hiddenChats', chatId), { id: `${firebaseUser.uid}_${chatId}`, userId: firebaseUser.uid, chatId, hiddenAt: new Date().toISOString() }); }, [firebaseUser, db]);
  
  const votePoll = useCallback(async (chatId: string, messageId: string, optionIdx: number) => { 
    if (!activeTeam?.id || !firebaseUser || !db) return; 
    const msgRef = doc(db, 'teams', activeTeam.id, 'groupChats', chatId, 'messages', messageId); 
    const snap = await getDoc(msgRef); 
    if (!snap.exists()) return; 
    const poll = snap.data().poll; 
    if (!poll || poll.isClosed) return; 
    const currentVote = poll.voters?.[firebaseUser.uid]; 
    const updates: any = { [`poll.voters.${firebaseUser.uid}`]: optionIdx }; 
    if (currentVote === undefined) { 
      updates[`poll.options.${optionIdx}.votes`] = increment(1); 
      updates['poll.totalVotes'] = increment(1); 
    } else if (currentVote !== optionIdx) { 
      updates[`poll.options.${currentVote}.votes`] = increment(-1); 
      updates[`poll.options.${optionIdx}.votes`] = increment(1); 
    } 
    await updateDoc(msgRef, updates); 
  }, [activeTeam, firebaseUser, db]);

  const updateChat = useCallback(async (chatId: string, data: any) => { if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'groupChats', chatId), clean(data)); }, [activeTeam, db]);

  const addVolunteerOpportunity = useCallback(async (data: any) => { if (activeTeam?.id && db) await addDoc(collection(db, 'teams', activeTeam.id, 'volunteers'), clean({ ...data, signups: {} })); }, [activeTeam, db]);
  const signUpForVolunteer = useCallback(async (oppId: string) => { if (activeTeam?.id && firebaseUser && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), { [`signups.${firebaseUser.uid}`]: { userId: firebaseUser.uid, userName: userProfile?.name, email: firebaseUser.email, isConfirmed: false, status: 'pending', createdAt: new Date().toISOString() } }); }, [activeTeam, firebaseUser, db, userProfile]);
  const verifyVolunteerHours = useCallback(async (oppId: string, userId: string, hours: number) => { if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), { [`signups.${userId}.status`]: 'verified', [`signups.${userId}.verifiedHours`]: hours }); }, [activeTeam, db]);
  const confirmVolunteerAttendance = useCallback(async (oppId: string, userId: string, confirmed: boolean) => { if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), { [`signups.${userId}.isConfirmed`]: confirmed }); }, [activeTeam, db]);

  const addFundraisingOpportunity = useCallback(async (data: any) => { if (activeTeam?.id && db) await addDoc(collection(db, 'teams', activeTeam.id, 'fundraising'), clean({ ...data, currentAmount: 0, finances: {} })); }, [activeTeam, db]);
  const signUpForFundraising = useCallback(async (fundId: string) => { if (activeTeam?.id && firebaseUser && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'fundraising', fundId), { [`finances.${firebaseUser.uid}`]: { userId: firebaseUser.uid, userName: userProfile?.name, status: 'joined', contributed: 0, createdAt: new Date().toISOString() } }); }, [activeTeam, firebaseUser, db, userProfile]);
  const confirmExternalDonation = useCallback(async (fundId: string, donationId: string, amount: number) => { if (!activeTeam?.id || !db) return; const batch = writeBatch(db); batch.update(doc(db, 'teams', activeTeam.id, 'fundraising', fundId, 'donations', donationId), { status: 'verified', amount }); batch.update(doc(db, 'teams', activeTeam.id, 'fundraising', fundId), { currentAmount: increment(amount) }); await batch.commit(); }, [db, activeTeam]);

  const addEquipmentItem = useCallback(async (data: any) => { if (activeTeam?.id && db) await addDoc(collection(db, 'teams', activeTeam.id, 'equipment'), clean({ ...data, assignments: {}, status: 'Active', availableQuantity: parseInt(data.totalQuantity), totalQuantity: parseInt(data.totalQuantity) })); }, [activeTeam, db]);
  const updateEquipmentItem = useCallback(async (id: string, updates: any) => { if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'equipment', id), clean(updates)); }, [activeTeam, db]);
  const deleteEquipmentItem = useCallback(async (id: string) => { if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'equipment', id)); }, [activeTeam, db]);
  const assignEquipment = useCallback(async (id: string, uid: string, uname: string, q: number) => { if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'equipment', id), { [`assignments.${uid}`]: { userId: uid, userName: uname, quantity: q, date: new Date().toISOString() }, availableQuantity: increment(-q) }); }, [activeTeam, db]);
  const returnEquipment = useCallback(async (id: string, uid: string) => { if (activeTeam?.id && db) { const snap = await getDoc(doc(db, 'teams', activeTeam.id, 'equipment', id)); if(snap.exists()) { const data = snap.data(); const assignment = data.assignments?.[uid]; if (assignment) { await updateDoc(doc(db, 'teams', activeTeam.id, 'equipment', id), { [`assignments.${uid}`]: deleteField(), availableQuantity: increment(assignment.quantity) }); } } } }, [activeTeam, db]);

  const addDrill = useCallback(async (d: any) => { if (activeTeam?.id && db) await addDoc(collection(db, 'teams', activeTeam.id, 'drills'), clean(d)); }, [activeTeam, db]);
  const addFile = useCallback(async (n: string, t: string, sb: number, u: string, c: string, d?: string) => { if (activeTeam?.id && db) await addDoc(collection(db, 'teams', activeTeam.id, 'files'), clean({ name: n, type: t, sizeBytes: sb, size: `${Math.round(sb/1024)}KB`, url: u, category: c, description: d, date: new Date().toISOString() })); }, [activeTeam, db]);
  const deleteFile = useCallback(async (id: string) => { if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'files', id)); }, [db, activeTeam]);

  const addFacility = useCallback(async (d: any) => { if (firebaseUser && db) await addDoc(collection(db, 'facilities'), clean({ ...d, clubId: firebaseUser.uid })); }, [db, firebaseUser]);
  const deleteFacility = useCallback(async (id: string) => { if(db) await deleteDoc(doc(db, 'facilities', id)); }, [db]);
  const addField = useCallback(async (fid: string, n: string) => { if(db) await addDoc(collection(db, 'facilities', fid, 'fields'), { name: n, facilityId: fid }); }, [db]);
  const deleteField = useCallback(async (fid: string, id: string) => { if(id && db) await deleteDoc(doc(db, 'facilities', fid, 'fields', id)); }, [db]);

  const createLeague = useCallback(async (name: string) => { 
    if (!firebaseUser || !db || !activeTeam) return ''; 
    const lid = `league_${Date.now()}`; 
    const batch = writeBatch(db); 
    
    batch.set(doc(db, 'leagues', lid), clean({ 
      id: lid, 
      name, 
      creatorId: firebaseUser.uid, 
      sport: activeTeam.sport || 'General', 
      teams: { 
        [activeTeam.id]: { teamName: activeTeam.name, wins: 0, losses: 0, ties: 0, points: 0, status: 'accepted' } 
      }, 
      memberTeamIds: [activeTeam.id], 
      finances: {}, 
      inviteCode: lid.slice(-6).toUpperCase(), 
      createdAt: new Date().toISOString() 
    })); 
    
    batch.update(doc(db, 'teams', activeTeam.id), { [`leagueIds.${lid}`]: true }); 
    await batch.commit(); 
    return lid; 
  }, [firebaseUser, db, activeTeam]);
  
  const updateLeagueSchedule = useCallback(async (lId: string, s: any[]) => { 
    if (!db) return; 
    const batch = writeBatch(db);
    batch.update(doc(db, 'leagues', lId), { schedule: clean(s) }); 
    const leagueSnap = await getDoc(doc(db, 'leagues', lId));
    const leagueData = leagueSnap.data();
    if (!leagueData) return;
    const teamNamesToIds: Record<string, string> = {};
    Object.entries(leagueData.teams || {}).forEach(([tid, tdata]: [string, any]) => { teamNamesToIds[tdata.teamName] = tid; });
    s.forEach(game => {
      const t1Id = teamNamesToIds[game.team1];
      const t2Id = teamNamesToIds[game.team2];
      const createEvent = (tid: string, opp: string) => {
        if (!tid || tid.startsWith('manual_')) return;
        const eid = `lg_${lId}_${game.id}`;
        batch.set(doc(db, 'teams', tid, 'events', eid), clean({ id: eid, teamId: tid, title: `League Match vs ${opp}`, eventType: 'game', isLeagueGame: true, leagueId: lId, date: game.date, startTime: game.time, location: game.location, description: `Season fixture for ${leagueData.name}.`, createdAt: new Date().toISOString() }));
      };
      if (t1Id) createEvent(t1Id, game.team2);
      if (t2Id) createEvent(t2Id, game.team1);
    });
    await batch.commit();
  }, [db]);

  const removeTeamFromLeague = useCallback(async (lId: string, tId: string) => {
    if (!db) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'leagues', lId), {
      [`teams.${tId}`]: deleteField(),
      memberTeamIds: arrayRemove(tId)
    });
    if (!tId.startsWith('manual_') && !tId.startsWith('recruit_')) {
      batch.update(doc(db, 'teams', tId), {
        [`leagueIds.${lId}`]: deleteField()
      });
    }
    await batch.commit();
    toast({ title: "Squad Excised", description: "Team removed from league standings." });
  }, [db]);

  const inviteTeamToLeague = useCallback(async (lId: string, lN: string, e: string, tN?: string) => { if (db) await addDoc(collection(db, 'leagues', 'global', 'invites'), clean({ leagueId: lId, leagueName: lN, invitedEmail: e, teamName: tN, status: 'pending', createdAt: new Date().toISOString() })); }, [db]);
  const manuallyAddTeamToLeague = useCallback(async (lId: string, n: string, e?: string) => { if (db) await updateDoc(doc(db, 'leagues', lId), { [`teams.manual_${Date.now()}`]: { teamName: n, coachEmail: e, wins: 0, losses: 0, ties: 0, points: 0, status: 'accepted' } }); }, [db]);
  const deleteLeagueInvite = useCallback(async (id: string) => { if (db) await deleteDoc(doc(db, 'leagues', 'global', 'invites', id)); }, [db]);
  const saveLeagueRegistrationConfig = useCallback(async (lId: string, pId: string, u: any) => { if (db) await setDoc(doc(db, 'leagues', lId, 'registration', pId), clean(u), { merge: true }); }, [db]);
  
  const submitRegistrationEntry = useCallback(async (tId: string, pId: string, a: any, v: number, signature?: string, targetType?: any) => { 
    if (!db) return; 
    const entryData: any = { 
      league_id: tId, 
      protocol_id: pId, 
      answers: a, 
      form_version: v, 
      waiver_signed_text: signature, 
      status: 'pending', 
      created_at: new Date().toISOString() 
    };
    if (pId === 'team_config' && a.manual_enrollment) {
      entryData.status = 'accepted';
    }
    const ref = await addDoc(collection(db, targetType || 'leagues', tId, 'registrationEntries'), clean(entryData)); 
    if (pId === 'team_config') {
      const teamName = a.teamName || a.name;
      if (teamName) {
        await updateDoc(doc(db, 'leagues', tId), {
          [`teams.recruit_${ref.id}`]: { teamName, coachName: a.name || 'Recruit Coach', coachEmail: a.email, wins: 0, losses: 0, ties: 0, points: 0, status: entryData.status },
          memberTeamIds: arrayUnion(`recruit_${ref.id}`)
        });
      }
    }
  }, [db]);

  const assignEntryToTeam = useCallback(async (leagueId: string, entryId: string, teamId: string | null) => { if (!db) return; await updateDoc(doc(db, 'leagues', leagueId, 'registrationEntries', entryId), { assigned_team_id: teamId, status: teamId ? 'assigned' : 'pending' }); }, [db]);
  const toggleRegistrationPaymentStatus = useCallback(async (leagueId: string, entryId: string, paid: boolean) => { if (!db) return; await updateDoc(doc(db, 'leagues', leagueId, 'registrationEntries', entryId), { payment_received: paid }); }, [db]);
  const respondToAssignment = useCallback(async (contextId: string, entryId: string, status: 'accepted' | 'declined') => { if (!db) return; await updateDoc(doc(db, 'leagues', contextId, 'registrationEntries', entryId), { status }); }, [db]);
  const updateLeagueTeamDetails = useCallback(async (leagueId: string, teamId: string, updates: any) => { if (!db) return; await updateDoc(doc(db, 'leagues', leagueId), { [`teams.${teamId}.origin`]: updates.origin, [`teams.${teamId}.coachName`]: updates.coachName, [`teams.${teamId}.coachEmail`]: updates.coachEmail, [`teams.${teamId}.coachPhone`]: updates.coachPhone, [`teams.${teamId}.organizerNotes`]: updates.organizerNotes, [`teams.${teamId}.teamName`]: updates.teamName }); }, [db]);

  const upgradeChildToLogin = useCallback(async (childId: string) => { if (db) await updateDoc(doc(db, 'players', childId), { hasLogin: true }); }, [db]);
  const registerChild = useCallback(async (first: string, last: string, dob: string) => { if (!firebaseUser || !db) return; const cid = `child_${Date.now()}`; await setDoc(doc(db, 'players', cid), clean({ id: cid, firstName: first, lastName: last, dateOfBirth: dob, isMinor: true, parentId: firebaseUser.uid, joinedTeamIds: [], createdAt: new Date().toISOString() })); }, [db, firebaseUser]);
  const assignManualPlan = useCallback(async (uid: string, planId: string, limit: number) => { if (db) await updateDoc(doc(db, 'users', uid), { activePlanId: planId, proTeamLimit: limit, planSource: 'manual' }); }, [db]);

  const addIncident = useCallback(async (data: any) => { if (activeTeam?.id && db && firebaseUser) await addDoc(collection(db, 'teams', activeTeam.id, 'incidents'), clean({ ...data, teamId: activeTeam.id, teamName: activeTeam.name, reportedBy: firebaseUser.uid, createdAt: new Date().toISOString() })); }, [db, firebaseUser, activeTeam]);
  
  const resetSquadData = useCallback(async (cats: string[]) => { if (!activeTeam?.id || !db) return; const batch = writeBatch(db); if (cats.includes('games')) { const gs = await getDocs(collection(db, 'teams', activeTeam.id, 'games')); gs.forEach(d => batch.delete(d.ref)); } if (cats.includes('events')) { const es = await getDocs(collection(db, 'teams', activeTeam.id, 'events')); es.forEach(d => batch.delete(d.ref)); } await batch.commit(); }, [activeTeam, db]);

  const markMediaAsViewed = useCallback(async (fileId: string) => { if (!firebaseUser || !activeTeam?.id || !db) return; await setDoc(doc(db, 'teams', activeTeam.id, 'members', firebaseUser.uid, 'mediaViews', fileId), { fileId, viewedAt: new Date().toISOString() }); }, [activeTeam, firebaseUser, db]);

  const deployClubProtocol = useCallback(async (data: any, teamIds: string[]) => { if(!db) return; const batch = writeBatch(db); teamIds.forEach(tid => { const docId = `protocol_${Date.now()}`; batch.set(doc(db, 'teams', tid, 'documents', docId), clean({ ...data, id: docId, isClubMaster: true, createdAt: new Date().toISOString() })); }); await batch.commit(); }, [db]);

  const deleteTeam = useCallback(async (tid: string) => { if(db) await deleteDoc(doc(db, 'teams', tid)); }, [db]);

  const markAlertAsSeen = useCallback(async (id: string) => { if (firebaseUser && db) await updateDoc(doc(db, 'users', firebaseUser.uid), { seenAlertIds: arrayUnion(id) }); }, [firebaseUser, db]);
  const markAllAlertsAsSeen = useCallback(async () => { if (firebaseUser && db && alerts.length > 0) await updateDoc(doc(db, 'users', firebaseUser.uid), { seenAlertIds: alerts.map(a => a.id) }); }, [firebaseUser, db, alerts]);
  const createAlert = useCallback(async (t: string, m: string, a: any) => { if (activeTeam?.id && db && firebaseUser) await addDoc(collection(db, 'teams', activeTeam.id, 'alerts'), clean({ title: t, message: m, audience: a, createdAt: new Date().toISOString(), createdBy: firebaseUser.uid })); }, [activeTeam, db, firebaseUser]);
  const deleteAlert = useCallback(async (id: string) => { if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'alerts', id)); }, [activeTeam, db]);

  const signPublicTournamentWaiver = useCallback(async (teamId: string, eventId: string, tournamentTeamName: string, coachName: string) => { if (!db) return false; await updateDoc(doc(db, 'teams', teamId, 'events', eventId), { [`teamAgreements.${tournamentTeamName}`]: { agreed: true, captainName: coachName, signedAt: new Date().toISOString() } }); return true; }, [db]);
  const submitMatchScore = useCallback(async (teamId: string, eventId: string, gameId: string, isTeam1: boolean, score1: number, score2: number) => { if (!db) return; const snap = await getDoc(doc(db, 'teams', teamId, 'events', eventId)); if (!snap.exists()) return; const games = snap.data().tournamentGames || []; const idx = games.findIndex((g: any) => g.id === gameId); if (idx === -1) return; games[idx] = { ...games[idx], score1, score2, isCompleted: true, updatedAt: new Date().toISOString() }; await updateDoc(doc(db, 'teams', teamId, 'events', eventId), { tournamentGames: games }); }, [db]);
  
  const submitLeagueMatchScore = useCallback(async (leagueId: string, gameId: string, isTeam1: boolean, score1: number, score2: number) => { 
    if (!db) return; 
    const snap = await getDoc(doc(db, 'leagues', leagueId)); 
    if (!snap.exists()) return; 
    const data = snap.data();
    const schedule = data.schedule || []; 
    const idx = schedule.findIndex((g: any) => g.id === gameId); 
    if (idx === -1) return; 
    schedule[idx] = { ...schedule[idx], score1, score2, isCompleted: true, isDisputed: false, updatedAt: new Date().toISOString() }; 
    const teams = data.teams || {};
    Object.keys(teams).forEach(id => { teams[id] = { ...teams[id], wins: 0, losses: 0, ties: 0, points: 0 }; });
    const teamNamesToIds: Record<string, string> = {};
    Object.entries(teams).forEach(([id, t]: [string, any]) => { teamNamesToIds[t.teamName] = id; });
    schedule.forEach((g: any) => {
      if (!g.isCompleted) return;
      const t1Id = teamNamesToIds[g.team1];
      const t2Id = teamNamesToIds[g.team2];
      if (!t1Id || !t2Id) return;
      if (g.score1 > g.score2) { teams[t1Id].wins++; teams[t1Id].points += 3; teams[t2Id].losses++; }
      else if (g.score2 > g.score1) { teams[t2Id].wins++; teams[t2Id].points += 3; teams[t1Id].losses++; }
      else { teams[t1Id].ties++; teams[t1Id].points += 1; teams[t2Id].ties++; teams[t2Id].points += 1; }
    });
    await updateDoc(doc(db, 'leagues', leagueId), { schedule, teams }); 
  }, [db]);

  const disputeMatchScore = useCallback(async (teamId: string, eventId: string, gameId: string, notes: string) => { if (!db) return; const snap = await getDoc(doc(db, 'teams', teamId, 'events', eventId)); if (!snap.exists()) return; const games = snap.data().tournamentGames || []; const idx = games.findIndex((g: any) => g.id === gameId); if (idx === -1) return; games[idx] = { ...games[idx], isDisputed: true, disputeNotes: notes }; await updateDoc(doc(db, 'teams', teamId, 'events', eventId), { tournamentGames: games }); }, [db]);
  const disputeLeagueMatchScore = useCallback(async (leagueId: string, gameId: string, notes: string) => { if (!db) return; const snap = await getDoc(doc(db, 'leagues', leagueId)); if (!snap.exists()) return; const schedule = snap.data().schedule || []; const idx = schedule.findIndex((g: any) => g.id === gameId); if (idx === -1) return; schedule[idx] = { ...schedule[idx], isDisputed: true, disputeNotes: notes }; await updateDoc(doc(db, 'leagues', leagueId), { schedule }); }, [db]);

  const resolveQuota = useCallback(async (selectedTeamIds: string[]) => { if (!db || !userProfile?.id) return; const batch = writeBatch(db); const ownedProTeams = teamsRaw.filter(t => t.ownerUserId === userProfile.id && t.isPro); ownedProTeams.forEach(t => { if (!selectedTeamIds.includes(t.id)) { batch.update(doc(db, 'teams', t.id), { isPro: false, planId: 'starter_squad' }); } }); await batch.commit(); }, [db, userProfile, teamsRaw]);
  const exportAttendanceCSV = useCallback(async (eventId: string) => { if (!db || !activeTeam?.id) return; const snap = await getDoc(doc(db, 'teams', activeTeam.id, 'events', eventId)); if (!snap.exists()) return; const rsvps = snap.data().userRsvps || {}; const rows = [["Name", "Status"]]; members.forEach(m => { rows.push([m.name, rsvps[m.userId] || 'no_response']); }); const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n"); const encodedUri = encodeURI(csvContent); const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", `attendance_${eventId}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); }, [db, activeTeam, members]);
  const exportTournamentStandingsCSV = useCallback(async (tournamentId: string) => { if (!db || !activeTeam?.id) return; const rows = [["Team", "Wins", "Losses", "Ties", "Points"]]; const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n"); const encodedUri = encodeURI(csvContent); const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", `standings_${tournamentId}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); }, [db, activeTeam]);

  const addRegistration = useCallback(async (teamId: string, eventId: string, data: any) => { if (db) { await addDoc(collection(db, 'teams', teamId, 'events', eventId, 'registrations'), clean(data)); return true; } return false; }, [db]);
  const manageSubscription = useCallback(async () => { setIsPaywallOpen(true); }, []);
  const purchasePro = useCallback(() => { setIsPaywallOpen(true); }, []);
  const addLeaguePayment = useCallback(async (leagueId: string, teamId: string, data: any) => { if (!db) return; await addDoc(collection(db, 'leagues', leagueId, 'payments'), clean({ ...data, teamId, createdAt: new Date().toISOString() })); await updateDoc(doc(db, 'leagues', leagueId), { [`finances.${teamId}.totalPaid`]: increment(data.amount) }); }, [db]);
  const useTeamData = useCallback(() => { return activeTeam; }, [activeTeam]);
  const updateLeagueGlobalFees = useCallback(async (leagueId: string, fees: any) => { if (db) await updateDoc(doc(db, 'leagues', leagueId), { globalFees: clean(fees) }); }, [db]);

  const contextValue = useMemo(() => ({
    db, user: userProfile, activeTeam, setActiveTeam: (t: Team) => setManualActiveTeamId(t.id), teams: teamsRaw, isTeamsLoading, members, isMembersLoading,
    currentMember: members.find(m => m.userId === firebaseUser?.uid) || null,
    isStaff, isPro, isParent: userProfile?.role === 'parent', isPlayer: userProfile?.role === 'adult_player',
    isSuperAdmin, isClubManager, householdEvents: householdEvents || [], householdBalance: 0, myChildren, plans, isPlansLoading, proQuotaStatus,
    isPaywallOpen, setIsPaywallOpen, purchasePro,
    hasFeature, alerts, unreadAlertsCount,
    markAlertAsSeen, markAllAlertsAsSeen, seenAlertIds, isSeedingDemo, setIsSeedingDemo,
    getRecruitingProfile, updateRecruitingProfile, getAthleticMetrics, updateAthleticMetrics,
    getPlayerStats, addPlayerStat, deletePlayerStat, getEvaluations, addEvaluation,
    getRecruitingContact, updateRecruitingContact, getPlayerVideos, addPlayerVideo, deletePlayerVideo,
    toggleRecruitingProfile, updateStaffEvaluation, getStaffEvaluation, createNewTeam, joinTeamWithCode,
    createLeague, signUpForVolunteer, addEquipmentItem, respondToAssignment, assignEntryToTeam, 
    toggleRegistrationPaymentStatus, updateLeagueSchedule, inviteTeamToLeague, manuallyAddTeamToLeague, 
    deleteLeagueInvite, updateLeagueTeamDetails, deleteChat, 
    hideChatForUser, votePoll, updateChat, deployClubProtocol, deleteTeam, upgradeChildToLogin, registerChild,
    updateUser, updateMember, updateTeamDetails, updateTeamHero, updateTeamPlan,
    signTeamDocument, createTeamDocument, updateTeamDocument, addEvent, updateEvent,
    deleteEvent, updateRSVP, addMessage, resetSquadData, verifyVolunteerHours,
    confirmVolunteerAttendance, addVolunteerOpportunity, signUpForFundraising,
    confirmExternalDonation, addIncident, assignManualPlan, removeTeamFromLeague,
    saveLeagueRegistrationConfig, submitRegistrationEntry,
    signPublicTournamentWaiver, submitMatchScore, submitLeagueMatchScore, disputeMatchScore, disputeLeagueMatchScore,
    createAlert, deleteAlert, addDrill, addFile, deleteFile, addFacility, deleteFacility,
    addField, deleteField, 
    assignEquipment, returnEquipment,
    formatTime, manageSubscription, resolveQuota, exportAttendanceCSV, exportTournamentStandingsCSV, markMediaAsViewed,
    isRCInitialized: true, addRegistration, addLeaguePayment, updateLeagueGlobalFees
  }), [
    db, userProfile, activeTeam, teamsRaw, isTeamsLoading, members, isMembersLoading, firebaseUser,
    isStaff, isPro, householdEvents, myChildren, plans, isPlansLoading, isPaywallOpen, isSeedingDemo,
    seenAlertIds, alerts, unreadAlertsCount, isSuperAdmin, isClubManager, hasFeature, proQuotaStatus,
    getRecruitingProfile, updateRecruitingProfile, getAthleticMetrics, updateAthleticMetrics,
    getPlayerStats, addPlayerStat, deletePlayerStat, getEvaluations, addEvaluation,
    getRecruitingContact, updateRecruitingContact, getPlayerVideos, addPlayerVideo, deletePlayerVideo,
    toggleRecruitingProfile, updateStaffEvaluation, getStaffEvaluation, createNewTeam, joinTeamWithCode,
    createLeague, signUpForVolunteer, addEquipmentItem, respondToAssignment, assignEntryToTeam, 
    toggleRegistrationPaymentStatus, updateLeagueSchedule, inviteTeamToLeague, manuallyAddTeamToLeague, 
    deleteLeagueInvite, updateLeagueTeamDetails, deleteChat, 
    hideChatForUser, votePoll, updateChat, deployClubProtocol, deleteTeam, upgradeChildToLogin, registerChild,
    updateUser, updateMember, updateTeamDetails, updateTeamHero, updateTeamPlan,
    signTeamDocument, createTeamDocument, updateTeamDocument, addEvent, updateEvent,
    deleteEvent, updateRSVP, addMessage, resetSquadData, verifyVolunteerHours,
    confirmVolunteerAttendance, addVolunteerOpportunity, signUpForFundraising,
    confirmExternalDonation, addIncident, assignManualPlan, removeTeamFromLeague,
    saveLeagueRegistrationConfig, submitRegistrationEntry,
    signPublicTournamentWaiver, submitMatchScore, submitLeagueMatchScore, disputeMatchScore, disputeLeagueMatchScore,
    createAlert, deleteAlert, addDrill, addFile, deleteFile, addFacility, deleteFacility,
    addField, deleteField, 
    assignEquipment, returnEquipment,
    formatTime, manageSubscription, resolveQuota, exportAttendanceCSV, exportTournamentStandingsCSV, markMediaAsViewed,
    addRegistration, purchasePro, addLeaguePayment, updateLeagueGlobalFees
  ]);

  return <TeamContext.Provider value={contextValue}>{children}</TeamContext.Provider>;
}

export const useTeam = () => {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within a TeamProvider');
  return context;
};
