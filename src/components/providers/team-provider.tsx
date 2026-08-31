"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo, useCallback } from 'react';
import { useFirestore, useMemoFirebase, useUser, useCollection, useDoc, useStorage, useAuth } from '@/firebase';
import { clearBrowserSession, getAuthToken, authHeader } from '@/lib/client-auth';
import { isAlertRelevantToRecipient } from '@/lib/alert-audience';
import { isBillableSquadSeat } from '@/lib/team-seat-policy';
import { calculateHouseholdPayments, type HouseholdPayment } from '@/lib/household-payments';
import { hasStaffRole } from '@/lib/staff-position';
import { activeTeamMembershipProjections } from '@/lib/team-membership-security';
import { canStartProtectedAccountState } from '@/lib/client-account-admission';

/**
 * Dispatch push + email notifications to all team members.
 * Called after addEvent, addDrill, addTeamDocument.
 * Fire-and-forget — errors are logged but never block the main action.
 */
async function dispatchNotification({
  idToken,
  db,
  teamId,
  memberUserIds,
  title,
  body,
  url,
  emailSubject,
  emailHtml,
}: {
  idToken: string;
  db: any;
  teamId: string;
  memberUserIds: string[];
  title: string;
  body: string;
  url?: string;
  emailSubject?: string;
  emailHtml?: string;
}) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    };

    // 1. The server resolves member device tokens so clients never need access
    // to other users' notification data.
    void fetch('/api/notify', {
      method: 'POST',
      headers,
      body: JSON.stringify({ teamId, recipientUserIds: memberUserIds, title, body, url }),
    }).then(async response => {
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Push notification request failed.');
      }
    }).catch((e) => console.warn('[Push] dispatch error:', e));

    // 2. The server likewise resolves member email addresses from membership data.
    if (emailSubject && emailHtml) {
      void fetch('/api/email/send', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          teamId,
          recipientUserIds: memberUserIds,
          subject: emailSubject,
          html: emailHtml,
        }),
      }).then(async response => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || 'Email notification request failed.');
        }
      }).catch((e) => console.warn('[Email] dispatch error:', e));
    }
  } catch (e) {
    console.warn('[dispatchNotification] Error:', e);
  }
}

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
  or,
  runTransaction
} from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { useRouter, usePathname } from 'next/navigation';
import { format } from 'date-fns';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

// --- TYPE DEFINITIONS ---
export type UserRole = "parent" | "adult_player" | "youth_player" | "coach" | "admin" | "superadmin" | "league_creator";

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  role: UserRole;
  createdAt?: string;
  isDemo?: boolean;
  plan_type?: 'free' | 'team' | 'elite' | 'league' | 'school' | string | null;
  team_limit?: number | null;
  extra_teams?: number | null;
  subscription_status?: string | null;
  trial_end?: string | null;
  cancel_at_period_end?: boolean;
  billing_cycle?: 'monthly' | 'annual' | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  seenAlertIds?: string[];
  clubName?: string;
  clubDescription?: string;
  schoolName?: string;          // The official school / institution name (editable by AD)
  institutionTitle?: string;    // e.g. "Athletic Director", "Principal", "Program Director"
  schoolAdminIds?: string[];
  isPrimaryClubAuthority?: boolean;
  isStaff?: boolean;
  division?: string; // High-level organizational tier
  isBetaTester?: boolean;
  betaDemoSeeded?: boolean;
  notificationsEnabled?: boolean; // Push notification preference — persisted to Firestore
  upcomingEventNotificationsEnabled?: boolean;
};

export function resolveUserAvatar(...candidates: Array<string | null | undefined>): string {
  return candidates.find(candidate => typeof candidate === 'string' && candidate.length > 0) ?? '/icon.png';
}

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
  inviteSentAt?: string;
  inviteExpiresAt?: string;
  division?: string; // Assigned division for roster sorting
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
  // Contact info embedded in profile
  playerEmail?: string;
  parentEmail?: string;
  // Portfolio visibility controls
  downloadsDisabled?: boolean;
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
  pointsPerSlot?: number;
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
  coachEmail?: string;
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
  thumbnailUrl?: string; // Video poster / thumbnail image URL
  isTacticalClip?: boolean; // True if this is a coach-tagged tactical analysis clip
  comments?: VideoComment[];
  createdAt?: any;
  startAt?: number;
  endAt?: number;
  segments?: { start: number; end: number; title: string }[];
};

export type Drill = {
  id: string;
  title: string;
  description: string;
  objective?: string;
  duration?: number; // in minutes
  category?: 'Warmup' | 'Skill' | 'Tactical' | 'Conditioning' | string;
  difficulty?: 'Beginner' | 'Intermediate' | 'Advanced' | string;
  url?: string;
  coverUrl?: string;
  media?: {url: string, description: string}[];
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
  comments?: VideoComment[];
};

export type GlobalDrill = Drill & {
  isPublic: boolean;
  authorId?: string;
};

