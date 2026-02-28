
"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo } from 'react';
import { useUser, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { 
  collection, 
  query, 
  where, 
  doc, 
  getDoc, 
  updateDoc, 
  addDoc,
  getDocs,
  limit,
  orderBy,
  setDoc,
  arrayUnion,
  arrayRemove,
  deleteDoc,
  writeBatch,
  increment,
  onSnapshot
} from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { deleteDocumentNonBlocking, addDocumentNonBlocking, updateDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Purchases } from '@revenuecat/purchases-js';

// Configuration for RevenueCat
const REVENUECAT_PUBLIC_API_KEY = 'test_zvlronFHqIFQuWTkgaeWrdyYnkZ';
const PRO_ENTITLEMENT_ID = 'The Squad Pro';

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
};

export type Team = {
  id: string;
  name: string;
  code: string;
  sport?: string;
  teamLogoUrl?: string;
  heroImageUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  membersMap?: Record<string, string>;
  isPro?: boolean;
  role?: 'Admin' | 'Member';
};

export type MemberPosition = 'Coach' | 'Team Lead' | 'Assistant Coach' | 'Squad Leader' | 'Player' | 'Parent' | string;

export type FeeItem = {
  id: string;
  title: string;
  amount: number;
  paid: boolean;
  createdAt: string;
};

export type Member = {
  id: string;
  userId: string;
  teamId: string;
  name: string;
  role: 'Admin' | 'Member';
  position: MemberPosition;
  jersey: string;
  avatar: string;
  feesPaid?: boolean;
  amountOwed?: number;
  fees?: FeeItem[];
};

export type Chat = {
  id: string;
  teamId: string;
  name: string;
  memberIds: string[];
  lastMessage?: string;
  time?: string;
  unread?: number;
};

export type PollOption = {
  text: string;
  votes: number;
  voterIds?: string[];
  imageUrl?: string;
};

export type Message = {
  id: string;
  chatId: string;
  author: string;
  authorId?: string;
  content?: string;
  imageUrl?: string;
  type: 'text' | 'poll' | 'image';
  createdAt: string;
  poll?: {
    id: string;
    question: string;
    options: PollOption[];
    totalVotes: number;
    userVoted?: number;
    isClosed: boolean;
    voters?: Record<string, number>;
  };
};

export type Comment = {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  content: string;
  imageUrl?: string;
  createdAt: string;
};

export type Post = {
  id: string;
  teamId: string;
  author: { name: string; avatar: string };
  authorId?: string;
  content: string;
  type: 'user' | 'system' | 'poll';
  imageUrl?: string;
  createdAt: string;
  likes?: string[];
  poll?: {
    id: string;
    question: string;
    options: PollOption[];
    totalVotes: number;
    voters?: Record<string, number>;
    isClosed: boolean;
  };
  systemData?: {
    updateType: string;
    title: string;
    date: string;
    startTime: string;
    endTime?: string;
    location?: string;
    label?: string;
    detail?: string;
  };
};

export type RSVPStatus = 'going' | 'notGoing' | 'maybe';

export type EventRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';

export type TeamEvent = {
  id: string;
  teamId: string;
  title: string;
  date: Date;
  startTime: string;
  endTime?: string;
  location: string;
  description: string;
  recurrence: EventRecurrence;
  recurrenceDays?: string[];
  recurrenceEndDate?: string;
  rsvps: { going: number; notGoing: number; maybe: number };
  userRsvps?: Record<string, RSVPStatus>;
  userRsvp?: RSVPStatus;
  maxRegistrations?: number;
  allowExternalRegistration?: boolean;
};

export type EventRegistration = {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
  status: 'pending' | 'added';
};

export type GameResult = 'Win' | 'Loss' | 'Tie';

export type Game = {
  id: string;
  teamId: string;
  opponent: string;
  date: Date;
  myScore: number;
  opponentScore: number;
  result: GameResult;
  location?: string;
  notes?: string;
  createdAt: string;
};

