
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
  collectionGroup
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
  medicalClearance?: boolean;
  gpa?: string;
  gradYear?: string;
  school?: string;
  highlightUrl?: string;
  joinedAt?: string;
  isDemo?: boolean;
  achievements?: string[];
  skills?: string[];
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
  documentTitle: string;
  documentId: string;
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
  tournamentGames?: TournamentGame[];
  userRsvps?: Record<string, string>;
  createdBy?: string;
  teamWaiverText?: string;
  teamAgreements?: Record<string, {
    agreed: boolean;
    signedAt: string;
    captainName: string;
    userId: string;
  }>;
  invitedTeamEmails?: Record<string, string>;
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
  signatureId?: string;
  memberId?: string;
  documentId?: string;
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
  schedule?: TournamentGame[];
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
  id: string;
  title: string;
  description: string;
  registration_cost: string;
  payment_instructions: string;
  is_active: boolean;
  form_schema: RegistrationFormField[];
  form_version: number;
  waiver_text?: string;
  confirmation_message?: string;
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
  protocol_id: string;
  waiver_signed_text?: string;
  target_type?: 'leagues' | 'teams';
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
  mvp?: string;
  leagueMatch?: boolean;
};

interface TeamContextType {
  db: any;
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
  createNewTeam: (name: string, type: "adult" | "youth", pos: string, description?: string, planId?: string) => Promise<string>;
  joinTeamWithCode: (code: string, playerId: string, position: string) => Promise<boolean>;
  registerChild: (firstName: string, lastName: string, dob: string) => Promise<string>;
  upgradeChildToLogin: (childId: string) => Promise<void>;
  updateUser: (updates: Partial<UserProfile>) => Promise<void>;
  updateMember: (memberId: string, updates: Partial<Member>) => Promise<void>;
  updateTeamDetails: (updates: Partial<Team>) => Promise<void>;
  updateTeamHero: (url: string) => Promise<void>;
  updateTeamPlan: (teamId: string, planId: string) => Promise<void>;
  signTeamDocument: (docId: string, signatureText: string, targetMemberId: string) => Promise<boolean>;
  createTeamDocument: (data: any) => Promise<void>;
  updateTeamDocument: (docId: string, data: any) => Promise<void>;
  deleteTeamDocument: (docId: string) => Promise<void>;
  updateStaffEvaluation: (memberId: string, note: string) => Promise<void>;
  getStaffEvaluation: (memberId: string) => Promise<string>;
  addEvent: (data: any) => Promise<boolean>;
  updateEvent: (id: string, data: any) => Promise<boolean>;
  deleteEvent: (id: string) => Promise<void>;
  updateRSVP: (eventId: string, status: string) => Promise<void>;
  addMessage: (chatId: string, author: string, content: string, type: string, img?: string, poll?: any) => Promise<void>;
  votePoll: (chatId: string, msgId: string, oIdx: number) => Promise<void>;
  createChat: (name: string, members: string[]) => Promise<string>;
  deleteChat: (chatId: string) => Promise<void>;
  hideChatForUser: (chatId: string) => Promise<void>;
  formatTime: (date: string | Date) => string;
  resetSquadData: (categories: string[]) => Promise<void>;
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
  addFile: (name: string, type: string, sBytes: number, url: string, category: string, desc?: string) => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
  markMediaAsViewed: (id: string) => Promise<void>;
  addMediaComment: (id: string, text: string) => Promise<void>;
  addFacility: (data: any) => Promise<void>;
  deleteFacility: (id: string) => Promise<void>;
  addField: (facilityId: string, name: string) => Promise<void>;
  deleteField: (facilityId: string, fieldId: string) => Promise<void>;
  createLeague: (name: string) => Promise<string>;
  updateLeagueSchedule: (leagueId: string, schedule: TournamentGame[]) => Promise<void>;
  inviteTeamToLeague: (leagueId: string, leagueName: string, email: string) => Promise<void>;
  acceptLeagueInvite: (inviteId: string, leagueId: string) => Promise<void>;
  manuallyAddTeamToLeague: (leagueId: string, teamName: string, coachEmail?: string, logoUrl?: string) => Promise<void>;
  saveLeagueRegistrationConfig: (leagueId: string, updates: Partial<LeagueRegistrationConfig>) => Promise<void>;
  submitRegistrationEntry: (targetId: string, protocolId: string, answers: any, version: number, signature?: string, targetType?: 'leagues' | 'teams') => Promise<void>;
  assignEntryToTeam: (leagueId: string, entryId: string, teamId: string | null) => Promise<void>;
  toggleRegistrationPaymentStatus: (leagueId: string, entryId: string, paid: boolean) => Promise<void>;
  respondToAssignment: (contextId: string, entryId: string, status: 'accepted' | 'declined') => Promise<void>;
  addRegistration: (teamId: string, eventId: string, data: any) => Promise<boolean>;
  signTeamTournamentWaiver: (teamId: string, eventId: string, tournamentTeamName: string) => Promise<void>;
  signPublicTournamentWaiver: (teamId: string, eventId: string, tournamentTeamName: string, coachName: string) => Promise<boolean>;
  submitMatchScore: (teamId: string, eventId: string, gameId: string, isTeam1: boolean, score1: number, score2: number) => Promise<void>;
  submitLeagueMatchScore: (leagueId: string, gameId: string, isTeam1: boolean, score1: number, score2: number) => Promise<void>;
  disputeMatchScore: (teamId: string, eventId: string, gameId: string, notes: string) => Promise<void>;
  manageSubscription: () => Promise<void>;
  resolveQuota: (selectedTeamIds: string[]) => Promise<void>;
  createAlert: (title: string, message: string, audience: TeamAlert['audience']) => Promise<void>;
  deleteAlert: (alertId: string) => Promise<void>;
  exportSignaturesCSV: (documentId: string) => Promise<void>;
  exportAttendanceCSV: (eventId: string) => Promise<void>;
  exportTournamentStandingsCSV: (tournamentId: string) => Promise<void>;
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
  const [seenAlertIds, setSeenAlertIds] = useState<string[]>([]);

