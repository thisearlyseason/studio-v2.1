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
  arrayRemove,
  or
} from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

// --- TYPE DEFINITIONS ---
export type UserRole = "parent" | "adult_player" | "youth_player" | "coach" | "admin" | "superadmin";

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
  schoolAdminIds?: string[];
  isPrimaryClubAuthority?: boolean;
  isStaff?: boolean;
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
  // Editable profile fields
  sports?: string[];
  primaryPosition?: string;
  sportPositions?: Record<string, string>;
  notes?: string;
  school?: string;
  gradYear?: string;
  height?: string;
  weight?: string;
  pendingInviteEmail?: string;
  inviteToken?: string;
};

export type RecruitingProfile = {
  playerId: string;
  photoURL?: string;
  photos?: string[];
  typeOfSport?: string;
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
  school?: string;
  teamName?: string;
  jerseyNumber?: string;
  bio: string;
  institutionalPulse?: string;
  updatedAt: any;
};


export type AthleticMetrics = {
  fortyYardDash?: number;
  verticalJump?: number;
  wingspan?: number;
  benchPress?: number;
  squat?: number;
  verified: boolean;
  [key: string]: any; // Allow custom sport-specific and user-defined metrics
};

export type PlayerStat = {
  id: string;
  season: string;
  gamesPlayed: number;
  points: number;
  assists: number;
  efficiency?: number;
  [key: string]: any;
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

export type VideoComment = {
  id: string;
  text: string;
  timestamp?: number; // seconds into the video
  authorName: string;
  createdAt: string;
};

export type PlayerVideo = {
  id: string;
  title: string;
  type: "highlight" | "fullGame" | "skills" | "practice" | string;
  url: string;
  comments?: VideoComment[];
  createdAt?: any;
};

export type Team = {
  id: string;
  name: string;
  code: string;
  teamCode?: string;
  type: "adult" | "youth" | "school" | "school_squad";
  sport?: string;
  description?: string;
  teamLogoUrl?: string;
  heroImageUrl?: string;
  isPro?: boolean;
  planId?: string;
  clubId?: string;
  schoolId?: string; // ID of the primary school team (for sub-squads)
  schoolAdminIds?: string[]; // IDs of additional school admins (for primary team)
  role?: 'Admin' | 'Member';
  ownerUserId?: string;
  parentChatEnabled?: boolean;
  parentCommentsEnabled?: boolean;
  parentPostingEnabled?: boolean;
  contactEmail?: string;
  contactPhone?: string;
  registrationProtocolId?: string;
  leagueIds?: Record<string, boolean>;
  isDemo?: boolean;
  rosterLimit?: number;
};

export type Club = {
  id: string;
  name: string;
  ownerUserId: string;
  subscriptionStatus: 'active' | 'canceled' | 'past_due';
  maxTeams: number;
  createdAt: any;
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
  schoolId?: string;
};

export interface Plan {
  id: string;
  name: string;
  description?: string;
  features: Record<string, boolean>;
  isPublic: boolean;
  isContactOnly: boolean;
  billingType: string;
  proTeamLimit: number;
  priceDisplay?: string;
  billingCycle?: string;
}

export interface Feature {
  id: string;
  description: string;
}

export type EventType = "game" | "practice" | "meeting" | "tournament" | "other" | string;

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
  isHome?: boolean;
  leagueId?: string;
  tournamentTeams?: string[];
  tournamentTeamsData?: any[];
  tournamentGames?: any[];
  userRsvps?: Record<string, string>;
  teamWaiverText?: string;
  teamAgreements?: Record<string, any>;
  customFormFields?: any[];
  ages?: string;
  contactEmail?: string;
  contactPhone?: string;
  socialLinks?: Record<string, string>;
  registrationCost?: string;
  paymentInstructions?: string;
};

export type TeamAlert = {
  id: string;
  title: string;
  message: string;
  audience: 'everyone' | 'coaches' | 'players' | 'parents';
  createdAt: string;
  createdBy: string;
};

export type IncidentPerson = {
  name: string;
  phone?: string;
  email?: string;
};

export type TeamIncident = {
  id: string;
  teamId: string;
  teamName: string;
  title: string;
  date: string;
  time?: string;
  location: string;
  description: string;
  emergencyServicesCalled: boolean;
  witnesses?: string;
  witnessesList?: IncidentPerson[];
  involvedPeople?: string;
  involvedPersonnel?: IncidentPerson[];
  severity?: 'minor' | 'moderate' | 'severe' | 'critical';
  treatmentProvided?: string;
  followUpRequired?: boolean;
  actionsTaken?: string;
  reportedBy?: string;
  reportedTo?: string;
  equipmentInvolved?: string;
  weatherConditions?: string;
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
  comments?: VideoComment[];
  createdAt?: string;
  resolvedDocTitle?: string;
  resolvedMemberName?: string;
};

export type League = {
  id: string;
  name: string;
  creatorId: string;
  sport: string;
  teams?: Record<string, {
    teamName: string;
    coachName?: string;
    coachEmail?: string;
    wins: number;
    losses: number;
    ties: number;
    points: number;
    status: 'pending' | 'accepted' | 'declined' | 'assigned';
    signedAt?: string;
    inviteCode?: string;
    teamCode?: string;
    code?: string;
    manual?: boolean;
    origin?: string;
    coachPhone?: string;
    organizerNotes?: string;
  }>;
  individualRecruits?: Record<string, {
    name: string;
    email: string;
    phone?: string;
    status: string;
    signedAt?: string;
    teamName?: string;
    teamCode?: string;
    inviteCode?: string;
    code?: string;
  }>;
  memberTeamIds?: string[];
  memberIndivIds?: string[];
  schedule?: any[];
  config?: any;
  finances?: Record<string, any>;
  globalFees?: any;
  inviteCode?: string;
  scorekeeperPin?: string;
  is_active?: boolean;
  createdAt?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  ages?: string;
  contactEmail?: string;
  contactPhone?: string;
  socialLinks?: Record<string, string>;
  registrationCost?: string;
  paymentInstructions?: string;
  requiredSquads?: number;
  slug?: string;
  blackoutDaysOfWeek?: number[];
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
  id: string; // 'player_config', 'coach_config', 'team_config'
  title: string;
  description: string;
  is_active: boolean;
  form_schema: RegistrationFormField[];
  waiver_mode?: 'none' | 'universal' | 'team' | 'mixed';
  selected_team_waivers?: string[]; // IDs of TeamDocuments
  team_waivers_content?: { id: string; title: string; content: string }[]; // Cached content for export
  default_waiver_text?: string;
  require_default_waiver?: boolean;
  custom_waiver_text?: string;
  confirmation_message?: string;
  form_version?: number;
  registration_cost?: string;
  offline_payment_instructions?: string;
  type: 'player' | 'team' | 'waiver';
};