export type TeamFile = {
  id: string;
  teamId: string;
  name: string;
  type: string;
  size: string;
  uploadedBy: string;
  uploaderId: string;
  date: Date;
  url?: string;
};

export type Drill = {
  id: string;
  teamId: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  photoUrl?: string;
  videoUrl?: string;
  category?: string;
  createdBy: string;
  createdAt: string;
};

export type TeamAlert = {
  id: string;
  teamId: string;
  title: string;
  message: string;
  createdBy: string;
  createdAt: string;
};

interface TeamContextType {
  user: UserProfile | null;
  updateUser: (updates: Partial<UserProfile>) => void;
  activeTeam: Team | null;
  setActiveTeam: (team: Team) => void;
  updateTeamHero: (url: string) => Promise<void>;
  updateTeamDetails: (updates: Partial<Team>) => Promise<void>;
  teams: Team[];
  members: Member[];
  updateMember: (id: string, updates: Partial<Member>) => void;
  toggleFeesPaid: (memberId: string) => void;
  chats: Chat[];
  createChat: (name: string, memberIds: string[]) => Promise<string>;
  messages: Message[];
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  addMessage: (chatId: string, author: string, content: string, type: 'text' | 'poll' | 'image', imageUrl?: string, poll?: any) => void;
  votePoll: (chatId: string, messageId: string, optionIndex: number) => Promise<void>;
  posts: Post[];
  addPost: (content: string, imageUrl?: string, type?: 'user' | 'system' | 'poll', systemData?: any, poll?: any) => void;
  deletePost: (postId: string) => void;
  addComment: (postId: string, content: string, imageUrl?: string) => void;
  deleteComment: (postId: string, commentId: string) => void;
  toggleLike: (postId: string) => Promise<void>;
  votePostPoll: (postId: string, optionIndex: number) => Promise<void>;
  events: TeamEvent[];
  addEvent: (event: Omit<TeamEvent, 'id' | 'teamId' | 'rsvps'>) => void;
  updateEvent: (eventId: string, updates: Partial<TeamEvent>) => void;
  deleteEvent: (eventId: string) => void;
  updateRSVP: (eventId: string, status: RSVPStatus) => void;
  addRegistration: (teamId: string, eventId: string, data: Omit<EventRegistration, 'id' | 'createdAt' | 'status'>) => Promise<boolean>;
  promoteToRoster: (teamId: string, eventId: string, registration: EventRegistration) => Promise<void>;
  games: Game[];
  addGame: (game: Omit<Game, 'id' | 'teamId' | 'createdAt'>) => void;
  updateGame: (gameId: string, updates: Partial<Game>) => void;
  files: TeamFile[];
  addFile: (name: string, type: string, size: string, url: string) => void;
  deleteFile: (fileId: string) => void;
  drills: Drill[];
  addDrill: (drill: Omit<Drill, 'id' | 'teamId' | 'createdBy' | 'createdAt'>) => void;
  deleteDrill: (drillId: string) => void;
  alerts: TeamAlert[];
  createAlert: (title: string, message: string) => void;
  createNewTeam: (name: string, organizerPosition: string) => Promise<void>;
  inviteMember: (name: string, email: string, position: MemberPosition) => void;
  joinTeamWithCode: (code: string, position: string) => Promise<boolean>;
  isLoading: boolean;
  formatTime: (date: string | Date) => string;
  isSuperAdmin: boolean;
  isPro: boolean;
  purchasePro: () => Promise<void>;
  manageSubscription: () => Promise<void>;
  isPaywallOpen: boolean;
  setIsPaywallOpen: (open: boolean) => void;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

const SUPER_ADMIN_EMAILS = ['thisearlyseason@gmail.com', 'test@gmail.com'];

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user: firebaseUser, isUserLoading } = useUser();
  const db = useFirestore();
  
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  
  const [isProEntitlementActive, setIsProEntitlementActive] = useState(false);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [isRCInitialized, setIsRCInitialized] = useState(false);

  const isSuperAdmin = useMemo(() => firebaseUser?.email ? SUPER_ADMIN_EMAILS.includes(firebaseUser.email) : false, [firebaseUser?.email]);

  useEffect(() => {
    if (firebaseUser && !isRCInitialized) {
      if (!REVENUECAT_PUBLIC_API_KEY || REVENUECAT_PUBLIC_API_KEY.includes('placeholder') || REVENUECAT_PUBLIC_API_KEY.length < 10) {
        setIsRCInitialized(true);
        return;
      }
      try {
        Purchases.configure(REVENUECAT_PUBLIC_API_KEY, firebaseUser.uid);
        const purchases = Purchases.getSharedInstance();
        purchases.getCustomerInfo().then(info => {
          setIsProEntitlementActive(!!info.entitlements.active[PRO_ENTITLEMENT_ID]);
        }).catch(() => {});
        const unsubscribe = purchases.addCustomerInfoUpdateListener((info) => {
          setIsProEntitlementActive(!!info.entitlements.active[PRO_ENTITLEMENT_ID]);
        });
        setIsRCInitialized(true);
        return () => { if (unsubscribe) unsubscribe(); };
      } catch (e) { setIsRCInitialized(true); }
    }
  }, [firebaseUser, isRCInitialized]);

  useEffect(() => {
    if (firebaseUser) {
      getDoc(doc(db, 'users', firebaseUser.uid)).then(docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserProfile({
            id: firebaseUser.uid,
            name: data.fullName || firebaseUser.displayName || 'Anonymous',
            email: data.email || firebaseUser.email || '',
            phone: data.phone || '',
            avatar: data.avatarUrl || `https://picsum.photos/seed/${firebaseUser.uid}/150/150`
          });
        }
      });
    }
  }, [firebaseUser, db]);

  const teamsQuery = useMemoFirebase(() => {
    if (!firebaseUser || !db) return null;
    const base = isSuperAdmin ? collection(db, 'teams') : collection(db, 'users', firebaseUser.uid, 'teamMemberships');
    return query(base, limit(20));
  }, [firebaseUser?.uid, db, isSuperAdmin]);

  const { data: teamsRawData } = useCollection(teamsQuery);
  const teams = useMemo(() => {
    if (!teamsRawData) return [];
    return teamsRawData.map(m => isSuperAdmin ? {
      id: m.id, name: m.teamName || m.name, code: m.teamCode || m.code, sport: m.sport, teamLogoUrl: m.teamLogoUrl, heroImageUrl: m.heroImageUrl, isPro: m.isPro || false, role: 'Admin'
    } : {
      id: m.teamId, name: m.teamName, code: m.teamCode, sport: m.sport, teamLogoUrl: m.teamLogoUrl, isPro: m.isPro || false, role: m.role || 'Member'
    });
  }, [teamsRawData, isSuperAdmin]);

  const activeTeam = useMemo(() => {
    if (!teams.length) return null;
    return teams.find(t => t.id === activeTeamId) || teams[0];
  }, [teams, activeTeamId]);

  const membersQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return collection(db, 'teams', activeTeam.id, 'members');
  }, [activeTeam?.id, db]);
  const { data: membersData } = useCollection(membersQuery);
  const members = useMemo(() => (membersData || []).map(m => ({
    id: m.id, userId: m.userId, teamId: m.teamId, name: m.name || 'Member', role: m.role, position: m.position || 'Player', jersey: m.jersey || 'TBD', avatar: m.avatar || `https://picsum.photos/seed/${m.userId}/150/150`, feesPaid: m.feesPaid || false, amountOwed: m.amountOwed || 0, fees: m.fees || []
  })), [membersData]);

  const postsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'feedPosts'), orderBy('createdAt', 'desc'), limit(50));
  }, [activeTeam?.id, db]);
  const { data: postsData } = useCollection(postsQuery);
  const posts = useMemo(() => (postsData || []).map(p => ({
    id: p.id, teamId: p.teamId, author: p.author || { name: 'Anonymous', avatar: '' }, authorId: p.authorId, content: p.content, type: p.type || 'user', imageUrl: p.imageUrl, createdAt: p.createdAt, likes: p.likes || [], systemData: p.systemData, poll: p.poll
  })), [postsData]);

  const eventsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'events'), limit(100));
  }, [activeTeam?.id, db]);
  const { data: eventsData } = useCollection(eventsQuery);
  const events = useMemo(() => (eventsData || []).map(e => {
    const userRsvpsMap = e.userRsvps || {};
    const counts = { going: 0, notGoing: 0, maybe: 0 };
    Object.values(userRsvpsMap).forEach(val => { if (val === 'going') counts.going++; if (val === 'notGoing') counts.notGoing++; if (val === 'maybe') counts.maybe++; });
    const d = new Date(e.date);
    return {
      id: e.id, teamId: e.teamId, title: e.title, date: isNaN(d.getTime()) ? new Date() : d, startTime: e.startTime, endTime: e.endTime, location: e.location, description: e.description, recurrence: e.recurrence || 'none', recurrenceDays: e.recurrenceDays, recurrenceEndDate: e.recurrenceEndDate, rsvps: counts, userRsvps: userRsvpsMap, userRsvp: userRsvpsMap[firebaseUser?.uid || ''] as RSVPStatus, maxRegistrations: e.maxRegistrations, allowExternalRegistration: e.allowExternalRegistration
    };
  }).sort((a, b) => a.date.getTime() - b.date.getTime()), [eventsData, firebaseUser?.uid]);

  const gamesQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'games'), orderBy('date', 'desc'), limit(50));
  }, [activeTeam?.id, db]);
  const { data: gamesData } = useCollection(gamesQuery);
  const games = useMemo(() => (gamesData || []).map(g => ({
    id: g.id, teamId: g.teamId, opponent: g.opponent, date: new Date(g.date), myScore: g.myScore, opponentScore: g.opponentScore, result: g.result as GameResult, location: g.location, notes: g.notes, createdAt: g.createdAt
  })), [gamesData]);

  const alertsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'alerts'), orderBy('createdAt', 'desc'), limit(20));
  }, [activeTeam?.id, db]);
  const { data: alertsData } = useCollection(alertsQuery);
  const alerts = useMemo(() => (alertsData || []).map(a => ({ id: a.id, teamId: a.teamId, title: a.title, message: a.message, createdBy: a.createdBy, createdAt: a.createdAt })), [alertsData]);

  const chatsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return collection(db, 'teams', activeTeam.id, 'groupChats');
  }, [activeTeam?.id, db]);
  const { data: chatsData } = useCollection(chatsQuery);
  const chats = useMemo(() => (chatsData || []).map(c => ({ id: c.id, teamId: c.teamId, name: c.name, memberIds: c.memberIds })), [chatsData]);

  const drillsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return collection(db, 'teams', activeTeam.id, 'drills');
  }, [activeTeam?.id, db]);
  const { data: drillsData } = useCollection(drillsQuery);
  const drills = useMemo(() => (drillsData || []).map(d => ({
    id: d.id, teamId: d.teamId, title: d.title, description: d.description, thumbnailUrl: d.thumbnailUrl, photoUrl: d.photoUrl, videoUrl: d.videoUrl, category: d.category, createdBy: d.createdBy, createdAt: d.createdAt
  })), [drillsData]);

  const filesQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'files'), orderBy('createdAt', 'desc'), limit(50));
  }, [activeTeam?.id, db]);
  const { data: filesData } = useCollection(filesQuery);
  const files = useMemo(() => (filesData || []).map(f => ({
    id: f.id, teamId: f.teamId, name: f.fileName, type: f.fileType, size: f.fileSize, uploadedBy: f.uploaderName || 'Unknown', uploaderId: f.uploadedBy || f.uploaderId || '', date: new Date(f.createdAt), url: f.fileUrl
  })), [filesData]);

  useEffect(() => {
    if (!activeTeam || !activeChatId || !db) { setMessages([]); return; }
    const q = query(collection(db, 'teams', activeTeam.id, 'groupChats', activeChatId, 'messages'), orderBy('createdAt', 'asc'), limit(100));
    return onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)));
    });
  }, [activeTeam?.id, activeChatId, db]);

  const contextValue = useMemo(() => ({
    user: userProfile, 
    updateUser: (u: any) => updateUser(u, firebaseUser, db, userProfile, setUserProfile),
    activeTeam, 
    setActiveTeam: (t: Team) => setActiveTeamId(t.id),
    updateTeamHero: (u: string) => updateTeamHero(u, activeTeam, firebaseUser, db),
    updateTeamDetails: (u: any) => updateTeamDetails(u, activeTeam, firebaseUser, db),
    teams, members, 
    updateMember: (id: string, u: any) => activeTeam && updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'members', id), u),
    toggleFeesPaid: (id: string) => { const m = members.find(x => x.id === id); if (m && activeTeam) updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'members', id), { feesPaid: !m.feesPaid }); },
    chats, 
    createChat: (n: string, ids: string[]) => createChat(n, ids, activeTeam, firebaseUser, db),
    messages, activeChatId, setActiveChatId, 
    addMessage: (id: string, a: string, c: string, t: any, i?: string, p?: any) => addMessage(id, a, c, t, i, p, activeTeam, firebaseUser, db),
    votePoll: (cid: string, mid: string, idx: number) => votePoll(cid, mid, idx, activeTeam, firebaseUser, db),
    posts, 
    addPost: (c: string, i?: string, t: any = 'user', sd?: any, p?: any) => addPost(c, i, t, sd, p, activeTeam, firebaseUser, db, userProfile),
    deletePost: (id: string) => activeTeam && deleteDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'feedPosts', id)),
    addComment: (pid: string, c: string, i?: string) => addComment(pid, c, i, activeTeam, firebaseUser, db, userProfile),
    deleteComment: (pid: string, cid: string) => activeTeam && deleteDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'feedPosts', pid, 'comments', cid)),
    toggleLike: (id: string) => toggleLike(id, activeTeam, firebaseUser, db),
    votePostPoll: (id: string, idx: number) => votePostPoll(id, idx, activeTeam, firebaseUser, db),
    events, 
    addEvent: (e: any) => addEvent(e, activeTeam, firebaseUser, db),
    updateEvent: (id: string, u: any) => activeTeam && updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'events', id), u),
    deleteEvent: (id: string) => activeTeam && deleteDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'events', id)),
    updateRSVP: (id: string, s: RSVPStatus) => updateRSVP(id, s, activeTeam, firebaseUser, db),
    addRegistration: (tid: string, eid: string, d: any) => addRegistration(tid, eid, d, db),
    promoteToRoster: (tid: string, eid: string, r: any) => promoteToRoster(tid, eid, r, activeTeam, db),
    games, 
    addGame: (g: any) => addGame(g, activeTeam, firebaseUser, db),
    updateGame: (id: string, u: any) => activeTeam && updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'games', id), u),
    files, 
    addFile: (n: string, t: string, s: string, u: string) => addFile(n, t, s, u, activeTeam, firebaseUser, db, userProfile),
    deleteFile: (id: string) => activeTeam && deleteDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'files', id)),
    drills, 
    addDrill: (d: any) => addDrill(d, activeTeam, firebaseUser, db),
    deleteDrill: (id: string) => activeTeam && deleteDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'drills', id)),
    alerts, 
    createAlert: (t: string, m: string) => createAlert(t, m, activeTeam, firebaseUser, db),
    createNewTeam: (n: string, p: string) => createNewTeam(n, p, firebaseUser, db, userProfile),
    inviteMember: (n: string, e: string, p: string) => { console.log(`Invite: ${n}`); },
    joinTeamWithCode: (c: string, p: string) => joinTeamWithCode(c, p, firebaseUser, db, userProfile),
    isLoading: isUserLoading, 
    formatTime: (d: any) => (typeof d === 'string' ? new Date(d) : d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }),
    isSuperAdmin,
    isPro: activeTeam?.isPro || isProEntitlementActive || isSuperAdmin,
    purchasePro: async () => setIsPaywallOpen(true),
    manageSubscription: async () => { try { await Purchases.getSharedInstance().openCustomerCenter(); } catch { toast({ title: "Error", description: "Failed to open settings.", variant: "destructive" }); } },
    isPaywallOpen, setIsPaywallOpen
  }), [userProfile, activeTeam, teams, members, chats, messages, activeChatId, posts, events, games, files, drills, alerts, isUserLoading, isProEntitlementActive, isSuperAdmin, isPaywallOpen, db, firebaseUser]);

  return <TeamContext.Provider value={contextValue}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (context === undefined) throw new Error('useTeam must be used within a TeamProvider');
  return context;
}

