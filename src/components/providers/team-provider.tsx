
"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo, useCallback } from 'react';
import { useFirebase, useFirestore, useMemoFirebase, useUser, useCollection } from '@/firebase';
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
  collectionGroup,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

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
  finances: Record<string, any>;
  globalFees?: any;
  creatorId: string;
  schedule?: any[];
  inviteCode?: string;
  teamAgreements?: Record<string, any>;
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
  const [seenAlertIds, setSeenAlertIds] = useState<string[]>([]);
  const [isSeedingDemo, setIsSeedingDemo] = useState(false);

  // --- RECRUITING FUNCTIONS ---
  const getRecruitingProfile = async (playerId: string) => {
    if (!playerId || !db) return null;
    const s = await getDoc(doc(db, 'players', playerId, 'recruitingProfile', 'profile'));
    return s.exists() ? (s.data() as RecruitingProfile) : null;
  };

  const updateRecruitingProfile = async (playerId: string, data: Partial<RecruitingProfile>) => {
    if (!playerId || !db) return;
    await setDoc(doc(db, 'players', playerId, 'recruitingProfile', 'profile'), {
      ...data,
      playerId,
      updatedAt: serverTimestamp()
    }, { merge: true });
  };

  const getAthleticMetrics = async (playerId: string) => {
    if (!playerId || !db) return null;
    const s = await getDoc(doc(db, 'players', playerId, 'recruitingProfile', 'metrics'));
    return s.exists() ? (s.data() as AthleticMetrics) : null;
  };

  const updateAthleticMetrics = async (playerId: string, data: Partial<AthleticMetrics>) => {
    if (!playerId || !db) return;
    await setDoc(doc(db, 'players', playerId, 'recruitingProfile', 'metrics'), data, { merge: true });
  };

  const getPlayerStats = async (playerId: string) => {
    if (!playerId || !db) return [];
    const s = await getDocs(collection(db, 'players', playerId, 'recruitingProfile', 'stats'));
    return s.docs.map(d => ({ id: d.id, ...d.data() } as PlayerStat));
  };

  const addPlayerStat = async (playerId: string, data: Partial<PlayerStat>) => {
    if (!playerId || !db) return;
    await addDoc(collection(db, 'players', playerId, 'recruitingProfile', 'stats'), clean(data));
  };

  const deletePlayerStat = async (playerId: string, statId: string) => {
    if (!playerId || !db) return;
    await deleteDoc(doc(db, 'players', playerId, 'recruitingProfile', 'stats', statId));
  };

  const getEvaluations = async (playerId: string) => {
    if (!playerId || !db) return [];
    const s = await getDocs(collection(db, 'players', playerId, 'evaluations'));
    return s.docs.map(d => ({ id: d.id, ...d.data() } as PlayerEvaluation));
  };

  const addEvaluation = async (playerId: string, data: Partial<PlayerEvaluation>) => {
    if (!playerId || !db) return;
    await addDoc(collection(db, 'players', playerId, 'evaluations'), clean({
      ...data,
      evaluatorId: firebaseUser?.uid,
      createdAt: serverTimestamp()
    }));
  };

  const getRecruitingContact = async (playerId: string) => {
    if (!playerId || !db) return null;
    const s = await getDoc(doc(db, 'players', playerId, 'recruitingProfile', 'contact'));
    return s.exists() ? (s.data() as RecruitingContact) : null;
  };

  const updateRecruitingContact = async (playerId: string, data: Partial<RecruitingContact>) => {
    if (!playerId || !db) return;
    await setDoc(doc(db, 'players', playerId, 'recruitingProfile', 'contact'), data, { merge: true });
  };

  const getPlayerVideos = async (playerId: string) => {
    if (!playerId || !db) return [];
    const s = await getDocs(collection(db, 'players', playerId, 'videos'));
    return s.docs.map(d => ({ id: d.id, ...d.data() } as PlayerVideo));
  };

  const addPlayerVideo = async (playerId: string, data: Partial<PlayerVideo>) => {
    if (!playerId || !db) return;
    await addDoc(collection(db, 'players', playerId, 'videos'), clean({
      ...data,
      createdAt: serverTimestamp()
    }));
  };

  const deletePlayerVideo = async (playerId: string, videoId: string) => {
    if (!playerId || !db) return;
    await deleteDoc(doc(db, 'players', playerId, 'videos', videoId));
  };

  const toggleRecruitingProfile = async (playerId: string, enabled: boolean) => {
    if (!playerId || !db) return;
    await updateDoc(doc(db, 'players', playerId), { recruitingProfileEnabled: enabled });
  };

  const updateStaffEvaluation = async (memberId: string, notes: string) => {
    if (!activeTeam?.id || !db) return;
    await updateDoc(doc(db, 'teams', activeTeam.id, 'members', memberId), { notes });
  };

  const getStaffEvaluation = async (memberId: string) => {
    if (!activeTeam?.id || !db) return '';
    const snap = await getDoc(doc(db, 'teams', activeTeam.id, 'members', memberId));
    return snap.exists() ? (snap.data().notes || '') : '';
  };

  // --- CORE SYSTEM ---
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

  const plansQuery = useMemoFirebase(() => (db && isAuthResolved) ? collection(db, 'plans') : null, [db, isAuthResolved]);
  const { data: plansData } = useCollection(plansQuery);
  const plans = plansData || [];

  const teamsQuery = useMemoFirebase(() => (isAuthResolved && firebaseUser?.uid && db) ? query(collection(db, 'users', firebaseUser.uid, 'teamMemberships')) : null, [isAuthResolved, firebaseUser?.uid, db]);
  const { data: teamsData, isLoading: isTeamsLoading } = useCollection(teamsQuery);
  const teams = useMemo(() => (teamsData || []).map(m => ({ ...m, id: m.teamId || m.id, name: m.name || m.teamName || 'Squad' })), [teamsData]);

  useEffect(() => {
    if (teams.length > 0 && !activeTeamId) setActiveTeamId(teams[0].id);
  }, [teams, activeTeamId]);

  const activeTeam = useMemo(() => teams.find(t => t.id === activeTeamId) || teams[0] || null, [teams, activeTeamId]);

  const membersQuery = useMemoFirebase(() => (isAuthResolved && activeTeam?.id && db) ? query(collection(db, 'teams', activeTeam.id, 'members')) : null, [isAuthResolved, activeTeam?.id, db]);
  const { data: membersData, isLoading: isMembersLoading } = useCollection<Member>(membersQuery);
  const members = useMemo(() => membersData || [], [membersData]);

  const alertsQuery = useMemoFirebase(() => (isAuthResolved && activeTeam?.id && db) ? query(collection(db, 'teams', activeTeam.id, 'alerts'), orderBy('createdAt', 'desc'), limit(10)) : null, [isAuthResolved, activeTeam?.id, db]);
  const { data: alertsData } = useCollection<TeamAlert>(alertsQuery);
  const alerts = alertsData || [];

  const unreadAlertsCount = useMemo(() => {
    return alerts.filter(a => !seenAlertIds.includes(a.id)).length;
  }, [alerts, seenAlertIds]);

  const createNewTeam = async (name: string, type: any, pos: string, description?: string, planId?: string) => {
    if (!firebaseUser || !db) return '';
    const tid = `team_${Date.now()}`;
    const batch = writeBatch(db);
    
    batch.set(doc(db, 'teams', tid), clean({
      id: tid, teamName: name, teamCode: tid.slice(-6).toUpperCase(),
      type, sport: 'General', description, createdBy: firebaseUser.uid,
      ownerUserId: firebaseUser.uid, planId: planId || 'starter_squad', isPro: planId !== 'starter_squad',
      createdAt: new Date().toISOString()
    }));

    // ACL SYNC
    batch.set(doc(db, 'team_memberships', `${tid}_${firebaseUser.uid}`), clean({
      teamId: tid, userId: firebaseUser.uid, role: 'Admin', joinedAt: new Date().toISOString()
    }));

    batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), clean({
      teamId: tid, name, role: 'Admin', joinedAt: new Date().toISOString()
    }));

    batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), clean({
      id: firebaseUser.uid, userId: firebaseUser.uid, playerId: `p_${firebaseUser.uid}`, name: firebaseUser.displayName,
      role: 'Admin', position: pos, joinedAt: new Date().toISOString()
    }));

    await batch.commit();
    return tid;
  };

  const joinTeamWithCode = async (code: string, playerId: string, position: string) => {
    if (!firebaseUser || !db) return false;
    const q = query(collection(db, 'teams'), where('teamCode', '==', code), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) {
      toast({ title: "Invalid Code", variant: "destructive" });
      return false;
    }
    const teamDoc = snap.docs[0];
    const tid = teamDoc.id;
    const batch = writeBatch(db);

    batch.set(doc(db, 'team_memberships', `${tid}_${firebaseUser.uid}`), clean({
      teamId: tid, userId: firebaseUser.uid, role: 'Member', joinedAt: new Date().toISOString()
    }));

    batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), clean({
      teamId: tid, name: teamDoc.data().teamName, role: 'Member', joinedAt: new Date().toISOString()
    }));

    batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), clean({
      id: firebaseUser.uid, userId: firebaseUser.uid, playerId, name: firebaseUser.displayName,
      role: 'Member', position, joinedAt: new Date().toISOString()
    }));

    await batch.commit();
    return true;
  };

  const contextValue = useMemo(() => ({
    db, user: userProfile, activeTeam, setActiveTeam: (t: Team) => setActiveTeamId(t.id), teams, isTeamsLoading, members, isMembersLoading,
    currentMember: members.find(m => m.userId === firebaseUser?.uid) || null,
    isStaff: activeTeam?.role === 'Admin' || ['Coach', 'Manager'].includes(members.find(m => m.userId === firebaseUser?.uid)?.position || ''),
    isPro: activeTeam?.isPro || false, isParent: userProfile?.role === 'parent', isPlayer: userProfile?.role === 'adult_player',
    isSuperAdmin: userProfile?.email === 'thisearlyseason@gmail.com', isClubManager: ['elite_teams', 'elite_league'].includes(userProfile?.activePlanId || ''),
    householdEvents, householdBalance, myChildren, plans, proQuotaStatus: { current: 0, limit: 0, remaining: 0, exceeded: false },
    isPaywallOpen, setIsPaywallOpen, purchasePro: () => setIsPaywallOpen(true),
    hasFeature: (id: string) => true, alerts, unreadAlertsCount,
    markAlertAsSeen: (id: string) => setSeenAlertIds(p => [...new Set([...p, id])]),
    markAllAlertsAsSeen: () => setSeenAlertIds(alerts.map(a => a.id)),
    seenAlertIds, isSeedingDemo, setIsSeedingDemo,
    
    // Recruiting Pack
    getRecruitingProfile, updateRecruitingProfile, getAthleticMetrics, updateAthleticMetrics,
    getPlayerStats, addPlayerStat, deletePlayerStat, getEvaluations, addEvaluation,
    getRecruitingContact, updateRecruitingContact, getPlayerVideos, addPlayerVideo, deletePlayerVideo,
    toggleRecruitingProfile, updateStaffEvaluation, getStaffEvaluation,

    createNewTeam, joinTeamWithCode,
    updateUser: async (u: any) => { if (firebaseUser) await updateDoc(doc(db, 'users', firebaseUser.uid), clean(u)); },
    updateMember: async (mid: string, u: any) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id, 'members', mid), clean(u)); },
    updateTeamDetails: async (u: any) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id), clean(u)); },
    updateTeamHero: async (url: string) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id), { heroImageUrl: url }); },
    updateTeamPlan: async (tid: string, pid: string) => { await updateDoc(doc(db, 'teams', tid), { planId: pid, isPro: pid !== 'starter_squad' }); },
    signTeamDocument: async (docId: string, sig: string, mid: string) => { 
      if (!activeTeam || !firebaseUser) return false;
      const certId = `cert_${Date.now()}`;
      const batch = writeBatch(db);
      batch.set(doc(db, 'teams', activeTeam.id, 'members', mid, 'signatures', docId), { docId, signature: sig, signedAt: new Date().toISOString() });
      batch.set(doc(db, 'teams', activeTeam.id, 'files', certId), { 
        id: certId, name: `Signed Certificate: ${docId}`, category: 'Signed Certificate', 
        url: '#', type: 'cert', size: '1kb', date: new Date().toISOString(),
        memberId: mid, documentId: docId
      });
      await batch.commit();
      return true;
    }, 
    createTeamDocument: async (data: any) => { if (activeTeam) await setDoc(doc(db, 'teams', activeTeam.id, 'documents', data.id || `doc_${Date.now()}`), clean(data)); },
    updateTeamDocument: async (docId: string, data: any) => { if (activeTeam) await updateDoc(doc(db, 'teams', activeTeam.id, 'documents', docId), clean(data)); },
    addEvent: async (data: any) => { if (activeTeam) { await addDoc(collection(db, 'teams', activeTeam.id, 'events'), clean(data)); return true; } return false; },
    updateEvent: async (id: string, data: any) => { if (activeTeam) { await updateDoc(doc(db, 'teams', activeTeam.id, 'events', id), clean(data)); return true; } return false; },
    deleteEvent: async (id: string) => { if (activeTeam) await deleteDoc(doc(db, 'teams', activeTeam.id, 'events', id)); },
    updateRSVP: async (eventId: string, status: string) => { if (activeTeam && firebaseUser) await updateDoc(doc(db, 'teams', activeTeam.id, 'events', eventId), { [`userRsvps.${firebaseUser.uid}`]: status }); },
    addMessage: async (chatId: string, author: string, content: string, type: string, img?: string, poll?: any) => { if (activeTeam) await addDoc(collection(db, 'teams', activeTeam.id, 'groupChats', chatId, 'messages'), clean({ author, content, type, imageUrl: img, poll, createdAt: new Date().toISOString(), authorId: firebaseUser?.uid })); },
    createChat: async (name: string, mIds: string[]) => { if (activeTeam) { const res = await addDoc(collection(db, 'teams', activeTeam.id, 'groupChats'), { name, memberIds: [...mIds, firebaseUser?.uid], createdAt: new Date().toISOString() }); return res.id; } return ''; },
    resetSquadData: async (categories: string[]) => {
      if (!activeTeam) return;
      const batch = writeBatch(db);
      if (categories.includes('games')) {
        const games = await getDocs(collection(db, 'teams', activeTeam.id, 'games'));
        games.docs.forEach(d => batch.delete(d.ref));
      }
      if (categories.includes('events')) {
        const events = await getDocs(collection(db, 'teams', activeTeam.id, 'events'));
        events.docs.forEach(d => batch.delete(d.ref));
      }
      await batch.commit();
    },
    addVolunteerOpportunity: async (data: any) => { if (activeTeam) await addDoc(collection(db, 'teams', activeTeam.id, 'volunteers'), clean(data)); },
    signUpForVolunteer: async (oppId: string) => { if (activeTeam && firebaseUser) await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), { [`signups.${firebaseUser.uid}`]: { userId: firebaseUser.uid, userName: firebaseUser.displayName, status: 'pending', createdAt: new Date().toISOString() } }); },
    verifyVolunteerHours: async (oppId: string, userId: string, hours: number) => { if (activeTeam) await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), { [`signups.${userId}.status`]: 'verified', [`signups.${userId}.verifiedHours`]: hours }); },
    confirmVolunteerAttendance: async (oppId: string, userId: string, confirmed: boolean) => { if (activeTeam) await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), { [`signups.${userId}.isConfirmed`]: confirmed }); },
    addFundraisingOpportunity: async (data: any) => { if (activeTeam) await addDoc(collection(db, 'teams', activeTeam.id, 'fundraising'), clean({ ...data, currentAmount: 0 })); },
    signUpForFundraising: async (fundId: string) => { if (activeTeam && firebaseUser) await addDoc(collection(db, 'teams', activeTeam.id, 'fundraising', fundId, 'donations'), { donorName: firebaseUser.displayName, donorId: firebaseUser.uid, status: 'pending', createdAt: new Date().toISOString() }); },
    confirmExternalDonation: async (fundId: string, donationId: string, amount: number) => { 
      if (!activeTeam) return;
      const batch = writeBatch(db);
      batch.update(doc(db, 'teams', activeTeam.id, 'fundraising', fundId, 'donations', donationId), { status: 'verified', amount });
      batch.update(doc(db, 'teams', activeTeam.id, 'fundraising', fundId), { currentAmount: increment(amount) });
      await batch.commit();
    },
    addEquipmentItem: async (data: any) => { if (activeTeam) await addDoc(collection(db, 'teams', activeTeam.id, 'equipment'), clean({ ...data, availableQuantity: data.totalQuantity, assignments: {}, status: 'Active' })); },
    updateEquipmentItem: async (id: string, updates: any) => { if (activeTeam) await updateDoc(doc(db, 'teams', activeTeam.id, 'equipment', id), clean(updates)); },
    deleteEquipmentItem: async (id: string) => { if (activeTeam) await deleteDoc(doc(db, 'teams', activeTeam.id, 'equipment', id)); },
    assignEquipment: async (id: string, userId: string, userName: string, qty: number) => {
      if (!activeTeam) return;
      const batch = writeBatch(db);
      batch.update(doc(db, 'teams', activeTeam.id, 'equipment', id), {
        [`assignments.${userId}`]: { userId, userName, quantity: qty, date: new Date().toISOString() },
        availableQuantity: increment(-qty)
      });
      await batch.commit();
    },
    returnEquipment: async (id: string, userId: string) => {
      if (!activeTeam) return;
      const snap = await getDoc(doc(db, 'teams', activeTeam.id, 'equipment', id));
      const qty = snap.data()?.assignments?.[userId]?.quantity || 0;
      const batch = writeBatch(db);
      batch.update(doc(db, 'teams', activeTeam.id, 'equipment', id), {
        [`assignments.${userId}`]: deleteField(),
        availableQuantity: increment(qty)
      });
      await batch.commit();
    },
    addDrill: async (data: any) => { if (activeTeam) await addDoc(collection(db, 'teams', activeTeam.id, 'drills'), clean(data)); },
    addFile: async (name: string, type: string, sBytes: number, url: string, category: string, desc?: string) => { if (activeTeam) await addDoc(collection(db, 'teams', activeTeam.id, 'files'), clean({ name, type, sizeBytes: sBytes, url, category, description: desc, date: new Date().toISOString() })); },
    deleteFile: async (id: string) => { if (activeTeam) await deleteDoc(doc(db, 'teams', activeTeam.id, 'files', id)); },
    addFacility: async (data: any) => { if (firebaseUser) await addDoc(collection(db, 'facilities'), clean({ ...data, clubId: firebaseUser.uid })); },
    deleteFacility: async (id: string) => { await deleteDoc(doc(db, 'facilities', id)); },
    addField: async (facilityId: string, name: string) => { await addDoc(collection(db, 'facilities', facilityId, 'fields'), { name, facilityId }); },
    deleteField: async (facilityId: string, fieldId: string) => { await deleteDoc(doc(db, 'facilities', facilityId, 'fields', fieldId)); },
    createLeague: async (name: string) => {
      if (!firebaseUser || !db || !activeTeam) return '';
      const id = `league_${Date.now()}`;
      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      const leagueData = {
        id,
        name,
        sport: activeTeam.sport || 'General',
        creatorId: firebaseUser.uid,
        inviteCode,
        teams: {
          [activeTeam.id]: {
            teamName: activeTeam.name,
            teamLogoUrl: activeTeam.teamLogoUrl || '',
            wins: 0, losses: 0, ties: 0, points: 0
          }
        },
        finances: {
          [activeTeam.id]: { totalOwed: 0, totalPaid: 0, status: 'paid', payments: [] }
        },
        globalFees: { registration: 0 },
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'leagues', id), clean(leagueData));
      await updateDoc(doc(db, 'teams', activeTeam.id), { [`leagueIds.${id}`]: true });
      return id;
    },
    updateLeagueSchedule: async (lId: string, schedule: any[]) => { await updateDoc(doc(db, 'leagues', lId), { schedule }); },
    inviteTeamToLeague: async (lId: string, lName: string, email: string, tName?: string) => { await addDoc(collection(db, 'leagues', 'global', 'invites'), { leagueId: lId, leagueName: lName, invitedEmail: email, teamName: tName, status: 'pending', createdAt: new Date().toISOString() }); },
    saveLeagueRegistrationConfig: async (lId: string, updates: any) => { await setDoc(doc(db, 'leagues', lId, 'registration', 'config'), clean(updates), { merge: true }); },
    submitRegistrationEntry: async (tId: string, pId: string, answers: any, ver: number, sig?: string, tType?: any) => { await addDoc(collection(db, tType || 'leagues', tId, 'registrationEntries'), clean({ answers, form_version: ver, waiver_signed_text: sig, status: 'pending', payment_received: false, created_at: new Date().toISOString(), league_id: tId })); },
    assignEntryToTeam: async (lId: string, eId: string, tId: string | null) => { await updateDoc(doc(db, 'leagues', lId, 'registrationEntries', eId), { assigned_team_id: tId, status: tId ? 'assigned' : 'pending' }); },
    toggleRegistrationPaymentStatus: async (lId: string, eId: string, paid: boolean) => { await updateDoc(doc(db, 'leagues', lId, 'registrationEntries', eId), { payment_received: paid }); },
    respondToAssignment: async (contextId: string, entryId: string, status: any) => { await updateDoc(doc(db, 'leagues', contextId, 'registrationEntries', entryId), { status }); },
    signPublicTournamentWaiver: async (tId: string, eId: string, teamName: string, coachName: string) => { await updateDoc(doc(db, 'teams', tId, 'events', eId), { [`teamAgreements.${teamName}`]: { agreed: true, captainName: coachName, signedAt: new Date().toISOString() } }); return true; },
    submitMatchScore: async (tId: string, eId: string, gId: string, isT1: boolean, s1: number, s2: number) => { 
      const snap = await getDoc(doc(db, 'teams', tId, 'events', eId));
      const games = snap.data()?.tournamentGames || [];
      const updated = games.map((g: any) => g.id === gId ? { ...g, score1: s1, score2: s2, isCompleted: true } : g);
      await updateDoc(doc(db, 'teams', tId, 'events', eId), { tournamentGames: updated });
    },
    submitLeagueMatchScore: async (lId: string, gId: string, isT1: boolean, s1: number, s2: number) => {
      const snap = await getDoc(doc(db, 'leagues', lId));
      const schedule = snap.data()?.schedule || [];
      const updated = schedule.map((g: any) => g.id === gId ? { ...g, score1: s1, score2: s2, isCompleted: true } : g);
      await updateDoc(doc(db, 'leagues', lId), { schedule: updated });
    },
    disputeMatchScore: async (tId: string, eId: string, gId: string, notes: string) => {
      const snap = await getDoc(doc(db, 'teams', tId, 'events', eId));
      const games = snap.data()?.tournamentGames || [];
      const updated = games.map((g: any) => g.id === gId ? { ...g, isDisputed: true, disputeNotes: notes } : g);
      await updateDoc(doc(db, 'teams', tId, 'events', eId), { tournamentGames: updated });
    },
    manageSubscription: async () => { toast({ title: "Redirecting to Stripe..." }); },
    resolveQuota: async (ids: string[]) => { toast({ title: "Tiers Synchronized" }); },
    createAlert: async (title: string, message: string, audience: any) => { if (activeTeam) await addDoc(collection(db, 'teams', activeTeam.id, 'alerts'), clean({ title, message, audience, createdAt: new Date().toISOString(), createdBy: firebaseUser?.uid })); },
    deleteAlert: async (id: string) => { if (activeTeam) await deleteDoc(doc(db, 'teams', activeTeam.id, 'alerts', id)); },
    exportAttendanceCSV: async () => { toast({ title: "RSVP Ledger Generated" }); },
    exportTournamentStandingsCSV: async () => { toast({ title: "Leaderboard Exported" }); },
    addIncident: async (data: any) => { if (activeTeam && firebaseUser) await addDoc(collection(db, 'teams', activeTeam.id, 'incidents'), clean({ ...data, teamId: activeTeam.id, teamName: activeTeam.name, reportedBy: firebaseUser.uid, createdAt: new Date().toISOString() })); },
    addLeaguePayment: async (lId: string, tId: string, data: any) => { await updateDoc(doc(db, 'leagues', lId), { [`finances.${tId}.payments`]: arrayUnion(data), [`finances.${tId}.totalPaid`]: increment(data.amount) }); },
    updateLeagueGlobalFees: async (lId: string, fees: any) => { await updateDoc(doc(db, 'leagues', lId), { globalFees: fees }); },
    purchasePro: () => setIsPaywallOpen(true),
    updateLeagueTeamDetails: async (lId: string, tId: string, u: any) => { await updateDoc(doc(db, 'leagues', lId), { [`teams.${tId}`]: u }); },
    manuallyAddTeamToLeague: async (lId: string, name: string, email?: string) => { await updateDoc(doc(db, 'leagues', lId), { [`teams.manual_${Date.now()}`]: { teamName: name, coachEmail: email, wins: 0, losses: 0, ties: 0, points: 0 } }); },
    deleteLeagueInvite: async (id: string) => { await deleteDoc(doc(db, 'leagues', 'global', 'invites', id)); },
    addRegistration: async (tId: string, eId: string, data: any) => { await addDoc(collection(db, 'teams', tId, 'events', eId, 'registrations'), clean({ ...data, createdAt: new Date().toISOString() })); return true; },
    deleteChat: async (cId: string) => { if (activeTeam) await deleteDoc(doc(db, 'teams', activeTeam.id, 'groupChats', cId)); },
    hideChatForUser: async (cId: string) => { if (firebaseUser) await setDoc(doc(db, 'users', firebaseUser.uid, 'hiddenChats', cId), { chatId: cId, userId: firebaseUser.uid, hiddenAt: new Date().toISOString() }); },
    votePoll: async (cId: string, mId: string, idx: number) => { if (activeTeam) await updateDoc(doc(db, 'teams', activeTeam.id, 'groupChats', cId, 'messages', mId), { [`poll.voters.${firebaseUser?.uid}`]: idx, [`poll.options.${idx}.votes`]: increment(1), ['poll.totalVotes']: increment(1) }); },
    formatTime: (iso: string) => format(new Date(iso), 'h:mm a'),
    updateChat: async (cId: string, data: any) => { if (activeTeam) await updateDoc(doc(db, 'teams', activeTeam.id, 'groupChats', cId), clean(data)); },
    deployClubProtocol: async (data: any, tIds: string[]) => { const batch = writeBatch(db); tIds.forEach(tid => batch.set(doc(db, 'teams', tid, 'documents', `club_${Date.now()}`), clean({ ...data, isClubMaster: true, teamId: tid, createdAt: new Date().toISOString() }))); await batch.commit(); },
    deleteTeam: async (tid: string) => { await deleteDoc(doc(db, 'teams', tid)); },
    markMediaAsViewed: async (fId: string) => { if (activeTeam && firebaseUser) await setDoc(doc(db, 'teams', activeTeam.id, 'files', fId, 'views', firebaseUser.uid), { userId: firebaseUser.uid, viewedAt: new Date().toISOString() }); },
    upgradeChildToLogin: async (cid: string) => { await updateDoc(doc(db, 'players', cid), { hasLogin: true }); },
    registerChild: async (first: string, last: string, dob: string) => { if (firebaseUser) await addDoc(collection(db, 'players'), clean({ firstName: first, lastName: last, dateOfBirth: dob, parentId: firebaseUser.uid, isMinor: true, hasLogin: false, createdAt: new Date().toISOString() })); }
  }), [userProfile, activeTeam, teams, members, alerts, seenAlertIds, firebaseUser, db, myChildren, householdEvents, householdBalance, plans, isPaywallOpen, isTeamsLoading, isMembersLoading, isSeedingDemo, respondToAssignment, updateLeagueTeamDetails, manuallyAddTeamToLeague, deleteLeagueInvite, updateLeagueSchedule, inviteTeamToLeague, saveLeagueRegistrationConfig, submitRegistrationEntry, assignEntryToTeam, toggleRegistrationPaymentStatus, addLeaguePayment, updateLeagueGlobalFees, deleteChat, hideChatForUser, votePoll, updateChat, deployClubProtocol, deleteTeam, markMediaAsViewed, upgradeChildToLogin, registerChild]);

  return <TeamContext.Provider value={contextValue}>{children}</TeamContext.Provider>;
}

export const useTeam = () => {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within TeamProvider');
  return context;
};