export type LeagueArchiveWaiver = {
  id: string;
  signer: string;
  title: string;
  signedAt: string;
  waiverText: string;
  registrationId: string;
  answers: Record<string, any>;
  type: 'individual' | 'team';
  teamName?: string;
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

export type RegistrationFormField = {
  id: string;
  label: string;
  type: 'short_text' | 'long_text' | 'dropdown' | 'header' | 'radio' | 'checkbox' | 'signature';
  required: boolean;
  options?: string[];
  step?: 'identity' | 'contact' | 'medical' | 'guardian' | 'team_code' | 'additional' | 'compliance';
  placeholder?: string;
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
  round?: string;
  stage?: string;
  reportedBy?: string;
};

export type DocumentSignature = {
  id: string;
  documentId: string;
  teamId: string;
  userId: string;
  userName: string;
  timestamp: string;
};

export type TeamDocument = {
  id: string;
  title: string;
  type: string;
  content?: string;
  isActive?: boolean;
  assignedTo?: string[];
  createdAt?: string;
  updatedAt?: string;
  isClubMaster?: boolean;
  teamId?: string;
  signatureCount?: number;
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
  firebaseUser: any;
  user: UserProfile | null;
  activeTeam: Team | null;
  setActiveTeam: (team: Team) => void;
  teams: Team[];
  isTeamsLoading: boolean;
  members: Member[];
  isMembersLoading: boolean;
  currentMember: Member | null | undefined;
  isStaff: boolean;
  isPro: boolean;
  isStarter: boolean;
  isParent: boolean;
  isPlayer: boolean;
  isYouth: boolean;
  isSuperAdmin: boolean;
  isClubManager: boolean;
  isPrimaryClubAuthority: boolean;
  isSchoolMode: boolean;
  isSchoolAdmin: boolean;
  isEliteAccount: boolean;
  householdEvents: TeamEvent[];
  activeTeamEvents: TeamEvent[];
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
  updatePlayerStat: (playerId: string, statId: string, data: Partial<PlayerStat>) => Promise<void>;
  deletePlayerStat: (playerId: string, statId: string) => Promise<void>;
  getEvaluations: (playerId: string) => Promise<PlayerEvaluation[]>;
  addEvaluation: (playerId: string, data: Partial<PlayerEvaluation>) => Promise<void>;
  getRecruitingContact: (playerId: string) => Promise<RecruitingContact | null>;
  updateRecruitingContact: (playerId: string, data: Partial<RecruitingContact>) => Promise<void>;
  getPlayerVideos: (playerId: string) => Promise<PlayerVideo[]>;
  addPlayerVideo: (playerId: string, data: Partial<PlayerVideo>) => Promise<void>;
  updatePlayerVideo: (playerId: string, videoId: string, data: Partial<PlayerVideo>) => Promise<void>;
  deletePlayerVideo: (playerId: string, videoId: string) => Promise<void>;
  toggleRecruitingProfile: (playerId: string, enabled: boolean) => Promise<void>;
  updateStaffEvaluation: (memberId: string, notes: string) => Promise<void>;
  getStaffEvaluation: (memberId: string) => Promise<string>;

  createNewTeam: (name: string, type: string, pos: string, description?: string, planId?: string, customWaiverTitle?: string, customWaiverContent?: string, schoolId?: string, coachName?: string, coachEmail?: string, overrideOwnerId?: string) => Promise<string>;
  joinTeamWithCode: (code: string, playerId: string, position: string) => Promise<boolean>;
  updateUser: (updates: Partial<UserProfile>) => Promise<void>;
  updateTeam: (id: string, data: Partial<Team>) => Promise<void>;
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
  updateRSVP: (eventId: string, status: string, teamId?: string, userId?: string) => Promise<void>;
  addMessage: (chatId: string, author: string, content: string, type: string, img?: string, poll?: any) => Promise<void>;
  createChat: (name: string, members: string[]) => Promise<string>;
  deleteChat: (chatId: string) => Promise<void>;
  hideChatForUser: (chatId: string) => Promise<void>;
  votePoll: (chatId: string, messageId: string, optionIdx: number) => Promise<void>;
  updateChat: (chatId: string, data: any) => Promise<void>;
  resetSquadData: (categories: string[]) => Promise<void>;
  addVolunteerOpportunity: (data: any) => Promise<void>;
  updateVolunteerOpportunity: (oppId: string, updates: any) => Promise<void>;
  deleteVolunteerOpportunity: (oppId: string) => Promise<void>;
  publicSignUpForVolunteer: (teamId: string, oppId: string, data: any) => Promise<void>;
  signUpForVolunteer: (oppId: string) => Promise<void>;
  verifyVolunteerHours: (oppId: string, userId: string, hours: number) => Promise<void>;
  confirmVolunteerAttendance: (oppId: string, userId: string, confirmed: boolean) => Promise<void>;
  addFundraisingOpportunity: (data: any) => Promise<void>;
  updateFundraisingOpportunity: (fundId: string, updates: any) => Promise<void>;
  signUpForFundraising: (fundId: string) => Promise<void>;
  recordDonation: (fundId: string, amount: number, donorName: string, method: 'external' | 'e-transfer') => Promise<void>;
  confirmExternalDonation: (fundId: string, donationId: string, amount: number) => Promise<void>;
  addEquipmentItem: (data: any) => Promise<void>;
  updateEquipmentItem: (id: string, updates: any) => Promise<void>;
  deleteEquipmentItem: (id: string) => Promise<void>;
  assignEquipment: (id: string, userId: string, userName: string, qty: number) => Promise<void>;
  returnEquipment: (id: string, userId: string) => Promise<void>;
  addDrill: (data: any) => Promise<void>;
  deleteDrill: (drillId: string) => Promise<void>;
  addFile: (name: string, type: string, sBytes: number, url: string, category: string, d?: string) => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
  addFacility: (data: any) => Promise<void>;
  deleteFacility: (id: string) => Promise<void>;
  addField: (facilityId: string, name: string) => Promise<void>;
  deleteField: (facilityId: string, fieldId: string) => Promise<void>;
  createLeague: (name: string) => Promise<string>;
  updateLeague: (leagueId: string, updates: Partial<League>) => Promise<void>;
  addLeagueGame: (leagueId: string, game: any) => Promise<void>;
  updateLeagueSchedule: (leagueId: string, schedule: any[]) => Promise<void>;
  removeTeamFromLeague: (leagueId: string, teamId: string) => Promise<void>;
  inviteTeamToLeague: (leagueId: string, leagueName: string, email: string, teamName?: string) => Promise<void>;
  saveLeagueRegistrationConfig: (leagueId: string, protocolId: string, updates: Partial<LeagueRegistrationConfig>) => Promise<void>;
  submitRegistrationEntry: (targetId: string, protocolId: string, answers: any, version: number, signature?: string, targetType?: 'leagues' | 'teams', eventId?: string) => Promise<string | undefined>;
  assignEntryToTeam: (leagueId: string, entryId: string, teamId: string | null) => Promise<void>;
  toggleRegistrationPaymentStatus: (leagueId: string, entryId: string, paid: boolean) => Promise<void>;
  respondToAssignment: (contextId: string, entryId: string, status: 'accepted' | 'declined') => Promise<void>;
  signPublicTournamentWaiver: (teamId: string, eventId: string, tournamentTeamName: string, coachName: string) => Promise<boolean>;
  submitMatchScore: (teamId: string, eventId: string, gameId: string, isTeam1: boolean, score1: number, score2: number) => Promise<void>;
  submitLeagueMatchScore: (leagueId: string, gameId: string, isTeam1: boolean, score1: number, score2: number, pin?: string) => Promise<void>;
  updateLeaguePin: (leagueId: string, pin: string) => Promise<void>;
  disputeMatchScore: (teamId: string, eventId: string, gameId: string, notes: string) => Promise<void>;
  disputeLeagueMatchScore: (leagueId: string, gameId: string, notes: string) => Promise<void>;
  manageSubscription: () => Promise<void>;
  resolveQuota: (selectedTeamIds: string[]) => Promise<void>;
  createAlert: (title: string, message: string, audience: TeamAlert['audience']) => Promise<void>;
  deleteAlert: (alertId: string) => Promise<void>;
  exportAttendanceCSV: (eventId: string) => Promise<void>;
  exportTournamentStandingsCSV: (tournamentId: string) => Promise<void>;
  addIncident: (data: any) => Promise<void>;
  updateIncident: (teamId: string, id: string, data: any) => Promise<void>;
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
  deleteAccount: () => Promise<void>;
  markMediaAsViewed: (fileId: string) => Promise<void>;
  upgradeChildToLogin: (childId: string) => Promise<void>;
  registerChild: (first: string, last: string, dob: string) => Promise<void>;
  updateChild: (childId: string, updates: Partial<PlayerProfile>) => Promise<void>;
  sendChildInvite: (child: PlayerProfile, email: string) => Promise<string | null>;
  assignManualPlan: (uid: string, planId: string, limit: number) => Promise<void>;
  deleteFundraisingOpportunity: (id: string) => Promise<void>;
  addGame: (data: any) => Promise<void>;
  updateGame: (gameId: string, data: any) => Promise<void>;
  getMember: (id: string | null | undefined) => Member | undefined;
  getTeamByCode: (code: string, leagueId?: string) => Promise<any>;
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

  // Restore active team from persistence
  useEffect(() => {
    const storedId = localStorage.getItem('sf_session_team_id');
    if (storedId) setManualActiveTeamId(storedId);
  }, []);

  const setActiveTeam = useCallback((team: Team | { id: string } | null) => {
    if (team) {
      setManualActiveTeamId(team.id);
      localStorage.setItem('sf_session_team_id', team.id);
    } else {
      setManualActiveTeamId(null);
      localStorage.removeItem('sf_session_team_id');
    }
  }, []);

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
      } else {
        // Fallback if the user document hasn't been written to DB yet or is deleted
        setUserProfile({
          id: firebaseUser.uid,
          name: firebaseUser.displayName || 'User',
          email: firebaseUser.email || '',
          avatar: firebaseUser.photoURL || `https://picsum.photos/seed/${firebaseUser.uid}/150/150`,
          role: 'adult_player',
          phone: '',
          parentOf: [],
          myChildIds: []
        } as unknown as UserProfile);
      }
    }, (error) => {
      const permissionError = new FirestorePermissionError({
        path: `users/${firebaseUser.uid}`,
        operation: 'get'
      });
      errorEmitter.emit('permission-error', permissionError);
      
      // Also fallback on permission error so the app doesn't hang forever
      setUserProfile({
        id: firebaseUser.uid,
        name: firebaseUser.displayName || 'User',
        email: firebaseUser.email || '',
        phone: '',
        avatar: firebaseUser.photoURL || `https://picsum.photos/seed/${firebaseUser.uid}/150/150`,
        role: 'adult_player',
      } as unknown as UserProfile);
    });
  }, [firebaseUser, db]);

  const teamsQuery = useMemoFirebase(() => (isAuthResolved && firebaseUser?.uid && db) ? query(collection(db, 'users', firebaseUser.uid, 'teamMemberships')) : null, [isAuthResolved, firebaseUser?.uid, db]);
  const { data: teamsData, isLoading: isTeamsLoading } = useCollection(teamsQuery);
  
  const teamsRaw = useMemo(() => (teamsData || []).map(m => ({ 
    ...m, 
    id: m.teamId || m.id, 
    name: m.name || m.teamName || 'Squad' 
  })), [teamsData]);

  const activeTeamMembership = useMemo(() => teamsRaw.find(t => t.id === activeTeamId) || teamsRaw[0] || null, [teamsRaw, activeTeamId]);
  const activeTeamDocRef = useMemoFirebase(() => (db && activeTeamMembership?.id) ? doc(db, 'teams', activeTeamMembership.id) : null, [db, activeTeamMembership?.id]);
  const { data: activeTeamDoc } = useDoc<Team>(activeTeamDocRef);

  const activeTeam = useMemo(() => {
    if (!activeTeamMembership) return null;
    const combined = { ...activeTeamMembership, ...activeTeamDoc };
    // Bridge the gap between 'code', 'teamCode', and 'inviteCode' fields
    const code = (combined.code || combined.teamCode || combined.inviteCode || '').toString().toUpperCase();
    const finalCode = code || (combined.id ? 'SF' + combined.id.slice(-4).toUpperCase() : 'SQUAD');
    return { 
      ...combined, 
      code: finalCode,
      teamCode: finalCode,
      inviteCode: finalCode
    } as Team;
  }, [activeTeamMembership, activeTeamDoc]);

  const membersQuery = useMemoFirebase(() => (isAuthResolved && activeTeam?.id && db) ? query(collection(db, 'teams', activeTeam.id, 'members')) : null, [isAuthResolved, activeTeam?.id, db]);
  const { data: membersData, isLoading: isMembersLoading } = useCollection<Member>(membersQuery);
  const members = useMemo(() => membersData || [], [membersData]);
  const getMember = useCallback((id: string | null | undefined) => {
    if (!id) return undefined;
    return members.find(m => m.id === id || m.userId === id);
  }, [members]);

  const activeEventsQuery = useMemoFirebase(() => {
    if (!db || !activeTeam?.id) return null;
    return query(collection(db, 'teams', activeTeam.id, 'events'), orderBy('date', 'asc'));
  }, [db, activeTeam?.id]);
  const { data: activeEventsData } = useCollection<TeamEvent>(activeEventsQuery);
  const activeTeamEvents = useMemo(() => activeEventsData || [], [activeEventsData]);

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
    if (!db || !firebaseUser?.uid) return null;
    
    // Hardening: Aggregate all team IDs from Parent AND ALL children
    const myOwnTeamIds = (teamsData || []).map(t => t.teamId).filter(Boolean);
    const childrenTeamIds = (myChildren || []).flatMap(c => c.joinedTeamIds || []);
    
    const allTeamIds = Array.from(new Set([...myOwnTeamIds, ...childrenTeamIds])).filter(Boolean);
    
    if (allTeamIds.length === 0) return null;
    
    // Firestore 'in' query limit is 30. For institutional scales, we slice to the first 30.
    return query(collectionGroup(db, 'events'), where('teamId', 'in', allTeamIds.slice(0, 30)));
  }, [db, firebaseUser?.uid, teamsData, myChildren]);
  
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
    return userProfile?.email === 'thisearlyseason@gmail.com' || superAdminUids.includes(firebaseUser.uid) || userProfile?.role === 'superadmin';
  }, [userProfile?.email, firebaseUser?.uid, userProfile?.role]);

  const isStaff = useMemo(() => {
    if (!firebaseUser) return false;
    if (isSuperAdmin) return true;
    
    // 1. Global Role Override: Users with global 'coach' or 'admin' role have staff access to all teams
    if (userProfile?.role === 'coach' || userProfile?.role === 'admin') return true; 

    // 2. Team-Level Admin: Check if user is an Admin for the active team
    if (activeTeam?.role === 'Admin') return true;

    // 3. Position Check: Check specific staff positions within the active team
    const currentMember = getMember(firebaseUser.uid);
    const staffPositions = ['Coach', 'Assistant Coach', 'Team Representative', 'Athletic Director', 'Staff', 'Manager', 'Squad Leader', 'Coach Guest'];
    return staffPositions.includes(currentMember?.position || '');
  }, [activeTeam, firebaseUser, members, userProfile, isSuperAdmin]);

  const isParent = useMemo(() => {
    // 1. Global Parent Role
    if (userProfile?.role === 'parent') return true;
    // 2. Team Check: If user is not a global parent, check team context (e.g. if they are listed as a guardian for a youth player)
    // Note: This might need expansion depending on how "Guardian" relationships are stored.
    return false;
  }, [userProfile?.role]);

  const isPlayer = useMemo(() => {
    // 1. Global Player Role
    if (userProfile?.role === 'adult_player' || userProfile?.role === 'youth_player') return true;
    
    // 2. Team Context Check: If not globally marked as player, check if they are a 'Member' in the active team
    // and NOT holding a staff position.
    if (firebaseUser) {
      const currentMember = getMember(firebaseUser.uid);
      const staffPositions = ['Coach', 'Assistant Coach', 'Team Representative', 'Athletic Director', 'Staff', 'Manager', 'Squad Leader', 'Coach Guest'];
      const isStaffMember = staffPositions.includes(currentMember?.position || '');
      const isTeamAdmin = currentMember?.role === 'Admin';

      // If they are a member (not staff/admin) in this team, treat them as a player/participant
      if (currentMember?.role === 'Member' && !isStaffMember && !isTeamAdmin) return true;
    }
    
    return false;
  }, [userProfile, firebaseUser, members]);

  const teams = teamsRaw;

  // Plan level check helpers
  const isEliteAccount = useMemo(() => {
    const elitePlanIds = ['squad_organization', 'elite_teams', 'elite_league'];
    return elitePlanIds.includes(userProfile?.activePlanId || '') || 
           elitePlanIds.includes(activeTeam?.planId || '');
  }, [userProfile?.activePlanId, activeTeam?.planId]);

  const isPrimaryClubAuthority = useMemo(() => {
    if (isSuperAdmin) return true;

    // 1. Direct field on user profile (explicitly granted or seeded)
    if (userProfile?.isPrimaryClubAuthority) return true;

    // 2. Determine Pro/Authority status (at user level or active team level)
    // We include squad_pro here because they CAN manage a league hub, 
    // but the Sidebar specifically gates the "Club Hub" to Elite/School.
    const authorityPlanIds = ['squad_organization', 'elite_teams', 'elite_league', 'squad_pro'];
    const hasUserAuthorityPlan = authorityPlanIds.includes(userProfile?.activePlanId || '');
    const isActiveTeamAuthority = activeTeam?.isPro && authorityPlanIds.includes(activeTeam?.planId || '');
    
    // 3. Check if user is an admin or owner of the active team
    const isCurrentTeamAdmin = activeTeam?.role === 'Admin' || 
                              activeTeam?.ownerUserId === userProfile?.id || 
                              activeTeam?.ownerUserId === firebaseUser?.uid;
    const isGlobalManagementRole = userProfile?.role === 'admin' || userProfile?.role === 'coach';

    // 4. Authority by Plan + Role/Ownership
    if (hasUserAuthorityPlan || isActiveTeamAuthority) {
      if (isCurrentTeamAdmin || isGlobalManagementRole) return true;
    }

    // 5. Fallback: Check all owned teams for any Elite/Pro status
    const ownsAnyProTeam = teams.some((t: any) => {
      const isOwner = t.ownerUserId === userProfile?.id || t.ownerUserId === firebaseUser?.uid;
      const isPro = t.isPro === true || authorityPlanIds.includes(t.planId || '');
      return isOwner && isPro;
    });
    if (ownsAnyProTeam) return true;

    // 6. Check for School Admin (Owner of Primary School Team or explicit admin)
    const isSchoolAdminOwned = teams.some((t: any) => 
      (t.type === 'school' || t.type === 'school_squad') && 
      (t.ownerUserId === userProfile?.id || t.ownerUserId === firebaseUser?.uid || t.schoolAdminIds?.includes(userProfile?.id))
    );
    if (isSchoolAdminOwned) return true;

    // 7. Starter Plan Users can also have 1 league hub if they are the owner/admin
    if (isCurrentTeamAdmin) return true;

    return false;
  }, [teams, userProfile, isSuperAdmin, activeTeam, firebaseUser]);

  
  const isClubManager = useMemo(() => isSuperAdmin || isPrimaryClubAuthority || userProfile?.role === 'admin', [isSuperAdmin, isPrimaryClubAuthority, userProfile?.role]);

  // Fetch Club Data
  const clubRef = useMemo(() => {
    if (!db || !activeTeam?.clubId) return null;
    return doc(db, 'clubs', activeTeam.clubId);
  }, [db, activeTeam?.clubId]);
  const { data: clubData } = useDoc<Club>(clubRef);

  const proQuotaStatus = useMemo(() => {
    if (!userProfile?.id) return { current: 0, limit: 0, exceeded: false, remaining: 0 };
    const ownedProTeams = teamsRaw.filter(t => t.ownerUserId === userProfile.id && t.isPro);
    const limit = userProfile.proTeamLimit || 0;
    return { current: ownedProTeams.length, limit, exceeded: ownedProTeams.length > limit && limit > 0, remaining: Math.max(0, limit - ownedProTeams.length) };
  }, [teamsRaw, userProfile]);

  const getTeamByCode = useCallback(async (code: string, leagueId?: string) => {
    if (!db || !code) return null;
    
    // 1. Check global teams collection
    const q = query(
      collection(db, 'teams'), 
      or(
        where('inviteCode', '==', code.toUpperCase()), 
        where('teamCode', '==', code.toUpperCase()), 
        where('code', '==', code.toUpperCase())
      ), 
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, ...d.data() };
    }

    // 2. Check specific league for manual team with this code
    if (leagueId) {
      const lSnap = await getDoc(doc(db, 'leagues', leagueId));
      if (lSnap.exists()) {
        const lData = lSnap.data();
        const teams = lData.teams || {};
        const foundEntry = Object.entries(teams).find(([id, t]: [string, any]) => t.inviteCode === code.toUpperCase());
        if (foundEntry) {
          return { id: foundEntry[0], name: (foundEntry[1] as any).teamName, manual: true };
        }
      }
    }

    return null;
  }, [db]);

  const isStarter = useMemo(() => {
    return activeTeam?.planId === 'starter_squad' || userProfile?.activePlanId === 'starter_squad';
  }, [activeTeam?.planId, userProfile?.activePlanId]);

  const isSchoolAdmin = useMemo(() => {
    if (!userProfile) return false;
    
    // Check specific Position (Athletic Director in any school team)
    const activeStaff = teams.some(t => {
      if (t.type !== 'school' && t.type !== 'school_squad') return false;
      const m = getMember(userProfile.id);
      return m?.position === 'Athletic Director' || m?.position === 'Staff';
    });
    if (activeStaff) return true;
    
    // Check if user is an admin of any 'school' type team
    return (userProfile?.schoolAdminIds?.includes(userProfile.id)) || teams.some((t: any) => 
      t.type === 'school' && 
      (t.ownerUserId === userProfile.id || t.schoolAdminIds?.includes(userProfile.id))
    );
  }, [teams, userProfile, getMember]);

  const isPro = useMemo(() => {
    if (isSuperAdmin) return true;

    // 1. Check Team Level Pro (Team Subscription)
    if (activeTeam?.isPro) return true;

    // 2. Check Club Level Pro (Elite Subscription)
    // If team belongs to a club, and club is active, return true
    if (activeTeam?.clubId && clubData?.subscriptionStatus === 'active') return true;

    // 3. Check School Level Pro
    // In school mode, all squads under a school hub, the hub itself, or squads owned by a school admin are Pro
    if (activeTeam?.type === 'school' || activeTeam?.type === 'school_squad' || activeTeam?.schoolId) {
       return true; 
    }
    
    // If the active team is owned by the current user and they are a school admin, it's Pro
    if (activeTeam?.ownerUserId === userProfile?.id && isSchoolAdmin) {
       return true;
    }

    // 4. Check for Squad Pro Demo / Primary Team Logic
    // If user owns ANY team that is pro, their first (primary) team is also pro
    const ownedProTeam = teams.find((t: any) => t.ownerUserId === userProfile?.id && t.isPro);
    if (ownedProTeam && activeTeam?.id === teams[0]?.id) {
       return true;
    }

    // 5. Legacy User Level Pro (Fallback)
    return userProfile?.activePlanId === 'squad_pro' || 
           userProfile?.activePlanId === 'squad_pro_demo' ||
           userProfile?.activePlanId === 'squad_organization' ||
           ['elite_teams', 'elite_league', 'squad_organization', 'squad_pro', 'squad_pro_demo'].includes(activeTeam?.planId || '');
  }, [activeTeam, clubData, userProfile, isSuperAdmin, isSchoolAdmin, teams]);

  const isSchoolMode = useMemo(() => {
    return activeTeam?.type === 'school' || activeTeam?.type === 'school_squad';
  }, [activeTeam?.type]);



  const hasFeature = useCallback((featureId: string) => {
    if (isSuperAdmin) return true;

    // Special handling for Club/League-restricted features
    if (featureId === 'league_generation') {
      // STARTER PLAN can now have 1 league as well
      return true; 
    }
    
    if (featureId === 'tournament_generation') {
      // Tournaments restricted to Pro/Elite
      return isPro;
    }

    if (featureId === 'recruit_portal') {
      // Allow Starter and Pro/Elite
      return true;
    }

    if (featureId === 'schedule_architect' || featureId === 'public_portal_url') {
      // ONLY Pro accounts (Squad Pro, Elite, School)
      return isPro;
    }

    if (featureId === 'club_management') {
      // Only Elite Plans OR School Admins (Squad Pro EXPLICITLY excluded)
      if (activeTeam?.planId === 'squad_pro' || userProfile?.activePlanId === 'squad_pro') {
        // Even if they are an owner, Squad Pro doesn't get Club Hub unless they are an actual School Admin
        return isSchoolAdmin;
      }
      if (isSchoolAdmin) return true;
      if (isEliteAccount) return true;
      if (clubData && clubData.subscriptionStatus === 'active' && clubData.ownerUserId === userProfile?.id) return true;
      return false;
    }

    // General Feature Check
    const currentPlanId = activeTeam?.planId || userProfile?.activePlanId || 'starter_squad';
    // Fallback mapping for demo plans to their parent features
    const effectivePlanId = currentPlanId === 'squad_pro_demo' ? 'squad_pro' : currentPlanId;
    
    const plan = plans.find(p => p.id === effectivePlanId);
    if (plan) return !!plan.features?.[featureId];
    return ['live_feed_read', 'basic_scheduling'].includes(featureId);
  }, [activeTeam, clubData, userProfile, plans, isSuperAdmin, isPro, isSchoolAdmin, teams, isEliteAccount]);


  const formatTime = useCallback((iso: string) => { try { return format(new Date(iso), 'h:mm a'); } catch (e) { return '--:--'; } }, []);

  // --- TACTICAL METHODS ---
  const getRecruitingProfile = useCallback(async (playerId: string) => { if (!db) return null; const snap = await getDoc(doc(db, 'players', playerId, 'recruitingProfile', 'profile')); return snap.exists() ? (snap.data() as RecruitingProfile) : null; }, [db]);
  const updateRecruitingProfile = useCallback(async (playerId: string, data: Partial<RecruitingProfile>) => { if (!db) return; await setDoc(doc(db, 'players', playerId, 'recruitingProfile', 'profile'), { ...clean(data), updatedAt: serverTimestamp() }, { merge: true }); }, [db]);
  const getAthleticMetrics = useCallback(async (playerId: string) => { if (!db) return null; const snap = await getDoc(doc(db, 'players', playerId, 'recruitingProfile', 'metrics')); return snap.exists() ? (snap.data() as AthleticMetrics) : null; }, [db]);
  const updateAthleticMetrics = useCallback(async (playerId: string, data: Partial<any>) => { if (!db) return; await setDoc(doc(db, 'players', playerId, 'recruitingProfile', 'metrics'), clean(data), { merge: true }); }, [db]);
  const getPlayerStats = useCallback(async (playerId: string) => { if (!db) return []; const snap = await getDocs(collection(db, 'players', playerId, 'stats')); return snap.docs.map(d => ({ ...d.data(), id: d.id } as PlayerStat)); }, [db]);
  const addPlayerStat = useCallback(async (playerId: string, data: Partial<PlayerStat>) => { if (!db) return; await addDoc(collection(db, 'players', playerId, 'stats'), clean(data)); }, [db]);
  const updatePlayerStat = useCallback(async (playerId: string, statId: string, data: Partial<PlayerStat>) => { if (!db) return; await setDoc(doc(db, 'players', playerId, 'stats', statId), clean(data), { merge: true }); }, [db]);
  const deletePlayerStat = useCallback(async (playerId: string, statId: string) => { if (!db) return; await deleteDoc(doc(db, 'players', playerId, 'stats', statId)); }, [db]);
  const getEvaluations = useCallback(async (playerId: string) => { if (!db) return []; const snap = await getDocs(query(collection(db, 'players', playerId, 'evaluations'), orderBy('createdAt', 'desc'))); return snap.docs.map(d => ({ ...d.data(), id: d.id } as PlayerEvaluation)); }, [db]);
  const addEvaluation = useCallback(async (playerId: string, data: Partial<PlayerEvaluation>) => { if (!db || !firebaseUser) return; await addDoc(collection(db, 'players', playerId, 'evaluations'), { ...clean(data), evaluatorId: firebaseUser.uid, createdAt: serverTimestamp() }); }, [db, firebaseUser]);
  const getRecruitingContact = useCallback(async (playerId: string) => { if (!db) return null; const snap = await getDoc(doc(db, 'players', playerId, 'recruitingContact', 'contact')); return snap.exists() ? (snap.data() as RecruitingContact) : null; }, [db]);
  const updateRecruitingContact = useCallback(async (playerId: string, data: Partial<RecruitingContact>) => { if (!db) return; await setDoc(doc(db, 'players', playerId, 'recruitingContact', 'contact'), clean(data), { merge: true }); }, [db]);
  const getPlayerVideos = useCallback(async (playerId: string) => { if (!db) return []; const snap = await getDocs(query(collection(db, 'players', playerId, 'videos'), orderBy('createdAt', 'desc'))); return snap.docs.map(d => ({ ...d.data(), id: d.id } as PlayerVideo)); }, [db]);
  const addPlayerVideo = useCallback(async (playerId: string, data: Partial<PlayerVideo>) => { if (!db) return; await addDoc(collection(db, 'players', playerId, 'videos'), { ...clean(data), createdAt: serverTimestamp() }); }, [db]);
  const updatePlayerVideo = useCallback(async (playerId: string, videoId: string, data: Partial<PlayerVideo>) => { if (!db) return; await setDoc(doc(db, 'players', playerId, 'videos', videoId), clean(data), { merge: true }); }, [db]);
  const deletePlayerVideo = useCallback(async (playerId: string, videoId: string) => { if (!db) return; await deleteDoc(doc(db, 'players', playerId, 'videos', videoId)); }, [db]);
  const toggleRecruitingProfile = useCallback(async (playerId: string, enabled: boolean) => { if (!db) return; await setDoc(doc(db, 'players', playerId), { recruitingProfileEnabled: enabled }, { merge: true }); }, [db]);
  const updateStaffEvaluation = useCallback(async (memberId: string, notes: string) => { if (!activeTeam?.id || !db) return; await setDoc(doc(db, 'teams', activeTeam.id, 'members', memberId, 'staffEvaluation', 'current'), { notes, updatedAt: new Date().toISOString() }); }, [activeTeam, db]);
  const getStaffEvaluation = useCallback(async (memberId: string) => { if (!activeTeam?.id || !db) return ''; const snap = await getDoc(doc(db, 'teams', activeTeam.id, 'members', memberId, 'staffEvaluation', 'current')); return snap.exists() ? (snap.data()?.notes || '') : ''; }, [activeTeam, db]);

  const createNewTeam = useCallback(async (name: string, type: any, pos: string, description?: string, planId?: string, customWaiverTitle?: string, customWaiverContent?: string, schoolId?: string, coachName?: string, coachEmail?: string, overrideOwnerId?: string) => { 
    if (!firebaseUser || !db || !userProfile) return ''; 
    const tid = `team_${Date.now()}`; 
    const batch = writeBatch(db); 
    
    const teamCode = tid.slice(-6).toUpperCase();
    const isSchool = type === 'school' || type === 'school_squad';
    
    const schoolIdToUse = schoolId || (type === 'school_squad' && activeTeam?.id ? activeTeam.id : null);
    const resolvedOwnerId = overrideOwnerId || firebaseUser.uid;

    batch.set(doc(db, 'teams', tid), clean({ 
      id: tid, 
      teamName: name, 
      code: teamCode,
      teamCode: teamCode, 
      inviteCode: teamCode, 
      type, sport: isSchool ? 'Basketball' : 'General', 
      description, createdBy: firebaseUser.uid, ownerUserId: resolvedOwnerId, 
      planId: planId || (isSchool ? 'squad_pro' : 'starter_squad'), 
      isPro: planId !== 'starter_squad', 
      createdAt: new Date().toISOString(),
      schoolId: schoolIdToUse
    })); 
    
    if (customWaiverTitle && customWaiverContent) {
      batch.set(doc(db, 'teams', tid, 'documents', 'custom_1'), clean({
        id: 'custom_1', title: customWaiverTitle, content: customWaiverContent, type: 'waiver', isActive: true, assignedTo: ['all'], createdAt: new Date().toISOString()
      }));
    }
    
    batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), clean({ 
      teamId: tid, 
      name, 
      role: 'Admin', 
      code: teamCode, 
      joinedAt: new Date().toISOString(),
      type,
      isPro: planId !== 'starter_squad',
      planId: planId || (isSchool ? 'squad_pro' : 'starter_squad'),
      schoolId: schoolIdToUse,
      ownerUserId: resolvedOwnerId  // Required for DISTRICT badge in Shell
    })); 
    
    batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), clean({ 
      id: firebaseUser.uid, userId: firebaseUser.uid, playerId: `p_${firebaseUser.uid}`, 
      name: firebaseUser.displayName, role: 'Admin', position: pos, 
      joinedAt: new Date().toISOString(), avatar: userProfile?.avatar || '',
      ownerUserId: resolvedOwnerId, teamId: tid,
      schoolId: schoolIdToUse
    })); 
    
    if (coachName && coachEmail) {
      const dummyId = `member_${Date.now()}`;
      batch.set(doc(db, 'teams', tid, 'members', dummyId), clean({
        id: dummyId,
        teamId: tid,
        name: coachName,
        email: coachEmail,
        position: 'Head Coach',
        role: 'Member',
        joinedAt: new Date().toISOString(),
        ownerUserId: resolvedOwnerId,
        schoolId: schoolIdToUse
      }));
    }

    await batch.commit();

    try {
      const qEntries = query(collectionGroup(db, 'registrationEntries'), where('answers.email', '==', firebaseUser.email));
      const entriesSnap = await getDocs(qEntries);
      if (!entriesSnap.empty) {
        const sweepBatch = writeBatch(db);
        let hasUpdates = false;
        entriesSnap.forEach(entryDoc => {
          const entry = entryDoc.data();
          if (!entry.assigned_team_id) {
            sweepBatch.update(entryDoc.ref, { assigned_team_id: tid, assigned_team_owner_id: firebaseUser.uid, status: 'assigned' });
            hasUpdates = true;
          }
        });
        if (hasUpdates) await sweepBatch.commit();
      }
    } catch (e) {
      console.warn("Identity sweep partial failure:", e);
    }

    toast({ title: "Team Created Successfully!", description: `Your new ${type.replace('_', ' ')} "${name}" is ready.` });
    return tid; 
  }, [firebaseUser, db, userProfile, activeTeam]);

  const joinTeamWithCode = useCallback(async (code: string, playerId: string, position: string) => { 
    if (!firebaseUser || !db || !userProfile) return false; 
    const q = query(
      collection(db, 'teams'), 
      or(
        where('teamCode', '==', code.toUpperCase()), 
        where('code', '==', code.toUpperCase()),
        where('inviteCode', '==', code.toUpperCase())
      ), 
      limit(1)
    ); 
    const snap = await getDocs(q); 
    if (snap.empty) return false; 
    const teamDoc = snap.docs[0]; 
    const tid = teamDoc.id; 
    const ownerId = teamDoc.data().ownerUserId;
    const batch = writeBatch(db); 
    const teamCodeValue = teamDoc.data().code || teamDoc.data().teamCode || teamDoc.data().inviteCode;
    batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), clean({ 
      teamId: tid, 
      name: teamDoc.data().teamName, 
      role: 'Member', 
      code: teamCodeValue,
      joinedAt: new Date().toISOString() 
    })); 
    batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), clean({ 
      id: firebaseUser.uid, userId: firebaseUser.uid, playerId, name: firebaseUser.displayName, 
      role: 'Member', position, joinedAt: new Date().toISOString(), 
      avatar: userProfile?.avatar || '', ownerUserId: ownerId, teamId: tid,
      schoolId: teamDoc.data().schoolId || null
    })); 
    await batch.commit(); return true; 
  }, [firebaseUser, db, userProfile]);

  const updateUser = useCallback(async (u: any) => { if (firebaseUser) await updateDoc(doc(db, 'users', firebaseUser.uid), clean(u)); }, [db, firebaseUser]);
  const updateTeam = useCallback(async (id: string, data: Partial<Team>) => { if (db) await updateDoc(doc(db, 'teams', id), clean(data)); }, [db]);
  const updateMember = useCallback(async (mid: string, u: any) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id, 'members', mid), clean(u)); }, [db, activeTeam]);
  const updateTeamDetails = useCallback(async (u: any) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id), clean(u)); }, [db, activeTeam]);
  const updateTeamHero = useCallback(async (url: string) => { if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id), { heroImageUrl: url }); }, [db, activeTeam]);
  const updateTeamPlan = useCallback(async (tid: string, pid: string) => { if(db) await updateDoc(doc(db, 'teams', tid), { planId: pid, isPro: pid !== 'starter_squad' }); }, [db]);

  const signTeamDocument = useCallback(async (docId: string, sig: string, mid: string) => { 
    if (!activeTeam?.id || !firebaseUser || !db) return false; 
    const certId = `cert_${Date.now()}`; 
    const member = getMember(mid);
    const memberName = member?.name || 'Unknown Member';
    const isParentSigning = member?.userId !== firebaseUser.uid;
    const parentName = userProfile?.name || firebaseUser.displayName || 'Authorized Guardian';
    
    // Hardening: If parent is signing for a minor, ensure dual-name recording
    const finalSignature = isParentSigning 
      ? `${memberName} (Signed by ${parentName})`
      : sig;

    const docTitle = docId === 'default_medical' ? 'Medical Waiver' : docId === 'default_travel' ? 'Travel Waiver' : docId === 'default_parental' ? 'Parental Consent' : 'General Waiver';
    const batch = writeBatch(db); 
    
    batch.set(doc(db, 'teams', activeTeam.id, 'members', mid, 'signatures', docId), { 
      docId, 
      signature: finalSignature, 
      signedAt: new Date().toISOString(),
      signedByParent: isParentSigning,
      parentName: isParentSigning ? parentName : null,
      parentUid: isParentSigning ? firebaseUser.uid : null
    }); 
    
    batch.set(doc(db, 'teams', activeTeam.id, 'files', certId), { 
      id: certId, 
      name: `Signed Certificate: ${docId}`, 
      category: 'Signed Certificate', 
      url: '#', 
      type: 'cert', 
      size: '1kb', 
      date: new Date().toISOString(), 
      memberId: mid, 
      documentId: docId,
      teamId: activeTeam.id,
      teamName: activeTeam.name,
      waiverType: docId === 'default_medical' ? 'Medical' : docId === 'default_travel' ? 'Travel' : docId === 'default_parental' ? 'Parental' : 'General',
      resolvedMemberName: memberName,
      resolvedDocTitle: docTitle,
      signedByParent: isParentSigning,
      signerName: parentName
    }); 

    // Synchronize with Centralized Waiver Library (Coaches Corner Vault)
    const archId = `arch_waiver_${certId}`;
    batch.set(doc(db, 'teams', activeTeam.id, 'archived_waivers', archId), clean({
      id: archId,
      documentId: docId,
      title: docTitle,
      signer: finalSignature,
      signedAt: new Date().toISOString(),
      type: 'Team Document',
      memberId: mid,
      memberName: memberName,
      signedByParent: isParentSigning
    }));

    await batch.commit(); 
    return true; 
  }, [db, activeTeam, firebaseUser, members, userProfile]);
  const createTeamDocument = useCallback(async (data: any) => { if (activeTeam?.id && db) await setDoc(doc(db, 'teams', activeTeam.id, 'documents', data.id), clean({ ...data, teamId: activeTeam.id, ownerUserId: activeTeam.ownerUserId, createdAt: new Date().toISOString() })); }, [db, activeTeam]);
  const updateTeamDocument = useCallback(async (docId: string, data: any) => { if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'documents', docId), clean(data)); }, [db, activeTeam]);

  const addEvent = useCallback(async (data: any) => { if (activeTeam?.id && db) { await addDoc(collection(db, 'teams', activeTeam.id, 'events'), clean({ ...data, teamId: activeTeam.id, ownerUserId: activeTeam.ownerUserId })); return true; } return false; }, [db, activeTeam]);
  const updateEvent = useCallback(async (id: string, data: any) => { if (activeTeam?.id && db) { await updateDoc(doc(db, 'teams', activeTeam.id, 'events', id), clean(data)); return true; } return false; }, [db, activeTeam]);
  const deleteEvent = useCallback(async (id: string) => { if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'events', id)); }, [db, activeTeam]);
  const updateRSVP = useCallback(async (eventId: string, status: string, teamId?: string, userId?: string) => { 
    const tid = teamId || activeTeam?.id;
    const uid = userId || firebaseUser?.uid;
    console.log(`[RSVP] Updating RSVP: Event ${eventId}, Status ${status}, Team ${tid}, User ${uid}`);
    if (tid && uid && db) {
      await updateDoc(doc(db, 'teams', tid, 'events', eventId), { [`userRsvps.${uid}`]: status }); 
    } else {
      console.error(`[RSVP] Failed: tid=${tid}, uid=${uid}, db=${!!db}`);
    }
  }, [db, activeTeam, firebaseUser]);

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
  const updateVolunteerOpportunity = useCallback(async (oppId: string, updates: any) => { if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), clean(updates)); }, [activeTeam, db]);
  const deleteVolunteerOpportunity = useCallback(async (oppId: string) => { if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId)); }, [activeTeam, db]);
  const publicSignUpForVolunteer = useCallback(async (teamId: string, oppId: string, data: any) => { if (db) await updateDoc(doc(db, 'teams', teamId, 'volunteers', oppId), { [`signups.${data.name.replace(/\s+/g, '')}_${Date.now()}`]: { userId: `public_${Date.now()}`, userName: data.name, email: data.email, phone: data.phone, isConfirmed: false, status: 'pending', createdAt: new Date().toISOString() } }); }, [db]);
  const signUpForVolunteer = useCallback(async (oppId: string) => { if (activeTeam?.id && firebaseUser && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), { [`signups.${firebaseUser.uid}`]: { userId: firebaseUser.uid, userName: userProfile?.name, email: firebaseUser.email, isConfirmed: false, status: 'pending', createdAt: new Date().toISOString() } }); }, [activeTeam, firebaseUser, db, userProfile]);
  const verifyVolunteerHours = useCallback(async (oppId: string, userId: string, hours: number) => { if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), { [`signups.${userId}.status`]: 'verified', [`signups.${userId}.verifiedHours`]: hours }); }, [activeTeam, db]);
  const confirmVolunteerAttendance = useCallback(async (oppId: string, userId: string, confirmed: boolean) => { if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), { [`signups.${userId}.isConfirmed`]: confirmed }); }, [activeTeam, db]);

  const addFundraisingOpportunity = useCallback(async (data: any) => { if (activeTeam?.id && db) await addDoc(collection(db, 'teams', activeTeam.id, 'fundraising'), clean({ ...data, currentAmount: 0, finances: {} })); }, [activeTeam, db]);
  const updateFundraisingOpportunity = useCallback(async (fundId: string, updates: any) => { if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'fundraising', fundId), clean(updates)); }, [activeTeam, db]);
  const deleteFundraisingOpportunity = useCallback(async (id: string) => { if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'fundraising', id)); }, [activeTeam, db]);
  const signUpForFundraising = useCallback(async (fundId: string) => { if (activeTeam?.id && firebaseUser && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'fundraising', fundId), { [`finances.${firebaseUser.uid}`]: { userId: firebaseUser.uid, userName: userProfile?.name, status: 'joined', contributed: 0, createdAt: new Date().toISOString() } }); }, [activeTeam, firebaseUser, db, userProfile]);
  const recordDonation = useCallback(async (fundId: string, amount: number, donorName: string, method: 'external' | 'e-transfer') => { 
    if (!activeTeam?.id || !db) return; 
    const donationId = `don_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`; 
    await setDoc(doc(db, 'teams', activeTeam.id, 'fundraising', fundId, 'donations', donationId), clean({ 
      id: donationId, 
      amount, 
      donorName, 
      method, 
      status: 'pending', 
      createdAt: new Date().toISOString() 
    })); 
    // Increment the shadow finances object if user is logged in
    if (firebaseUser) {
      await updateDoc(doc(db, 'teams', activeTeam.id, 'fundraising', fundId), {
        [`finances.${firebaseUser.uid}.contributed`]: increment(amount),
        [`finances.${firebaseUser.uid}.lastDonationAt`]: new Date().toISOString()
      });
    }
  }, [db, activeTeam, firebaseUser]);
  const confirmExternalDonation = useCallback(async (fundId: string, donationId: string, amount: number) => { if (!activeTeam?.id || !db) return; const batch = writeBatch(db); batch.update(doc(db, 'teams', activeTeam.id, 'fundraising', fundId, 'donations', donationId), { status: 'verified', amount }); batch.update(doc(db, 'teams', activeTeam.id, 'fundraising', fundId), { currentAmount: increment(amount) }); await batch.commit(); }, [db, activeTeam]);

  const addGame = useCallback(async (data: any) => { if (activeTeam?.id && db) await addDoc(collection(db, 'teams', activeTeam.id, 'games'), clean(data)); }, [activeTeam, db]);
  const updateGame = useCallback(async (id: string, data: any) => { if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'games', id), clean(data)); }, [activeTeam, db]);

  const addEquipmentItem = useCallback(async (data: any) => { if (activeTeam?.id && db) await addDoc(collection(db, 'teams', activeTeam.id, 'equipment'), clean({ ...data, assignments: {}, status: 'Active', availableQuantity: parseInt(data.totalQuantity), totalQuantity: parseInt(data.totalQuantity) })); }, [activeTeam, db]);
  const updateEquipmentItem = useCallback(async (id: string, updates: any) => { if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'equipment', id), clean(updates)); }, [activeTeam, db]);
  const deleteEquipmentItem = useCallback(async (id: string) => { if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'equipment', id)); }, [activeTeam, db]);
  const assignEquipment = useCallback(async (id: string, uid: string, uname: string, q: number) => { if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'equipment', id), { [`assignments.${uid}`]: { userId: uid, userName: uname, quantity: q, date: new Date().toISOString() }, availableQuantity: increment(-q) }); }, [activeTeam, db]);
  const returnEquipment = useCallback(async (id: string, uid: string) => { if (activeTeam?.id && db) { const snap = await getDoc(doc(db, 'teams', activeTeam.id, 'equipment', id)); if(snap.exists()) { const data = snap.data(); const assignment = data.assignments?.[uid]; if (assignment) { await updateDoc(doc(db, 'teams', activeTeam.id, 'equipment', id), { [`assignments.${uid}`]: deleteField(), availableQuantity: increment(assignment.quantity) }); } } } }, [activeTeam, db]);

  const addDrill = useCallback(async (d: any) => { if (activeTeam?.id && db) await addDoc(collection(db, 'teams', activeTeam.id, 'drills'), clean(d)); }, [activeTeam, db]);
  const deleteDrill = useCallback(async (drillId: string) => { if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'drills', drillId)); }, [activeTeam, db]);
  const addFile = useCallback(async (n: string, t: string, sb: number, u: string, c: string, d?: string) => { if (activeTeam?.id && db) await addDoc(collection(db, 'teams', activeTeam.id, 'files'), clean({ name: n, type: t, sizeBytes: sb, size: `${Math.round(sb/1024)}KB`, url: u, category: c, description: d, date: new Date().toISOString() })); }, [activeTeam, db]);
  const deleteFile = useCallback(async (id: string) => { if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'files', id)); }, [db, activeTeam]);

  const addFacility = useCallback(async (d: any) => { if (firebaseUser && db) await addDoc(collection(db, 'facilities'), clean({ ...d, clubId: firebaseUser.uid })); }, [db, firebaseUser]);
  const deleteFacility = useCallback(async (id: string) => { if(db) await deleteDoc(doc(db, 'facilities', id)); }, [db]);
  const addField = useCallback(async (fid: string, n: string) => { if(db) await addDoc(collection(db, 'facilities', fid, 'fields'), { name: n, facilityId: fid }); }, [db]);
  const deleteFacilityField = useCallback(async (fid: string, id: string) => { if(id && db) await deleteDoc(doc(db, 'facilities', fid, 'fields', id)); }, [db]);

  const createLeague = useCallback(async (name: string) => { 
    if (!firebaseUser || !db || !activeTeam) return ''; 

    // Enforce Capacity Limits
    const leagueCount = activeTeam.leagueIds ? Object.keys(activeTeam.leagueIds).length : 0;
    
    // School / Squad Organization accounts have higher capacity
    const isHighCapacity = isSchoolMode || activeTeam?.planId === 'squad_organization' || userProfile?.activePlanId === 'squad_organization';
    const limit = isHighCapacity ? 20 : 1;
    
    if (leagueCount >= limit) {
      throw new Error(`League limit (${limit}) reached for this squad. Upgrade to an Elite or School plan for more.`);
    }

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
  
  const updateLeague = useCallback(async (leagueId: string, updates: Partial<League>) => { 
    if (!db) return; 
    await updateDoc(doc(db, 'leagues', leagueId), clean(updates)); 
  }, [db]);

  const addLeagueGame = useCallback(async (lId: string, game: any) => {
    if (!db) return;
    const leagueRef = doc(db, 'leagues', lId);
    const leagueSnap = await getDoc(leagueRef);
    const leagueData = leagueSnap.data();
    if (!leagueData) return;

    const gameId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newGame = {
      ...game,
      id: gameId,
      isCompleted: false,
      score1: 0,
      score2: 0,
      createdAt: new Date().toISOString()
    };

    const batch = writeBatch(db);
    batch.update(leagueRef, { schedule: arrayUnion(newGame) });

    const createEvent = (tid: string, myName: string, oppName: string, isHome: boolean) => {
      if (!tid) return;
      const eid = `lg_${lId}_${gameId}`;
      batch.set(doc(db, 'teams', tid, 'events', eid), clean({ 
        id: eid, 
        teamId: tid, 
        title: `League Match vs ${oppName}`, 
        eventType: 'game', 
        isLeagueGame: true, 
        isHome,
        leagueId: lId, 
        date: game.date, 
        startTime: game.time, 
        location: game.location, 
        description: `Official season fixture for ${leagueData.name}. Matchup: ${myName} vs ${oppName}`, 
        createdAt: new Date().toISOString() 
      }));
    };

    if (game.team1Id) createEvent(game.team1Id, game.team1, game.team2, true);
    if (game.team2Id) createEvent(game.team2Id, game.team2, game.team1, false);

    await batch.commit();
  }, [db]);

  const updateLeagueSchedule = useCallback(async (lId: string, s: any[]) => { 
    if (!db) return; 
    
    const leagueSnap = await getDoc(doc(db, 'leagues', lId));
    const leagueData = leagueSnap.data();
    if (!leagueData) return;

    const batch = writeBatch(db);
    batch.update(doc(db, 'leagues', lId), { schedule: clean(s) }); 
    
    s.forEach(game => {
      const createEvent = (tid: string, myName: string, oppName: string, isHome: boolean) => {
        if (!tid) return;
        const eid = `lg_${lId}_${game.id}`;
        batch.set(doc(db, 'teams', tid, 'events', eid), clean({ 
          id: eid, 
          teamId: tid, 
          title: `League Match vs ${oppName}`, 
          eventType: 'game', 
          isLeagueGame: true, 
          isHome,
          leagueId: lId, 
          date: game.date, 
          startTime: game.time, 
          location: game.location, 
          description: `Official season fixture for ${leagueData.name}. Matchup: ${myName} vs ${oppName}`, 
          createdAt: new Date().toISOString() 
        }));
      };
      if (game.team1Id) createEvent(game.team1Id, game.team1, game.team2, true);
      if (game.team2Id) createEvent(game.team2Id, game.team2, game.team1, false);
    });
    
    await batch.commit();
    toast({ title: "Season Synchronized", description: "League matches pushed to all squad itineraries." });
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
  const manuallyAddTeamToLeague = useCallback(async (lId: string, n: string, e?: string) => { 
    if (db) {
      const tid = `manual_${Date.now()}`;
      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      await updateDoc(doc(db, 'leagues', lId), { 
        [`teams.${tid}`]: { 
          teamName: n, 
          coachEmail: e, 
          wins: 0, 
          losses: 0, 
          ties: 0, 
          points: 0, 
          status: 'pending',
          inviteCode: inviteCode,
          manual: true,
          createdAt: new Date().toISOString()
        } 
      }); 
    }
  }, [db]);
  const deleteLeagueInvite = useCallback(async (id: string) => { if (db) await deleteDoc(doc(db, 'leagues', 'global', 'invites', id)); }, [db]);
  const saveLeagueRegistrationConfig = useCallback(async (lId: string, pId: string, u: any) => { if (db) await setDoc(doc(db, 'leagues', lId, 'registration', pId), clean(u), { merge: true }); }, [db]);
  
  const submitRegistrationEntry = useCallback(async (tId: string, pId: string, a: any, v: number, signature?: string, targetType?: any, eventId?: string) => { 
    if (!db) return; 

    // Fetch config to get waiver texts for archiving
    let waiverTextToStore = "";
    try {
      const configSnap = await getDoc(doc(db, 'leagues', tId, 'registration', pId));
      if (configSnap.exists()) {
        const config = configSnap.data() as LeagueRegistrationConfig;
        const parts: string[] = [];
        
        if (config.require_default_waiver) {
          parts.push("--- UNIVERSAL WAIVER ---\n" + (config.default_waiver_text || ""));
        }
        if (config.custom_waiver_text) {
          parts.push("--- ORGANIZATION AGREEMENT ---\n" + config.custom_waiver_text);
        }
        if (config.team_waivers_content && config.team_waivers_content.length > 0) {
          config.team_waivers_content.forEach(tw => {
             parts.push(`--- ${tw.title.toUpperCase()} ---\n${tw.content}`);
          });
        }
        waiverTextToStore = parts.join("\n\n");
      }
    } catch (e) {
      console.error("Error fetching config for waiver archive", e);
    }

    const entryData: any = { 
      league_id: tId, 
      protocol_id: pId, 
      answers: a, 
      form_version: v, 
      waiver_signed_text: waiverTextToStore || signature, 
      signature_date: signature ? new Date().toISOString() : null,
      status: 'pending', 
      created_at: new Date().toISOString() 
    };
    if (pId === 'team_config' && a.manual_enrollment) {
      entryData.status = 'accepted';
    }
    const collectionPath = targetType || 'leagues';
    const ref = await addDoc(collection(db, collectionPath, tId, 'registrationEntries'), clean(entryData)); 
    
    // Universal Waiver Archiving
    if (signature) {
      const archId = `arch_waiver_${ref.id}`;
      await setDoc(doc(db, collectionPath, tId, 'archived_waivers', archId), clean({
        id: archId,
        entryId: ref.id,
        protocolId: pId,
        title: a.teamName || a.name || 'Participant Registration',
        signer: signature,
        signedAt: entryData.signature_date,
        waiverText: waiverTextToStore, // Store the full text here
        type: pId === 'player_config' ? 'Individual' : 'Squad',
        answers: a
      }));
    }

    if (pId === 'team_config') {
      const teamName = a.teamName || a.name;
      if (teamName) {
        if (collectionPath === 'leagues') {
          await updateDoc(doc(db, 'leagues', tId), {
            [`teams.recruit_${ref.id}`]: { 
              teamName, 
              coachName: a.name || 'Recruit Coach', 
              coachEmail: a.email, 
              wins: 0, 
              losses: 0, 
              ties: 0, 
              points: 0, 
              status: entryData.status, 
              signedAt: entryData.signature_date,
              inviteCode: a.inviteCode || Math.random().toString(36).substring(2, 8).toUpperCase()
            },
            memberTeamIds: arrayUnion(`recruit_${ref.id}`)
          });
        } else if (collectionPath === 'teams' && eventId) {
          // Automatic Tournament Roster Inclusion
          const eventRef = doc(db, 'teams', tId, 'events', eventId);
          await updateDoc(eventRef, {
            tournamentTeamsData: arrayUnion(clean({
              id: `p_${ref.id}`,
              name: teamName,
              coach: a.name || 'Pipeline Coach',
              email: a.email || '',
              source: 'pipeline'
            })),
            tournamentTeams: arrayUnion(teamName),
            [`teamAgreements.${teamName}`]: signature ? {
              signedAt: entryData.signature_date,
              captainName: signature,
              status: 'signed'
            } : null
          });
        }
      }
    } else if (pId === 'player_config' || pId === 'individual_config') {
      // Individual Recruit Pool Management
      if (collectionPath === 'leagues') {
        const participantName = a.name || a.fullName || 'Recruit Athlete';
        await updateDoc(doc(db, 'leagues', tId), {
          [`individualRecruits.recruit_${ref.id}`]: { 
            name: participantName, 
            email: a.email, 
            phone: a.phone || '',
            status: entryData.status || 'pending',
            signedAt: entryData.signature_date,
            teamCode: a.recruiter_code || null,
            teamName: a.team_name || null,
            teamId: a.team_id || null
          },
          memberIndivIds: arrayUnion(`recruit_${ref.id}`)
        });
      }
    }
    return ref.id;
  }, [db]);


  const assignEntryToTeam = useCallback(async (leagueId: string, entryId: string, teamId: string | null) => { if (!db) return; await updateDoc(doc(db, 'leagues', leagueId, 'registrationEntries', entryId), { assigned_team_id: teamId, status: teamId ? 'assigned' : 'pending' }); }, [db]);
  const toggleRegistrationPaymentStatus = useCallback(async (leagueId: string, entryId: string, paid: boolean) => { if (!db) return; await updateDoc(doc(db, 'leagues', leagueId, 'registrationEntries', entryId), { payment_received: paid }); }, [db]);
  
  const respondToAssignment = useCallback(async (contextId: string, entryId: string, status: 'accepted' | 'declined') => { 
    if (!db || !activeTeam?.id) return; 
    const batch = writeBatch(db);
    const entryRef = doc(db, 'leagues', contextId, 'registrationEntries', entryId);
    
    batch.update(entryRef, { status }); 
    
    const leagueRef = doc(db, 'leagues', contextId);
    const leagueSnap = await getDoc(leagueRef);
    const leagueData = leagueSnap.data();
    
    if (leagueData && status === 'accepted') {
      const placeholderKey = `recruit_${entryId}`;
      const placeholderData = leagueData.teams?.[placeholderKey] || {};
      
      batch.update(leagueRef, { 
        [`teams.${placeholderKey}`]: deleteField(),
        [`teams.${activeTeam.id}`]: { ...placeholderData, status: 'accepted', teamName: activeTeam.name },
        memberTeamIds: arrayUnion(activeTeam.id)
      });
      // Corrected: arrayRemove was missing in the previous block but I can combine it here if needed, or do it separately.
      // But we must NOT have duplicate keys.
      batch.update(leagueRef, {
        memberTeamIds: arrayRemove(placeholderKey)
      });
      
      batch.update(doc(db, 'teams', activeTeam.id), { [`leagueIds.${contextId}`]: true });

      const schedule = leagueData.schedule || [];
      const updatedSchedule = schedule.map((game: any) => {
        let changed = false;
        let t1Id = game.team1Id;
        let t2Id = game.team2Id;
        
        if (t1Id === placeholderKey) { t1Id = activeTeam.id; changed = true; }
        if (t2Id === placeholderKey) { t2Id = activeTeam.id; changed = true; }
        
        if (changed) {
          const mySide = t1Id === activeTeam.id ? 1 : 2;
          const oppName = mySide === 1 ? game.team2 : game.team1;
          const oppTid = mySide === 1 ? game.team2Id : game.team1Id;
          const eid = `lg_${contextId}_${game.id}`;
          
          batch.set(doc(db, 'teams', activeTeam.id, 'events', eid), clean({
            id: eid, teamId: activeTeam.id, title: `League Match vs ${oppName}`,
            eventType: 'game', isLeagueGame: true, isHome: mySide === 1, leagueId: contextId,
            date: game.date, startTime: game.time, location: game.location,
            description: `Official season fixture for ${leagueData.name}. Matchup: ${activeTeam.name} vs ${oppName}`,
            createdAt: new Date().toISOString()
          }));

          if (oppTid && !oppTid.startsWith('recruit_') && !oppTid.startsWith('manual_')) {
            batch.update(doc(db, 'teams', oppTid, 'events', eid), {
              title: `League Match vs ${activeTeam.name}`,
              description: `Official season fixture for ${leagueData.name}. Matchup: ${oppName} vs ${activeTeam.name}`
            });
          }

          return { ...game, team1Id: t1Id, team2Id: t2Id };
        }
        return game;
      });

      if (schedule.length > 0) {
        batch.update(leagueRef, { schedule: updatedSchedule });
      }
    }
    
    await batch.commit();
    toast({ title: status === 'accepted' ? "Assignment Accepted" : "Assignment Declined" });
  }, [db, activeTeam]);

  const updateLeagueTeamDetails = useCallback(async (leagueId: string, teamId: string, updates: any) => { 
    if (!db) return; 
    const finalUpdates: any = {};
    
    if (updates.origin !== undefined) finalUpdates[`teams.${teamId}.origin`] = updates.origin;
    if (updates.coachName !== undefined) finalUpdates[`teams.${teamId}.coachName`] = updates.coachName;
    if (updates.coachEmail !== undefined) finalUpdates[`teams.${teamId}.coachEmail`] = updates.coachEmail;
    if (updates.coachPhone !== undefined) finalUpdates[`teams.${teamId}.coachPhone`] = updates.coachPhone;
    if (updates.organizerNotes !== undefined) finalUpdates[`teams.${teamId}.organizerNotes`] = updates.organizerNotes;
    if (updates.inviteCode !== undefined) finalUpdates[`teams.${teamId}.inviteCode`] = updates.inviteCode.toUpperCase();
    if (updates.wins !== undefined) finalUpdates[`teams.${teamId}.wins`] = parseInt(updates.wins.toString());
    if (updates.losses !== undefined) finalUpdates[`teams.${teamId}.losses`] = parseInt(updates.losses.toString());
    if (updates.ties !== undefined) finalUpdates[`teams.${teamId}.ties`] = parseInt(updates.ties.toString());
    if (updates.points !== undefined) finalUpdates[`teams.${teamId}.points`] = parseInt(updates.points.toString());
    
    if (updates.teamName !== undefined) {
      finalUpdates[`teams.${teamId}.teamName`] = updates.teamName;
      
      // Update schedule to reflect new team name
      const snap = await getDoc(doc(db, 'leagues', leagueId));
      if (snap.exists()) {
        const data = snap.data();
        const schedule = (data.schedule || []).map((g: any) => {
          let updated = false;
          let t1 = g.team1;
          let t2 = g.team2;
          
          if (g.team1Id === teamId) { t1 = updates.teamName; updated = true; }
          if (g.team2Id === teamId) { t2 = updates.teamName; updated = true; }
          
          return updated ? { ...g, team1: t1, team2: t2 } : g;
        });
        if (schedule.length > 0) finalUpdates.schedule = schedule;
      }
    }
    
    await updateDoc(doc(db, 'leagues', leagueId), finalUpdates); 
    toast({ title: "Sync Successful", description: "Team details and tournament fixtures updated." });
  }, [db]);

  const upgradeChildToLogin = useCallback(async (childId: string) => { if (db) await updateDoc(doc(db, 'players', childId), { hasLogin: true }); }, [db]);
  const registerChild = useCallback(async (first: string, last: string, dob: string) => { if (!firebaseUser || !db) return; const cid = `child_${Date.now()}`; await setDoc(doc(db, 'players', cid), clean({ id: cid, firstName: first, lastName: last, dateOfBirth: dob, isMinor: true, parentId: firebaseUser.uid, joinedTeamIds: [], createdAt: new Date().toISOString() })); }, [db, firebaseUser]);
  const updateChild = useCallback(async (childId: string, updates: Partial<PlayerProfile>) => { if (db) await updateDoc(doc(db, 'players', childId), clean(updates)); }, [db]);
  const sendChildInvite = useCallback(async (child: PlayerProfile, email: string): Promise<string | null> => {
    if (!db || !firebaseUser) return null;
    
    // Diagnostic logging to catch permission mismatches
    console.log('[YouthInvite] Initiating invite for child:', child.id);
    console.log('[YouthInvite] Parent UID:', firebaseUser.uid);
    console.log('[YouthInvite] Child parentId:', child.parentId);

    const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    try {
      // 1. Attempt to write to invites collection
      await setDoc(doc(db, 'invites', token), {
        token,
        childId: child.id,
        childFirstName: child.firstName,
        childLastName: child.lastName,
        parentId: firebaseUser.uid,
        email,
        used: false,
        createdAt: new Date().toISOString(),
        expiresAt,
      });
      console.log('[YouthInvite] Invite document created successfully');

      // 2. Attempt to update players record
      await updateDoc(doc(db, 'players', child.id), { 
        pendingInviteEmail: email, 
        inviteToken: token 
      });
      console.log('[YouthInvite] Player record updated successfully');

      const signupUrl = `${window.location.origin}/signup/youth?token=${token}`;
      return signupUrl;
    } catch (err: any) {
      console.error('[YouthInvite] Error during invite flow:', err);
      toast({ 
        title: 'Invite Permission Error', 
        description: `Failed to ${err.message.includes('invites') ? 'create invite token' : 'update player record'}. Ensure you are the primary guardian.`,
        variant: 'destructive'
      });
      return null;
    }
  }, [db, firebaseUser]);
  const assignManualPlan = useCallback(async (uid: string, planId: string, limit: number) => { if (db) await updateDoc(doc(db, 'users', uid), { activePlanId: planId, proTeamLimit: limit, planSource: 'manual' }); }, [db]);

  const addIncident = useCallback(async (data: any) => { if (activeTeam?.id && db && firebaseUser) await addDoc(collection(db, 'teams', activeTeam.id, 'incidents'), clean({ ...data, teamId: activeTeam.id, ownerUserId: activeTeam.ownerUserId, teamName: activeTeam.name, reportedBy: firebaseUser.uid, createdAt: new Date().toISOString() })); }, [db, firebaseUser, activeTeam]);
  const updateIncident = useCallback(async (teamId: string, id: string, data: any) => { if (db) await updateDoc(doc(db, 'teams', teamId, 'incidents', id), clean(data)); }, [db]);
  
  const resetSquadData = useCallback(async (cats: string[]) => { if (!activeTeam?.id || !db) return; const batch = writeBatch(db); if (cats.includes('games')) { const gs = await getDocs(collection(db, 'teams', activeTeam.id, 'games')); gs.forEach(d => batch.delete(d.ref)); } if (cats.includes('events')) { const es = await getDocs(collection(db, 'teams', activeTeam.id, 'events')); es.forEach(d => batch.delete(d.ref)); } await batch.commit(); }, [activeTeam, db]);

  const markMediaAsViewed = useCallback(async (fileId: string) => { if (!firebaseUser || !activeTeam?.id || !db) return; await setDoc(doc(db, 'teams', activeTeam.id, 'members', firebaseUser.uid, 'mediaViews', fileId), { fileId, viewedAt: new Date().toISOString() }); }, [activeTeam, firebaseUser, db]);

  const deployClubProtocol = useCallback(async (data: any, teamIds: string[]) => { if(!db || !firebaseUser) return; const batch = writeBatch(db); teamIds.forEach(tid => { const docId = `protocol_${Date.now()}`; batch.set(doc(db, 'teams', tid, 'documents', docId), clean({ ...data, id: docId, teamId: tid, ownerUserId: firebaseUser.uid, isClubMaster: true, createdAt: new Date().toISOString() })); }); await batch.commit(); }, [db, firebaseUser]);

  const deleteTeam = useCallback(async (tid: string) => { if(db) await deleteDoc(doc(db, 'teams', tid)); }, [db]);

  const deleteAccount = useCallback(async () => {
    if (!firebaseUser || !db) return;
    try {
      // 1. Delete Firestore user document
      await deleteDoc(doc(db, 'users', firebaseUser.uid));
      
      // 2. Delete Firebase Auth user
      await firebaseUser.delete();
      
      toast({ title: "Account Deleted", description: "Your profile and data have been removed." });
      window.location.href = '/login';
    } catch (error: any) {
      console.error("Delete Account Error:", error);
      if (error.code === 'auth/requires-recent-login') {
        toast({ 
          title: "Security Verification Required", 
          description: "Please sign out and back in to delete your account for security reasons.",
          variant: "destructive" 
        });
      } else {
        toast({ title: "Deletion Failed", description: error.message, variant: "destructive" });
      }
    }
  }, [firebaseUser, db]);

  const markAlertAsSeen = useCallback(async (id: string) => { 
    console.log("DEBUG: markAlertAsSeen called for ID:", id);
    if (!firebaseUser) {
      console.warn("DEBUG: markAlertAsSeen failed: no firebaseUser");
      return;
    }
    if (!db) {
      console.warn("DEBUG: markAlertAsSeen failed: no db");
      return;
    }
    try {
      console.log("DEBUG: Attempting Firestore update for user:", firebaseUser.uid);
      const userRef = doc(db, 'users', firebaseUser.uid);
      
      // Hardening: Use a batch or at least verify the ID is valid
      if (!id) throw new Error("No alert ID provided to archive");

      await setDoc(userRef, { 
        seenAlertIds: arrayUnion(id),
        lastAlertArchivedAt: new Date().toISOString() // Diagnostic field
      }, { merge: true }); 
      
      console.log("DEBUG: markAlertAsSeen Firestore write successful for ID:", id);
    } catch (error) {
      console.error("CRITICAL: markAlertAsSeen failed:", error);
      toast({
        title: "Update Failed",
        description: "Could not archive the broadcast. Please try again.",
        variant: "destructive"
      });
    }
  }, [firebaseUser, db]);

  const markAllAlertsAsSeen = useCallback(async () => { 
    console.log("DEBUG: markAllAlertsAsSeen called. Alerts count in memory:", alerts.length);
    if (!firebaseUser || !db) {
      console.warn("DEBUG: markAllAlertsAsSeen aborted: missing user or db", { hasUser: !!firebaseUser, hasDb: !!db });
      return;
    }
    
    if (alerts.length === 0) {
      console.log("DEBUG: No alerts found to archive in markAllAlertsAsSeen");
      return;
    }

    try {
      const userRelevantIds = alerts.filter(alert => {
        if (alert.audience === 'everyone') return true;
        if (alert.audience === 'coaches' && isStaff) return true;
        if (alert.audience === 'players' && isPlayer) return true;
        if (alert.audience === 'parents' && isParent) return true;
        return false;
      }).map(a => a.id);

      console.log("DEBUG: Filtered relevant IDs for bulk archive:", userRelevantIds);

      if (userRelevantIds.length > 0) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        await setDoc(userRef, { 
          seenAlertIds: arrayUnion(...userRelevantIds),
          lastBulkArchiveAt: new Date().toISOString() // Diagnostic field
        }, { merge: true }); 
        console.log("DEBUG: Bulk archive Firestore write successful.");
      } else {
        console.log("DEBUG: No relevant unread alerts for this user's role.");
      }
    } catch (error) {
      console.error("CRITICAL: markAllAlertsAsSeen failed:", error);
      toast({
        title: "Bulk Archive Failed",
        description: "Could not clear all notifications. Please try again.",
        variant: "destructive"
      });
    }
  }, [firebaseUser, db, alerts, isStaff, isPlayer, isParent]);
  const createAlert = useCallback(async (t: string, m: string, a: any) => { if (activeTeam?.id && db && firebaseUser) await addDoc(collection(db, 'teams', activeTeam.id, 'alerts'), clean({ title: t, message: m, audience: a, createdAt: new Date().toISOString(), createdBy: firebaseUser.uid })); }, [activeTeam, db, firebaseUser]);
  const deleteAlert = useCallback(async (id: string) => { if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'alerts', id)); }, [activeTeam, db]);

  const signPublicTournamentWaiver = useCallback(async (teamId: string, eventId: string, tournamentTeamName: string, coachName: string) => { 
    if (!db) return false; 
    const signedAt = new Date().toISOString();
    const batch = writeBatch(db);
    batch.update(doc(db, 'teams', teamId, 'events', eventId), { 
      [`teamAgreements.${tournamentTeamName}`]: { agreed: true, captainName: coachName, signedAt } 
    }); 
    
    // Archive in the team's global waiver archive
    const archId = `arch_tournament_${eventId}_${tournamentTeamName.replace(/\s+/g, '_')}`;
    batch.set(doc(db, 'teams', teamId, 'archived_waivers', archId), clean({
      id: archId,
      eventId,
      tournamentTeamName,
      signer: coachName,
      signedAt,
      type: 'Tournament Waiver',
      status: 'verified'
    }));

    await batch.commit();
    return true; 
  }, [db]);


  const submitMatchScore = useCallback(async (teamId: string, eventId: string, gameId: string, isTeam1: boolean, score1: number, score2: number) => { if (!db) return; const snap = await getDoc(doc(db, 'teams', teamId, 'events', eventId)); if (!snap.exists()) return; const games = snap.data().tournamentGames || []; const idx = games.findIndex((g: any) => g.id === gameId); if (idx === -1) return; games[idx] = { ...games[idx], score1, score2, isCompleted: true, updatedAt: new Date().toISOString() }; await updateDoc(doc(db, 'teams', teamId, 'events', eventId), { tournamentGames: games }); }, [db]);
  
  const submitLeagueMatchScore = useCallback(async (leagueId: string, gameId: string, isTeam1: boolean, score1: number, score2: number, pin?: string) => { 
    if (!db) return; 
    const leagueRef = doc(db, 'leagues', leagueId);
    const snap = await getDoc(leagueRef);
    if (!snap.exists()) return;
    const leagueData = snap.data() as League;

    // Hardening: Enforce Scorekeeper PIN
    const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'superadmin';
    if (leagueData.scorekeeperPin && pin !== leagueData.scorekeeperPin && !isAdmin) {
      throw new Error("UNAUTHORIZED_ACCESS: Invalid Scorekeeper Verification PIN.");
    }

    const schedule = (leagueData.schedule || []).map(g => {
      if (g.id === gameId) {
        // If no PIN provided, assume it's from the dashboard (Staff)
        const attribution = pin ? (isTeam1 ? g.team1 : g.team2) : "League Office";
        
        return { 
          ...g, 
          score1, 
          score2, 
          isCompleted: true, 
          isDisputed: false, 
          disputeNotes: null,
          reportedBy: attribution,
          updatedAt: new Date().toISOString() 
        };
      }
      return g;
    });

    const game = schedule.find(g => g.id === gameId);
    if (!game) return;

    const teams = leagueData.teams || {};
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

    const batch = writeBatch(db);
    batch.update(leagueRef, { schedule, teams }); 

    const syncToTeamHub = (tid: string, myScore: number, oppScore: number, opponentName: string) => {
      if (!tid || tid.startsWith('manual_') || tid.startsWith('recruit_')) return;
      const result = myScore > oppScore ? 'Win' : myScore < oppScore ? 'Loss' : 'Tie';
      const gameRecord = clean({
        id: `lg_${gameId}`,
        teamId: tid,
        opponent: opponentName, 
        date: game.date,
        myScore, 
        opponentScore: oppScore, 
        result,
        location: game.location || 'League Venue',
        notes: `Official result from ${leagueData.name}`,
        leagueId, 
        leagueGameId: gameId, 
        createdAt: new Date().toISOString()
      });
      batch.set(doc(db, 'teams', tid, 'games', `lg_${gameId}`), gameRecord);
    };

    if (game.team1Id) syncToTeamHub(game.team1Id, score1, score2, game.team2);
    if (game.team2Id) syncToTeamHub(game.team2Id, score2, score1, game.team1);

    await batch.commit();
  }, [db, userProfile]);

  const disputeMatchScore = useCallback(async (teamId: string, eventId: string, gameId: string, notes: string) => { if (!db) return; const snap = await getDoc(doc(db, 'teams', teamId, 'events', eventId)); if (!snap.exists()) return; const games = snap.data().tournamentGames || []; const idx = games.findIndex((g: any) => g.id === gameId); if (idx === -1) return; games[idx] = { ...games[idx], isDisputed: true, disputeNotes: notes }; await updateDoc(doc(db, 'teams', teamId, 'events', eventId), { tournamentGames: games }); }, [db]);
  const disputeLeagueMatchScore = useCallback(async (leagueId: string, gameId: string, notes: string) => { 
    if (!db) return; 
    const snap = await getDoc(doc(db, 'leagues', leagueId)); 
    if (!snap.exists()) return; 
    
    const leagueData = snap.data();
    const schedule = (leagueData.schedule || []).map((g: any) => {
      if (g.id === gameId) {
        return { 
          ...g, 
          isDisputed: true, 
          disputeNotes: notes,
          updatedAt: new Date().toISOString()
        };
      }
      return g;
    });

    await updateDoc(doc(db, 'leagues', leagueId), { schedule }); 
  }, [db]);

  const resolveQuota = useCallback(async (selectedTeamIds: string[]) => { if (!db || !userProfile?.id) return; const batch = writeBatch(db); const ownedProTeams = teamsRaw.filter(t => t.ownerUserId === userProfile.id && t.isPro); ownedProTeams.forEach(t => { if (!selectedTeamIds.includes(t.id)) { batch.update(doc(db, 'teams', t.id), { isPro: false, planId: 'starter_squad' }); } }); await batch.commit(); }, [db, userProfile, teamsRaw]);
  const exportAttendanceCSV = useCallback(async (eventId: string) => { if (!db || !activeTeam?.id) return; const snap = await getDoc(doc(db, 'teams', activeTeam.id, 'events', eventId)); if (!snap.exists()) return; const rsvps = snap.data().userRsvps || {}; const rows = [["Name", "Status"]]; members.forEach(m => { rows.push([m.name, rsvps[m.userId] || 'no_response']); }); const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n"); const encodedUri = encodeURI(csvContent); const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", `attendance_${eventId}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); }, [db, activeTeam, members]);
  const exportTournamentStandingsCSV = useCallback(async (tournamentId: string) => { if (!db || !activeTeam?.id) return; const rows = [["Team", "Wins", "Losses", "Ties", "Points"]]; const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n"); const encodedUri = encodeURI(csvContent); const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", `standings_${tournamentId}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); }, [db, activeTeam]);

  const addRegistration = useCallback(async (teamId: string, eventId: string, data: any) => { if (db) { await addDoc(collection(db, 'teams', teamId, 'events', eventId, 'registrations'), clean(data)); return true; } return false; }, [db]);
  const manageSubscription = useCallback(async () => { setIsPaywallOpen(true); }, []);
  const purchasePro = useCallback(() => { setIsPaywallOpen(true); }, []);
  const addLeaguePayment = useCallback(async (leagueId: string, teamId: string, data: any) => { if (!db) return; await addDoc(collection(db, 'leagues', leagueId, 'payments'), clean({ ...data, teamId, createdAt: new Date().toISOString() })); await updateDoc(doc(db, 'leagues', leagueId), { [`finances.${teamId}.totalPaid`]: increment(data.amount) }); }, [db]);
  const updateLeagueGlobalFees = useCallback(async (leagueId: string, fees: any) => { if (db) await updateDoc(doc(db, 'leagues', leagueId), { globalFees: clean(fees) }); }, [db]);

  const updateLeaguePin = useCallback(async (leagueId: string, pin: string) => { 
    if (db) await updateDoc(doc(db, 'leagues', leagueId), { scorekeeperPin: pin }); 
  }, [db]);



  const contextValue = useMemo(() => ({
    db, user: userProfile, activeTeam, setActiveTeam, teams: teamsRaw, isTeamsLoading, members, isMembersLoading,
    currentMember: getMember(firebaseUser?.uid),
    isStaff, isPro, isStarter, isParent, 
    isPlayer,
    isYouth: activeTeam?.type === 'youth',
    isSuperAdmin,
    isClubManager,
    isPrimaryClubAuthority,
    isEliteAccount,
    isSchoolMode,
    isSchoolAdmin, householdEvents: householdEvents || [], activeTeamEvents, householdBalance: 0, myChildren, plans, isPlansLoading, proQuotaStatus,
    deleteFundraisingOpportunity, addGame, updateGame, canAddProTeam: (proQuotaStatus.remaining > 0),
    isPaywallOpen, setIsPaywallOpen, purchasePro,
    hasFeature, alerts, unreadAlertsCount,

    markAlertAsSeen, markAllAlertsAsSeen, seenAlertIds, isSeedingDemo, setIsSeedingDemo,
    getRecruitingProfile, updateRecruitingProfile, getAthleticMetrics, updateAthleticMetrics,
    getPlayerStats, addPlayerStat, updatePlayerStat, deletePlayerStat, getEvaluations, addEvaluation,
    getRecruitingContact, updateRecruitingContact, getPlayerVideos, addPlayerVideo, updatePlayerVideo, deletePlayerVideo,
    toggleRecruitingProfile, updateStaffEvaluation, getStaffEvaluation, createNewTeam, joinTeamWithCode,
    createChat, signUpForVolunteer, addEquipmentItem, updateEquipmentItem, deleteEquipmentItem, respondToAssignment, assignEntryToTeam, 
    toggleRegistrationPaymentStatus, updateLeague, updateLeagueSchedule, inviteTeamToLeague, manuallyAddTeamToLeague, 
    deleteLeagueInvite, updateLeagueTeamDetails, deleteChat, createLeague,
    hideChatForUser, votePoll, updateChat, deployClubProtocol, deleteTeam, deleteAccount, upgradeChildToLogin, registerChild, updateChild, sendChildInvite,
    updateUser, updateTeam, updateMember, updateTeamDetails, updateTeamHero, updateTeamPlan,
    signTeamDocument, createTeamDocument, updateTeamDocument, addEvent, updateEvent,
    deleteEvent, updateRSVP, addMessage, resetSquadData, verifyVolunteerHours,
    confirmVolunteerAttendance, addVolunteerOpportunity, updateVolunteerOpportunity, deleteVolunteerOpportunity, publicSignUpForVolunteer, signUpForFundraising, recordDonation, addFundraisingOpportunity, updateFundraisingOpportunity,
    confirmExternalDonation, addIncident, updateIncident, assignManualPlan, removeTeamFromLeague,
    saveLeagueRegistrationConfig, submitRegistrationEntry,
    signPublicTournamentWaiver, submitMatchScore, submitLeagueMatchScore, updateLeaguePin, disputeMatchScore, disputeLeagueMatchScore,
    addLeagueGame,
    createAlert, deleteAlert, addDrill, deleteDrill, addFile, deleteFile, addFacility, deleteFacility,
    addField, deleteField: deleteFacilityField, 
    assignEquipment, returnEquipment,
    formatTime, manageSubscription, resolveQuota, exportAttendanceCSV, exportTournamentStandingsCSV, markMediaAsViewed,
    isRCInitialized: true, addRegistration, addLeaguePayment, updateLeagueGlobalFees,
    getMember, firebaseUser, getTeamByCode
  }), [
    db, userProfile, activeTeam, setActiveTeam, teamsRaw, isTeamsLoading, members, isMembersLoading, firebaseUser,
    isStaff, isPro, isStarter, householdEvents, activeTeamEvents, myChildren, plans, isPlansLoading, isPaywallOpen, isSeedingDemo,
    seenAlertIds, alerts, unreadAlertsCount, isSuperAdmin, isClubManager, isPrimaryClubAuthority, isEliteAccount, hasFeature, proQuotaStatus,

    getRecruitingProfile, updateRecruitingProfile, getAthleticMetrics, updateAthleticMetrics,
    getPlayerStats, addPlayerStat, updatePlayerStat, deletePlayerStat, getEvaluations, addEvaluation,
    getRecruitingContact, updateRecruitingContact, getPlayerVideos, addPlayerVideo, updatePlayerVideo, deletePlayerVideo,
    toggleRecruitingProfile, updateStaffEvaluation, getStaffEvaluation, createNewTeam, joinTeamWithCode,
    createLeague, signUpForVolunteer, addEquipmentItem, updateEquipmentItem, deleteEquipmentItem, respondToAssignment, assignEntryToTeam, 
    toggleRegistrationPaymentStatus, updateLeague, updateLeagueSchedule, inviteTeamToLeague, manuallyAddTeamToLeague, 
    deleteLeagueInvite, updateLeagueTeamDetails, deleteChat, createChat,
    hideChatForUser, votePoll, updateChat, deployClubProtocol, deleteTeam, deleteAccount, upgradeChildToLogin, registerChild, updateChild, sendChildInvite,
    updateUser, updateTeam, updateMember, updateTeamDetails, updateTeamHero, updateTeamPlan,
    signTeamDocument, createTeamDocument, updateTeamDocument, addEvent, updateEvent,
    deleteEvent, updateRSVP, addMessage, resetSquadData, verifyVolunteerHours,
    confirmVolunteerAttendance, addVolunteerOpportunity, updateVolunteerOpportunity, deleteVolunteerOpportunity, publicSignUpForVolunteer, addFundraisingOpportunity, updateFundraisingOpportunity, signUpForFundraising, recordDonation,
    confirmExternalDonation, addIncident, updateIncident, assignManualPlan, removeTeamFromLeague,
    saveLeagueRegistrationConfig, submitRegistrationEntry,
    signPublicTournamentWaiver, submitMatchScore, submitLeagueMatchScore, updateLeaguePin, disputeMatchScore, disputeLeagueMatchScore,
    addLeagueGame,
    createAlert, deleteAlert, addDrill, deleteDrill, addFile, deleteFile, addFacility, deleteFacility,
    addField, deleteFacilityField, 
    assignEquipment, returnEquipment,
    formatTime, manageSubscription, resolveQuota, exportAttendanceCSV, exportTournamentStandingsCSV, markMediaAsViewed,
    addRegistration, purchasePro, addLeaguePayment, updateLeagueGlobalFees,
    getMember, getTeamByCode
  ]);

  return <TeamContext.Provider value={contextValue}>{children}</TeamContext.Provider>;
}

export const useTeam = () => {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within a TeamProvider');
  return context;
};