// Internal Helper Functions to keep Provider clean
function updateUser(updates: any, firebaseUser: any, db: any, userProfile: any, setUserProfile: any) {
  if (!firebaseUser) return;
  updateDocumentNonBlocking(doc(db, 'users', firebaseUser.uid), updates);
  if (userProfile) setUserProfile({ ...userProfile, ...updates });
}

function updateTeamHero(url: string, activeTeam: any, firebaseUser: any, db: any) {
  if (!activeTeam || !firebaseUser) return;
  updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id), { heroImageUrl: url });
  updateDocumentNonBlocking(doc(db, 'users', firebaseUser.uid, 'teamMemberships', activeTeam.id), { heroImageUrl: url });
}

async function updateTeamDetails(updates: any, activeTeam: any, firebaseUser: any, db: any) {
  if (!activeTeam || !firebaseUser) return;
  const teamRef = doc(db, 'teams', activeTeam.id);
  const membershipRef = doc(db, 'users', firebaseUser.uid, 'teamMemberships', activeTeam.id);
  const f: any = {};
  if (updates.name) f.teamName = updates.name;
  if (updates.sport) f.sport = updates.sport;
  if (updates.teamLogoUrl) f.teamLogoUrl = updates.teamLogoUrl;
  if (Object.keys(f).length > 0) { updateDocumentNonBlocking(teamRef, f); updateDocumentNonBlocking(membershipRef, f); }
  toast({ title: "Squad Profile Updated" });
}

