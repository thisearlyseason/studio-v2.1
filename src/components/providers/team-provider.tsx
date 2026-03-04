
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
import { Purchases } from '@revenuecat/purchases-js';
import { seedGuestDemoTeam, resetDemoEnvironment } from '@/lib/db-seeder';
import { useSearchParams, useRouter } from 'next/navigation';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

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
  parentId: string | null; // UID of parent if minor
  userId: string | null; // UID if adult player has login
  hasLogin: boolean;
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
};

export type Member = {
  id: string;
  userId: string; // Parent UID if minor
  playerId: string; // Authoritative player record ID
  teamId: string;
  name: string;
  role: 'Admin' | 'Member';
  position: string;
  jersey: string;
  avatar: string;
  isMinor?: boolean;
};

export type WaiverSignature = {
  id: string;
  playerId: string;
  signedByUserId: string;
  signedByRole: "player" | "parent";
  signedAt: string;
  version: string;
};

interface TeamContextType {
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
  createNewTeam: (name: string, type: "adult" | "youth", pos: string, description?: string, planId?: string) => Promise<string>;
  joinTeamWithCode: (code: string, playerId: string, position: string) => Promise<boolean>;
  registerChild: (firstName: string, lastName: string, dob: string) => Promise<string>;
  myChildren: PlayerProfile[];
  signWaiver: (playerId: string, version: string) => Promise<void>;
  plans: any[];
  isPlansLoading: boolean;
  proQuotaStatus: { current: number; limit: number; remaining: number; exceeded: boolean };
  canAddProTeam: boolean;
  purchasePro: () => void;
  setIsPaywallOpen: (open: boolean) => void;
  isPaywallOpen: boolean;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user: firebaseUser, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [myChildren, setMyChildren] = useState<PlayerProfile[]>([]);

  // Fetch Plans
  const plansQuery = useMemoFirebase(() => db ? collection(db, 'plans') : null, [db]);
  const { data: plansData, isLoading: isPlansLoading } = useCollection(plansQuery);
  const plans = plansData || [];

  // Fetch User Profile
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
          createdAt: data.createdAt
        });
      }
    });
  }, [firebaseUser?.uid, db]);

  // Fetch Children if Parent
  useEffect(() => {
    if (!firebaseUser?.uid || !db || userProfile?.role !== 'parent') return;
    const q = query(collection(db, 'players'), where('parentId', '==', firebaseUser.uid));
    return onSnapshot(q, (snap) => {
      setMyChildren(snap.docs.map(d => ({ id: d.id, ...d.data() } as PlayerProfile)));
    });
  }, [firebaseUser?.uid, db, userProfile?.role]);

  // Fetch Teams
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
      ownerUserId: m.ownerUserId
    }));
  }, [teamsData]);

  const activeTeam = useMemo(() => {
    if (!teams.length) return null;
    return teams.find(t => t.id === activeTeamId) || teams[0];
  }, [teams, activeTeamId]);

  // Fetch Members
  const [members, setMembers] = useState<Member[]>([]);
  const [isMembersLoading, setIsMembersLoading] = useState(false);
  useEffect(() => {
    if (!activeTeam?.id || !db) return;
    setIsMembersLoading(true);
    return onSnapshot(query(collection(db, 'teams', activeTeam.id, 'members')), (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
      setIsMembersLoading(false);
    });
  }, [activeTeam?.id, db]);

  const proQuotaStatus = useMemo(() => {
    const limitCount = userProfile?.proTeamLimit ?? 0;
    const ownedProTeams = teams.filter(t => t.ownerUserId === firebaseUser?.uid && t.isPro);
    const current = ownedProTeams.length;
    return { current, limit: limitCount, remaining: Math.max(0, limitCount - current), exceeded: current > limitCount };
  }, [teams, userProfile, firebaseUser?.uid]);

  const isStaff = activeTeam?.role === 'Admin';
  const isPro = activeTeam?.isPro || false;

  const value = {
    user: userProfile,
    activeTeam,
    setActiveTeam: (t: Team) => setActiveTeamId(t.id),
    teams,
    isTeamsLoading,
    members,
    isMembersLoading,
    currentMember: members.find(m => m.userId === firebaseUser?.uid) || null,
    isStaff,
    isPro,
    createNewTeam: async (name: string, type: "adult" | "youth", pos: string, description?: string, planId?: string) => {
      if (!firebaseUser) return '';
      const tid = `team_${Date.now()}`;
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const pId = planId || 'starter_squad';
      const batch = writeBatch(db);
      batch.set(doc(db, 'teams', tid), { 
        id: tid, teamName: name, teamCode: code, type, createdBy: firebaseUser.uid, 
        ownerUserId: firebaseUser.uid, createdAt: new Date().toISOString(), isPro: pId !== 'starter_squad', planId: pId 
      });
      batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), { 
        userId: firebaseUser.uid, teamId: tid, role: 'Admin', position: pos, 
        name: userProfile?.name, avatar: userProfile?.avatar, joinedAt: new Date().toISOString() 
      });
      batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), { 
        teamId: tid, teamName: name, teamCode: code, type, role: 'Admin', isPro: pId !== 'starter_squad', 
        planId: pId, ownerUserId: firebaseUser.uid 
      });
      await batch.commit();
      return tid;
    },
    joinTeamWithCode: async (code: string, playerId: string, position: string) => {
      if (!firebaseUser || !db) return false;
      const q = query(collection(db, 'teams'), where('teamCode', '==', code.toUpperCase()), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) return false;
      const tDoc = snap.docs[0];
      const tid = tDoc.id;
      const playerSnap = await getDoc(doc(db, 'players', playerId));
      const pData = playerSnap.data();
      
      const batch = writeBatch(db);
      batch.set(doc(db, 'teams', tid, 'members', playerId), {
        userId: firebaseUser.uid, playerId, teamId: tid, role: 'Member', position,
        name: `${pData?.firstName} ${pData?.lastName}`, avatar: '', isMinor: pData?.isMinor
      });
      batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), {
        teamId: tid, teamName: tDoc.data().teamName, teamCode: code.toUpperCase(), 
        type: tDoc.data().type, role: 'Member', ownerUserId: tDoc.data().ownerUserId
      });
      await batch.commit();
      return true;
    },
    registerChild: async (firstName: string, lastName: string, dob: string) => {
      if (!firebaseUser) return '';
      const docRef = await addDoc(collection(db, 'players'), {
        firstName, lastName, dateOfBirth: dob, isMinor: true, parentId: firebaseUser.uid,
        hasLogin: false, createdAt: new Date().toISOString()
      });
      return docRef.id;
    },
    myChildren,
    signWaiver: async (playerId: string, version: string) => {
      if (!firebaseUser) return;
      await addDoc(collection(db, 'waivers'), {
        playerId, signedByUserId: firebaseUser.uid, 
        signedByRole: userProfile?.role === 'parent' ? 'parent' : 'player',
        signedAt: new Date().toISOString(), version
      });
    },
    plans,
    isPlansLoading,
    proQuotaStatus,
    canAddProTeam: proQuotaStatus.remaining > 0,
    purchasePro: () => setIsPaywallOpen(true),
    setIsPaywallOpen,
    isPaywallOpen
  };

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export const useTeam = () => {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within TeamProvider');
  return context;
};
