"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo } from 'react';
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
import { useRouter } from 'next/navigation';

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
  parentChatEnabled?: boolean;
  parentCommentsEnabled?: boolean;
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
};

export type FeeItem = {
  id: string;
  title: string;
  amount: number;
  paid: boolean;
  createdAt: string;
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
  isParent: boolean;
  isPlayer: boolean;
  isSuperAdmin: boolean;
  isClubManager: boolean;
  createNewTeam: (name: string, type: "adult" | "youth", pos: string, description?: string, planId?: string) => Promise<string>;
  joinTeamWithCode: (code: string, playerId: string, position: string) => Promise<boolean>;
  registerChild: (firstName: string, lastName: string, dob: string) => Promise<string>;
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
          isDemo: data.isDemo
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
      ownerUserId: m.ownerUserId,
      sport: m.sport,
      parentChatEnabled: m.parentChatEnabled,
      parentCommentsEnabled: m.parentCommentsEnabled
    }));
  }, [teamsData]);

  const activeTeam = useMemo(() => {
    if (!teams.length) return null;
    return teams.find(t => t.id === activeTeamId) || teams[0];
  }, [teams, activeTeamId]);

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
  const isParent = userProfile?.role === 'parent';
  const isPlayer = userProfile?.role === 'adult_player';
  const isSuperAdmin = userProfile?.email === 'thisearlyseason@gmail.com' || userProfile?.email === 'test@gmail.com';
  const isClubManager = userProfile?.activePlanId?.includes('squad_organization');

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
    isParent,
    isPlayer,
    isSuperAdmin,
    isClubManager,
    createNewTeam: async (name: string, type: "adult" | "youth", pos: string, description?: string, planId?: string) => {
      if (!firebaseUser) return '';
      const tid = `team_${Date.now()}`;
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const pId = planId || 'starter_squad';
      const batch = writeBatch(db);
      
      const teamData = { 
        id: tid, teamName: name, teamCode: code, type, createdBy: firebaseUser.uid, 
        ownerUserId: firebaseUser.uid, createdAt: new Date().toISOString(), isPro: pId !== 'starter_squad', planId: pId,
        parentChatEnabled: true, parentCommentsEnabled: true
      };

      batch.set(doc(db, 'teams', tid), teamData);
      
      batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), { 
        id: firebaseUser.uid,
        userId: firebaseUser.uid, 
        teamId: tid, 
        role: 'Admin', 
        position: pos, 
        name: userProfile?.name, 
        avatar: userProfile?.avatar, 
        joinedAt: new Date().toISOString(),
        jersey: 'HQ'
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
      if (snap.empty) {
        toast({ title: "Invalid Code", variant: "destructive" });
        return false;
      }
      
      const tDoc = snap.docs[0];
      const tid = tDoc.id;
      const tData = tDoc.data();
      
      const playerSnap = await getDoc(doc(db, 'players', playerId));
      const pData = playerSnap.data();
      
      const batch = writeBatch(db);
      batch.set(doc(db, 'teams', tid, 'members', playerId), {
        id: playerId,
        userId: firebaseUser.uid, 
        playerId, 
        teamId: tid, 
        role: 'Member', 
        position,
        name: `${pData?.firstName} ${pData?.lastName}`, 
        avatar: '', 
        isMinor: pData?.isMinor,
        joinedAt: new Date().toISOString(),
        jersey: 'TBD'
      });

      batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), {
        teamId: tid, teamName: tData.teamName, teamCode: code.toUpperCase(), 
        type: tData.type, role: 'Member', ownerUserId: tData.ownerUserId,
        isPro: tData.isPro, planId: tData.planId
      });

      await batch.commit();
      toast({ title: "Welcome to the Squad!" });
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
    purchasePro: () => setIsPaywallOpen(true),
    setIsPaywallOpen,
    isPaywallOpen,
    updateUser: async (updates: Partial<UserProfile>) => {
      if (!firebaseUser) return;
      await updateDoc(doc(db, 'users', firebaseUser.uid), updates);
    },
    updateMember: async (memberId: string, updates: Partial<Member>) => {
      if (!activeTeam) return;
      await updateDoc(doc(db, 'teams', activeTeam.id, 'members', memberId), updates);
    },
    updateTeamDetails: async (updates: Partial<Team>) => {
      if (!activeTeam) return;
      await updateDoc(doc(db, 'teams', activeTeam.id), updates);
    },
    updateTeamPlan: async (teamId: string, planId: string) => {
      const plan = plans.find(p => p.id === planId);
      if (!plan) return;
      await updateDoc(doc(db, 'teams', teamId), { planId, isPro: planId !== 'starter_squad' });
    },
    manageSubscription: () => {
      window.open('https://billing.thesquad.pro', '_blank');
    },
    resetSeasonData: async () => {
      if (!activeTeam) return;
      toast({ title: "Resetting Season...", description: "Purging historical records." });
      // Logic would involve batch deleting subcollections
    },
    createChat: async (name: string, memberIds: string[]) => {
      if (!activeTeam || !firebaseUser) return '';
      const docRef = await addDoc(collection(db, 'teams', activeTeam.id, 'groupChats'), {
        name,
        memberIds: [...memberIds, firebaseUser.uid],
        createdBy: firebaseUser.uid,
        createdAt: new Date().toISOString(),
        lastMessage: 'New channel established.'
      });
      return docRef.id;
    },
    addMessage: async (chatId: string, author: string, content: string, type: any, imageUrl?: string, poll?: any) => {
      if (!activeTeam || !firebaseUser) return;
      await addDoc(collection(db, 'teams', activeTeam.id, 'groupChats', chatId, 'messages'), {
        author, authorId: firebaseUser.uid, content, type, imageUrl, poll, createdAt: new Date().toISOString()
      });
      await updateDoc(doc(db, 'teams', activeTeam.id, 'groupChats', chatId), {
        lastMessage: type === 'poll' ? 'New Poll' : (content || 'Media attached'),
        lastMessageAt: new Date().toISOString()
      });
    },
    votePoll: async (chatId: string, msgId: string, optIdx: number) => {
      if (!activeTeam || !firebaseUser) return;
      const ref = doc(db, 'teams', activeTeam.id, 'groupChats', chatId, 'messages', msgId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const poll = snap.data().poll;
      const current = poll.voters?.[firebaseUser.uid];
      const u: any = { [`poll.voters.${firebaseUser.uid}`]: optIdx };
      if (current === undefined) { u[`poll.options.${optIdx}.votes`] = increment(1); u['poll.totalVotes'] = increment(1); }
      else if (current !== optIdx) { u[`poll.options.${current}.votes`] = increment(-1); u[`poll.options.${optIdx}.votes`] = increment(1); }
      await updateDoc(ref, u);
    },
    formatTime: (date: string | Date) => {
      return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    },
    submitLead: async (data: any) => {
      await addDoc(collection(db, 'leads'), { ...data, createdAt: new Date().toISOString() });
      toast({ title: "Inquiry Dispatched" });
      return true;
    }
  };

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export const useTeam = () => {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within TeamProvider');
  return context;
};