async function createChat(name: string, ids: string[], activeTeam: any, firebaseUser: any, db: any) {
  if (!activeTeam || !firebaseUser) return "";
  const id = `chat_${Date.now()}`;
  setDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'groupChats', id), { id, teamId: activeTeam.id, name, memberIds: [...ids, firebaseUser.uid], createdAt: new Date().toISOString() }, { merge: true });
  return id;
}

function addMessage(cid: string, a: string, c: string, t: any, img: any, p: any, activeTeam: any, firebaseUser: any, db: any) {
  if (!activeTeam || !firebaseUser) return;
  addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'groupChats', cid, 'messages'), { chatId: cid, author: a, authorId: firebaseUser.uid, content: c, type: t, imageUrl: img || null, poll: p || null, createdAt: new Date().toISOString() });
}

async function votePoll(cid: string, mid: string, idx: number, activeTeam: any, firebaseUser: any, db: any) {
  if (!activeTeam || !firebaseUser) return;
  const ref = doc(db, 'teams', activeTeam.id, 'groupChats', cid, 'messages', mid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const poll = snap.data().poll;
  const current = poll.voters?.[firebaseUser.uid];
  const u: any = { [`poll.voters.${firebaseUser.uid}`]: idx };
  if (current === undefined) { u[`poll.options.${idx}.votes`] = increment(1); u['poll.totalVotes'] = increment(1); }
  else if (current !== idx) { u[`poll.options.${current}.votes`] = increment(-1); u[`poll.options.${idx}.votes`] = increment(1); }
  updateDocumentNonBlocking(ref, u);
}

function addPost(c: string, img: any, t: any, sd: any, p: any, activeTeam: any, firebaseUser: any, db: any, userProfile: any) {
  if (!activeTeam || !firebaseUser) return;
  addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'feedPosts'), { teamId: activeTeam.id, content: c, imageUrl: img || null, type: t, systemData: sd || null, poll: p || null, authorId: firebaseUser.uid, author: { name: userProfile?.name || firebaseUser.displayName || 'Anonymous', avatar: userProfile?.avatar || firebaseUser.photoURL || '' }, createdAt: new Date().toISOString(), likes: [] });
}

