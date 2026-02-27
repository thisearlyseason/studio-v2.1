
"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
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
  type: 'user' | 'system';
  imageUrl?: string;
  createdAt: string;
  likes?: string[];
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
  addPost: (content: string, imageUrl?: string, type?: 'user' | 'system', systemData?: any) => void;
  deletePost: (postId: string) => void;
  addComment: (postId: string, content: string, imageUrl?: string) => void;
  deleteComment: (postId: string, commentId: string) => void;
  toggleLike: (postId: string) => Promise<void>;
  events: TeamEvent[];
  addEvent: (event: Omit<TeamEvent, 'id' | 'teamId' | 'rsvps'>) => void;
  updateEvent: (eventId: string, updates: Partial<TeamEvent>) => void;
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
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

const SUPER_ADMIN_EMAILS = ['thisearlyseason@gmail.com', 'test@gmail.com'];

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user: firebaseUser, isUserLoading } = useUser();
  const db = useFirestore();
  
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const isSuperAdmin = firebaseUser?.email ? SUPER_ADMIN_EMAILS.includes(firebaseUser.email) : false;

  useEffect(() => {
    if (firebaseUser) {
      const docRef = doc(db, 'users', firebaseUser.uid);
      getDoc(docRef).then(docSnap => {
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
    if (isSuperAdmin) return collection(db, 'teams');
    return collection(db, 'users', firebaseUser.uid, 'teamMemberships');
  }, [firebaseUser?.uid, db, isSuperAdmin]);

  const { data: teamsRawData } = useCollection(teamsQuery);
  const [teams, setTeams] = useState<Team[]>([]);

  useEffect(() => {
    if (!teamsRawData) return;
    if (isSuperAdmin) {
      setTeams(teamsRawData.map(t => ({
        id: t.id,
        name: t.teamName || t.name,
        code: t.teamCode || t.code,
        sport: t.sport,
        teamLogoUrl: t.teamLogoUrl,
        heroImageUrl: t.heroImageUrl,
        isPro: t.isPro || false,
        role: 'Admin'
      })));
    } else {
      setTeams(teamsRawData.map(m => ({
        id: m.teamId,
        name: m.teamName,
        code: m.teamCode,
        sport: m.sport,
        teamLogoUrl: m.teamLogoUrl,
        isPro: m.isPro || false,
        role: m.role || 'Member'
      })));
    }
  }, [teamsRawData, isSuperAdmin]);

  useEffect(() => {
    if (teams.length > 0) {
      if (!activeTeam) {
        setActiveTeam(teams[0]);
      } else {
        const updated = teams.find(t => t.id === activeTeam.id);
        if (updated) {
          const hasChanged = updated.name !== activeTeam.name || updated.teamLogoUrl !== activeTeam.teamLogoUrl || updated.role !== activeTeam.role || updated.isPro !== activeTeam.isPro;
          if (hasChanged) setActiveTeam(updated);
        }
      }
    }
  }, [teams, activeTeam]);

  const membersQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return collection(db, 'teams', activeTeam.id, 'members');
  }, [activeTeam?.id, db]);
  const { data: membersData } = useCollection(membersQuery);
  const members: Member[] = (membersData || []).map(m => ({
    id: m.id,
    userId: m.userId,
    teamId: m.teamId,
    name: m.name || 'Member',
    role: m.role,
    position: m.position || 'Player',
    jersey: m.jersey || 'TBD',
    avatar: m.avatar || `https://picsum.photos/seed/${m.userId}/150/150`,
    feesPaid: m.feesPaid || false
  }));

  const postsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'feedPosts'), orderBy('createdAt', 'desc'));
  }, [activeTeam?.id, db]);
  const { data: postsData } = useCollection(postsQuery);
  const posts: Post[] = (postsData || []).map(p => ({
    id: p.id, teamId: p.teamId, author: p.author || { name: 'Anonymous', avatar: '' }, authorId: p.authorId, content: p.content, type: p.type || 'user', imageUrl: p.imageUrl, createdAt: p.createdAt, likes: p.likes || [], systemData: p.systemData
  }));

  const eventsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return collection(db, 'teams', activeTeam.id, 'events');
  }, [activeTeam?.id, db]);
  const { data: eventsData } = useCollection(eventsQuery);
  const events: TeamEvent[] = (eventsData || []).map(e => {
    const userRsvpsMap = e.userRsvps || {};
    const counts = { going: 0, notGoing: 0, maybe: 0 };
    Object.values(userRsvpsMap).forEach(val => { if (val === 'going') counts.going++; if (val === 'notGoing') counts.notGoing++; if (val === 'maybe') counts.maybe++; });
    return {
      id: e.id, teamId: e.teamId, title: e.title, date: new Date(e.date), startTime: e.startTime, endTime: e.endTime, location: e.location, description: e.description,
      recurrence: e.recurrence || 'none', recurrenceDays: e.recurrenceDays, recurrenceEndDate: e.recurrenceEndDate, rsvps: counts, userRsvp: userRsvpsMap[firebaseUser?.uid || ''] as RSVPStatus,
      maxRegistrations: e.maxRegistrations, allowExternalRegistration: e.allowExternalRegistration
    };
  }).sort((a, b) => a.date.getTime() - b.date.getTime());

  const gamesQuery = useMemoFirebase(() => {
    if (!activeTeam || !db || (!activeTeam.isPro && !isSuperAdmin)) return null;
    return collection(db, 'teams', activeTeam.id, 'games');
  }, [activeTeam?.id, db, activeTeam?.isPro, isSuperAdmin]);
  const { data: gamesData } = useCollection(gamesQuery);
  const games: Game[] = (gamesData || []).map(g => ({
    id: g.id, teamId: g.teamId, opponent: g.opponent, date: new Date(g.date), myScore: g.myScore, opponentScore: g.opponentScore, result: g.result as GameResult, location: g.location, notes: g.notes, createdAt: g.createdAt
  })).sort((a, b) => b.date.getTime() - a.date.getTime());

  const alertsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'alerts'), orderBy('createdAt', 'desc'));
  }, [activeTeam?.id, db]);
  const { data: alertsData } = useCollection(alertsQuery);
  const alerts: TeamAlert[] = (alertsData || []).map(a => ({ id: a.id, teamId: a.teamId, title: a.title, message: a.message, createdBy: a.createdBy, createdAt: a.createdAt }));

  const chatsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return collection(db, 'teams', activeTeam.id, 'groupChats');
  }, [activeTeam?.id, db]);
  const { data: chatsData } = useCollection(chatsQuery);
  const chats: Chat[] = (chatsData || []).map(c => ({ id: c.id, teamId: c.teamId, name: c.name, memberIds: c.memberIds }));

  const drillsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db || (!activeTeam.isPro && !isSuperAdmin)) return null;
    return collection(db, 'teams', activeTeam.id, 'drills');
  }, [activeTeam?.id, db, activeTeam?.isPro, isSuperAdmin]);
  const { data: drillsData } = useCollection(drillsQuery);
  const drills: Drill[] = (drillsData || []).map(d => ({
    id: d.id, teamId: d.teamId, title: d.title, description: d.description, thumbnailUrl: d.thumbnailUrl, photoUrl: d.photoUrl, videoUrl: d.videoUrl, category: d.category, createdBy: d.createdBy, createdAt: d.createdAt
  }));

  const filesQuery = useMemoFirebase(() => {
    if (!activeTeam || !db || (!activeTeam.isPro && !isSuperAdmin)) return null;
    return collection(db, 'teams', activeTeam.id, 'files');
  }, [activeTeam?.id, db, activeTeam?.isPro, isSuperAdmin]);
  const { data: filesData } = useCollection(filesQuery);
  const files: TeamFile[] = (filesData || []).map(f => ({
    id: f.id, teamId: f.teamId, name: f.fileName, type: f.fileType, size: f.fileSize, uploadedBy: f.uploaderName || 'Unknown', uploaderId: f.uploadedBy || f.uploaderId || '', date: new Date(f.createdAt), url: f.fileUrl
  })).sort((a, b) => b.date.getTime() - a.date.getTime());

  useEffect(() => {
    if (!activeTeam || !activeChatId || !db) {
      setMessages([]);
      return;
    }
    const q = query(collection(db, 'teams', activeTeam.id, 'groupChats', activeChatId, 'messages'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs);
    });
    return () => unsubscribe();
  }, [activeTeam?.id, activeChatId, db]);

  const formatTime = (date: string | Date) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const updateUser = (updates: Partial<UserProfile>) => {
    if (!firebaseUser) return;
    const docRef = doc(db, 'users', firebaseUser.uid);
    updateDocumentNonBlocking(docRef, updates);
    if (userProfile) setUserProfile({ ...userProfile, ...updates });
  };

  const updateTeamHero = async (url: string) => {
    if (!activeTeam || !firebaseUser) return;
    updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id), { heroImageUrl: url });
    updateDocumentNonBlocking(doc(db, 'users', firebaseUser.uid, 'teamMemberships', activeTeam.id), { heroImageUrl: url });
  };

  const updateTeamDetails = async (updates: Partial<Team>) => {
    if (!activeTeam || !firebaseUser) return;
    const teamRef = doc(db, 'teams', activeTeam.id);
    const membershipRef = doc(db, 'users', firebaseUser.uid, 'teamMemberships', activeTeam.id);
    const firestoreUpdates: any = {};
    if (updates.name) firestoreUpdates.teamName = updates.name;
    if (updates.sport) firestoreUpdates.sport = updates.sport;
    if (updates.teamLogoUrl) firestoreUpdates.teamLogoUrl = updates.teamLogoUrl;
    if (Object.keys(firestoreUpdates).length > 0) {
      updateDocumentNonBlocking(teamRef, firestoreUpdates);
      updateDocumentNonBlocking(membershipRef, firestoreUpdates);
    }
    toast({ title: "Squad Profile Updated" });
  };

  const updateMember = (id: string, updates: Partial<Member>) => {
    if (!activeTeam) return;
    updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'members', id), updates);
  };

  const toggleFeesPaid = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return;
    updateMember(memberId, { feesPaid: !member.feesPaid });
  };

  const createChat = async (name: string, memberIds: string[]) => {
    if (!activeTeam || !firebaseUser) return "";
    const chatId = `chat_${Date.now()}`;
    const chatRef = doc(db, 'teams', activeTeam.id, 'groupChats', chatId);
    setDocumentNonBlocking(chatRef, {
      id: chatId, teamId: activeTeam.id, name, memberIds: [...memberIds, firebaseUser.uid], createdAt: new Date().toISOString()
    }, { merge: true });
    return chatId;
  };

  const addMessage = (chatId: string, author: string, content: string, type: 'text' | 'poll' | 'image', imageUrl?: string, poll?: any) => {
    if (!activeTeam || !firebaseUser) return;
    addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'groupChats', chatId, 'messages'), {
      chatId, author, authorId: firebaseUser.uid, content, type, imageUrl, poll, createdAt: new Date().toISOString()
    });
  };

  const votePoll = async (chatId: string, messageId: string, optionIndex: number) => {
    if (!activeTeam || !firebaseUser) return;
    const msgRef = doc(db, 'teams', activeTeam.id, 'groupChats', chatId, 'messages', messageId);
    const msgSnap = await getDoc(msgRef);
    if (!msgSnap.exists()) return;
    const poll = msgSnap.data().poll;
    const currentVote = poll.voters?.[firebaseUser.uid];
    const updates: any = { [`poll.voters.${firebaseUser.uid}`]: optionIndex };
    if (currentVote === undefined) {
      updates[`poll.options.${optionIndex}.votes`] = increment(1);
      updates['poll.totalVotes'] = increment(1);
    } else if (currentVote !== optionIndex) {
      updates[`poll.options.${currentVote}.votes`] = increment(-1);
      updates[`poll.options.${optionIndex}.votes`] = increment(1);
    }
    updateDocumentNonBlocking(msgRef, updates);
  };

  const addPost = (content: string, imageUrl?: string, type: 'user' | 'system' = 'user', systemData?: any) => {
    if (!activeTeam || !firebaseUser) return;
    addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'feedPosts'), {
      teamId: activeTeam.id, content, imageUrl, type, systemData, authorId: firebaseUser.uid,
      author: { name: userProfile?.name || 'Anonymous', avatar: userProfile?.avatar || '' }, createdAt: new Date().toISOString(), likes: []
    });
  };

  const deletePost = (postId: string) => {
    if (!activeTeam) return;
    deleteDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'feedPosts', postId));
  };

  const addComment = (postId: string, content: string, imageUrl?: string) => {
    if (!activeTeam || !firebaseUser) return;
    addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'feedPosts', postId, 'comments'), {
      postId, content, imageUrl, authorId: firebaseUser.uid, authorName: userProfile?.name || 'Anonymous', createdAt: new Date().toISOString()
    });
  };

  const deleteComment = (postId: string, commentId: string) => {
    if (!activeTeam) return;
    deleteDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'feedPosts', postId, 'comments', commentId));
  };

  const toggleLike = async (postId: string) => {
    if (!activeTeam || !firebaseUser) return;
    const postRef = doc(db, 'teams', activeTeam.id, 'feedPosts', postId);
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) return;
    const likes = postSnap.data().likes || [];
    if (likes.includes(firebaseUser.uid)) {
      updateDocumentNonBlocking(postRef, { likes: arrayRemove(firebaseUser.uid) });
    } else {
      updateDocumentNonBlocking(postRef, { likes: arrayUnion(firebaseUser.uid) });
    }
  };

  const addEvent = async (eventData: Omit<TeamEvent, 'id' | 'teamId' | 'rsvps'>) => {
    if (!activeTeam || !firebaseUser) return;
    
    // Safety check for date validity
    const eventDate = eventData.date instanceof Date ? eventData.date : new Date(eventData.date);
    if (isNaN(eventDate.getTime())) {
      console.error("Invalid event date provided to addEvent");
      return;
    }

    addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'events'), {
      ...eventData, 
      teamId: activeTeam.id, 
      date: eventDate.toISOString(), 
      createdBy: firebaseUser.uid, 
      createdAt: new Date().toISOString(), 
      userRsvps: { [firebaseUser.uid]: 'going' }
    });
  };

  const updateRSVP = (eventId: string, status: RSVPStatus) => {
    if (!activeTeam || !firebaseUser) return;
    updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'events', eventId), { [`userRsvps.${firebaseUser.uid}`]: status });
  };

  const addRegistration = async (teamId: string, eventId: string, data: Omit<EventRegistration, 'id' | 'createdAt' | 'status'>): Promise<boolean> => {
    try {
      const eventRef = doc(db, 'teams', teamId, 'events', eventId);
      const eventSnap = await getDoc(eventRef);
      if (!eventSnap.exists()) return false;
      const eventData = eventSnap.data();
      const regsRef = collection(db, 'teams', teamId, 'events', eventId, 'registrations');
      const regsSnap = await getDocs(regsRef);
      if (eventData.maxRegistrations && regsSnap.size >= eventData.maxRegistrations) return false;
      await addDoc(regsRef, { ...data, createdAt: new Date().toISOString(), status: 'pending' });
      return true;
    } catch (e) { return false; }
  };

  const promoteToRoster = async (teamId: string, eventId: string, reg: EventRegistration) => {
    if (!activeTeam) return;
    const batch = writeBatch(db);
    const memberId = `reg_${reg.id}`;
    batch.set(doc(db, 'teams', teamId, 'members', memberId), {
      userId: memberId, teamId, role: 'Member', position: 'Prospect', name: reg.name, avatar: `https://picsum.photos/seed/${reg.id}/150/150`, joinedAt: new Date().toISOString()
    });
    batch.update(doc(db, 'teams', teamId, 'events', eventId, 'registrations', reg.id), { status: 'added' });
    await batch.commit();
    toast({ title: "Member Added", description: `${reg.name} is now on the roster.` });
  };

  const addGame = (gameData: Omit<Game, 'id' | 'teamId' | 'createdAt'>) => {
    if (!activeTeam || !firebaseUser) return;
    addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'games'), {
      ...gameData, teamId: activeTeam.id, date: gameData.date.toISOString(), createdAt: new Date().toISOString()
    });
  };

  const addFile = (name: string, type: string, size: string, url: string) => {
    if (!activeTeam || !firebaseUser) return;
    addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'files'), {
      teamId: activeTeam.id, fileName: name, fileType: type, fileSize: size, fileUrl: url, uploaderName: userProfile?.name || 'Unknown', uploadedBy: firebaseUser.uid, createdAt: new Date().toISOString()
    });
  };

  const deleteFile = (fileId: string) => {
    if (!activeTeam) return;
    deleteDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'files', fileId));
  };

  const addDrill = (drillData: Omit<Drill, 'id' | 'teamId' | 'createdBy' | 'createdAt'>) => {
    if (!activeTeam || !firebaseUser) return;
    addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'drills'), {
      ...drillData, teamId: activeTeam.id, createdBy: firebaseUser.uid, createdAt: new Date().toISOString()
    });
  };

  const deleteDrill = (drillId: string) => {
    if (!activeTeam) return;
    deleteDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'drills', drillId));
  };

  const createAlert = (title: string, message: string) => {
    if (!activeTeam || !firebaseUser) return;
    addDocumentNonBlocking(collection(db, 'teams', activeTeam.id, 'alerts'), {
      teamId: activeTeam.id, title, message, createdBy: firebaseUser.uid, createdAt: new Date().toISOString()
    });
  };

  const createNewTeam = async (name: string, organizerPosition: string) => {
    if (!firebaseUser) return;
    const teamId = `team_${Date.now()}`;
    const teamCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const batch = writeBatch(db);
    batch.set(doc(db, 'teams', teamId), { id: teamId, teamName: name, teamCode, createdBy: firebaseUser.uid, createdAt: new Date().toISOString(), members: { [firebaseUser.uid]: 'Admin' }, isPro: false });
    batch.set(doc(db, 'teams', teamId, 'members', firebaseUser.uid), { userId: firebaseUser.uid, teamId, role: 'Admin', position: organizerPosition || 'Coach', name: userProfile?.name || 'Organizer', avatar: userProfile?.avatar || '', joinedAt: new Date().toISOString() });
    batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', teamId), { userId: firebaseUser.uid, teamId, teamName: name, teamCode, role: 'Admin', isPro: false, joinedAt: new Date().toISOString() });
    await batch.commit();
    setActiveTeam({ id: teamId, name, code: teamCode, role: 'Admin', isPro: false });
  };

  const joinTeamWithCode = async (code: string, position: string): Promise<boolean> => {
    if (!firebaseUser || !userProfile) return false;
    const qTeams = query(collection(db, 'teams'), where('teamCode', '==', code.toUpperCase()), limit(1));
    const querySnapshot = await getDocs(qTeams);
    if (querySnapshot.empty) return false;
    const teamDoc = querySnapshot.docs[0];
    const teamId = teamDoc.id;
    const batch = writeBatch(db);
    batch.update(doc(db, 'teams', teamId), { [`members.${firebaseUser.uid}`]: 'Member' });
    batch.set(doc(db, 'teams', teamId, 'members', firebaseUser.uid), { userId: firebaseUser.uid, teamId, role: 'Member', position: position || 'Player', name: userProfile.name, avatar: userProfile.avatar, joinedAt: new Date().toISOString() });
    batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', teamId), { userId: firebaseUser.uid, teamId, teamName: teamDoc.data().teamName, teamCode: code.toUpperCase(), role: 'Member', isPro: teamDoc.data().isPro || false, joinedAt: new Date().toISOString() });
    await batch.commit();
    return true;
  };

  const inviteMember = async (name: string, email: string, position: MemberPosition) => { console.log(`Invite to ${activeTeam?.name}: ${name}`); };

  return (
    <TeamContext.Provider value={{ 
      user: userProfile, updateUser, activeTeam, setActiveTeam, updateTeamHero, updateTeamDetails, teams, members, updateMember, toggleFeesPaid,
      chats, createChat, messages, activeChatId, setActiveChatId, addMessage, votePoll, posts, addPost, deletePost, addComment, deleteComment, toggleLike,
      events, addEvent, updateEvent: () => {}, updateRSVP, addRegistration, promoteToRoster, games, addGame, updateGame: () => {}, files, addFile, deleteFile, drills, addDrill, deleteDrill, alerts, createAlert,
      createNewTeam, inviteMember, joinTeamWithCode, isLoading: isUserLoading, formatTime, isSuperAdmin, isPro: activeTeam?.isPro || isSuperAdmin
    }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (context === undefined) throw new Error('useTeam must be used within a TeamProvider');
  return context;
}