  // --- QUERIES ---
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
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('squad_seen_alerts_ids');
      if (stored) {
        try { setSeenAlertIds(JSON.parse(stored)); } catch (e) {}
      }
    }
  }, []);

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

  useEffect(() => {
    if (teams.length > 0 && !activeTeamId) {
      setActiveTeamId(teams[0].id);
    }
  }, [teams, activeTeamId]);

  const activeTeam = useMemo(() => teams.find(t => t.id === activeTeamId) || teams[0] || null, [teams, activeTeamId]);

  // --- UNIFIED EVENT SYNC ---
  useEffect(() => {
    if (!db || !isAuthResolved || !firebaseUser || teams.length === 0) return;

    const relevantTeamIds = new Set<string>();
    teams.forEach(t => relevantTeamIds.add(t.id));
    myChildren.forEach(c => (c.joinedTeamIds || []).forEach(tid => relevantTeamIds.add(tid)));

    const unsubscribes: (() => void)[] = [];

    Array.from(relevantTeamIds).forEach(tid => {
      const q = query(collection(db, 'teams', tid, 'events'), orderBy('date', 'asc'));
      const unsub = onSnapshot(q, (snap) => {
        setHouseholdEvents(prev => {
          const otherEvents = prev.filter(e => e.teamId !== tid);
          const teamEvents = snap.docs.map(d => ({ id: d.id, teamId: tid, ...d.data() } as TeamEvent));
          return [...otherEvents, ...teamEvents].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        });
      }, (error) => {
        console.warn(`Event sync failed for team ${tid}:`, error);
      });
      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [db, isAuthResolved, firebaseUser, teams, myChildren]);

  const membersQuery = useMemoFirebase(() => (isAuthResolved && activeTeam?.id && db) ? query(collection(db, 'teams', activeTeam.id, 'members')) : null, [isAuthResolved, activeTeam?.id, db]);
  const { data: membersData, isLoading: isMembersLoading } = useCollection<Member>(membersQuery);
  const members = useMemo(() => membersData || [], [membersData]);

  const currentMember = useMemo(() => members.find(m => m.userId === firebaseUser?.uid) || null, [members, firebaseUser?.uid]);

  const alertsQuery = useMemoFirebase(() => (isAuthResolved && activeTeam?.id && db) ? query(collection(db, 'teams', activeTeam.id, 'alerts'), orderBy('createdAt', 'desc'), limit(10)) : null, [isAuthResolved, activeTeam?.id, db]);
  const { data: alertsData } = useCollection<TeamAlert>(alertsQuery);
  const alerts = alertsData || [];

  const unreadAlertsCount = useMemo(() => {
    if (!userProfile || !alertsData) return 0;
    const myAlerts = (alertsData || []).filter(alert => {
      if (alert.audience === 'everyone') return true;
      if (alert.audience === 'coaches' && (activeTeam?.role === 'Admin')) return true;
      if (alert.audience === 'players' && (userProfile.role === 'adult_player')) return true;
      if (alert.audience === 'parents' && (userProfile.role === 'parent')) return true;
      return false;
    });
    return myAlerts.filter(a => !seenAlertIds.includes(a.id)).length;
  }, [alertsData, seenAlertIds, userProfile, activeTeam?.role]);

  const proQuotaStatus = useMemo(() => {
    const limitCount = userProfile?.proTeamLimit ?? 0;
    const currentCount = teams.filter(t => t.ownerUserId === firebaseUser?.uid && t.isPro).length;
    return { current: currentCount, limit: limitCount, remaining: Math.max(0, limitCount - currentCount), exceeded: currentCount > limitCount };
  }, [teams, userProfile, firebaseUser?.uid]);

  // --- ACTIONS ---
  const createAlert = useCallback(async (title: string, message: string, audience: TeamAlert['audience']) => {
    if (!activeTeam?.id || !firebaseUser) return;
    await addDoc(collection(db, 'teams', activeTeam.id, 'alerts'), clean({ 
      title, message, audience, createdAt: new Date().toISOString(), createdBy: firebaseUser.uid 
    }));
    toast({ title: "Broadcast Dispatched" });
  }, [activeTeam?.id, firebaseUser, db]);

  const deleteAlert = useCallback(async (alertId: string) => {
    if (activeTeam?.id) await deleteDoc(doc(db, 'teams', activeTeam.id, 'alerts', alertId));
  }, [activeTeam?.id, db]);

  const respondToAssignment = useCallback(async (contextId: string, entryId: string, status: 'accepted' | 'declined') => {
    const entryRef = doc(db, 'leagues', contextId, 'registrationEntries', entryId);
    const entrySnap = await getDoc(entryRef);
    let finalRef = entryRef;
    if (!entrySnap.exists()) {
      const teamEntryRef = doc(db, 'teams', contextId, 'registrationEntries', entryId);
      const teamEntrySnap = await getDoc(teamEntryRef);
      if (teamEntrySnap.exists()) finalRef = teamEntryRef;
    }
    await updateDoc(finalRef, { status });
    toast({ title: status === 'accepted' ? "Recruit Enrolled" : "Application Declined" });
  }, [db]);

  const signTeamDocument = useCallback(async (docId: string, signatureText: string, targetMemberId: string) => {
    if (!activeTeam?.id || !userProfile) return false;
    const docRef = doc(db, 'teams', activeTeam.id, 'documents', docId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return false;
    const docData = docSnap.data() as TeamDocument;
    const targetMember = members.find(m => m.id === targetMemberId);
    if (!targetMember) return false;

    const batch = writeBatch(db);
    const sigId = `sig_${targetMember.id}_${Date.now()}`;
    
    batch.set(doc(db, 'teams', activeTeam.id, 'documents', docId, 'signatures', sigId), clean({
      id: sigId, memberId: targetMember.id, userId: userProfile.id, userName: targetMember.name,
      signedAt: new Date().toISOString(), signatureText, documentTitle: docData.title, documentId: docId
    }));
    
    batch.set(doc(db, 'teams', activeTeam.id, 'members', targetMember.id, 'signatures', docId), clean({
      id: sigId, docId, title: docData.title, signedAt: new Date().toISOString(), signatureText
    }));
    
    batch.update(docRef, { signatureCount: increment(1) });
    
    const certId = `cert_${docId}_${targetMember.id}`;
    batch.set(doc(db, 'teams', activeTeam.id, 'files', certId), clean({
      id: certId,
      name: `Signed: ${docData.title} - ${targetMember.name}`,
      type: 'pdf', size: 'Digital Certificate', sizeBytes: 0, url: '#',
      category: 'Signed Certificate', description: `Verified execution of ${docData.title}. Signed as "${signatureText}".`,
      date: new Date().toISOString(), authorId: userProfile.id, targetMemberId: targetMember.id, documentId: docId,
      signatureId: sigId
    }));
    
    await batch.commit(); 
    toast({ title: "Compliance Verified", description: "Record added to roster." });
    return true;
  }, [activeTeam?.id, userProfile, db, members]);

  const createTeamDocument = useCallback(async (data: any) => {
    if (!activeTeam?.id || !firebaseUser) return;
    await addDoc(collection(db, 'teams', activeTeam.id, 'documents'), clean({ 
      ...data, teamId: activeTeam.id, signatureCount: 0, createdAt: new Date().toISOString() 
    }));
    await createAlert(`Waiver Required: ${data.title}`, `Please visit the Library to sign.`, 'everyone');
  }, [activeTeam?.id, firebaseUser, db, createAlert]);

  const exportSignaturesCSV = useCallback(async (documentId: string) => {
    if (!activeTeam?.id) return;
    const s = await getDocs(collection(db, 'teams', activeTeam.id, 'documents', documentId, 'signatures'));
    const rows = s.docs.map(d => d.data());
    const headers = ["Member", "Legal Signature", "Date Signed", "Document"];
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows.map(r => [r.userName, r.signatureText, r.signedAt, r.documentTitle])].map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Signatures_${documentId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [activeTeam?.id, db]);

  const exportAttendanceCSV = useCallback(async (eventId: string) => {
    if (!activeTeam?.id) return;
    const event = householdEvents.find(e => e.id === eventId);
    if (!event) return;
    
    const headers = ["Member Name", "RSVP Status", "Position", "Jersey"];
    const rows = members.map(m => {
      const rsvp = event.userRsvps?.[m.userId] || 'No Response';
      return [m.name, rsvp, m.position, m.jersey];
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Attendance_${event.title.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "RSVP Ledger Exported" });
  }, [activeTeam?.id, householdEvents, members]);

  const exportTournamentStandingsCSV = useCallback(async (tournamentId: string) => {
    const event = householdEvents.find(e => e.id === tournamentId);
    if (!event) return;
    
    const teams = event.tournamentTeams || [];
    const games = event.tournamentGames || [];
    
    const standings = teams.map(team => {
      let w = 0, l = 0, t = 0, p = 0;
      games.filter(g => g.isCompleted && (g.team1 === team || g.team2 === team)).forEach(g => {
        const isT1 = g.team1 === team;
        const myScore = isT1 ? g.score1 : g.score2;
        const oppScore = isT1 ? g.score2 : g.score1;
        if (myScore > oppScore) { w++; p++; }
        else if (myScore < oppScore) { l++; p--; }
        else t++;
      });
      return [team, w, l, t, p];
    });

    const headers = ["Team Name", "Wins", "Losses", "Ties", "Total Points"];
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...standings].map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Standings_${event.title.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Championship Standings Exported" });
  }, [householdEvents]);

  const contextValue = useMemo(() => ({
    db,
    user: userProfile, activeTeam, setActiveTeam: (t: Team) => setActiveTeamId(t.id), teams, isTeamsLoading, isSeedingDemo, members, isMembersLoading,
    currentMember, isStaff: activeTeam?.role === 'Admin', isPro: activeTeam?.isPro || false, isParent: userProfile?.role === 'parent', isPlayer: userProfile?.role === 'adult_player',
    isSuperAdmin, isClubManager: ['elite_teams', 'elite_league', 'squad_organization'].includes(userProfile?.activePlanId || ''), household, householdEvents, householdBalance, myChildren, plans, isPlansLoading, proQuotaStatus,
    isPaywallOpen, setIsPaywallOpen, purchasePro: () => setIsPaywallOpen(true), 
    hasFeature: (fid: string) => !!plans.find(p => p.id === (activeTeam?.planId || 'starter_squad'))?.features?.[fid], 
    alerts, unreadAlertsCount, 
    markAlertAsSeen: (id: string) => { setSeenAlertIds(prev => [...new Set([...prev, id])]); localStorage.setItem('squad_seen_alerts_ids', JSON.stringify([...seenAlertIds, id])); },
    markAllAlertsAsSeen: () => { const ids = alerts.map(a => a.id); setSeenAlertIds(ids); localStorage.setItem('squad_seen_alerts_ids', JSON.stringify(ids)); },
    seenAlertIds,
    formatTime: (date: string | Date) => { try { return new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return 'TBD'; } },
    createNewTeam: async (name: string, type: any, pos: string, description?: string, planId?: string) => { if (!firebaseUser) return ''; const tid = `team_${Date.now()}`; const code = Math.random().toString(36).substring(2, 8).toUpperCase(); const batch = writeBatch(db); batch.set(doc(db, 'teams', tid), clean({ id: tid, teamName: name, teamCode: code, type, ownerUserId: firebaseUser.uid, createdAt: new Date().toISOString(), isPro: planId !== 'starter_squad', planId: planId || 'starter_squad' })); batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), clean({ id: firebaseUser.uid, userId: firebaseUser.uid, teamId: tid, role: 'Admin', position: pos, name: userProfile?.name || 'Coach', joinedAt: new Date().toISOString(), jersey: 'HQ' })); batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), clean({ teamId: tid, teamName: name, teamCode: code, role: 'Admin', isPro: planId !== 'starter_squad', planId: planId || 'starter_squad' })); await batch.commit(); return tid; },
    joinTeamWithCode: async (code: string, pid: string, pos: string) => { if (!firebaseUser) return false; const q = query(collection(db, 'teams'), where('teamCode', '==', code.toUpperCase()), limit(1)); const s = await getDocs(q); if (s.empty) return false; const tid = s.docs[0].id; const t = s.docs[0].data(); const batch = writeBatch(db); batch.update(doc(db, 'players', pid), { joinedTeamIds: arrayUnion(tid) }); batch.set(doc(db, 'teams', tid, 'members', pid), clean({ id: pid, userId: firebaseUser.uid, playerId: pid, teamId: tid, role: 'Member', position: pos, name: pid.startsWith('p_') ? userProfile?.name : 'Child', joinedAt: new Date().toISOString(), jersey: 'TBD' })); batch.set(db, doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), clean({ teamId: tid, teamName: t.teamName, teamCode: code.toUpperCase(), role: 'Member', isPro: !!t.isPro, planId: t.planId || 'starter_squad' })); await batch.commit(); return true; },
    registerChild: async (f: string, l: string, d: string) => { if (!firebaseUser) return ''; const ref = await addDoc(collection(db, 'players'), clean({ firstName: f, lastName: l, dateOfBirth: d, isMinor: true, parentId: firebaseUser.uid, createdAt: new Date().toISOString() })); return ref.id; },
    upgradeChildToLogin: async (cid: string) => { await updateDoc(doc(db, 'players', cid), { hasLogin: true }); },
    updateUser: async (u: any) => { if (firebaseUser) await updateDoc(doc(db, 'users', firebaseUser.uid), clean(u)); },
    updateMember: async (mid: string, u: any) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id, 'members', mid), clean(u)); },
    updateTeamDetails: async (u: any) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id), clean(u)); },
    updateTeamHero: async (url: string) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id), { heroImageUrl: url }); },
    updateTeamPlan: async (tid: string, pid: string) => { await updateDoc(doc(db, 'teams', tid), { planId: pid, isPro: pid !== 'starter_squad' }); },
    signTeamDocument,
    createTeamDocument,
    updateTeamDocument: async (id: string, data: any) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id, 'documents', id), clean(data)); },
    deleteTeamDocument: async (id: string) => { if (activeTeam?.id) await deleteDoc(doc(db, 'teams', activeTeam.id, 'documents', id)); },
    updateStaffEvaluation: async (mid: string, note: string) => { if (activeTeam?.id) await setDoc(doc(db, 'teams', activeTeam.id, 'members', mid, 'private', 'evaluation'), { note, updatedAt: new Date().toISOString() }); },
    getStaffEvaluation: async (mid: string) => { if (!activeTeam?.id) return ''; const s = await getDoc(doc(db, 'teams', activeTeam.id, 'members', mid, 'private', 'evaluation')); return s.exists() ? s.data().note : ''; },
    addEvent: async (d: any) => { if (!activeTeam?.id) return false; await addDoc(collection(db, 'teams', activeTeam.id, 'events'), clean({ ...d, teamId: activeTeam.id })); return true; },
    updateEvent: async (id: string, d: any) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id, 'events', id), clean(d)); return true; },
    deleteEvent: async (id: string) => { if (activeTeam?.id) await deleteDoc(doc(db, 'teams', activeTeam.id, 'events', id)); },
    updateRSVP: async (eid: string, s: string) => { if (activeTeam?.id && firebaseUser) await updateDoc(doc(db, 'teams', activeTeam.id, 'events', eid), { [`userRsvps.${firebaseUser.uid}`]: s }); },
    addMessage: async (cid: string, a: string, c: string, t: string, i?: string, p?: any) => { if (activeTeam?.id) await addDoc(collection(db, 'teams', activeTeam.id, 'groupChats', cid, 'messages'), clean({ author: a, authorId: firebaseUser?.uid, content: c, type: t, imageUrl: i, poll: p, createdAt: new Date().toISOString() })); },
    votePoll: async (cid: string, mid: string, o: number) => { if (activeTeam?.id && firebaseUser) { const r = doc(db, 'teams', activeTeam.id, 'groupChats', cid, 'messages', mid); const s = await getDoc(r); const p = s.data()?.poll; const cur = p.voters?.[firebaseUser.uid]; const u: any = { [`poll.voters.${firebaseUser.uid}`]: o }; if (cur === undefined) { u[`poll.options.${o}.votes`] = increment(1); u['poll.totalVotes'] = increment(1); } else if (cur !== o) { u[`poll.options.${cur}.votes`] = increment(-1); u[`poll.options.${o}.votes`] = increment(1); } await updateDoc(r, u); } },
    createChat: async (n: string, m: string[]) => { if (!activeTeam?.id || !firebaseUser) return ''; const r = await addDoc(collection(db, 'teams', activeTeam.id, 'groupChats'), clean({ name: n, memberIds: [...m, firebaseUser.uid], createdAt: new Date().toISOString() })); return r.id; },
    deleteChat: async (id: string) => { if (activeTeam?.id) await deleteDoc(doc(db, 'teams', activeTeam.id, 'groupChats', id)); },
    hideChatForUser: async (id: string) => { if (activeTeam?.id && firebaseUser) await updateDoc(doc(db, 'teams', activeTeam.id, 'groupChats', id), { [`hiddenFor.${firebaseUser.uid}`]: true }); },
    resetSquadData: async (cats: string[]) => { if (!activeTeam?.id) return; const b = writeBatch(db); for (const c of cats) { const s = await getDocs(collection(db, `teams/${activeTeam.id}/${c}`)); s.docs.forEach(d => b.delete(d.ref)); } await b.commit(); },
    addVolunteerOpportunity: async (d: any) => { if (activeTeam?.id) await addDoc(collection(db, 'teams', activeTeam.id, 'volunteers'), clean({ ...d, signups: {}, createdAt: new Date().toISOString() })); },
    signUpForVolunteer: async (id: string) => { if (activeTeam?.id && userProfile) await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', id), { [`signups.${userProfile.id}`]: { userId: userProfile.id, userName: userProfile.name, status: 'pending' } }); },
    verifyVolunteerHours: async (id: string, uid: string, h: number) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', id), { [`signups.${uid}.status`]: 'verified', [`signups.${uid}.verifiedHours`]: h }); },
    deleteVolunteerOpportunity: async (id: string) => { if (activeTeam?.id) await deleteDoc(doc(db, 'teams', activeTeam.id, 'volunteers', id)); },
    addFundraisingOpportunity: async (d: any) => { if (activeTeam?.id) await addDoc(collection(db, 'teams', activeTeam.id, 'fundraising'), clean({ ...d, currentAmount: 0, participants: {}, createdAt: new Date().toISOString() })); },
    signUpForFundraising: async (id: string) => { if (activeTeam?.id && userProfile) await updateDoc(doc(db, 'teams', activeTeam.id, 'fundraising', id), { [`participants.${userProfile.id}`]: true }); },
    updateFundraisingAmount: async (id: string, a: number) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id, 'fundraising', id), { currentAmount: increment(a) }); },
    deleteFundraisingOpportunity: async (id: string) => { if (activeTeam?.id) await deleteDoc(doc(db, 'teams', activeTeam.id, 'fundraising', id)); },
    addEquipmentItem: async (d: any) => { if (activeTeam?.id) await addDoc(collection(db, 'teams', activeTeam.id, 'equipment'), clean({ ...d, availableQuantity: d.totalQuantity, assignments: {}, status: 'Active' })); },
    updateEquipmentItem: async (id: string, u: any) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id, 'equipment', id), clean(u)); },
    deleteEquipmentItem: async (id: string) => { if (activeTeam?.id) await deleteDoc(doc(db, 'teams', activeTeam.id, 'equipment', id)); },
    assignEquipment: async (id: string, uid: string, un: string, q: number) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id, 'equipment', id), { [`assignments.${uid}`]: { userId: uid, userName: un, quantity: q, assignedAt: new Date().toISOString() }, availableQuantity: increment(-q) }); },
    returnEquipment: async (id: string, uid: string) => { if (activeTeam?.id) { const r = doc(db, 'teams', activeTeam.id, 'equipment', id); const s = await getDoc(r); const q = s.data()?.assignments?.[uid]?.quantity || 0; await updateDoc(r, { [`assignments.${uid}`]: deleteField(), availableQuantity: increment(q) }); } },
    addDrill: async (d: any) => { if (activeTeam?.id) await addDoc(collection(db, 'teams', activeTeam.id, 'drills'), clean(d)); },
    deleteDrill: async (id: string) => { if (activeTeam?.id) await deleteDoc(doc(db, 'teams', activeTeam.id, 'drills', id)); },
    addScoutingReport: async (d: any) => { if (activeTeam?.id) await addDoc(collection(db, 'teams', activeTeam.id, 'scouting'), clean(d)); },
    deleteScoutingReport: async (id: string) => { if (activeTeam?.id) await deleteDoc(doc(db, 'teams', activeTeam.id, 'scouting', id)); },
    addFile: async (n: string, t: string, s: number, u: string, c: string, d?: string) => { if (activeTeam?.id) await addDoc(collection(db, 'teams', activeTeam.id, 'files'), clean({ name: n, type: t, size: (s / 1048576).toFixed(2) + ' MB', sizeBytes: s, url: u, category: c, description: d, date: new Date().toISOString() })); },
    deleteFile: async (id: string) => { if (activeTeam?.id) await deleteDoc(doc(db, 'teams', activeTeam.id, 'files', id)); },
    markMediaAsViewed: async (id: string) => { if (activeTeam?.id && userProfile) await updateDoc(doc(db, 'teams', activeTeam.id, 'files', id), { [`viewedBy.${userProfile.id}`]: true }); },
    addMediaComment: async (id: string, text: string) => { if (activeTeam?.id && userProfile) await updateDoc(doc(db, 'teams', activeTeam.id, 'files', id), { comments: arrayUnion({ id: `c_${Date.now()}`, authorId: userProfile.id, authorName: userProfile.name, text, createdAt: new Date().toISOString() }) }); },
    addFacility: async (d: any) => { if (firebaseUser) await addDoc(collection(db, 'facilities'), clean({ ...d, clubId: firebaseUser.uid, createdAt: new Date().toISOString() })); },
    deleteFacility: async (id: string) => { await deleteDoc(doc(db, 'facilities', id)); },
    addField: async (fid: string, n: string) => { await addDoc(collection(db, 'facilities', fid, 'fields'), clean({ name: n, facilityId: fid, createdAt: new Date().toISOString() })); },
    deleteField: async (fid: string, id: string) => { await deleteDoc(doc(db, 'facilities', fid, 'fields', id)); },
    createLeague: async (n: string) => { if (activeTeam?.id && firebaseUser) { const r = doc(collection(db, 'leagues')); await setDoc(r, clean({ id: r.id, name: n, sport: activeTeam.sport, teams: { [activeTeam.id]: { teamName: activeTeam.name, wins: 0, losses: 0, ties: 0, points: 0 } }, creatorId: firebaseUser.uid })); return r.id; } return ''; },
    updateLeagueSchedule: async (lid: string, s: TournamentGame[]) => { await updateDoc(doc(db, 'leagues', lid), { schedule: s }); },
    inviteTeamToLeague: async (lid: string, ln: string, e: string) => { await addDoc(collection(db, 'leagues', 'global', 'invites'), clean({ leagueId: lid, leagueName: ln, invitedEmail: e, status: 'pending', createdAt: new Date().toISOString() })); },
    acceptLeagueInvite: async (iid: string, lid: string) => { if (activeTeam?.id) { const b = writeBatch(db); b.update(doc(db, 'leagues', 'global', 'invites', iid), { status: 'accepted' }); b.update(doc(db, 'leagues', lid), { [`teams.${activeTeam.id}`]: { teamName: activeTeam.name, wins: 0, losses: 0, ties: 0, points: 0 } }); await b.commit(); } },
    manuallyAddTeamToLeague: async (lid: string, n: string, e?: string, l?: string) => { await updateDoc(doc(db, 'leagues', lid), { [`teams.manual_${Date.now()}`]: { teamName: n, coachEmail: e, teamLogoUrl: l, wins: 0, losses: 0, ties: 0, points: 0 } }); },
    saveLeagueRegistrationConfig: async (lid: string, u: any) => { const pid = u.id || 'config'; await setDoc(doc(db, 'leagues', lid, 'registration', pid), clean({ ...u, id: pid }), { merge: true }); },
    submitRegistrationEntry: async (tid: string, pid: string, a: any, v: number, s?: string, type: any = 'leagues') => { await addDoc(collection(db, type, tid, 'registrationEntries'), clean({ league_id: tid, protocol_id: pid, answers: a, status: 'pending', created_at: new Date().toISOString(), form_version: v, waiver_signed_text: s, target_type: type })); },
    assignEntryToTeam: async (lid: string, eid: string, tid: string | null) => { await updateDoc(doc(db, 'leagues', lid, 'registrationEntries', eid), { assigned_team_id: tid, status: tid ? 'assigned' : 'pending' }); },
    toggleRegistrationPaymentStatus: async (lid: string, eid: string, p: boolean) => { await updateDoc(doc(db, 'leagues', lid, 'registrationEntries', eid), { payment_received: p }); },
    respondToAssignment,
    addRegistration: async (tid: string, eid: string, d: any) => { await addDoc(collection(db, tid, 'events', eid, 'registrations'), clean({ ...d, createdAt: new Date().toISOString() })); return true; },
    signTeamTournamentWaiver: async (tid: string, eid: string, ttn: string) => { if (userProfile) await updateDoc(doc(db, 'teams', tid, 'events', eid), { [`teamAgreements.${ttn}`]: { agreed: true, signedAt: new Date().toISOString(), captainName: userProfile.name, userId: userProfile.id } }); },
    signPublicTournamentWaiver: async (tid: string, eid: string, ttn: string, cn: string) => { await updateDoc(doc(db, 'teams', tid, 'events', eid), { [`teamAgreements.${ttn}`]: { agreed: true, signedAt: new Date().toISOString(), captainName: cn, userId: 'public' } }); return true; },
    submitMatchScore: async (tid: string, eid: string, gid: string, t1: boolean, s1: number, s2: number) => { const r = doc(db, 'teams', tid, 'events', eid); const s = await getDoc(r); const gs = (s.data()?.tournamentGames || []) as TournamentGame[]; const u = gs.map(g => g.id === gid ? { ...g, score1: s1, score2: s2, isCompleted: true } : g); await updateDoc(r, { tournamentGames: u }); },
    submitLeagueMatchScore: async (lid: string, gid: string, t1: boolean, s1: number, s2: number) => { const r = doc(db, 'leagues', lid); const s = await getDoc(r); const gs = (s.data()?.schedule || []) as TournamentGame[]; const u = gs.map(g => g.id === gid ? { ...g, score1: s1, score2: s2, isCompleted: true } : g); await updateDoc(r, { schedule: u }); },
    disputeMatchScore: async (tid: string, eid: string, gid: string, n: string) => { const r = doc(db, 'teams', tid, 'events', eid); const s = await getDoc(r); const gs = (s.data()?.tournamentGames || []) as TournamentGame[]; const u = gs.map(g => g.id === gid ? { ...g, isDisputed: true, disputeNotes: n } : g); await updateDoc(r, { tournamentGames: u }); },
    manageSubscription: async () => router.push('/pricing'),
    resolveQuota: async (sids: string[]) => { if (firebaseUser) { const b = writeBatch(db); teams.filter(t => t.ownerUserId === firebaseUser.uid && t.isPro).forEach(t => { const ok = sids.includes(t.id); b.update(doc(db, 'teams', t.id), { isPro: ok, planId: ok ? t.planId : 'starter_squad' }); b.update(doc(db, 'users', firebaseUser.uid, 'teamMemberships', t.id), { isPro: ok, planId: ok ? t.planId : 'starter_squad' }); }); await b.commit(); } },
    createAlert,
    deleteAlert,
    exportSignaturesCSV,
    exportAttendanceCSV,
    exportTournamentStandingsCSV
  }), [userProfile, activeTeam?.id, activeTeam?.role, activeTeam?.isPro, activeTeam?.planId, teams, isTeamsLoading, isSeedingDemo, members, isMembersLoading, currentMember, isSuperAdmin, household, householdEvents, householdBalance, myChildren, plans, isPlansLoading, proQuotaStatus, isPaywallOpen, firebaseUser?.uid, db, signTeamDocument, createTeamDocument, respondToAssignment, createAlert, deleteAlert, exportSignaturesCSV, exportAttendanceCSV, exportTournamentStandingsCSV, router]);

  return <TeamContext.Provider value={contextValue}>{children}</TeamContext.Provider>;
}

export const useTeam = () => {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within TeamProvider');
  return context;
};