function addComment(pid: string, c: string, img: any, activeTeam: any, firebaseUser: any, db: any, userProfile: any) {
  if (!activeTeam || !firebaseUser) return;
  addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'feedPosts', pid, 'comments'), { postId: pid, content: c, imageUrl: img || null, authorId: firebaseUser.uid, authorName: userProfile?.name || firebaseUser.displayName || 'Anonymous', createdAt: new Date().toISOString() });
}

async function toggleLike(pid: string, activeTeam: any, firebaseUser: any, db: any) {
  if (!activeTeam || !firebaseUser) return;
  const ref = doc(db, 'teams', activeTeam.id, 'feedPosts', pid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const likes = snap.data().likes || [];
  updateDocumentNonBlocking(ref, { likes: likes.includes(firebaseUser.uid) ? arrayRemove(firebaseUser.uid) : arrayUnion(firebaseUser.uid) });
}

async function votePostPoll(pid: string, idx: number, activeTeam: any, firebaseUser: any, db: any) {
  if (!activeTeam || !firebaseUser) return;
  const ref = doc(db, 'teams', activeTeam.id, 'feedPosts', pid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const poll = snap.data().poll;
  if (!poll) return;
  const current = poll.voters?.[firebaseUser.uid];
  const u: any = { [`poll.voters.${firebaseUser.uid}`]: idx };
  if (current === undefined) { u[`poll.options.${idx}.votes`] = increment(1); u['poll.totalVotes'] = increment(1); }
  else if (current !== idx) { u[`poll.options.${current}.votes`] = increment(-1); u[`poll.options.${idx}.votes`] = increment(1); }
  updateDocumentNonBlocking(ref, u);
}

function addEvent(ed: any, activeTeam: any, firebaseUser: any, db: any) {
  if (!activeTeam || !firebaseUser) return;
  const d = ed.date instanceof Date ? ed.date : new Date(ed.date);
  addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'events'), { ...ed, teamId: activeTeam.id, date: d.toISOString(), createdBy: firebaseUser.uid, createdAt: new Date().toISOString(), userRsvps: {} });
}

