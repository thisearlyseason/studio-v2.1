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
};

export type TeamAlert = {
  id: string;
  title: string;
  message: string;
  audience: 'everyone' | 'coaches' | 'players' | 'parents';
  createdAt: string;
  createdBy: string;
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
  const [householdEvents, setHouseholdEvents] = useState<TeamEvent[]>([]);
  const [householdBalance, setHouseholdBalance] = useState(0);
  const [seenAlertIds, setSeenAlertIds] = useState<string[]>([]);

  // --- RECRUITING FUNCTIONS ---
  const getRecruitingProfile = async (playerId: string) => {
    const s = await getDoc(doc(db, 'players', playerId, 'recruitingProfile', 'profile'));
    return s.exists() ? (s.data() as RecruitingProfile) : null;
  };

  const updateRecruitingProfile = async (playerId: string, data: Partial<RecruitingProfile>) => {
    await setDoc(doc(db, 'players', playerId, 'recruitingProfile', 'profile'), {
      ...data,
      playerId,
      updatedAt: serverTimestamp()
    }, { merge: true });
  };

  const getAthleticMetrics = async (playerId: string) => {
    const s = await getDoc(doc(db, 'players', playerId, 'recruitingProfile', 'metrics'));
    return s.exists() ? (s.data() as AthleticMetrics) : null;
  };

  const updateAthleticMetrics = async (playerId: string, data: Partial<AthleticMetrics>) => {
    await setDoc(doc(db, 'players', playerId, 'recruitingProfile', 'metrics'), data, { merge: true });
  };

  const getPlayerStats = async (playerId: string) => {
    const s = await getDocs(collection(db, 'players', playerId, 'recruitingProfile', 'stats'));
    return s.docs.map(d => ({ id: d.id, ...d.data() } as PlayerStat));
  };

  const addPlayerStat = async (playerId: string, data: Partial<PlayerStat>) => {
    await addDoc(collection(db, 'players', playerId, 'recruitingProfile', 'stats'), clean(data));
  };

  const deletePlayerStat = async (playerId: string, statId: string) => {
    await deleteDoc(doc(db, 'players', playerId, 'recruitingProfile', 'stats', statId));
  };

  const getEvaluations = async (playerId: string) => {
    const s = await getDocs(collection(db, 'players', playerId, 'evaluations'));
    return s.docs.map(d => ({ id: d.id, ...d.data() } as PlayerEvaluation));
  };

  const addEvaluation = async (playerId: string, data: Partial<PlayerEvaluation>) => {
    await addDoc(collection(db, 'players', playerId, 'evaluations'), clean({
      ...data,
      evaluatorId: firebaseUser?.uid,
      createdAt: serverTimestamp()
    }));
  };

  const getRecruitingContact = async (playerId: string) => {
    const s = await getDoc(doc(db, 'players', playerId, 'recruitingProfile', 'contact'));
    return s.exists() ? (s.data() as RecruitingContact) : null;
  };

  const updateRecruitingContact = async (playerId: string, data: Partial<RecruitingContact>) => {
    await setDoc(doc(db, 'players', playerId, 'recruitingProfile', 'contact'), data, { merge: true });
  };

  const getPlayerVideos = async (playerId: string) => {
    const s = await getDocs(collection(db, 'players', playerId, 'videos'));
    return s.docs.map(d => ({ id: d.id, ...d.data() } as PlayerVideo));
  };

  const addPlayerVideo = async (playerId: string, data: Partial<PlayerVideo>) => {
    await addDoc(collection(db, 'players', playerId, 'videos'), clean({
      ...data,
      createdAt: serverTimestamp()
    }));
  };

  const deletePlayerVideo = async (playerId: string, videoId: string) => {
    await deleteDoc(doc(db, 'players', playerId, 'videos', videoId));
  };

  const toggleRecruitingProfile = async (playerId: string, enabled: boolean) => {
    await updateDoc(doc(db, 'players', playerId), { recruitingProfileEnabled: enabled });
  };

  const updateStaffEvaluation = async (memberId: string, notes: string) => {
    if (!activeTeam?.id) return;
    await updateDoc(doc(db, 'teams', activeTeam.id, 'members', memberId), { notes });
  };

  const getStaffEvaluation = async (memberId: string) => {
    if (!activeTeam?.id) return '';
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
    seenAlertIds,
    
    // Recruiting Pack
    getRecruitingProfile, updateRecruitingProfile, getAthleticMetrics, updateAthleticMetrics,
    getPlayerStats, addPlayerStat, deletePlayerStat, getEvaluations, addEvaluation,
    getRecruitingContact, updateRecruitingContact, getPlayerVideos, addPlayerVideo, deletePlayerVideo,
    toggleRecruitingProfile, updateStaffEvaluation, getStaffEvaluation,

    createNewTeam: async (name: string, type: any, pos: string) => { const tid = `team_${Date.now()}`; return tid; },
    joinTeamWithCode: async (code: string, pid: string, pos: string) => true,
    updateUser: async (u: any) => { if (firebaseUser) await updateDoc(doc(db, 'users', firebaseUser.uid), clean(u)); },
    updateMember: async (mid: string, u: any) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id, 'members', mid), clean(u)); },
    updateTeamDetails: async (u: any) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id), clean(u)); },
    updateTeamHero: async (url: string) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id), { heroImageUrl: url }); },
    updateTeamPlan: async (tid: string, pid: string) => { await updateDoc(doc(db, 'teams', tid), { planId: pid, isPro: pid !== 'starter_squad' }); },
    signTeamDocument: async () => true, createTeamDocument: async () => {}, updateTeamDocument: async () => {},
    addEvent: async () => true, updateEvent: async () => true, deleteEvent: async () => {}, updateRSVP: async () => {},
    addMessage: async () => {}, createChat: async () => '', resetSquadData: async () => {},
    addVolunteerOpportunity: async (data: any) => { if (activeTeam) await addDoc(collection(db, 'teams', activeTeam.id, 'volunteers'), clean(data)); },
    signUpForVolunteer: async () => {},
    verifyVolunteerHours: async (oppId: string, userId: string, hours: number) => { if (activeTeam) await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), { [`signups.${userId}.status`]: 'verified', [`signups.${userId}.verifiedHours`]: hours }); },
    confirmVolunteerAttendance: async (oppId: string, userId: string, confirmed: boolean) => { if (activeTeam) await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), { [`signups.${userId}.isConfirmed`]: confirmed }); },
    addFundraisingOpportunity: async (data: any) => { if (activeTeam) await addDoc(collection(db, 'teams', activeTeam.id, 'fundraising'), clean({ ...data, currentAmount: 0 })); },
    signUpForFundraising: async () => {},
    confirmExternalDonation: async (fundId: string, donationId: string, amount: number) => { 
      if (!activeTeam) return;
      const batch = writeBatch(db);
      batch.update(doc(db, 'teams', activeTeam.id, 'fundraising', fundId, 'donations', donationId), { status: 'verified' });
      batch.update(doc(db, 'teams', activeTeam.id, 'fundraising', fundId), { currentAmount: increment(amount) });
      await batch.commit();
    },
    addEquipmentItem: async () => {}, updateEquipmentItem: async () => {}, deleteEquipmentItem: async () => {},
    addDrill: async () => {}, addFile: async () => {}, deleteFile: async () => {},
    addFacility: async () => {}, deleteFacility: async () => {}, addField: async () => {}, deleteField: async () => {},
    createLeague: async (name: string) => { if (firebaseUser) { const id = `league_${Date.now()}`; await setDoc(doc(db, 'leagues', id), { name, creatorId: firebaseUser.uid, teams: {}, finances: {}, createdAt: new Date().toISOString() }); return id; } return ''; },
    updateLeagueSchedule: async () => {}, inviteTeamToLeague: async () => {},
    saveLeagueRegistrationConfig: async () => {}, submitRegistrationEntry: async () => {},
    assignEntryToTeam: async () => {}, toggleRegistrationPaymentStatus: async () => {},
    respondToAssignment: async () => {}, signPublicTournamentWaiver: async () => true,
    submitMatchScore: async () => {}, submitLeagueMatchScore: async () => {}, disputeMatchScore: async () => {},
    manageSubscription: async () => {}, resolveQuota: async () => {},
    createAlert: async () => {}, deleteAlert: async () => {}, exportAttendanceCSV: async () => {},
    exportTournamentStandingsCSV: async () => {}, addIncident: async () => {},
    addLeaguePayment: async () => {}, updateLeagueGlobalFees: async () => {},
    updateLeagueTeamDetails: async () => {}, manuallyAddTeamToLeague: async () => {}, deleteLeagueInvite: async () => {}
  }), [userProfile, activeTeam, teams, members, alerts, seenAlertIds, firebaseUser, db, myChildren, householdEvents, householdBalance, plans, isPaywallOpen, isTeamsLoading, isMembersLoading]);

  return <TeamContext.Provider value={contextValue}>{children}</TeamContext.Provider>;
}

export const useTeam = () => {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within TeamProvider');
  return context;
};