export type Team = {
  id: string;
  name: string;
  code: string;
  teamCode?: string;
  type: "adult" | "youth" | "school" | "school_squad" | "school_hub";
  sport?: string;
  description?: string;
  teamLogoUrl?: string;
  heroImageUrl?: string;
  isPro?: boolean;
  planId?: string;
  clubId?: string;
  schoolId?: string; // ID of the primary school team (for sub-squads)
  schoolAdminIds?: string[]; // IDs of additional school admins (for primary team)
  pendingAdminEmails?: string[]; // Emails invited as admins, granted access on sign-up
  role?: 'Admin' | 'Member';
  ownerUserId?: string;
  parentChatEnabled?: boolean;
  parentCommentsEnabled?: boolean;
  parentFeedEnabled?: boolean;
  parentPostingEnabled?: boolean;
  contactEmail?: string;
  contactPhone?: string;
  registrationProtocolId?: string;
  leagueIds?: Record<string, boolean>;
  isDemo?: boolean;
  rosterLimit?: number;
  isArchived?: boolean;
  division?: string;
  // Invite / join code
  inviteCode?: string;
  teamName?: string; // Alias used in some contexts
  lastCodeEditedAt?: string;
  // Module visibility settings (admin-configurable)
  features?: {
    feed?: boolean;
    roster?: boolean;
    practice?: boolean;
    playbook?: boolean;
    volunteer?: boolean;
    fundraising?: boolean;
    tacticalChat?: boolean;
    library?: boolean;
  };
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
  parentId?: string;
  medicalClearance?: boolean;
  gradYear?: string;
  gpa?: string;
  school?: string;
  phone?: string;
  email?: string;
  skills?: string[];
  achievements?: string[];
  recruitingProfileEnabled?: boolean;
  schoolId?: string;
  signatures?: Record<string, any>;
  volunteerPoints?: number;
  status?: 'active' | 'removed';
  removalReason?: string;
  removedAt?: string;
  division?: string; // Division assignment for league play
  /** ISO date string (YYYY-MM-DD) — used to compute age for payment history access */
  dateOfBirth?: string;
  /** Explicitly mark a member as an adult (18+). Overrides dateOfBirth computation. */
  isAdult?: boolean;
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

export type EventAssignment = {
  id: string;
  title: string;
  assigneeId: string | null;
  assigneeName?: string | null;
  status: 'open' | 'claimed' | 'completed';
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
  registrationCode?: string;
  isTournamentMatch?: boolean; // Indicates this is a match within a tournament (not a standalone event)
  isLeagueGame?: boolean;
  isHome?: boolean;
  leagueId?: string;
  leagueName?: string; // Human-readable league/program label for multi-league display
  adminEmails?: string[]; // Allowed emails to manage this specific event
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
  opponent?: string;
  assignments?: EventAssignment[];
  drillIds?: string[]; // References to drills in the playbook/library
  isArchived?: boolean;
  division?: string;
  divisionTitle?: string;
  sport?: string;
  round?: string | number; // Tournament round identifier
  refereePool?: TournamentReferee[];
  // ── Tournament deployment fields (set by TournamentDeploymentWizard) ──
  tournamentType?: 'round_robin' | 'single_elimination' | 'double_elimination' | 'pool_play_knockout';
  gameLength?: number;
  breakLength?: number;
  gamesPerTeam?: number;
  maxDailyGamesPerTeam?: number;
  poolCount?: number;
  advancePerPool?: number;
  dailyWindows?: Array<{ date: string; startTime: string; endTime: string }>;
  selectedFields?: string[];
  manualVenue?: string;
  waiverIds?: string[];
  waiverDocuments?: Array<{ id: string; title: string; content: string }>;
  venueSettings?: Record<string, any>;
  creatorId?: string;
  isCompleted?: boolean;
  setupStatus?: 'draft' | 'complete';
  bracketStatus?: 'pending' | 'ready' | 'failed';
  scheduleStatus?: 'pending' | 'ready' | 'failed';
  deploymentStatus?: 'undeployed' | 'deployed' | 'failed';
  deploymentError?: string;
  archived_waivers?: any[];
};

export type PracticeTemplate = {
  id: string;
  teamId: string;
  title: string;
  description: string;
  drillIds: string[];
  createdAt: string;
  createdBy: string;
};

export type TeamAlert = {
  id: string;
  title: string;
  message: string;
  audience: 'everyone' | 'coaches' | 'players' | 'parents' | string;
  targetUserId?: string;
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
  participantTeamName?: string;
  leagueId?: string;
  tournamentId?: string;
  division?: string;
  gameId?: string;
  participantId?: string;
  participantName?: string;
  incidentType?: string;
  injuryType?: string;
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
  followUpNotes?: string;
  status?: 'open' | 'monitoring' | 'follow_up_required' | 'resolved';
  parentGuardianContacted?: boolean;
  actionsTaken?: string;
  reportedBy?: string;
  reportedTo?: string;
  equipmentInvolved?: string;
  weatherConditions?: string;
  supportingDocumentUrl?: string;
  auditHistory?: Array<{ action: string; userId: string; at: string }>;
  updatedAt?: string;
  updatedBy?: string;
  createdAt: string;
};


export type VolunteerOpportunity = {
  id: string;
  title: string;
  description: string;
  date: string;
  endDate?: string;
  location: string;
  spots: number;
  points?: number; // Dormant historical compatibility field; Reward Points are retired.
  hoursPerSlot?: number;
  isShareable?: boolean;
  signups: Record<string, any>;
  eventId?: string;
  assignmentId?: string;
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
  donorEmail?: string;
  amount: number;
  method: 'external' | 'etransfer' | 'e-transfer';
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
    teamLogoUrl?: string;
    division?: string;
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
  /** Server-maintained user IDs allowed to access this league. */
  memberUserIds?: string[];
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
  isArchived?: boolean;
  divisions?: string[]; // List of available divisions (e.g. 'Gold', 'Silver', 'U12')
  divisionTitle?: string;
  schedulerConfig?: any;
  settingsCopiedFrom?: string;
  settingsCopiedAt?: string;
  deploymentStatus?: 'undeployed' | 'deployed' | 'failed';
  isDemo?: boolean;
  demoSessionOwnerId?: string;
  demoSeeded?: boolean;
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
  require_division_selection?: boolean;
  available_divisions?: string[];
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
  division?: string; // Selected division during registration
};

export type RegistrationFormField = {
  id: string;
  label: string;
  type: 'short_text' | 'long_text' | 'dropdown' | 'header' | 'radio' | 'multi_select' | 'checkbox' | 'signature' | 'information_box';
  required: boolean;
  options?: string[];
  step?: 'identity' | 'contact' | 'medical' | 'guardian' | 'team_code' | 'additional' | 'compliance';
  placeholder?: string;
  infoContent?: string;
};


export type EquipmentItem = {
  id: string;
  name: string;
  category: string;
  totalQuantity: number;
  availableQuantity: number;
  description?: string;
  sizeStock?: Record<string, number>;
  size?: string;
  jerseyNumber?: string;
  status: string;
  assignments: Record<string, {
    userId: string;
    userName: string;
    quantity: number;
    date: string;
    size?: string;
    jerseyNumber?: string;
  }>;
};

export type TournamentGame = {
  id: string;
  team1: string;
  team2: string;
  team1Id?: string;
  team2Id?: string;
  team1LogoUrl?: string;
  team2LogoUrl?: string;
  score1: number;
  score2: number;
  date: string;
  time: string;
  location?: string;
  /** Stable facility/field identity used for cross-schedule conflict checks. */
  resourceId?: string;
  isCompleted: boolean;
  /** Organizer-added fixture that does not affect official game caps or standings. */
  isExhibition?: boolean;
  isDisputed?: boolean;
  disputeNotes?: string;
  updatedAt?: string;
  round?: string;
  stage?: string;
  reportedBy?: string;
  winnerTo?: string;
  winnerToSlot?: 'team1' | 'team2';
  loserTo?: string;
  loserToSlot?: 'team1' | 'team2';
  /** Pool index (0-based) for pool_play_knockout format */
  pool?: number;
  /** True for Grand Final Reset match in Double Elimination */
  isResetMatch?: boolean;
  /** True for conditional matches that only occur under specific bracket outcomes */
  isConditional?: boolean;
  /** Assigned official */
  refereeId?: string;
  refereeName?: string;
};

export type TournamentReferee = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  certLevel?: string | null; // e.g. 'Regional' | 'State' | 'National'
  notes?: string | null;
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
  isGlobal?: boolean;
  deploymentId?: string;
  sourceGlobalDocumentId?: string;
  waiverAudience?: 'participant' | 'team';
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
  storage: any;
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
  isEliteClubMode: boolean;
  householdEvents: TeamEvent[];
  activeTeamEvents: TeamEvent[];
  games: any[];
  householdGames: any[];
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
  totalStorageUsed: number;

  
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
  deleteTeamDocument: (docId: string) => Promise<void>;
  addEvent: (data: any) => Promise<boolean>;
  updateEvent: (id: string, data: any) => Promise<boolean>;
  deleteEvent: (id: string) => Promise<void>;
  updateRSVP: (eventId: string, status: string, teamId?: string, userId?: string) => Promise<void>;
  claimAssignment: (eventId: string, assignmentId: string) => Promise<boolean>;
  addMessage: (chatId: string, author: string, content: string, type: string, img?: string, poll?: any, teamId?: string) => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => Promise<void>;
  createChat: (name: string, members: string[], contextId?: string) => Promise<string>;
  deleteChat: (chatId: string) => Promise<void>;
  hideChatForUser: (chatId: string) => Promise<void>;
  votePoll: (chatId: string, messageId: string, optionIdx: number, teamId?: string) => Promise<void>;
  updateChat: (chatId: string, data: any) => Promise<void>;
  resetSquadData: (categories: string[]) => Promise<void>;
  addVolunteerOpportunity: (data: any) => Promise<void>;
  updateVolunteerOpportunity: (oppId: string, updates: any) => Promise<void>;
  deleteVolunteerOpportunity: (oppId: string) => Promise<void>;
  publicSignUpForVolunteer: (teamId: string, oppId: string, data: any) => Promise<void>;
  signUpForVolunteer: (oppId: string) => Promise<void>;
  confirmVolunteerAttendance: (oppId: string, userId: string, confirmed: boolean) => Promise<void>;
  addFundraisingOpportunity: (data: any) => Promise<string | undefined>;
  updateFundraisingOpportunity: (fundId: string, updates: any) => Promise<void>;
  signUpForFundraising: (fundId: string) => Promise<void>;
  recordDonation: (fundId: string, amount: number, donorName: string, method: 'external' | 'e-transfer') => Promise<void>;
  confirmExternalDonation: (fundId: string, donationId: string, amount: number) => Promise<void>;
  addEquipmentItem: (data: any) => Promise<void>;
  updateEquipmentItem: (id: string, updates: any) => Promise<void>;
  deleteEquipmentItem: (id: string) => Promise<void>;
  assignEquipment: (
    id: string,
    userId: string,
    userName: string,
    qty: number,
    details?: { size?: string; jerseyNumber?: string }
  ) => Promise<void>;
  returnEquipment: (id: string, userId: string) => Promise<void>;
  addDrill: (data: any) => Promise<void>;
  updateDrill: (drillId: string, data: any) => Promise<void>;
  deleteDrill: (drillId: string) => Promise<void>;
  assignDrillsToEvent: (eventId: string, drillIds: string[]) => Promise<void>;
  addPracticeTemplate: (data: any) => Promise<void>;
  updatePracticeTemplate: (templateId: string, data: any) => Promise<void>;
  deletePracticeTemplate: (templateId: string) => Promise<void>;
  addFile: (name: string, type: string, sizeBytes: number, url: string, category: string, description?: string) => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
  addFacility: (data: any) => Promise<void>;
  updateFacility: (id: string, data: Partial<Facility>) => Promise<void>;
  deleteFacility: (id: string) => Promise<void>;
  addField: (facilityId: string, name: string) => Promise<void>;
  updateField: (facilityId: string, fieldId: string, name: string) => Promise<void>;
  deleteField: (facilityId: string, fieldId: string) => Promise<void>;
  createLeague: (name: string, divisionTitle?: string, sport?: string) => Promise<string>;
  updateLeague: (leagueId: string, updates: Partial<League>) => Promise<void>;
  addLeagueGame: (leagueId: string, game: any) => Promise<void>;
  updateLeagueSchedule: (leagueId: string, schedule: any[]) => Promise<void>;
  removeTeamFromLeague: (leagueId: string, teamId: string) => Promise<void>;
  inviteTeamToLeague: (leagueId: string, leagueName: string, email: string, teamName?: string) => Promise<void>;
  saveLeagueRegistrationConfig: (leagueId: string, protocolId: string, updates: Partial<LeagueRegistrationConfig>) => Promise<void>;
  submitRegistrationEntry: (targetId: string, protocolId: string, answers: any, version: number, signature?: string, targetType?: 'leagues' | 'teams', eventId?: string) => Promise<string | undefined>;
  assignEntryToTeam: (leagueId: string, entryId: string, teamId: string | null) => Promise<void>;
  toggleRegistrationPaymentStatus: (leagueId: string, entryId: string, paid: boolean) => Promise<void>;
  respondToAssignment: (contextId: string, entryId: string, status: 'accepted' | 'declined') => Promise<boolean>;
  signPublicTournamentWaiver: (teamId: string, eventId: string, tournamentTeamName: string, coachName: string) => Promise<boolean>;
  submitMatchScore: (teamId: string, eventId: string, gameId: string, isTeam1: boolean, score1: number, score2: number, pin?: string) => Promise<void>;
  submitLeagueMatchScore: (leagueId: string, gameId: string, isTeam1: boolean, score1: number, score2: number, pin?: string) => Promise<void>;
  updateLeaguePin: (leagueId: string, pin: string) => Promise<void>;
  disputeMatchScore: (teamId: string, eventId: string, gameId: string, notes: string) => Promise<void>;
  disputeLeagueMatchScore: (leagueId: string, gameId: string, notes: string) => Promise<void>;
  manageSubscription: () => Promise<void>;
  resolveQuota: (selectedTeamIds: string[]) => Promise<void>;
  createAlert: (title: string, message: string, audience: TeamAlert['audience'], targetUserId?: string) => Promise<void>;
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
  /** Signs a global (hub-deployed) waiver AS THE COACH/STAFF. Stores signature
   * in teams/{teamId}/coachWaiverSignatures/{waiverDocId} and archives it. */
  signGlobalWaiverAsCoach: (waiverDocId: string, waiverTitle: string) => Promise<boolean>;
  removeMember: (memberId: string, reason?: string) => Promise<void>;
  reinstateMember: (memberId: string) => Promise<void>;
  upgradeChildToLogin: (childId: string) => Promise<void>;
  registerChild: (first: string, last: string, dob: string, email?: string) => Promise<string | null>;
  updateChild: (childId: string, updates: Partial<PlayerProfile>) => Promise<void>;
  sendChildInvite: (child: PlayerProfile, email: string) => Promise<string | null>;
  revokeChildInvite: (childId: string) => Promise<void>;
  assignManualPlan: (uid: string, planId: string, _limit?: number) => Promise<void>;
  deleteFundraisingOpportunity: (id: string) => Promise<void>;
  addGame: (data: any) => Promise<void>;
  updateGame: (gameId: string, data: any) => Promise<void>;
  getMember: (id: string | null | undefined) => Member | undefined;
  getTeamByCode: (code: string, leagueId?: string) => Promise<any>;
  getLeagueMembers: (leagueId: string) => Promise<Member[]>;
  propagateLogoToLeagues: (teamId: string, logoUrl: string) => Promise<void>;
  // Team code management
  updateTeamCode: (teamId: string, newCode: string) => Promise<void>;
  checkCodeUniqueness: (code: string) => Promise<boolean>;
  // Calendar feed URL generator
  getCalendarFeedUrl: (type: 'user' | 'team' | 'multi', targetId?: string, teamIds?: string[]) => Promise<string | null>;
  // Inline member update handler (used in coaches-corner)
  handleUpdateMemberField: (memberId: string, field: string, value: any) => Promise<void>;
  // Alias for user — used by pricing page
  userProfile: UserProfile | null;
  // Pro quota shorthand
  canAddProTeam?: boolean;
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
  const firebaseAuth = useAuth();
  const db = useFirestore();
  const storage = useStorage();
  const router = useRouter();
  const pathname = usePathname();
  const canReadProtectedAccountState = canStartProtectedAccountState(pathname);
  
  const [activeTeamId, setManualActiveTeamId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [claimedSchoolAdminForUid, setClaimedSchoolAdminForUid] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser) {
      setUserRole(null);
      return;
    }
    firebaseUser.getIdTokenResult()
      .then((tokenResult: any) => {
        setUserRole((tokenResult.claims.role as string) || null);
      })
      .catch((err: any) => {
        console.error('Error fetching ID token result:', err);
        setUserRole(null);
      });
  }, [firebaseUser]);

  useEffect(() => {
    if (!canReadProtectedAccountState || !isAuthResolved || !firebaseUser?.uid || firebaseUser.isAnonymous || firebaseUser.emailVerified !== true || !firebaseAuth) return;
    if (claimedSchoolAdminForUid === firebaseUser.uid) return;

    let cancelled = false;
    const claimPendingSchoolInvites = async () => {
      try {
        const token = await getAuthToken(firebaseAuth);
        if (!token) return;
        const response = await fetch('/api/schools/admins', {
          method: 'PATCH',
          headers: authHeader(token),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || 'Unable to claim School Hub invitations.');
        }
        if (!cancelled) setClaimedSchoolAdminForUid(firebaseUser.uid);
      } catch (error) {
        console.error('[TeamProvider] School Hub invitation claim failed:', error);
      }
    };
    claimPendingSchoolInvites();
    return () => { cancelled = true; };
  }, [canReadProtectedAccountState, claimedSchoolAdminForUid, firebaseAuth, firebaseUser?.isAnonymous, firebaseUser?.uid, isAuthResolved]);

  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [isSeedingDemo, setIsSeedingDemo] = useState(false);
  const [totalStorageUsed, setTotalStorageUsed] = useState(0);


  // Restore active team from persistence.
  // Only restore if we have a stored ID — validation against actual teams
  // happens in activeTeamMembership once teamsRaw is loaded.
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
    if (!canReadProtectedAccountState || !firebaseUser || !db || (!firebaseUser.isAnonymous && firebaseUser.emailVerified !== true)) {
      setUserProfile(null);
      return;
    }
    const userRef = doc(db, 'users', firebaseUser.uid);
    return onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        
        // Superadmin authority comes exclusively from the signed Firebase Auth
        // token. A Firestore profile is user-readable data and must never grant
        // global authority on its own.
        const isSuper = userRole === 'superadmin';
        
        // For beta testers, always prefer Firebase Auth identity so the real
        // logged-in email/name shows instead of seeded demo placeholders
        const isBeta = data.isBetaTester === true;
        const resolvedName = isBeta
          ? (firebaseUser.displayName || data.fullName || data.name || 'User')
          : (data.fullName || data.name || 'User');
        const resolvedEmail = isBeta
          ? (firebaseUser.email || data.email || '')
          : (data.email);

        setUserProfile({ 
          ...data, 
          id: snap.id,
          name: resolvedName,
          email: resolvedEmail,
          plan_type: isSuper ? 'league' : data.plan_type,
          team_limit: isSuper ? 100 : data.team_limit,
          role: isSuper ? 'superadmin' : data.role,
          avatar: resolveUserAvatar(data.avatarUrl, data.avatar)
        } as UserProfile);
      } else {
        // Fallback if the user document hasn't been written to DB yet or is deleted
        setUserProfile({
          id: firebaseUser.uid,
          name: firebaseUser.displayName || 'User',
          email: firebaseUser.email || '',
          avatar: resolveUserAvatar(firebaseUser.photoURL),
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
        avatar: resolveUserAvatar(firebaseUser.photoURL),
        role: 'adult_player',
      } as unknown as UserProfile);
    });
  }, [canReadProtectedAccountState, firebaseUser, db, userRole]);

  const teamsQuery = useMemoFirebase(() => (canReadProtectedAccountState && isAuthResolved && firebaseUser?.uid && db && (firebaseUser.isAnonymous || firebaseUser.emailVerified === true)) ? query(collection(db, 'users', firebaseUser.uid, 'teamMemberships')) : null, [canReadProtectedAccountState, isAuthResolved, firebaseUser?.uid, firebaseUser?.isAnonymous, firebaseUser?.emailVerified, db]);
  const { data: teamsData, isLoading: isTeamsLoading } = useCollection(teamsQuery);
  
  // ── Shared deterministic invite-code fallback ─────────────────────────
  // MUST stay outside useMemo so both teamsRaw and activeTeam use
  // the exact same algorithm — guaranteeing they always agree.
  const generateTeamCode = useCallback((teamId: string): string => {
    let h = 0;
    for (let i = 0; i < teamId.length; i++) h = (Math.imul(31, h) + teamId.charCodeAt(i)) | 0;
    // 8-char base36 padded with leading zeros (not Z) for readability
    return Math.abs(h).toString(36).toUpperCase().padStart(8, '0');
  }, []);

  const teamsRaw = useMemo(() => activeTeamMembershipProjections(teamsData || []).map(m => {
    const tid = m.teamId || m.id;
    const storedCode = (m.code || m.teamCode || m.inviteCode || '').toString().trim().toUpperCase();
    const finalCode = storedCode || generateTeamCode(tid);
    return { 
      ...m, 
      id: tid, 
      name: m.name || m.teamName || 'Squad',
      code: finalCode,
      teamCode: finalCode,
      inviteCode: finalCode
    };
  }), [teamsData, generateTeamCode]);

  const activeTeamMembership = useMemo(() => {
    if (teamsRaw.length === 0) return null;

    // --- Validate the stored ID ---
    // If there's an explicit team selection, honour it — BUT only if that team
    // still exists in this user's membership list. Stale IDs from a previous
    // demo/session are silently discarded so the institutional default fires.
    if (activeTeamId) {
      const found = teamsRaw.find(t => t.id === activeTeamId);
      if (found) return found;
      // Stale ID — clear it so the institutional default takes over
      localStorage.removeItem('sf_session_team_id');
    }

    // --- School Admin / Athletic Director ---
    // Always land on the school institution (type === 'school'), not a random squad.
    const schoolPrimary = teamsRaw.find(t => t.type === 'school');
    if (schoolPrimary) return schoolPrimary;

    // --- Elite Club Organizer ---
    // If the user owns an Elite/League plan team (no clubId = they are the club owner),
    // return null to signal "hub mode" — the sidebar shows the club identity, not a squad.
    // The Club Hub page handles this state; the user picks a squad from the dropdown.
    const isEliteOwner = teamsRaw.some(
      t => !t.clubId && ['elite', 'league'].includes(t.planId || '') && t.ownerUserId === teamsRaw[0]?.ownerUserId
    );
    if (isEliteOwner) {
      // Default to null (hub mode) — no squad active on first load
      return null;
    }

    // --- Default: first available team ---
    return teamsRaw[0] || null;
  }, [teamsRaw, activeTeamId]);
  const activeTeamDocRef = useMemoFirebase(() => (isAuthResolved && firebaseUser && db && activeTeamMembership?.id) ? doc(db, 'teams', activeTeamMembership.id) : null, [isAuthResolved, firebaseUser, db, activeTeamMembership?.id]);
  const { data: activeTeamDoc } = useDoc<Team>(activeTeamDocRef);

  const activeTeam = useMemo(() => {
    if (!activeTeamMembership) return null;
    const combined = { ...activeTeamMembership, ...activeTeamDoc };
    // Use the same shared fallback — NEVER 'SF' + slice which was inconsistent
    const storedCode = (combined.code || combined.teamCode || combined.inviteCode || '').toString().trim().toUpperCase();
    const finalCode = storedCode || generateTeamCode(combined.id || activeTeamMembership.id);
    return { 
      ...combined, 
      code: finalCode,
      teamCode: finalCode,
      inviteCode: finalCode
    } as Team;
  }, [activeTeamMembership, activeTeamDoc, generateTeamCode]);

  const membersQuery = useMemoFirebase(() => (isAuthResolved && activeTeam?.id && db) ? query(collection(db, 'teams', activeTeam.id, 'members')) : null, [isAuthResolved, activeTeam?.id, db]);
  const { data: membersData, isLoading: isMembersInitialLoading } = useCollection<Member>(membersQuery);
  const [hydratedMembers, setHydratedMembers] = useState<Member[]>([]);
  const [isHydrating, setIsHydrating] = useState(false);

  const hydrateEmails = useCallback(async (membersList: Member[]): Promise<Member[]> => {
    // Contact fields used by team staff belong on the team-scoped membership
    // record. Firestore intentionally restricts /users/{uid} to that user (or
    // a superadmin), so bulk-reading private user profiles here both violates
    // the privacy boundary and always fails for normal coaches and players.
    return membersList || [];
  }, []);

  useEffect(() => {
    if (membersData) {
      setHydratedMembers(membersData);
      const doHydrate = async () => {
        setIsHydrating(true);
        const results = await hydrateEmails(membersData);
        setHydratedMembers(results);
        setIsHydrating(false);
      };
      doHydrate();
    } else {
      setHydratedMembers([]);
    }
  }, [membersData, hydrateEmails]);

  const members = hydratedMembers;
  const isMembersLoading = isMembersInitialLoading || isHydrating;

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

  const gamesQuery = useMemoFirebase(() => {
    if (!db || !activeTeam?.id) return null;
    return query(collection(db, 'teams', activeTeam.id, 'games'), orderBy('date', 'desc'));
  }, [db, activeTeam?.id]);
  const { data: gamesData } = useCollection(gamesQuery);
  const games = useMemo(() => gamesData || [], [gamesData]);

  // History is deliberately unbounded here: the inbox promises the member's
  // full squad broadcast history, not an arbitrary latest-ten slice.
  const alertsQuery = useMemoFirebase(() => (isAuthResolved && activeTeam?.id && db) ? query(collection(db, 'teams', activeTeam.id, 'alerts'), orderBy('createdAt', 'desc')) : null, [isAuthResolved, activeTeam?.id, db]);
  const { data: alertsData } = useCollection<TeamAlert>(alertsQuery);
  const allAlerts = useMemo(() => alertsData || [], [alertsData]);
  
  const seenAlertIds = useMemo(() => userProfile?.seenAlertIds || [], [userProfile?.seenAlertIds]);

  const plansQuery = useMemoFirebase(() => (db && isAuthResolved) ? collection(db, 'plans') : null, [db, isAuthResolved]);
  const { data: plansData, isLoading: isPlansLoading } = useCollection(plansQuery);
  const plans = useMemo(() => plansData || [], [plansData]);

  const childrenQuery = useMemoFirebase(() => (db && firebaseUser?.uid) ? query(collection(db, 'players'), where('parentId', '==', firebaseUser.uid)) : null, [db, firebaseUser?.uid]);
  const { data: myChildrenRaw } = useCollection<PlayerProfile>(childrenQuery);
  const myChildren = useMemo(() => myChildrenRaw || [], [myChildrenRaw]);

  const getLeagueMembers = useCallback(async (leagueId: string): Promise<Member[]> => {
    if (!db || !leagueId) return [];
    try {
      const leagueSnap = await getDoc(doc(db, 'leagues', leagueId));
      if (!leagueSnap.exists()) return [];
      const leagueData = leagueSnap.data();
      const teamIds = Object.keys(leagueData.teams || {});
      
      const allMembers: Member[] = [];
      
      // 1. Collect all members from the 'members' subcollection of each actual team
      const memberPromises = teamIds.map(async (teamId) => {
        // Skip placeholders that don't have a real team document
        if (teamId.startsWith('manual_') || teamId.startsWith('recruit_')) return;
        
        const membersSnap = await getDocs(collection(db, 'teams', teamId, 'members'));
        membersSnap.forEach((m) => {
          allMembers.push({ id: m.id, ...m.data() } as Member);
        });
      });
      await Promise.all(memberPromises);

      // 2. Add coaches from placeholder/manual teams in the league record itself
      Object.entries(leagueData.teams || {}).forEach(([tid, t]: [string, any]) => {
        if (t.coachEmail) {
          // Check if this coach is already in the list to avoid duplicates
          const alreadyAdded = allMembers.some(m => m.email?.toLowerCase() === t.coachEmail.toLowerCase());
          if (!alreadyAdded) {
            allMembers.push({
              id: `coach_${tid}`,
              userId: `u_${tid}`,
              playerId: `p_${tid}`,
              name: t.coachName || t.teamName || 'Team Coach',
              email: t.coachEmail,
              role: 'Admin',
              position: 'Coach',
              teamId: tid,
              teamName: t.teamName,
              joinedAt: t.createdAt || new Date().toISOString(),
              avatar: '',
              jersey: ''
            } as Member);
          }
        }
      });

      // 3. Add individual recruits if they have emails
      if (leagueData.individualRecruits) {
        Object.entries(leagueData.individualRecruits).forEach(([rid, r]: [string, any]) => {
          if (r.email) {
            allMembers.push({
              id: rid,
              userId: rid,
              playerId: `p_${rid}`,
              name: r.name || 'Recruit',
              email: r.email,
              phone: r.phone,
              role: 'Member',
              position: 'Recruit',
              teamId: '',
              joinedAt: r.signedAt || new Date().toISOString(),
              avatar: '',
              jersey: ''
            } as Member);
          }
        });
      }

      return await hydrateEmails(allMembers);
    } catch (error) {
      console.error('Error fetching league members:', error);
      return [];
    }
  }, [db]);

  const isSuperAdmin = useMemo(() => {
    if (!firebaseUser?.uid) return false;
    return userRole === 'superadmin';
  }, [firebaseUser?.uid, userRole]);

  const isStaff = useMemo(() => {
    if (!firebaseUser) return false;
    if (isSuperAdmin) return true;
    
    // Team-level authority only: a profile role must not grant staff access to
    // a team the user does not manage.
    if (String(activeTeam?.role || '').toLowerCase() === 'admin') return true;
    if (activeTeam?.ownerUserId === firebaseUser.uid) return true;

    // Position Check: Check specific staff positions within the active team
    const currentMember = getMember(firebaseUser.uid);
    return hasStaffRole(currentMember);
  }, [activeTeam, firebaseUser, members, isSuperAdmin]);

  const isParent = useMemo(() => {
    const role = userProfile?.role?.toLowerCase();
    return role === 'parent' || role === 'guardian';
  }, [userProfile]);

  const isPlayer = useMemo(() => {
    const role = userProfile?.role?.toLowerCase();
    if (role === 'youth_player' || role === 'adult_player' || role === 'player') return true;
    if (firebaseUser) {
      const currentMember = getMember(firebaseUser.uid);
      const isStaffMember = hasStaffRole(currentMember);
      const isTeamAdmin = String(currentMember?.role || '').toLowerCase() === 'admin';

      // If they are a member (not staff/admin) in this team, treat them as a player/participant
      if (currentMember?.role === 'Member' && !isStaffMember && !isTeamAdmin) return true;
    }
    
    return false;
  }, [userProfile, firebaseUser, members]);

  // Every alert surface receives this same audience-filtered collection.
  // This prevents a badge for broadcasts that the inbox must not disclose.
  const alerts = useMemo(() => allAlerts.filter(alert => isAlertRelevantToRecipient(alert, {
    userId: firebaseUser?.uid,
    isStaff,
    isPlayer,
    isParent,
  })), [allAlerts, firebaseUser?.uid, isStaff, isPlayer, isParent]);
  const unreadAlertsCount = useMemo(
    () => alerts.filter(alert => !seenAlertIds.includes(alert.id)).length,
    [alerts, seenAlertIds],
  );

  const teams = teamsRaw;

  // Plan level check helpers
  const isEliteAccount = useMemo(() => {
    const elitePlanIds = ['elite', 'league', 'school'];
    return elitePlanIds.includes(userProfile?.plan_type || '') || 
           elitePlanIds.includes(activeTeam?.planId || '');
  }, [userProfile?.plan_type, activeTeam?.planId]);

  const isPrimaryClubAuthority = useMemo(() => {
    if (isSuperAdmin) return true;

    // Determine Pro/Authority status (at user level or active team level).
    // A profile field or global role alone is not organization authority.
    const authorityPlanIds = ['school', 'elite', 'league', 'team'];
    const hasUserAuthorityPlan = authorityPlanIds.includes(userProfile?.plan_type || '');
    const isActiveTeamAuthority = activeTeam?.isPro && authorityPlanIds.includes(activeTeam?.planId || '');
    
    // 3. Check if user is an admin or owner of the active team
    const isCurrentTeamAdmin = activeTeam?.role === 'Admin' || 
                              activeTeam?.ownerUserId === userProfile?.id || 
                              activeTeam?.ownerUserId === firebaseUser?.uid;
    // Authority by plan plus ownership of the active organization.
    if (hasUserAuthorityPlan || isActiveTeamAuthority) {
      if (isCurrentTeamAdmin) return true;
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

  // --- HOUSEHOLD & GLOBAL QUERIES (Moved here to avoid initialization order errors) ---
  const [householdEvents, setHouseholdEvents] = useState<TeamEvent[]>([]);
  const [householdGames, setHouseholdGames] = useState<any[]>([]);

  useEffect(() => {
    if (!db || !firebaseUser?.uid || (!isParent && !isPlayer)) return;

    const myOwnTeamIds = (teamsData || []).map(t => t.teamId).filter(Boolean);
    const childrenTeamIds = (myChildren || []).flatMap(c => c.joinedTeamIds || []);
    
    const allTeamIds = Array.from(new Set([...myOwnTeamIds, ...childrenTeamIds])).filter(Boolean);
    
    if (allTeamIds.length === 0) {
      setHouseholdEvents([]);
      setHouseholdGames([]);
      return;
    }

    const unsubscribers: (() => void)[] = [];
    const eventMaps = new Map<string, TeamEvent[]>();
    const gameMaps = new Map<string, any[]>();

    const flattenAndSet = () => {
       const allE: TeamEvent[] = [];
       eventMaps.forEach(arr => allE.push(...arr));
       setHouseholdEvents(allE);

       const allG: any[] = [];
       gameMaps.forEach(arr => allG.push(...arr));
       setHouseholdGames(allG);
    };

    allTeamIds.forEach(tid => {
       const eu = onSnapshot(collection(db, 'teams', tid, 'events'), (snap) => {
          const docs: TeamEvent[] = [];
          snap.forEach(d => docs.push({ id: d.id, ...d.data() } as TeamEvent));
          eventMaps.set(tid, docs);
          flattenAndSet();
       }, (err) => console.error("Event Sync Error:", err));

       const gu = onSnapshot(collection(db, 'teams', tid, 'games'), (snap) => {
          const docs: any[] = [];
          snap.forEach(d => docs.push({ id: d.id, ...d.data() } as any));
          gameMaps.set(tid, docs);
          flattenAndSet();
       }, (err) => console.error("Game Sync Error:", err));

       unsubscribers.push(eu, gu);
    });

    return () => {
       unsubscribers.forEach(fn => fn());
    };
  }, [db, firebaseUser?.uid, isParent, isPlayer, teamsData, myChildren]);

  const householdMembersQuery = useMemoFirebase(() => (db && firebaseUser?.uid && isAuthResolved && isParent) ? query(collectionGroup(db, 'members'), where('parentId', '==', firebaseUser.uid)) : null, [db, firebaseUser?.uid, isAuthResolved, isParent]);
  const { data: householdMembersData } = useCollection<Member>(householdMembersQuery);
  const householdPaymentsQuery = useMemoFirebase(
    () => (db && firebaseUser?.uid && isAuthResolved && isParent)
      ? query(collection(db, 'users', firebaseUser.uid, 'payments'))
      : null,
    [db, firebaseUser?.uid, isAuthResolved, isParent]
  );
  const { data: householdPaymentsData } = useCollection<HouseholdPayment>(householdPaymentsQuery);
  const householdBalance = useMemo(
    () => calculateHouseholdPayments(householdPaymentsData || []).outstanding,
    [householdPaymentsData]
  );


  
  const isClubManager = useMemo(() => isSuperAdmin || isPrimaryClubAuthority || userProfile?.role === 'admin', [isSuperAdmin, isPrimaryClubAuthority, userProfile?.role]);

  // Fetch Club Data
  const clubRef = useMemo(() => {
    if (!db || !activeTeam?.clubId) return null;
    return doc(db, 'clubs', activeTeam.clubId);
  }, [db, activeTeam?.clubId]);
  const { data: clubData } = useDoc<Club>(clubRef);

  const isSchoolAdmin = useMemo(() => {
    if (!userProfile) return false;
    
    return teamsRaw.some(t => {
      // Direct check of position in members if we have them
      const m = members.find(member => member.teamId === t.id && member.userId === firebaseUser?.uid);
      return m?.position === 'Athletic Director' || m?.position === 'Director of Athletics' || m?.position === 'Staff';
    });
  }, [teamsRaw, userProfile, members, firebaseUser?.uid]);

  const proQuotaStatus = useMemo(() => {
    if (!userProfile?.id) return { current: 0, limit: 0, exceeded: false, remaining: 0 };

    // Parents and players are never team owners — quota management is irrelevant for them.
    // Guard here so the QuotaResolutionOverlay never fires for member-level roles.
    const memberOnlyRoles = ['parent', 'guardian', 'adult_player', 'youth_player', 'player'];
    if (memberOnlyRoles.includes(userProfile.role?.toLowerCase() || '')) {
      return { current: 0, limit: 0, exceeded: false, remaining: 0 };
    }

    const ownedProTeams = teamsRaw.filter(
      t => t.ownerUserId === userProfile.id && t.isPro && isBillableSquadSeat(t)
    );

    // Determine Pro team limit from the user document.
    // Signup writes `proTeamLimit` (number); Stripe webhooks write `team_limit` (number).
    // Starter/free plan users always have 0 Pro slots — never fall back to a non-zero default.
    const rawData = userProfile as any;
    const paidPlanTypes = ['team', 'elite', 'league', 'school', 'squad_pro', 'squad_pro_demo'];
    const isOnPaidPlan = paidPlanTypes.includes(rawData.plan_type || '') ||
                         (rawData.activePlanId && rawData.activePlanId !== 'starter_squad' && rawData.activePlanId !== 'free');

    // Read explicit numeric limit; fall back to 0 (never grant free Pro slots).
    const explicitLimit = rawData.team_limit ?? rawData.proTeamLimit ?? null;
    let limit = isOnPaidPlan
      ? (typeof explicitLimit === 'number' ? explicitLimit : 1)
      : 0;
      
    // Beta Testers automatically receive 1 Squad Pro team
    if (rawData.isBetaTester) {
      limit = Math.max(limit, 1);
    }
    
    // Superadmin access must come from the authenticated role, never an email match.
    if (rawData.role === 'superadmin') {
      limit = Math.max(limit, 100);
    }

    return { current: ownedProTeams.length, limit, exceeded: ownedProTeams.length > limit && (limit > 0), remaining: Math.max(0, limit - ownedProTeams.length) };
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

  const isPro = useMemo(() => {
    if (isSuperAdmin) return true;

    // Paid access is allocated per canonical team document. Organization links,
    // account plans, and staff roles never grant an unallocated squad Pro access.
    return activeTeam?.isPro === true;
  }, [activeTeam?.isPro, isSuperAdmin]);

  const isStarter = useMemo(() => {
    if (isPro) return false;
    return !activeTeam?.planId || activeTeam?.planId === 'starter_squad' || userProfile?.plan_type === 'free' || !userProfile?.plan_type;
  }, [activeTeam?.planId, userProfile?.plan_type, isPro]);

  const isSchoolMode = useMemo(() => {
    return (
      activeTeam?.type === 'school' || 
      activeTeam?.type === 'school_squad' || 
      userProfile?.plan_type === 'school'
    );
  }, [activeTeam?.type, userProfile?.plan_type]);

  // Elite Club Organizer mode — true when the user is an Elite/League subscription owner
  // who is NOT in school mode. Analogous to isSchoolMode for Athletic Directors.
  // In this mode the user is managing the club hub, not a specific squad.
  const isEliteClubMode = useMemo(() => {
    return isEliteAccount && isPrimaryClubAuthority && !isSchoolMode;
  }, [isEliteAccount, isPrimaryClubAuthority, isSchoolMode]);

  // Storage calculation for the active team
  useEffect(() => {
    if (!db || !activeTeam?.id) {
      setTotalStorageUsed(0);
      return;
    }

    const filesRef = collection(db, 'teams', activeTeam.id, 'files');
    return onSnapshot(filesRef, (snapshot) => {
      let total = 0;
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        total += data.sizeBytes || 0;
      });
      setTotalStorageUsed(total);
    });
  }, [db, activeTeam?.id]);

  const createTeamDocument = useCallback(async (docData: Partial<TeamDocument>) => {
    if (!db || !activeTeam?.id) return;
    const docRef = docData.id ? doc(db, 'teams', activeTeam.id, 'documents', docData.id) : doc(collection(db, 'teams', activeTeam.id, 'documents'));
    await setDoc(docRef, {
      ...docData,
      id: docRef.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }, [db, activeTeam?.id]);

  const hasFeature = useCallback((featureId: string) => {
    if (isSuperAdmin) return true;

    // Special handling for Club/League-restricted features
    if (featureId === 'league_generation') {
      // STARTER PLAN can now have 1 league as well
      return true; 
    }
    
    if (featureId === 'tournament_generation' || featureId === 'series_architect') {
      // Tournaments restricted to Pro/Elite
      if (!isPro) return false;

      // Elite Team/League Plan restriction: Only primary account holder
      // EXCEPT for schools where all sub-squads receive full access
      if (isEliteAccount && !isSchoolMode) {
        return activeTeam?.ownerUserId === userProfile?.id;
      }
      
      return true;
    }

    if (featureId === 'recruit_portal' || featureId === 'library_access') {
      // Accessible to all (Starter, Pro, Elite)
      return true;
    }

    if (featureId === 'schedule_architect' || featureId === 'public_portal_url') {
      // ONLY Pro accounts (Squad Pro, Elite, School)
      return isPro;
    }

    if (featureId === 'club_management') {
      // 1. School Admins always have club management
      if (isSchoolAdmin) return true;

      // 2. Elite level accounts (Elite, League, School) have club management
      if (isEliteAccount) return true;

      // 3. Fallback for Explicitly owner-managed clubs
      if (clubData && clubData.subscriptionStatus === 'active' && clubData.ownerUserId === userProfile?.id) return true;

      return false;
    }

    // General Feature Check
    const currentPlanId = activeTeam?.planId || userProfile?.plan_type || 'free';
    // Fallback mapping for demo plans to their parent features
    const effectivePlanId = currentPlanId === 'squad_pro_demo' ? 'team' : currentPlanId;
    
    const plan = plans.find(p => p.id === effectivePlanId);
    if (plan && plan.features?.[featureId] !== undefined) return !!plan.features?.[featureId];
    return ['live_feed_read', 'basic_scheduling', 'recruit_portal', 'library_access'].includes(featureId);
  }, [activeTeam, clubData, userProfile, plans, isSuperAdmin, isPro, isSchoolAdmin, teams, isEliteAccount, isSchoolMode]);

  // Parent Login Redirect: Automatically push parents to the Family Hub if they land on the main dashboard
  useEffect(() => {
    if (isAuthResolved && isParent && !isStaff && pathname === '/dashboard') {
      router.push('/family');
    }
  }, [isAuthResolved, isParent, isStaff, pathname, router]);


  const formatTime = useCallback((iso: string) => { try { return format(new Date(iso), 'h:mm a'); } catch (e) { return '--:--'; } }, []);

  // --- TACTICAL METHODS ---
  const getRecruitingProfile = useCallback(async (playerId: string) => { if (!db) return null; const snap = await getDoc(doc(db, 'players', playerId, 'recruitingProfile', 'profile')); return snap.exists() ? (snap.data() as RecruitingProfile) : null; }, [db]);
  // Include updatedByTeamId so Firestore rules can verify the caller owns that team.
  const updateRecruitingProfile = useCallback(async (playerId: string, data: Partial<RecruitingProfile>) => { if (!db) return; await setDoc(doc(db, 'players', playerId, 'recruitingProfile', 'profile'), { ...clean(data), updatedAt: serverTimestamp(), ...(activeTeam?.id ? { updatedByTeamId: activeTeam.id } : {}) }, { merge: true }); }, [db, activeTeam?.id]);
  const getAthleticMetrics = useCallback(async (playerId: string) => { if (!db) return null; const snap = await getDoc(doc(db, 'players', playerId, 'recruitingProfile', 'metrics')); return snap.exists() ? (snap.data() as AthleticMetrics) : null; }, [db]);
  const updateAthleticMetrics = useCallback(async (playerId: string, data: Partial<any>) => { if (!db) return; await setDoc(doc(db, 'players', playerId, 'recruitingProfile', 'metrics'), { ...clean(data), ...(activeTeam?.id ? { updatedByTeamId: activeTeam.id } : {}) }, { merge: true }); }, [db, activeTeam?.id]);
  const getPlayerStats = useCallback(async (playerId: string) => { if (!db) return []; const snap = await getDocs(collection(db, 'players', playerId, 'stats')); return snap.docs.map(d => ({ ...d.data(), id: d.id } as PlayerStat)); }, [db]);
  const addPlayerStat = useCallback(async (playerId: string, data: Partial<PlayerStat>) => { if (!db) return; await addDoc(collection(db, 'players', playerId, 'stats'), { ...clean(data), ...(activeTeam?.id ? { updatedByTeamId: activeTeam.id } : {}) }); }, [db, activeTeam?.id]);
  const updatePlayerStat = useCallback(async (playerId: string, statId: string, data: Partial<PlayerStat>) => { if (!db) return; await setDoc(doc(db, 'players', playerId, 'stats', statId), { ...clean(data), ...(activeTeam?.id ? { updatedByTeamId: activeTeam.id } : {}) }, { merge: true }); }, [db, activeTeam?.id]);
  const deletePlayerStat = useCallback(async (playerId: string, statId: string) => { if (!db) return; await deleteDoc(doc(db, 'players', playerId, 'stats', statId)); }, [db]);
  const getEvaluations = useCallback(async (playerId: string) => { if (!db) return []; const snap = await getDocs(query(collection(db, 'players', playerId, 'evaluations'), orderBy('createdAt', 'desc'))); return snap.docs.map(d => ({ ...d.data(), id: d.id } as PlayerEvaluation)); }, [db]);
  const addEvaluation = useCallback(async (playerId: string, data: Partial<PlayerEvaluation>) => { if (!db || !firebaseUser) return; await addDoc(collection(db, 'players', playerId, 'evaluations'), { ...clean(data), evaluatorId: firebaseUser.uid, createdAt: serverTimestamp(), ...(activeTeam?.id ? { updatedByTeamId: activeTeam.id } : {}) }); }, [db, firebaseUser, activeTeam?.id]);
  const getRecruitingContact = useCallback(async (playerId: string) => { if (!db) return null; const snap = await getDoc(doc(db, 'players', playerId, 'recruitingContact', 'contact')); return snap.exists() ? (snap.data() as RecruitingContact) : null; }, [db]);
  const updateRecruitingContact = useCallback(async (playerId: string, data: Partial<RecruitingContact>) => { if (!db) return; await setDoc(doc(db, 'players', playerId, 'recruitingContact', 'contact'), { ...clean(data), ...(activeTeam?.id ? { updatedByTeamId: activeTeam.id } : {}) }, { merge: true }); }, [db, activeTeam?.id]);
  const getPlayerVideos = useCallback(async (playerId: string) => { if (!db) return []; const snap = await getDocs(query(collection(db, 'players', playerId, 'videos'), orderBy('createdAt', 'desc'))); return snap.docs.map(d => ({ ...d.data(), id: d.id } as PlayerVideo)); }, [db]);
  const addPlayerVideo = useCallback(async (playerId: string, data: Partial<PlayerVideo>) => { if (!db) return; await addDoc(collection(db, 'players', playerId, 'videos'), { ...clean(data), createdAt: serverTimestamp(), ...(activeTeam?.id ? { updatedByTeamId: activeTeam.id } : {}) }); }, [db, activeTeam?.id]);
  const updatePlayerVideo = useCallback(async (playerId: string, videoId: string, data: Partial<PlayerVideo>) => { if (!db) return; await setDoc(doc(db, 'players', playerId, 'videos', videoId), { ...clean(data), ...(activeTeam?.id ? { updatedByTeamId: activeTeam.id } : {}) }, { merge: true }); }, [db, activeTeam?.id]);
  const deletePlayerVideo = useCallback(async (playerId: string, videoId: string) => { if (!db) return; await deleteDoc(doc(db, 'players', playerId, 'videos', videoId)); }, [db]);
  const toggleRecruitingProfile = useCallback(async (playerId: string, enabled: boolean) => { if (!db) return; await setDoc(doc(db, 'players', playerId), { recruitingProfileEnabled: enabled, ...(activeTeam?.id ? { updatedByTeamId: activeTeam.id } : {}) }, { merge: true }); }, [db, activeTeam?.id]);
  const updateStaffEvaluation = useCallback(async (memberId: string, notes: string) => { if (!activeTeam?.id || !db) return; await setDoc(doc(db, 'teams', activeTeam.id, 'members', memberId, 'staffEvaluation', 'current'), { notes, updatedAt: new Date().toISOString() }); }, [activeTeam, db]);
  const getStaffEvaluation = useCallback(async (memberId: string) => { if (!activeTeam?.id || !db) return ''; const snap = await getDoc(doc(db, 'teams', activeTeam.id, 'members', memberId, 'staffEvaluation', 'current')); return snap.exists() ? (snap.data()?.notes || '') : ''; }, [activeTeam, db]);

  const removeMember = useCallback(async (memberId: string, reason?: string) => {
    if (!activeTeam?.id || !db) return;
    try {
      const memberRef = doc(db, 'teams', activeTeam.id, 'members', memberId);
      const memberSnap = await getDoc(memberRef);
      if (memberSnap.exists()) {
        const mData = memberSnap.data();
        await updateDoc(memberRef, {
          status: 'removed',
          removalReason: reason || null,
          removedAt: new Date().toISOString()
        });
        
        // Also update their user profile record if they have a userId linked
        if (mData.userId) {
          await updateDoc(doc(db, 'users', mData.userId, 'teamMemberships', activeTeam.id), {
            status: 'removed'
          }).catch(() => {}); // Secondary record might not exist or be named differently
        }
        
        toast({ title: "Player Removed", description: "Member has been moved to the archived section." });
      }
    } catch (e) {
      console.error("Remove Member Error:", e);
      toast({ title: "Operation Failed", description: "Failed to remove member from active roster.", variant: "destructive" });
    }
  }, [activeTeam, db]);

  const reinstateMember = useCallback(async (memberId: string) => {
    if (!activeTeam?.id || !db) return;
    try {
      const memberRef = doc(db, 'teams', activeTeam.id, 'members', memberId);
      const memberSnap = await getDoc(memberRef);
      if (memberSnap.exists()) {
        const mData = memberSnap.data();
        await updateDoc(memberRef, {
          status: 'active',
          removalReason: deleteField(),
          removedAt: deleteField()
        });
        
        if (mData.userId) {
          await updateDoc(doc(db, 'users', mData.userId, 'teamMemberships', activeTeam.id), {
            status: 'active'
          }).catch(() => {});
        }
        
        toast({ title: "Player Reinstated", description: "Member is now back on the active roster." });
      }
    } catch (e) {
      console.error("Reinstate Member Error:", e);
      toast({ title: "Operation Failed", description: "Failed to reinstate member.", variant: "destructive" });
    }
  }, [activeTeam, db]);

  const createNewTeam = useCallback(async (name: string, type: any, pos: string, description?: string, planId?: string, customWaiverTitle?: string, customWaiverContent?: string, schoolId?: string, coachName?: string, coachEmail?: string, overrideOwnerId?: string) => { 
    if (!firebaseUser || !firebaseAuth || !db || !userProfile) return '';
    const token = await getAuthToken(firebaseAuth);
    const response = await fetch('/api/teams/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({
        name,
        type,
        position: pos,
        description,
        customWaiverTitle,
        customWaiverContent,
        schoolId:
          schoolId || (type === 'school_squad' && activeTeam?.id ? activeTeam.id : undefined),
        coachName,
        coachEmail,
        overrideOwnerId,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to create the team.');
    const tid = result.teamId as string;

    // Paid subscriptions may automatically allocate one available seat to a
    // newly created squad. The API derives eligibility and capacity server-side.
    const paidPlanTypes = new Set(['team', 'elite', 'league', 'school', 'squad_pro', 'squad_pro_demo']);
    if (paidPlanTypes.has((userProfile as any).plan_type) && proQuotaStatus.remaining > 0 && firebaseAuth) {
      try {
        const token = await getAuthToken(firebaseAuth);
        const allocationResponse = await fetch('/api/teams/allocate-pro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader(token) },
          body: JSON.stringify({ teamId: tid }),
        });
        if (!allocationResponse.ok) {
          const result = await allocationResponse.json();
          console.warn('[Team creation] Pro seat was not allocated:', result.error);
        }
      } catch (err) {
        console.warn('[Team creation] Pro seat allocation failed:', err);
      }
    }


    // Identity sweep: If the user has a name/avatar, update all their memberships to match
    try {
      const allMemberships = await getDocs(query(collectionGroup(db, 'members'), where('userId', '==', firebaseUser.uid)));
      if (!allMemberships.empty) {
        const sweepBatch = writeBatch(db);
        let hasUpdates = false;
        allMemberships.docs.forEach(mDoc => {
          const mData = mDoc.data();
          if (mData.name !== userProfile.name || mData.avatar !== userProfile.avatar) {
            sweepBatch.update(mDoc.ref, { name: userProfile.name, avatar: userProfile.avatar });
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
  }, [firebaseUser, firebaseAuth, db, userProfile, proQuotaStatus, activeTeam]);

  const joinTeamWithCode = useCallback(async (code: string, playerId: string, position: string) => { 
    if (!firebaseUser || !firebaseAuth) return false;
    const token = await getAuthToken(firebaseAuth);
    const response = await fetch('/api/teams/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({
        code,
        playerId,
        enrollmentIntent: position === 'Player' ? 'player' : undefined,
      }),
    });
    return response.ok;
  }, [firebaseUser, firebaseAuth]);


  const updateUser = useCallback(async (u: any) => { if (firebaseUser) await updateDoc(doc(db, 'users', firebaseUser.uid), clean(u)); }, [db, firebaseUser]);
  const updateTeam = useCallback(async (id: string, data: Partial<Team>) => { if (db) await updateDoc(doc(db, 'teams', id), clean(data)); }, [db]);
  const updateMember = useCallback(async (mid: string, u: any) => { 
    if (!isStaff) {
      toast({ title: "Strategic Restriction", description: "Only coaches and team staff can manage the squad directory.", variant: "destructive" });
      return;
    }
    if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id, 'members', mid), clean(u)); 
  }, [db, activeTeam, isStaff]);

  const updateTeamDetails = useCallback(async (u: any) => { 
    if (!isStaff) {
      toast({ title: "Authorization Denied", description: "Only admins can modify team identity settings.", variant: "destructive" });
      return;
    }
    if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id), clean(u)); 
  }, [db, activeTeam, isStaff]);

  const updateTeamHero = useCallback(async (url: string) => { 
    if (!isStaff) return;
    if (activeTeam?.id) await updateDoc(doc(db, 'teams', activeTeam.id), { heroImageUrl: url }); 
  }, [db, activeTeam, isStaff]);

  const updateTeamPlan = useCallback(async (tid: string, pid: string) => {
    if (!firebaseAuth) throw new Error('You must be signed in.');
    const token = await getAuthToken(firebaseAuth);
    const response = await fetch('/api/teams/allocate-pro', {
      method: pid === 'free' ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({ teamId: tid, ...(isSuperAdmin ? { planId: pid } : {}) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to update this team plan.');
    toast({ title: pid === 'free' ? 'Pro Slot Released' : 'Plan Assignment Updated' });
  }, [firebaseAuth, isSuperAdmin]);

  const checkCodeUniqueness = useCallback(async (code: string) => {
    if (!db) return true;
    const normalized = code.toUpperCase().trim();
    try {
      // Rigorous verification across all identity fields to ensure absolute uniqueness
      const q = query(
        collection(db, 'teams'), 
        or(
          where('inviteCode', '==', normalized),
          where('teamCode', '==', normalized),
          where('code', '==', normalized)
        ), 
        limit(1)
      );
      const snap = await getDocs(q);
      return snap.empty;
    } catch (e: any) {
      // Firestore rules block arbitrary queries across the 'teams' collection.
      // Since the code is a 10-character secure random string, collision chance is ~1/10^15.
      // It's safe to assume uniqueness if the permission is denied.
      console.warn("Could not verify code uniqueness due to permissions, assuming unique:", e);
      return true;
    }
  }, [db]);

  const updateTeamCode = useCallback(async (tid: string, newCode: string) => {
    if (!db) return;
    
    // Safety check for cooldown
    const teamDoc = await getDoc(doc(db, 'teams', tid));
    if (teamDoc.exists()) {
      const data = teamDoc.data();
      const lastUpdate = data.lastCodeEditedAt ? new Date(data.lastCodeEditedAt).getTime() : 0;
      if ((Date.now() - lastUpdate) < (24 * 60 * 60 * 1000)) {
        throw new Error('COOLDOWN_ACTIVE: Squad identity codes can only be modified once every 24 hours.');
      }
    }

    const code = newCode.toUpperCase();
    
    // Uniqueness validation
    const isUnique = await checkCodeUniqueness(code);
    if (!isUnique) {
      throw new Error('CODE_TAKEN: This squad identify code is already active in another organization.');
    }

    await updateDoc(doc(db, 'teams', tid), { 
      code, 
      teamCode: code, 
      inviteCode: code,
      lastCodeEditedAt: new Date().toISOString()
    });
    // Also update all memberships for the owner so their local list reflects the change
    if (firebaseUser) {
      const membershipRef = doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid);
      await updateDoc(membershipRef, { code });
    }
  }, [db, firebaseUser]);

  const resetSquadData = useCallback(async (cats: string[]) => { 
    if (!db || !firebaseUser?.uid) return; 
    
    try {
      const batch = writeBatch(db); 
      
      // 1. Wipe current active team data if exists
      if (activeTeam?.id) {
        const paths = ['games', 'events', 'members', 'incidents', 'equipment', 'groupChats', 'feedPosts', 'files', 'documents'];
        const collections = await Promise.all(
          paths.map(path => getDocs(collection(db, 'teams', activeTeam.id, path)))
        );
        collections.forEach(snap => snap.forEach(d => batch.delete(d.ref)));
      }

      // 2. AGGRESSIVE WIPE: Clear all memberships if doing complete wipe
      if (cats.includes('complete')) {
        const memberships = await getDocs(collection(db, 'users', firebaseUser.uid, 'teamMemberships'));
        memberships.forEach(d => batch.delete(d.ref));
        
        // Also clear children to ensure fresh household start
        const children = await getDocs(query(collection(db, 'players'), where('parentId', '==', firebaseUser.uid)));
        children.forEach(d => batch.delete(d.ref));
      }

      await batch.commit(); 
    } catch (error) {
      console.error("Reset Failure:", error);
      throw error;
    }
  }, [activeTeam, db, firebaseUser]);

  const signTeamDocument = useCallback(async (docId: string, sig: string, mid: string) => { 
    if (!activeTeam?.id || !firebaseAuth) return false;
    try {
      const token = await getAuthToken(firebaseAuth);
      if (!token) throw new Error('Your session has expired. Please sign in again.');
      const response = await fetch('/api/teams/waivers/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({
          teamId: activeTeam.id,
          memberId: mid,
          documentId: docId,
          signatureName: sig,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to sign this waiver.');
      return true;
    } catch (error) {
      toast({
        title: 'Signature Failed',
        description: error instanceof Error ? error.message : 'Unable to sign this waiver.',
        variant: 'destructive',
      });
      return false;
    }
  }, [activeTeam?.id, firebaseAuth]);

  const addTeamDocument = useCallback(async (data: any) => { 
    if (!isStaff) {
      toast({ title: "Vault Access Denied", description: "Only staff can archive new organizational documents.", variant: "destructive" });
      return;
    }
    if (activeTeam?.id && db) {
      await setDoc(doc(db, 'teams', activeTeam.id, 'documents', data.id), clean({ ...data, teamId: activeTeam.id, ownerUserId: activeTeam.ownerUserId, createdAt: new Date().toISOString() }));

      // Fire push + email to all team members
      if (!activeTeam.isDemo) Promise.resolve().then(async () => {
        try {
          const { getAuth } = await import('firebase/auth');
          const { getApp } = await import('firebase/app');
          const currentUser = getAuth(getApp()).currentUser;
          if (!currentUser) return;
          const idToken = await currentUser.getIdToken();
          const { generalNotificationEmail: _genEmail } = await import('@/lib/email-templates');
          const memberUserIds = members.map(m => m.userId).filter((id): id is string => !!id && id !== currentUser.uid);
          const { subject: emailSubject, html: emailHtml } = _genEmail({
            recipientName: 'Team Member',
            title: `Document Requires Your Signature`,
            message: `A new document "${data.title}" has been added to ${activeTeam.name} and may require your signature.`,
            teamName: activeTeam.name,
            ctaLabel: 'View Document',
            ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL || ''}/dashboard/team`,
          });
          dispatchNotification({
            idToken,
            db,
            teamId: activeTeam.id,
            memberUserIds,
            title: 'Document Added',
            body: `"${data.title}" — check for signature requirements.`,
            url: '/dashboard/team',
            emailSubject,
            emailHtml,
          });
        } catch { /* ignore */ }
      });
    }
  }, [db, activeTeam, isStaff, members]);

  const updateTeamDocument = useCallback(async (docId: string, data: any) => { 
    if (!isStaff) return;
    if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'documents', docId), clean(data)); 
  }, [db, activeTeam, isStaff]);

  const deleteTeamDocument = useCallback(async (docId: string) => {
    if (!isStaff) return;
    if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'documents', docId));
  }, [db, activeTeam, isStaff]);

  const addEvent = useCallback(async (data: any) => { 
    if (!isStaff) {
      toast({ title: "Scheduling Restricted", description: "Only staff members can coordinate team calendar events.", variant: "destructive" });
      return false;
    }
    if (activeTeam?.id && db) {
      if (!firebaseAuth) throw new Error('Your session is unavailable. Refresh and try again.');
      const token = await getAuthToken(firebaseAuth);
      if (!token) throw new Error('Your session has expired. Sign in again.');
      const response = await fetch('/api/teams/events/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({ action: 'create', teamId: activeTeam.id, event: clean(data) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to create this event.');

      // Fire push + email to all team members
      if (!activeTeam.isDemo) Promise.resolve().then(async () => {
        try {
          const { getAuth } = await import('firebase/auth');
          const { getApp } = await import('firebase/app');
          const currentUser = getAuth(getApp()).currentUser;
          if (!currentUser) return;
          const idToken = await currentUser.getIdToken();
          const { eventNotificationEmail } = await import('@/lib/email-templates');
          const memberUserIds = members.map(m => m.userId).filter((id): id is string => !!id && id !== currentUser.uid);
          const eventTitle = data.title || data.name || 'New Event';
          const eventDate = data.date || data.startDate || '';
          const eventType = data.type || 'event';
          const { subject: emailSubject, html: emailHtml } = eventNotificationEmail({
            recipientName: 'Team Member',
            teamName: activeTeam.name,
            eventTitle,
            eventDate,
            eventTime: data.time || data.startTime,
            location: data.location,
            eventType,
          });
          dispatchNotification({
            idToken,
            db,
            teamId: activeTeam.id,
            memberUserIds,
            title: `${eventType === 'game' ? '⚽ Game Day' : eventType === 'practice' ? '🏃 Practice' : '📅 Event'}: ${eventTitle}`,
            body: `${eventDate}${data.time ? ' at ' + data.time : ''}${data.location ? ' · ' + data.location : ''}`,
            url: '/dashboard/team',
            emailSubject,
            emailHtml,
          });
        } catch { /* ignore */ }
      });

      return true;
    }
    return false;
  }, [db, activeTeam, isStaff, members, firebaseAuth]);

  const updateEvent = useCallback(async (id: string, data: any) => { 
    if (!isStaff) return false;
    if (activeTeam?.id && firebaseAuth) {
      const token = await getAuthToken(firebaseAuth);
      if (!token) throw new Error('Your session has expired. Sign in again.');
      const response = await fetch('/api/teams/events/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({ action: 'update', teamId: activeTeam.id, eventId: id, event: clean(data) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to update this event.');
      return true;
    }
    return false; 
  }, [activeTeam, isStaff, firebaseAuth]);

  const deleteEvent = useCallback(async (id: string) => { 
    if (!isStaff) return;
    if (activeTeam?.id && firebaseAuth) {
      const token = await getAuthToken(firebaseAuth);
      if (!token) throw new Error('Your session has expired. Sign in again.');
      const response = await fetch('/api/teams/events/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({ action: 'delete', teamId: activeTeam.id, eventId: id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to delete this event.');
    }
  }, [activeTeam, isStaff, firebaseAuth]);
  const updateRSVP = useCallback(async (eventId: string, status: string, teamId?: string, userId?: string) => { 
    const tid = teamId || activeTeam?.id;
    const uid = userId || firebaseUser?.uid;

    // RSVP Hygiene: Parents can ONLY RSVP for their children, not their own root account
    if (isParent && !isStaff) {
      if (!uid) return;
      const isMyChild = (myChildren || []).some(c => c.id === uid || (c as any).userId === uid);
      if (uid === firebaseUser?.uid && !isMyChild) {
        toast({ 
          title: "Strategic Restriction", 
          description: "Guardians coordinate through athlete profiles. Use the Family Hub to manage RSVPs for your children.", 
          variant: "destructive" 
        });
        return;
      }
      if (!isMyChild && uid !== firebaseUser?.uid) {
         toast({ 
           title: "Coordination Denied", 
           description: "You can only manage RSVPs for members of your own household.", 
           variant: "destructive" 
         });
         return;
      }
    }

    console.log(`[RSVP] Updating RSVP: Event ${eventId}, Status ${status}, Team ${tid}, User ${uid}`);
    if (tid && uid && db) {
      const token = await getAuthToken(firebaseAuth);
      const response = await fetch('/api/teams/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({
          teamId: tid,
          eventId,
          participantId: uid,
          status,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Unable to update RSVP.');
      }
    } else {
      console.error(`[RSVP] Failed: tid=${tid}, uid=${uid}, db=${!!db}`);
    }
  }, [db, activeTeam, firebaseUser, firebaseAuth, isParent, isStaff, myChildren]);

  const claimAssignment = useCallback(async (eventId: string, assignmentId: string) => {
    if (!activeTeam?.id || !firebaseAuth) return false;
    try {
      const token = await getAuthToken(firebaseAuth);
      if (!token) throw new Error('Your session has expired. Please sign in again.');
      const response = await fetch('/api/teams/events/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({
          action: 'claim-assignment',
          teamId: activeTeam.id,
          eventId,
          assignmentId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to claim this assignment.');
      toast({
        title: 'Assignment Secured',
        description: 'You have been deployed for this task. The coaching staff has been notified.',
      });
      return true;
    } catch (error) {
      toast({
        title: 'Assignment Claim Failed',
        description: error instanceof Error ? error.message : 'Unable to claim this assignment.',
        variant: 'destructive',
      });
      return false;
    }
  }, [activeTeam?.id, firebaseAuth]);

  const addMessage = useCallback(async (chatId: string, author: string, content: string, type: string, img?: string, poll?: any, teamId?: string) => {
    const targetTeamId = teamId || activeTeam?.id;
    if (!targetTeamId || !firebaseAuth) return;
    const token = await getAuthToken(firebaseAuth);
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const response = await fetch('/api/teams/chat/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({ teamId: targetTeamId, chatId, author, content, type, imageUrl: img || null, poll: poll || null }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Unable to send this tactical message.');
  }, [activeTeam, firebaseAuth]);

  const deleteMessage = useCallback(async (chatId: string, messageId: string) => { 
    if (activeTeam?.id && db) {
      await deleteDoc(doc(db, 'teams', activeTeam.id, 'groupChats', chatId, 'messages', messageId));
    }
  }, [activeTeam, db]);
  const createChat = useCallback(async (name: string, members: string[], contextId?: string) => {
    if (!activeTeam?.id || !firebaseAuth) return '';
    const token = await getAuthToken(firebaseAuth);
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const response = await fetch('/api/teams/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({
        teamId: activeTeam.id,
        contextId: contextId || `team:${activeTeam.id}`,
        name,
        memberIds: members,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Unable to create this tactical chat.');
    return payload.chatId as string;
  }, [activeTeam, firebaseAuth]);
  const deleteChat = useCallback(async (chatId: string) => { if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'groupChats', chatId), { isDeleted: true }); }, [activeTeam, db]);
  const hideChatForUser = useCallback(async (chatId: string) => { if (!firebaseUser || !db) return; await setDoc(doc(db, 'users', firebaseUser.uid, 'hiddenChats', chatId), { id: `${firebaseUser.uid}_${chatId}`, userId: firebaseUser.uid, chatId, hiddenAt: new Date().toISOString() }); }, [firebaseUser, db]);
  
  const votePoll = useCallback(async (chatId: string, messageId: string, optionIdx: number, teamId?: string) => {
    const targetTeamId = teamId || activeTeam?.id;
    if (!targetTeamId || !firebaseAuth) return;
    try {
      const idToken = await getAuthToken(firebaseAuth);
      if (!idToken) throw new Error('Your session has expired.');
      const response = await fetch('/api/teams/chat/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(idToken) },
        body: JSON.stringify({ teamId: targetTeamId, chatId, messageId, optionIdx }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Unable to record your vote.');
    } catch (error: any) {
      toast({ title: 'Vote Not Recorded', description: error.message, variant: 'destructive' });
    }
  }, [activeTeam, firebaseAuth]);

  const updateChat = useCallback(async (chatId: string, data: any) => { if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'groupChats', chatId), clean(data)); }, [activeTeam, db]);

  const addVolunteerOpportunity = useCallback(async (data: any) => { if (activeTeam?.id && db) await addDoc(collection(db, 'teams', activeTeam.id, 'volunteers'), clean({ ...data, signups: {} })); }, [activeTeam, db]);
  const updateVolunteerOpportunity = useCallback(async (oppId: string, updates: any) => { if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), clean(updates)); }, [activeTeam, db]);
  const deleteVolunteerOpportunity = useCallback(async (oppId: string) => { if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId)); }, [activeTeam, db]);
  const publicSignUpForVolunteer = useCallback(async (teamId: string, oppId: string, data: any) => { if (db) await updateDoc(doc(db, 'teams', teamId, 'volunteers', oppId), { [`signups.${data.name.replace(/\s+/g, '')}_${Date.now()}`]: { userId: `public_${Date.now()}`, userName: data.name, email: data.email, phone: data.phone, isConfirmed: false, status: 'pending', createdAt: new Date().toISOString() } }); }, [db]);
  const signUpForVolunteer = useCallback(async (oppId: string) => { if (activeTeam?.id && firebaseUser && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), { [`signups.${firebaseUser.uid}`]: { userId: firebaseUser.uid, userName: userProfile?.name, email: firebaseUser.email, isConfirmed: false, status: 'pending', createdAt: new Date().toISOString() } }); }, [activeTeam, firebaseUser, db, userProfile]);
  const confirmVolunteerAttendance = useCallback(async (oppId: string, userId: string, confirmed: boolean) => { if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'volunteers', oppId), { [`signups.${userId}.isConfirmed`]: confirmed }); }, [activeTeam, db]);

  const addFundraisingOpportunity = useCallback(async (data: any) => {
    if (!activeTeam?.id || !db) return undefined;
    const created = await addDoc(
      collection(db, 'teams', activeTeam.id, 'fundraising'),
      clean({ ...data, currentAmount: 0, finances: {} })
    );
    return created.id;
  }, [activeTeam, db]);
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

  const addGame = useCallback(async (data: any) => { if (activeTeam?.id && db) await addDoc(collection(db, 'teams', activeTeam.id, 'games'), clean({ ...data, teamId: activeTeam.id })); }, [activeTeam, db]);
  const updateGame = useCallback(async (id: string, data: any) => { if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'games', id), clean({ ...data, teamId: activeTeam.id })); }, [activeTeam, db]);

  const addEquipmentItem = useCallback(async (data: any) => {
    if (!activeTeam?.id || !db) return;
    const sizeStock = data.sizeStock && typeof data.sizeStock === 'object'
      ? data.sizeStock as Record<string, number>
      : undefined;
    const sizeTotal = sizeStock
      ? Object.values(sizeStock).reduce((sum, quantity) => sum + Math.max(0, Number(quantity) || 0), 0)
      : 0;
    const totalQuantity = sizeTotal > 0 ? sizeTotal : Math.max(0, parseInt(data.totalQuantity) || 0);
    await addDoc(
      collection(db, 'teams', activeTeam.id, 'equipment'),
      clean({
        ...data,
        sizeStock,
        assignments: {},
        status: 'Active',
        availableQuantity: totalQuantity,
        totalQuantity,
      })
    );
  }, [activeTeam, db]);
  const updateEquipmentItem = useCallback(async (id: string, updates: any) => {
    if (!activeTeam?.id || !db) return;
    const equipmentRef = doc(db, 'teams', activeTeam.id, 'equipment', id);
    if (!('totalQuantity' in updates)) {
      await updateDoc(equipmentRef, clean(updates));
      return;
    }

    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(equipmentRef);
      if (!snapshot.exists()) throw new Error('Equipment item no longer exists.');

      const data = snapshot.data();
      const currentAssignments = Object.values(data.assignments || {}) as any[];
      const assignedCount = currentAssignments.reduce(
        (sum, assignment) => sum + (Number(assignment.quantity) || 0),
        0
      );
      const requestedSizeStock = updates.sizeStock && typeof updates.sizeStock === 'object'
        ? updates.sizeStock as Record<string, number>
        : undefined;
      const sizeTotal = requestedSizeStock
        ? Object.values(requestedSizeStock).reduce(
            (sum, quantity) => sum + Math.max(0, Number(quantity) || 0),
            0
          )
        : 0;

      if (requestedSizeStock) {
        const assignedBySize = currentAssignments.reduce<Record<string, number>>((totals, assignment) => {
          if (!assignment.size) {
            throw new Error('Return existing assignments without a sub-item before enabling sub-item stock.');
          }
          totals[assignment.size] = (totals[assignment.size] || 0) + (Number(assignment.quantity) || 0);
          return totals;
        }, {});
        for (const [size, assigned] of Object.entries(assignedBySize)) {
          if (assigned > (Number(requestedSizeStock[size]) || 0)) {
            throw new Error(`Cannot reduce ${size} stock below the quantity currently signed out.`);
          }
        }
      }

      const newTotal = sizeTotal > 0
        ? sizeTotal
        : Math.max(0, parseInt(updates.totalQuantity) || 0);
      if (newTotal < assignedCount) {
        throw new Error('Total stock cannot be lower than the quantity currently signed out.');
      }
      const availableQuantity = newTotal - assignedCount;
      transaction.update(equipmentRef, clean({
        ...updates,
        totalQuantity: newTotal,
        availableQuantity,
        status: availableQuantity > 0 ? 'Active' : data.status,
      }));
    });
  }, [activeTeam, db]);
  const deleteEquipmentItem = useCallback(async (id: string) => { if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'equipment', id)); }, [activeTeam, db]);
  const assignEquipment = useCallback(async (
    id: string,
    uid: string,
    uname: string,
    q: number,
    details?: { size?: string; jerseyNumber?: string }
  ) => {
    if (activeTeam?.id && db) {
      const equipmentRef = doc(db, 'teams', activeTeam.id, 'equipment', id);
      await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(equipmentRef);
        if (!snapshot.exists()) throw new Error('Equipment item no longer exists.');
        const data = snapshot.data();
        const assignments = data.assignments || {};
        if (assignments[uid]) {
          throw new Error('This member already has this equipment signed out. Return it before assigning another.');
        }
        if (!Number.isInteger(q) || q <= 0 || q > (Number(data.availableQuantity) || 0)) {
          throw new Error('The requested quantity is not available.');
        }

        const sizeStock = data.sizeStock && typeof data.sizeStock === 'object'
          ? data.sizeStock as Record<string, number>
          : {};
        const sizes = Object.keys(sizeStock);
        if (sizes.length > 0) {
          const selectedSize = details?.size?.trim();
          if (!selectedSize || !(selectedSize in sizeStock)) {
            throw new Error('Select an available stock sub-item.');
          }
          const assignedForSize = Object.values(assignments as Record<string, any>)
            .filter(assignment => assignment.size === selectedSize)
            .reduce((sum, assignment) => sum + (Number(assignment.quantity) || 0), 0);
          if (assignedForSize + q > (Number(sizeStock[selectedSize]) || 0)) {
            throw new Error(`${selectedSize} does not have enough stock available.`);
          }
        }

        transaction.update(equipmentRef, {
          [`assignments.${uid}`]: clean({
            userId: uid,
            userName: uname,
            quantity: q,
            date: new Date().toISOString(),
            size: details?.size,
            jerseyNumber: details?.jerseyNumber,
          }),
          availableQuantity: increment(-q),
        });
      });
    }
  }, [activeTeam, db]);
  const returnEquipment = useCallback(async (id: string, uid: string) => {
    if (!activeTeam?.id || !db) return;
    const equipmentRef = doc(db, 'teams', activeTeam.id, 'equipment', id);
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(equipmentRef);
      if (!snapshot.exists()) return;
      const assignment = snapshot.data().assignments?.[uid];
      if (!assignment) return;
      transaction.update(equipmentRef, {
        [`assignments.${uid}`]: deleteField(),
        availableQuantity: increment(Number(assignment.quantity) || 0),
      });
    });
  }, [activeTeam, db]);

  const addDrill = useCallback(async (d: any) => { 
    if (!isStaff) return;
    if (activeTeam?.id && db) {
      await addDoc(collection(db, 'teams', activeTeam.id, 'drills'), { ...clean(d), createdAt: new Date().toISOString() });

      // Fire push + email to all team members
      if (!activeTeam.isDemo) Promise.resolve().then(async () => {
        try {
          const { getAuth } = await import('firebase/auth');
          const { getApp } = await import('firebase/app');
          const currentUser = getAuth(getApp()).currentUser;
          if (!currentUser) return;
          const idToken = await currentUser.getIdToken();
          const { drillNotificationEmail } = await import('@/lib/email-templates');
          const memberUserIds = members.map(m => m.userId).filter((id): id is string => !!id && id !== currentUser.uid);
          const { subject: emailSubject, html: emailHtml } = drillNotificationEmail({
            recipientName: 'Team Member',
            teamName: activeTeam.name,
            drillTitle: d.title || d.name || 'New Drill',
            drillDescription: d.description,
          });
          dispatchNotification({
            idToken,
            db,
            teamId: activeTeam.id,
            memberUserIds,
            title: `New Drill: ${d.title || d.name || 'Playbook Update'}`,
            body: `${activeTeam.name} playbook has a new drill. Check it out.`,
            url: '/dashboard/team',
            emailSubject,
            emailHtml,
          });
        } catch { /* ignore */ }
      });
    }
  }, [activeTeam, db, isStaff, members]);

  const updateDrill = useCallback(async (drillId: string, d: any) => {
    if (!isStaff) return;
    if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'drills', drillId), { ...clean(d), updatedAt: new Date().toISOString() });
  }, [activeTeam, db, isStaff]);

  const deleteDrill = useCallback(async (drillId: string) => { 
    if (!isStaff) return;
    if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'drills', drillId)); 
  }, [activeTeam, db, isStaff]);

  const assignDrillsToEvent = useCallback(async (eventId: string, drillIds: string[]) => {
    if (!isStaff || !activeTeam?.id || !db) return;
    try {
      await updateDoc(doc(db, 'teams', activeTeam.id, 'events', eventId), {
        drillIds,
        updatedAt: serverTimestamp()
      });
      toast({ title: "Itinerary Updated", description: "Drills successfully injected into practice." });
    } catch (e) {
      console.error("Assign Drills Error:", e);
      toast({ title: "Injection Failed", description: "Failed to map drills to event.", variant: "destructive" });
    }
  }, [activeTeam, db, isStaff]);

  const addPracticeTemplate = useCallback(async (data: any) => { 
    if (!isStaff) return;
    if (activeTeam?.id && db && firebaseUser) await addDoc(collection(db, 'teams', activeTeam.id, 'practice_templates'), { ...clean(data), teamId: activeTeam.id, createdBy: firebaseUser.uid, createdAt: new Date().toISOString() }); 
  }, [activeTeam, db, isStaff, firebaseUser]);

  const updatePracticeTemplate = useCallback(async (templateId: string, data: any) => {
    if (!isStaff) return;
    if (activeTeam?.id && db) await updateDoc(doc(db, 'teams', activeTeam.id, 'practice_templates', templateId), { ...clean(data), updatedAt: new Date().toISOString() });
  }, [activeTeam, db, isStaff]);

  const deletePracticeTemplate = useCallback(async (templateId: string) => { 
    if (!isStaff) return;
    if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'practice_templates', templateId)); 
  }, [activeTeam, db, isStaff]);
  const addFile = useCallback(async (n: string, t: string, sb: number, u: string, c: string, d?: string) => { 
    if (!activeTeam?.id || !db) return;

    // Starter Plan Storage Check
    const STARTER_LIMIT = 500 * 1024 * 1024; // 500MB
    if (isStarter && (totalStorageUsed + sb) > STARTER_LIMIT) {
      toast({
        title: "Storage Limit Exceeded",
        description: "Your starter plan is capped at 500MB. Please upgrade to Pro for unlimited storage.",
        variant: "destructive"
      });
      return;
    }

    await addDoc(collection(db, 'teams', activeTeam.id, 'files'), clean({ name: n, type: t, sizeBytes: sb, size: `${Math.round(sb/1024)}KB`, url: u, category: c, description: d, date: new Date().toISOString() })); 
  }, [activeTeam, db, isStarter, totalStorageUsed]);
  const deleteFile = useCallback(async (id: string) => { 
    if (!isStaff) return;
    if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'files', id)); 
  }, [db, activeTeam, isStaff]);

  const addFacility = useCallback(async (d: any) => { if (firebaseUser && db) await addDoc(collection(db, 'facilities'), clean({ ...d, clubId: firebaseUser.uid })); }, [db, firebaseUser]);
  const updateFacility = useCallback(async (id: string, d: Partial<Facility>) => {
    if (!firebaseAuth) throw new Error('Authentication is unavailable.');
    const idToken = await getAuthToken(firebaseAuth);
    if (!idToken) throw new Error('Your session has expired. Please sign in again.');
    const response = await fetch('/api/facilities/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(idToken) },
      body: JSON.stringify({ facilityId: id, facilityUpdates: d }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Unable to update the facility.');
  }, [firebaseAuth]);

  const deleteFacility = useCallback(async (id: string) => {
    if (!firebaseAuth) throw new Error('Authentication is unavailable.');
    const idToken = await getAuthToken(firebaseAuth);
    if (!idToken) throw new Error('Your session has expired. Please sign in again.');
    const response = await fetch('/api/facilities/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(idToken) },
      body: JSON.stringify({ facilityId: id }),
    });
    const payload = await response.json();
    if (!response.ok) {
      const counts = payload.dependencies;
      const details = counts
        ? ` Linked records: ${counts.events} event(s) and ${counts.leagues} league(s)${
            counts.examples?.length ? `, including ${counts.examples.join(', ')}` : ''
          }.`
        : '';
      throw new Error(`${payload.error || 'Unable to delete the facility.'}${details}`);
    }
  }, [firebaseAuth]);
  const addField = useCallback(async (fid: string, n: string) => { if(db) await addDoc(collection(db, 'facilities', fid, 'fields'), { name: n, facilityId: fid }); }, [db]);
  const updateFacilityField = useCallback(async (facilityId: string, fieldId: string, name: string) => {
    if (!firebaseAuth) throw new Error('Authentication is unavailable.');
    const idToken = await getAuthToken(firebaseAuth);
    if (!idToken) throw new Error('Your session has expired. Please sign in again.');
    const response = await fetch('/api/facilities/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(idToken) },
      body: JSON.stringify({ facilityId, fieldId, fieldName: name }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Unable to rename the facility resource.');
  }, [firebaseAuth]);
  const deleteFacilityField = useCallback(async (facilityId: string, fieldId: string) => {
    if (!fieldId) return;
    if (!firebaseAuth) throw new Error('Authentication is unavailable.');
    const idToken = await getAuthToken(firebaseAuth);
    if (!idToken) throw new Error('Your session has expired. Please sign in again.');
    const response = await fetch('/api/facilities/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(idToken) },
      body: JSON.stringify({ facilityId, fieldId }),
    });
    const payload = await response.json();
    if (!response.ok) {
      const counts = payload.dependencies;
      const details = counts
        ? ` Linked records: ${counts.events} event(s) and ${counts.leagues} league(s)${
            counts.examples?.length ? `, including ${counts.examples.join(', ')}` : ''
          }.`
        : '';
      throw new Error(
        `${payload.error || 'Unable to delete the facility resource.'}${details}`
      );
    }
  }, [firebaseAuth]);

  const createLeague = useCallback(async (name: string, divisionTitle?: string, sport?: string) => { 
    if (!firebaseUser || !firebaseAuth || !db) return '';
    if (!activeTeam && userProfile?.role !== 'league_creator') return '';
    const token = await getAuthToken(firebaseAuth);
    const response = await fetch('/api/leagues/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({
        name,
        divisionTitle,
        sport: sport || activeTeam?.sport,
        teamId: activeTeam?.id,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to create the league.');
    return result.leagueId as string;
  }, [firebaseUser, firebaseAuth, db, activeTeam, userProfile]);
  
  const updateLeague = useCallback(async (leagueId: string, updates: Partial<League>) => { 
    if (!db) return; 
    await updateDoc(doc(db, 'leagues', leagueId), clean(updates)); 
  }, [db]);

  /**
   * Propagates a newly uploaded team logo URL to all leagues this team is enrolled in.
   * Call this immediately after updating the team document's teamLogoUrl field so
   * that league.teams[teamId].teamLogoUrl stays in sync everywhere.
   */
  const propagateLogoToLeagues = useCallback(async (teamId: string, logoUrl: string) => {
    if (!db || !teamId || !logoUrl) return;
    try {
      const q = query(collection(db, 'leagues'), where('memberTeamIds', 'array-contains', teamId));
      const snap = await getDocs(q);
      const updates = snap.docs.map(leagueDoc =>
        updateDoc(leagueDoc.ref, { [`teams.${teamId}.teamLogoUrl`]: logoUrl })
      );
      await Promise.all(updates);
    } catch (e) {
      console.warn('[propagateLogoToLeagues] Failed to sync logo to leagues:', e);
    }
  }, [db]);

  const addLeagueGame = useCallback(async (lId: string, game: any) => {
    if (!firebaseAuth) throw new Error('Your session is unavailable. Refresh and try again.');
    const token = await getAuthToken(firebaseAuth);
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const response = await fetch('/api/leagues/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({ action: 'append', leagueId: lId, game }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = Array.isArray(payload.conflicts) && payload.conflicts.length > 0
        ? ` ${payload.conflicts[0]}`
        : '';
      throw new Error(`${payload.error || 'Unable to add the league match.'}${detail}`);
    }
  }, [firebaseAuth]);

  const updateLeagueSchedule = useCallback(async (lId: string, s: any[]) => { 
    if (!firebaseAuth) throw new Error('Your session is unavailable. Refresh and try again.');
    const token = await getAuthToken(firebaseAuth);
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const response = await fetch('/api/leagues/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({ action: 'replace', leagueId: lId, games: s }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = Array.isArray(payload.conflicts) && payload.conflicts.length > 0
        ? ` ${payload.conflicts[0]}`
        : '';
      throw new Error(`${payload.error || 'Unable to deploy the league schedule.'}${detail}`);
    }
    toast({ title: "Season Synchronized", description: "League matches pushed to all squad itineraries." });
  }, [firebaseAuth]);

  const removeTeamFromLeague = useCallback(async (lId: string, tId: string) => {
    if (!firebaseAuth) return;
    const token = await getAuthToken(firebaseAuth);
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const response = await fetch('/api/leagues/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({ action: 'remove-team', leagueId: lId, teamId: tId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Unable to remove the team from the league.');
    toast({ title: "Squad Excised", description: "Team removed from league standings." });
  }, [firebaseAuth]);

  const inviteTeamToLeague = useCallback(async (lId: string, lN: string, e: string, tN?: string) => {
    if (db) {
      await addDoc(collection(db, 'leagues', lId, 'invites'), clean({
        leagueId: lId,
        leagueName: lN,
        invitedEmail: e.trim().toLowerCase(),
        teamName: tN,
        status: 'pending',
        createdAt: new Date().toISOString(),
      }));
    }
  }, [db]);
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

    const isTournamentEntry = targetType === 'teams' && Boolean(eventId);
    const entryParentRef = isTournamentEntry
      ? doc(db, 'teams', tId, 'events', eventId as string)
      : doc(db, targetType || 'leagues', tId);

    // Fetch config to get waiver texts for archiving
    let waiverTextToStore = "";
    try {
      const configSnap = await getDoc(doc(collection(entryParentRef, 'registration'), pId));
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

    // Snapshot the registration fee so financial reports remain stable if the
    // organizer changes the configured fee later.
    let snapshotRegistrationCost = 0;
    try {
      const feeSnap = await getDoc(entryParentRef);
      if (feeSnap.exists()) {
        const feeData = feeSnap.data();
        snapshotRegistrationCost = parseFloat(feeData?.registrationCost || feeData?.registration_cost || '0') || 0;
      }
    } catch { /* non-blocking — fee defaults to 0 */ }

    const entryData: any = { 
      league_id: tId, 
      protocol_id: pId, 
      answers: a, 
      form_version: v, 
      waiver_signed_text: waiverTextToStore || signature, 
      signature_date: signature ? new Date().toISOString() : null,
      status: 'pending',
      registrationCost: snapshotRegistrationCost,   // ← snapshot fee at submission time
      payment_received: false,                       // ← explicit default for filter queries
      created_at: new Date().toISOString(),
      createdAt: new Date().toISOString()            // ← both field names for compatibility
    };
    if ((pId === 'team_config' || pId === 'player_config') && a.manual_enrollment) {
      entryData.status = 'accepted';
    }
    const collectionPath = targetType || 'leagues';
    const ref = await addDoc(collection(entryParentRef, 'registrationEntries'), clean(entryData));
    
    // Universal Waiver Archiving
    if (signature) {
      const archId = `arch_waiver_${ref.id}`;
      await setDoc(doc(collection(entryParentRef, 'archived_waivers'), archId), clean({
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
              teamLogoUrl: a.teamLogoUrl || teamsRaw.find(t => t.name === teamName)?.teamLogoUrl || '', 
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
              logoUrl: a.teamLogoUrl || '',
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


  const assignEntryToTeam = useCallback(async (leagueId: string, entryId: string, teamId: string | null) => { 
    if (!isStaff && !isPrimaryClubAuthority) {
      toast({ title: "Roster Provisioning Denied", description: "Only authorized officials can assign personnel.", variant: "destructive" });
      return;
    }
    if (!firebaseAuth) return;
    try {
      const token = await getAuthToken(firebaseAuth);
      if (!token) throw new Error('Your session has expired. Please sign in again.');
      const response = await fetch('/api/leagues/assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({ action: 'assign', leagueId, entryId, teamId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to assign this registration.');
    } catch (error) {
      toast({
        title: 'Assignment Failed',
        description: error instanceof Error ? error.message : 'Unable to assign this registration.',
        variant: 'destructive',
      });
    }
  }, [firebaseAuth, isStaff, isPrimaryClubAuthority]);
  const toggleRegistrationPaymentStatus = useCallback(async (leagueId: string, entryId: string, paid: boolean) => { if (!db) return; await updateDoc(doc(db, 'leagues', leagueId, 'registrationEntries', entryId), { payment_received: paid }); }, [db]);
  
  const respondToAssignment = useCallback(async (contextId: string, entryId: string, status: 'accepted' | 'declined') => { 
    if (!activeTeam?.id || !firebaseAuth) return false;
    try {
      const token = await getAuthToken(firebaseAuth);
      if (!token) throw new Error('Your session has expired. Please sign in again.');
      const response = await fetch('/api/leagues/assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({
          action: 'respond',
          leagueId: contextId,
          entryId,
          teamId: activeTeam.id,
          status,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to respond to this assignment.');
      toast({ title: status === 'accepted' ? 'Assignment Accepted' : 'Assignment Declined' });
      return true;
    } catch (error) {
      toast({
        title: 'Assignment Update Failed',
        description: error instanceof Error ? error.message : 'Unable to respond to this assignment.',
        variant: 'destructive',
      });
      return false;
    }
  }, [activeTeam?.id, firebaseAuth]);

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
  const registerChild = useCallback(async (first: string, last: string, dob: string, email?: string) => { 
    if (!firebaseUser || !db) return null; 
    const cid = `child_${Date.now()}`; 
    await setDoc(doc(db, 'players', cid), clean({ 
      id: cid, 
      firstName: first, 
      lastName: last, 
      dateOfBirth: dob, 
      isMinor: true, 
      parentId: firebaseUser.uid, 
      joinedTeamIds: [], 
      recruitingProfileEnabled: false,
      pendingInviteEmail: email || null,
      createdAt: new Date().toISOString() 
    }));
    return cid;
  }, [db, firebaseUser]);

  const updateChild = useCallback(async (childId: string, updates: Partial<PlayerProfile>) => { 
    if (db) await updateDoc(doc(db, 'players', childId), clean(updates)); 
  }, [db]);

  const revokeChildInvite = useCallback(async (childId: string) => {
    if (!firebaseAuth) return;
    try {
      const idToken = await getAuthToken(firebaseAuth);
      if (!idToken) throw new Error('Your session has expired. Please sign in again.');
      const response = await fetch('/api/invites/youth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(idToken) },
        body: JSON.stringify({ action: 'revoke', childId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to revoke invitation.');
      toast({ title: "Invite Revoked", description: "The invitation has been canceled." });
    } catch (err) {
      console.error('[YouthInvite] Failed to revoke invite:', err);
      toast({ title: "Error", description: "Failed to revoke invitation.", variant: "destructive" });
    }
  }, [firebaseAuth]);

  const sendChildInvite = useCallback(async (child: PlayerProfile, email: string): Promise<string | null> => {
    if (!firebaseAuth || !firebaseUser) return null;
    
    // Diagnostic logging to catch permission mismatches
    console.log('[YouthInvite] Initiating invite for child:', child.id);

    try {
      const idToken = await getAuthToken(firebaseAuth);
      if (!idToken) throw new Error('Your session has expired. Please sign in again.');
      const response = await fetch('/api/invites/youth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(idToken) },
        body: JSON.stringify({
          action: 'create',
          childId: child.id,
          email,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to create invitation.');
      const signupUrl = `${window.location.origin}/signup/youth?token=${payload.token}`;
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
  }, [firebaseAuth, firebaseUser]);
  const assignManualPlan = useCallback(async (uid: string, planId: string, _limit?: number) => {
    if (!firebaseUser) throw new Error('Authentication is required.');
    const token = await firebaseUser.getIdToken();
    const response = await fetch(`/api/admin/users/${encodeURIComponent(uid)}/entitlement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ planId, reason: 'Manual assignment from plan administration' }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Unable to assign this plan.');
  }, [firebaseUser]);

  const addIncident = useCallback(async (data: any) => { if (activeTeam?.id && db && firebaseUser) await addDoc(collection(db, 'teams', activeTeam.id, 'incidents'), clean({ ...data, teamId: activeTeam.id, ownerUserId: activeTeam.ownerUserId, teamName: activeTeam.name, reportedBy: firebaseUser.uid, createdAt: new Date().toISOString() })); }, [db, firebaseUser, activeTeam]);
  const updateIncident = useCallback(async (teamId: string, id: string, data: any) => {
    if (!db || !firebaseUser) return;
    const updatedAt = new Date().toISOString();
    await updateDoc(doc(db, 'teams', teamId, 'incidents', id), {
      ...clean(data), updatedAt, updatedBy: firebaseUser.uid,
      auditHistory: arrayUnion({ action: data.status ? `status:${data.status}` : 'updated', userId: firebaseUser.uid, at: updatedAt }),
    });
  }, [db, firebaseUser]);
  


  const markMediaAsViewed = useCallback(async (fileId: string) => { if (!firebaseUser || !activeTeam?.id || !db) return; await setDoc(doc(db, 'teams', activeTeam.id, 'members', firebaseUser.uid, 'mediaViews', fileId), { fileId, viewedAt: new Date().toISOString() }); }, [activeTeam, firebaseUser, db]);

  const deployClubProtocol = useCallback(async (data: any, teamIds: string[]) => {
    if (!db || !firebaseUser) return;
    const batch = writeBatch(db);
    const baseId = `protocol_${Date.now()}`;
    // Always write a global copy to the user's own club-documents store so it shows up even with no squads
    const globalDocId = `${baseId}_global`;
    batch.set(doc(db, 'users', firebaseUser.uid, 'clubDocuments', globalDocId), clean({
      ...data,
      id: globalDocId,
      ownerUserId: firebaseUser.uid,
      isClubMaster: true,
      isGlobal: true,
      deploymentId: baseId,
      waiverAudience: data.waiverAudience === 'team' ? 'team' : 'participant',
      createdAt: new Date().toISOString()
    }));
    // Also push to each squad so compliance checks can reference it
    teamIds.forEach((tid, i) => {
      const docId = `${baseId}_${i}`;
      batch.set(doc(db, 'teams', tid, 'documents', docId), clean({
        ...data,
        id: docId,
        teamId: tid,
        ownerUserId: firebaseUser.uid,
        isClubMaster: true,
        deploymentId: baseId,
        sourceGlobalDocumentId: globalDocId,
        waiverAudience: data.waiverAudience === 'team' ? 'team' : 'participant',
        createdAt: new Date().toISOString()
      }));
    });
    await batch.commit();
  }, [db, firebaseUser]);

  const deleteTeam = useCallback(async (tid: string) => { 
    if (!isPrimaryClubAuthority && !isSuperAdmin) {
      toast({ title: "Authorization Required", description: "Only the primary authority or an administrator can disband a squad.", variant: "destructive" });
      return;
    }
    if(db) await deleteDoc(doc(db, 'teams', tid)); 
  }, [db, isPrimaryClubAuthority, isSuperAdmin]);

  /**
   * Signs a hub-deployed global waiver on behalf of the current coach/staff member.
   * Writes to:
   *   - teams/{teamId}/coachWaiverSignatures/{waiverDocId}  (primary record)
   *   - teams/{teamId}/archived_waivers/{archId}            (audit trail)
   */
  const signGlobalWaiverAsCoach = useCallback(async (waiverDocId: string, waiverTitle: string): Promise<boolean> => {
    if (!db || !firebaseUser || !activeTeam?.id) return false;
    const now = new Date().toISOString();
    const coachName = firebaseUser.displayName || firebaseUser.email || 'Coach';
    try {
      const batch = writeBatch(db);
      // Primary: coachWaiverSignatures/{waiverDocId} — one doc per waiver per team
      batch.set(
        doc(db, 'teams', activeTeam.id, 'coachWaiverSignatures', waiverDocId),
        {
          waiverDocId,
          waiverTitle,
          signedBy: firebaseUser.uid,
          signedByName: coachName,
          signedAt: now,
          isGlobal: true,
          isClubMaster: true,
          teamId: activeTeam.id,
        }
      );
      // Archive: for the audit trail in Waiver Library
      const archId = `global_coach_${waiverDocId}_${firebaseUser.uid}`;
      batch.set(
        doc(db, 'teams', activeTeam.id, 'archived_waivers', archId),
        {
          id: archId,
          documentId: waiverDocId,
          title: waiverTitle,
          type: 'waiver',
          signerName: coachName,
          signerUserId: firebaseUser.uid,
          signerRole: 'coach',
          signedAt: now,
          isGlobal: true,
          isClubMaster: true,
          teamId: activeTeam.id,
        }
      );
      await batch.commit();
      toast({ title: '✅ Waiver Signed', description: `You have acknowledged: ${waiverTitle}` });
      return true;
    } catch (e: any) {
      console.error('[signGlobalWaiverAsCoach] Error:', e.message);
      toast({ title: 'Signing Failed', description: e.message, variant: 'destructive' });
      return false;
    }
  }, [db, firebaseUser, activeTeam?.id]);

  const deleteAccount = useCallback(async () => {
    if (!firebaseUser || !firebaseAuth) return;
    try {
      const idToken = await getAuthToken(firebaseAuth);
      if (!idToken) throw new Error('Your session has expired. Please sign in again.');
      const response = await fetch('/api/account/deletion-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(idToken) },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to schedule account deletion.');

      const { signOut } = await import('firebase/auth');
      await clearBrowserSession();
      await signOut(firebaseAuth);
      toast({
        title: 'Account Deletion Scheduled',
        description: `Your account will be permanently removed after ${new Date(payload.purgeAt).toLocaleDateString()}.`,
      });
      window.location.href = '/login';
    } catch (error: any) {
      console.error("Delete Account Error:", error);
      toast({ title: "Deletion Failed", description: error.message, variant: "destructive" });
    }
  }, [firebaseUser, firebaseAuth]);

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
      const userRelevantIds = alerts.map(alert => alert.id);

      console.log("DEBUG: Filtered relevant IDs for bulk archive:", userRelevantIds);

      if (userRelevantIds.length > 0) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        await setDoc(userRef, {
          seenAlertIds: arrayUnion(...userRelevantIds),
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
  const createAlert = useCallback(async (t: string, m: string, a: TeamAlert['audience'], targetUserId?: string) => { 
    if (!firebaseUser || !activeTeam?.id || !db) {
      throw new Error('A signed-in squad and active team are required.');
    }
    if (!isSuperAdmin && activeTeam.ownerUserId !== firebaseUser.uid) {
      throw new Error('Only the primary squad owner can dispatch broadcasts.');
    }
    await addDoc(collection(db, 'teams', activeTeam.id, 'alerts'), clean({
      title: t,
      message: m,
      audience: a,
      targetUserId: targetUserId || null,
      createdAt: new Date().toISOString(),
      createdBy: firebaseUser.uid
    }));
  }, [activeTeam, db, firebaseUser, isSuperAdmin]);

  const deleteAlert = useCallback(async (id: string) => { 
    if (!isStaff) return;
    if (activeTeam?.id && db) await deleteDoc(doc(db, 'teams', activeTeam.id, 'alerts', id)); 
  }, [activeTeam, db, isStaff]);

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


  const submitMatchScore = useCallback(async (teamId: string, eventId: string, gameId: string, isTeam1: boolean, score1: number, score2: number, pin?: string) => {
    if (!firebaseAuth) return;
    const token = await getAuthToken(firebaseAuth);
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const response = await fetch('/api/tournaments/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({ action: 'score', teamId, eventId, gameId, isTeam1, score1, score2, pin }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Unable to submit the tournament score.');
  }, [firebaseAuth]);
  
  const submitLeagueMatchScore = useCallback(async (leagueId: string, gameId: string, isTeam1: boolean, score1: number, score2: number, pin?: string) => {
    if (!firebaseAuth) return;
    const token = await getAuthToken(firebaseAuth);
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const response = await fetch('/api/leagues/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({ action: 'score', leagueId, gameId, isTeam1, score1, score2, pin }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Unable to submit the league score.');
  }, [firebaseAuth]);

  const disputeMatchScore = useCallback(async (teamId: string, eventId: string, gameId: string, notes: string) => {
    if (!firebaseAuth) return;
    const token = await getAuthToken(firebaseAuth);
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const response = await fetch('/api/tournaments/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({ action: 'dispute', teamId, eventId, gameId, notes }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Unable to dispute the tournament score.');
  }, [firebaseAuth]);
  const disputeLeagueMatchScore = useCallback(async (leagueId: string, gameId: string, notes: string) => {
    if (!firebaseAuth) return;
    const token = await getAuthToken(firebaseAuth);
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const response = await fetch('/api/leagues/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({ action: 'dispute', leagueId, gameId, notes }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Unable to dispute the league score.');
  }, [firebaseAuth]);

  const resolveQuota = useCallback(async (selectedTeamIds: string[]) => {
    if (!firebaseAuth || !userProfile?.id) return;
    const token = await getAuthToken(firebaseAuth);
    const response = await fetch('/api/teams/resolve-quota', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({ selectedTeamIds }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Unable to resolve the team quota.');
    }
  }, [firebaseAuth, userProfile]);
  const exportAttendanceCSV = useCallback(async (eventId: string) => { if (!db || !activeTeam?.id) return; const snap = await getDoc(doc(db, 'teams', activeTeam.id, 'events', eventId)); if (!snap.exists()) return; const rsvps = snap.data().userRsvps || {}; const rows = [["Name", "Status"]]; members.forEach(m => { rows.push([m.name, rsvps[m.userId] || 'no_response']); }); const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n"); const encodedUri = encodeURI(csvContent); const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", `attendance_${eventId}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); }, [db, activeTeam, members]);
  const exportTournamentStandingsCSV = useCallback(async (tournamentId: string) => { if (!db || !activeTeam?.id) return; const rows = [["Team", "Wins", "Losses", "Ties", "Points"]]; const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n"); const encodedUri = encodeURI(csvContent); const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", `standings_${tournamentId}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); }, [db, activeTeam]);

  const addRegistration = useCallback(async (teamId: string, eventId: string, data: any) => { if (db) { await addDoc(collection(db, 'teams', teamId, 'events', eventId, 'registrations'), clean(data)); return true; } return false; }, [db]);
  const manageSubscription = useCallback(async () => {
    // If the user already has a Stripe customer, open the billing portal
    if (userProfile?.id && (userProfile as any).stripe_customer_id) {
      try {
        const token = await getAuthToken(firebaseAuth);
        const res = await fetch('/api/stripe/customer-portal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader(token) },
          body: JSON.stringify({ userId: userProfile.id }),
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      } catch (e) {
        console.warn('[manageSubscription] portal redirect failed, falling back to paywall', e);
      }
    }
    // Fall back to showing the upgrade paywall
    setIsPaywallOpen(true);
  }, [userProfile, firebaseAuth]);
  const purchasePro = useCallback(() => { setIsPaywallOpen(true); }, []);
  const addLeaguePayment = useCallback(async (leagueId: string, teamId: string, data: any) => { if (!db) return; await addDoc(collection(db, 'leagues', leagueId, 'payments'), clean({ ...data, teamId, createdAt: new Date().toISOString() })); await updateDoc(doc(db, 'leagues', leagueId), { [`finances.${teamId}.totalPaid`]: increment(data.amount) }); }, [db]);
  const updateLeagueGlobalFees = useCallback(async (leagueId: string, fees: any) => { if (db) await updateDoc(doc(db, 'leagues', leagueId), { globalFees: clean(fees) }); }, [db]);

  const updateLeaguePin = useCallback(async (leagueId: string, pin: string) => {
    if (db) await updateDoc(doc(db, 'leagues', leagueId), { scorekeeperPin: pin });
  }, [db]);


  const getCalendarFeedUrl = useCallback(async (type: 'user' | 'team' | 'multi', targetId?: string, teamIds?: string[]) => {
    if (!firebaseUser) return null;
    const finalTargetId = targetId || (type === 'team' ? activeTeam?.id : firebaseUser?.uid);
    if (type !== 'multi' && !finalTargetId) return null;
    if (type === 'multi' && (!teamIds || teamIds.length === 0)) return null;
    const token = await getAuthToken(firebaseAuth);
    const response = await fetch('/api/calendar/feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({
        type,
        ...(type === 'team' ? { teamId: finalTargetId } : {}),
        ...(type === 'multi' ? { teamIds } : {}),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Unable to create calendar feed.');
    return typeof payload.url === 'string' ? payload.url : null;
  }, [activeTeam?.id, firebaseAuth, firebaseUser]);

  const contextValue = useMemo(() => ({
    db, user: userProfile, userProfile, activeTeam, setActiveTeam, teams: teamsRaw, isTeamsLoading, members, isMembersLoading,
    currentMember: getMember(firebaseUser?.uid),
    isStaff, isPro, isStarter, isParent, 
    isPlayer,
    isYouth: activeTeam?.type === 'youth',
    isSuperAdmin,
    isClubManager,
    isPrimaryClubAuthority,
    isEliteAccount,
    isEliteClubMode,
    isSchoolMode,
    isSchoolAdmin, householdEvents: householdEvents || [], householdGames: householdGames || [], activeTeamEvents, games, householdBalance, myChildren, plans, isPlansLoading, proQuotaStatus,
    deleteFundraisingOpportunity, addGame, updateGame, canAddProTeam: (proQuotaStatus.remaining > 0),
    isPaywallOpen, setIsPaywallOpen, purchasePro,
    hasFeature, alerts, unreadAlertsCount,
    getCalendarFeedUrl,

    markAlertAsSeen, markAllAlertsAsSeen, seenAlertIds, isSeedingDemo, setIsSeedingDemo,
    totalStorageUsed,

    getRecruitingProfile, updateRecruitingProfile, getAthleticMetrics, updateAthleticMetrics,
    getPlayerStats, addPlayerStat, updatePlayerStat, deletePlayerStat, getEvaluations, addEvaluation,
    getRecruitingContact, updateRecruitingContact, getPlayerVideos, addPlayerVideo, updatePlayerVideo, deletePlayerVideo,
    toggleRecruitingProfile, updateStaffEvaluation, getStaffEvaluation, createNewTeam, joinTeamWithCode,
    createChat, signUpForVolunteer, addEquipmentItem, updateEquipmentItem, deleteEquipmentItem, respondToAssignment, assignEntryToTeam, 
    toggleRegistrationPaymentStatus, updateLeague, updateLeagueSchedule, inviteTeamToLeague, manuallyAddTeamToLeague, 
    deleteLeagueInvite, updateLeagueTeamDetails, deleteChat, createLeague,
    hideChatForUser, votePoll, updateChat, deployClubProtocol, deleteTeam, deleteAccount, upgradeChildToLogin, registerChild, updateChild, sendChildInvite, revokeChildInvite,
    updateUser, updateTeam, updateMember, updateTeamDetails, updateTeamHero, updateTeamPlan,
    signTeamDocument, createTeamDocument, updateTeamDocument, deleteTeamDocument, addEvent, updateEvent, claimAssignment,
    deleteEvent, updateRSVP, addMessage, resetSquadData,
    removeMember, reinstateMember,
    confirmVolunteerAttendance, addVolunteerOpportunity, updateVolunteerOpportunity, deleteVolunteerOpportunity, publicSignUpForVolunteer, signUpForFundraising, recordDonation, addFundraisingOpportunity, updateFundraisingOpportunity,
    confirmExternalDonation, addIncident, updateIncident, assignManualPlan, removeTeamFromLeague,
    saveLeagueRegistrationConfig, submitRegistrationEntry,
    signPublicTournamentWaiver, submitMatchScore, submitLeagueMatchScore, updateLeaguePin, disputeMatchScore, disputeLeagueMatchScore,
    addLeagueGame,
    createAlert, deleteAlert, addDrill, updateDrill, deleteDrill, assignDrillsToEvent,
    addPracticeTemplate, updatePracticeTemplate, deletePracticeTemplate,
    addFile, deleteFile, addFacility, updateFacility, deleteFacility,
    addField, updateField: updateFacilityField, deleteField: deleteFacilityField,
    assignEquipment, returnEquipment,
    formatTime, manageSubscription, resolveQuota, exportAttendanceCSV, exportTournamentStandingsCSV, markMediaAsViewed,
    addRegistration, addLeaguePayment, updateLeagueGlobalFees,
    signGlobalWaiverAsCoach,

    getMember, firebaseUser, getTeamByCode, deleteMessage, getLeagueMembers, storage,
    checkCodeUniqueness, updateTeamCode, propagateLogoToLeagues,
    handleUpdateMemberField: async (memberId: string, field: string, value: any) => {
      const m = teamsRaw.length > 0 ? null : null; // just for dep tracking
      if (!db || !activeTeam) return;
      await updateMember(memberId, { [field]: value });
    },
  }), [
    db, userProfile, activeTeam, setActiveTeam, teamsRaw, isTeamsLoading, members, isMembersLoading, firebaseUser, storage,
    isStaff, isPro, isStarter, householdEvents, householdGames, activeTeamEvents, games, myChildren, plans, isPlansLoading, isPaywallOpen,
    isSeedingDemo, setIsSeedingDemo, getCalendarFeedUrl,
    seenAlertIds, alerts, unreadAlertsCount, isSuperAdmin, isClubManager, isPrimaryClubAuthority, isEliteAccount, hasFeature, proQuotaStatus,
    totalStorageUsed,



    getRecruitingProfile, updateRecruitingProfile, getAthleticMetrics, updateAthleticMetrics,
    getPlayerStats, addPlayerStat, updatePlayerStat, deletePlayerStat, getEvaluations, addEvaluation,
    getRecruitingContact, updateRecruitingContact, getPlayerVideos, addPlayerVideo, updatePlayerVideo, deletePlayerVideo,
    toggleRecruitingProfile, updateStaffEvaluation, getStaffEvaluation, createNewTeam, joinTeamWithCode,
    createLeague, signUpForVolunteer, addEquipmentItem, updateEquipmentItem, deleteEquipmentItem, respondToAssignment, assignEntryToTeam, 
    toggleRegistrationPaymentStatus, updateLeague, updateLeagueSchedule, inviteTeamToLeague, manuallyAddTeamToLeague, 
    deleteLeagueInvite, updateLeagueTeamDetails, deleteChat, createChat,
    hideChatForUser, votePoll, updateChat, deployClubProtocol, deleteTeam, deleteAccount, upgradeChildToLogin, registerChild, updateChild, sendChildInvite, revokeChildInvite,
    updateUser, updateTeam, updateMember, updateTeamDetails, updateTeamHero, updateTeamPlan,
    signTeamDocument, createTeamDocument, updateTeamDocument, deleteTeamDocument, addEvent, updateEvent,
    deleteEvent, updateRSVP, addMessage, resetSquadData,
    confirmVolunteerAttendance, addVolunteerOpportunity, updateVolunteerOpportunity, deleteVolunteerOpportunity, publicSignUpForVolunteer, addFundraisingOpportunity, updateFundraisingOpportunity, signUpForFundraising, recordDonation,
    confirmExternalDonation, addIncident, updateIncident, assignManualPlan, removeTeamFromLeague,
    saveLeagueRegistrationConfig, submitRegistrationEntry,
    signPublicTournamentWaiver, submitMatchScore, submitLeagueMatchScore, updateLeaguePin, disputeMatchScore, disputeLeagueMatchScore,
    addLeagueGame,
    createAlert, deleteAlert, addDrill, updateDrill, deleteDrill, assignDrillsToEvent, 
    addPracticeTemplate, updatePracticeTemplate, deletePracticeTemplate,
    addFile, deleteFile, addFacility, updateFacility, deleteFacility,
    addField, updateFacilityField, deleteFacilityField,
    assignEquipment, returnEquipment,
    formatTime, manageSubscription, resolveQuota, exportAttendanceCSV, exportTournamentStandingsCSV, markMediaAsViewed,
    addRegistration, purchasePro, addLeaguePayment, updateLeagueGlobalFees,
    getMember, getTeamByCode, deleteMessage, getLeagueMembers,
    removeMember, reinstateMember,
    checkCodeUniqueness, updateTeamCode, propagateLogoToLeagues,
    signGlobalWaiverAsCoach,
  ]);

  return <TeamContext.Provider value={contextValue}>{children}</TeamContext.Provider>;
}

export const useTeam = () => {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within a TeamProvider');
  return context;
};