function updateRSVP(eid: string, s: RSVPStatus, activeTeam: any, firebaseUser: any, db: any) {
  if (!activeTeam || !firebaseUser) return;
  updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'events', eid), { [`userRsvps.${firebaseUser.uid}`]: s });
}

async function addRegistration(tid: string, eid: string, d: any, db: any) {
  try {
    const snap = await getDoc(doc(db, 'teams', tid, 'events', eid));
    if (!snap.exists()) return false;
    await addDoc(collection(db, 'teams', tid, 'events', eid, 'registrations'), { ...d, createdAt: new Date().toISOString(), status: 'pending' });
    return true;
  } catch { return false; }
}

async function promoteToRoster(tid: string, eid: string, reg: any, activeTeam: any, db: any) {
  if (!activeTeam) return;
  const batch = writeBatch(db);
  const mid = `reg_${reg.id}`;
  batch.set(doc(db, 'teams', tid, 'members', mid), { userId: mid, teamId: tid, role: 'Member', position: 'Prospect', name: reg.name, avatar: `https://picsum.photos/seed/${reg.id}/150/150`, joinedAt: new Date().toISOString() });
  batch.update(doc(db, 'teams', tid, 'events', eid, 'registrations', reg.id), { status: 'added' });
  await batch.commit();
  toast({ title: "Member Added", description: `${reg.name} is now on the roster.` });
}

function addGame(gd: any, activeTeam: any, firebaseUser: any, db: any) {
  if (!activeTeam || !firebaseUser) return;
  addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'games'), { ...gd, teamId: activeTeam.id, date: gd.date.toISOString(), createdAt: new Date().toISOString() });
}

function addFile(n: string, t: string, s: string, url: string, activeTeam: any, firebaseUser: any, db: any, userProfile: any) {
  if (!activeTeam || !firebaseUser) return;
  addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'files'), { teamId: activeTeam.id, fileName: n, fileType: t, fileSize: s, fileUrl: url, uploaderName: userProfile?.name || firebaseUser.displayName || 'Unknown', uploadedBy: firebaseUser.uid, createdAt: new Date().toISOString() });
}

function addDrill(dd: any, activeTeam: any, firebaseUser: any, db: any) {
  if (!activeTeam || !firebaseUser) return;
  addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'drills'), { ...dd, teamId: activeTeam.id, createdBy: firebaseUser.uid, createdAt: new Date().toISOString() });
}

function createAlert(t: string, m: string, activeTeam: any, firebaseUser: any, db: any) {
  if (!activeTeam || !firebaseUser) return;
  addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'alerts'), { teamId: activeTeam.id, title: t, message: m, createdBy: firebaseUser.uid, createdAt: new Date().toISOString() });
}

async function createNewTeam(name: string, pos: string, firebaseUser: any, db: any, userProfile: any) {
  if (!firebaseUser) return;
  const tid = `team_${Date.now()}`;
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const batch = writeBatch(db);
  batch.set(doc(db, 'teams', tid), { id: tid, teamName: name, teamCode: code, createdBy: firebaseUser.uid, createdAt: new Date().toISOString(), members: { [firebaseUser.uid]: 'Admin' }, isPro: false });
  batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), { userId: firebaseUser.uid, teamId: tid, role: 'Admin', position: pos || 'Coach', name: userProfile?.name || firebaseUser.displayName || 'Organizer', avatar: userProfile?.avatar || firebaseUser.photoURL || '', joinedAt: new Date().toISOString() });
  batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), { userId: firebaseUser.uid, teamId: tid, teamName: name, teamCode: code, role: 'Admin', isPro: false, joinedAt: new Date().toISOString() });
  await batch.commit();
}

async function joinTeamWithCode(code: string, pos: string, firebaseUser: any, db: any, userProfile: any) {
  if (!firebaseUser || !userProfile) return false;
  const qT = query(collection(db, 'teams'), where('teamCode', '==', code.toUpperCase()), limit(1));
  const snap = await getDocs(qT);
  if (snap.empty) return false;
  const tDoc = snap.docs[0];
  const tid = tDoc.id;
  const batch = writeBatch(db);
  batch.update(doc(db, 'teams', tid), { [`members.${firebaseUser.uid}`]: 'Member' });
  batch.set(doc(db, 'teams', tid, 'members', firebaseUser.uid), { userId: firebaseUser.uid, teamId: tid, role: 'Member', position: pos || 'Player', name: userProfile.name, avatar: userProfile.avatar, joinedAt: new Date().toISOString() });
  batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', tid), { userId: firebaseUser.uid, teamId: tid, teamName: tDoc.data().teamName, teamCode: code.toUpperCase(), role: 'Member', isPro: tDoc.data().isPro || false, joinedAt: new Date().toISOString() });
  await batch.commit();
  return true;
}
