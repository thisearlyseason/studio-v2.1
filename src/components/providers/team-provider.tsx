"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useUser, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { 
  collection, 
  query, 
  where, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  addDoc,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export type UserProfile = {
  name: string;
  email: string;
  phone: string;
  avatar: string;
};

export type Team = {
  id: string;
  name: string;
  code: string;
};

export type MemberPosition = 'Coach' | 'Team Lead' | 'Assistant Coach' | 'Squad Leader' | 'Player' | 'Parent' | string;

export type Member = {
  id: string;
  teamId: string;
  name: string;
  role: 'Admin' | 'Member';
  position: MemberPosition;
  jersey: string;
  avatar: string;
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
};

export type Message = {
  id: string;
  chatId: string;
  author: string;
  content?: string;
  type: 'text' | 'poll';
  createdAt: string;
  poll?: {
    id: string;
    question: string;
    options: PollOption[];
    totalVotes: number;
    userVoted?: number;
    isClosed: boolean;
  };
};

export type Post = {
  id: string;
  teamId: string;
  author: { name: string; avatar: string };
  content: string;
  type: 'user' | 'system';
  imageUrl?: string;
  createdAt: string;
  comments: Comment[];
};

export type Comment = {
  id: string;
  author: string;
  content: string;
  createdAt: string;
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
  rsvps: { going: number; notGoing: number; maybe: number };
  userRsvp?: RSVPStatus;
};

export type TeamFile = {
  id: string;
  teamId: string;
  name: string;
  type: string;
  size: string;
  uploadedBy: string;
  date: Date;
};

interface TeamContextType {
  user: UserProfile | null;
  updateUser: (updates: Partial<UserProfile>) => void;
  activeTeam: Team | null;
  setActiveTeam: (team: Team) => void;
  teams: Team[];
  members: Member[];
  updateMember: (id: string, updates: Partial<Member>) => void;
  chats: Chat[];
  createChat: (name: string, memberIds: string[]) => Promise<string>;
  messages: Message[];
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  addMessage: (chatId: string, author: string, content: string, type: 'text' | 'poll', poll?: any) => void;
  posts: Post[];
  addPost: (content: string, imageUrl?: string) => void;
  addComment: (postId: string, content: string) => void;
  events: TeamEvent[];
  addEvent: (event: Omit<TeamEvent, 'id' | 'teamId' | 'rsvps'>) => void;
  updateRSVP: (eventId: string, status: RSVPStatus) => void;
  files: TeamFile[];
  addFile: (name: string, type: string, size: string) => void;
  createNewTeam: (name: string, organizerPosition: string) => Promise<void>;
  inviteMember: (name: string, position: MemberPosition) => void;
  isLoading: boolean;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

// --- Mock Data Generators ---

const generateMockMembers = (teamId: string): Member[] => [
  { id: 'm1', teamId, name: 'Alex Johnson', role: 'Admin', position: 'Coach', jersey: 'CH', avatar: 'https://picsum.photos/seed/m1/150/150' },
  { id: 'm2', teamId, name: 'Sarah Williams', role: 'Member', position: 'Point Guard', jersey: '23', avatar: 'https://picsum.photos/seed/m2/150/150' },
  { id: 'm3', teamId, name: 'Mike Thompson', role: 'Member', position: 'Small Forward', jersey: '11', avatar: 'https://picsum.photos/seed/m3/150/150' },
  { id: 'm4', teamId, name: 'Jessica Chen', role: 'Member', position: 'Parent', jersey: 'PAR', avatar: 'https://picsum.photos/seed/m4/150/150' },
];

const generateMockPosts = (teamId: string): Post[] => [
  {
    id: 'p1',
    teamId,
    author: { name: 'Alex Johnson', avatar: 'https://picsum.photos/seed/m1/150/150' },
    content: "Great hustle at practice tonight! The defensive rotations are looking much tighter. Let's keep this intensity for Saturday's game. 🏀",
    type: 'user',
    imageUrl: 'https://picsum.photos/seed/practice/800/600',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    comments: [
      { id: 'c1', author: 'Sarah Williams', content: "Feeling good about the new play!", createdAt: new Date(Date.now() - 1800000).toISOString() }
    ]
  },
  {
    id: 'p2',
    teamId,
    author: { name: 'System', avatar: '' },
    content: "New event scheduled: Team Dinner at Pizza Palace after the tournament.",
    type: 'system',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    comments: []
  }
];

const generateMockEvents = (teamId: string): TeamEvent[] => [
  {
    id: 'e1',
    teamId,
    title: 'Morning Conditioning',
    date: new Date(Date.now() + 86400000), // Tomorrow
    startTime: '07:00',
    endTime: '08:30',
    location: 'Community Park',
    description: 'Drills and fitness focus.',
    recurrence: 'weekly',
    rsvps: { going: 12, notGoing: 2, maybe: 1 },
    userRsvp: 'going'
  },
  {
    id: 'e2',
    teamId,
    title: 'Championship Game',
    date: new Date(Date.now() + 259200000), // 3 days
    startTime: '19:00',
    endTime: '21:00',
    location: 'City Arena',
    description: 'Final game of the season. Wear the away jerseys!',
    recurrence: 'none',
    rsvps: { going: 15, notGoing: 0, maybe: 0 },
    userRsvp: 'going'
  }
];

const generateMockChats = (teamId: string): Chat[] => [
  { id: 'ch1', teamId, name: 'General Discussion', memberIds: ['m1', 'm2', 'm3', 'm4'], lastMessage: 'See you all tomorrow!', time: '10:30 AM', unread: 2 },
  { id: 'ch2', teamId, name: 'Tactics & Plays', memberIds: ['m1', 'm2', 'm3'], lastMessage: 'Check the new playbook PDF.', time: 'Yesterday' }
];

const generateMockFiles = (teamId: string): TeamFile[] => [
  { id: 'f1', teamId, name: 'OffensivePlaybook_V2.pdf', type: 'PDF', size: '2.4 MB', uploadedBy: 'Alex Johnson', date: new Date() },
  { id: 'f2', teamId, name: 'TeamPhoto_Regionals.jpg', type: 'JPG', size: '4.1 MB', uploadedBy: 'Sarah Williams', date: new Date(Date.now() - 604800000) }
];

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user: firebaseUser, isUserLoading: isAuthLoading } = useUser();
  const db = useFirestore();
  
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Fetch User Profile
  useEffect(() => {
    if (firebaseUser) {
      const fetchProfile = async () => {
        const docRef = doc(db, 'users', firebaseUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserProfile({
            name: data.fullName || firebaseUser.displayName || 'Anonymous',
            email: data.email || firebaseUser.email || '',
            phone: data.phone || '',
            avatar: data.avatarUrl || `https://picsum.photos/seed/${firebaseUser.uid}/150/150`
          });
        }
      };
      fetchProfile();
    }
  }, [firebaseUser, db]);

  // Fetch Teams
  const teamsQuery = useMemoFirebase(() => {
    if (!firebaseUser || !db) return null;
    return query(
      collection(db, 'teams'), 
      where(`members.${firebaseUser.uid}`, 'in', ['Admin', 'Member'])
    );
  }, [firebaseUser?.uid, db]);
  const { data: teamsData } = useCollection(teamsQuery);
  const teams = (teamsData || []).map(t => ({ id: t.id, name: t.teamName, code: t.teamCode }));

  useEffect(() => {
    if (teams.length > 0 && !activeTeam) {
      setActiveTeam(teams[0]);
    }
  }, [teams, activeTeam]);

  // Fetch Members
  const membersQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return collection(db, 'teams', activeTeam.id, 'members');
  }, [activeTeam?.id, db]);
  const { data: membersData } = useCollection(membersQuery);
  const members: Member[] = membersData && membersData.length > 0 
    ? (membersData || []).map(m => ({
        id: m.userId,
        teamId: m.teamId,
        name: m.name || 'Member',
        role: m.role,
        position: m.position || 'Player',
        jersey: m.jersey || 'TBD',
        avatar: m.avatar || `https://picsum.photos/seed/${m.userId}/150/150`
      }))
    : (activeTeam ? generateMockMembers(activeTeam.id) : []);

  // Fetch Posts
  const postsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db || !firebaseUser) return null;
    return query(
      collection(db, 'teams', activeTeam.id, 'feedPosts'),
      where(`members.${firebaseUser.uid}`, 'in', ['Admin', 'Member'])
    );
  }, [activeTeam?.id, db, firebaseUser?.uid]);
  const { data: postsData } = useCollection(postsQuery);
  const posts: Post[] = postsData && postsData.length > 0
    ? (postsData || [])
        .map(p => ({
          id: p.id,
          teamId: p.teamId,
          author: p.author || { name: 'Anonymous', avatar: '' },
          content: p.content,
          type: p.type || 'user',
          imageUrl: p.imageUrl,
          createdAt: p.createdAt,
          comments: []
        }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : (activeTeam ? generateMockPosts(activeTeam.id) : []);

  // Fetch Events
  const eventsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db || !firebaseUser) return null;
    return query(
      collection(db, 'teams', activeTeam.id, 'events'),
      where(`members.${firebaseUser.uid}`, 'in', ['Admin', 'Member'])
    );
  }, [activeTeam?.id, db, firebaseUser?.uid]);
  const { data: eventsData } = useCollection(eventsQuery);
  const events: TeamEvent[] = eventsData && eventsData.length > 0
    ? (eventsData || [])
        .map(e => ({
          id: e.id,
          teamId: e.teamId,
          title: e.title,
          date: new Date(e.date),
          startTime: e.startTime,
          endTime: e.endTime,
          location: e.location,
          description: e.description,
          recurrence: e.recurrence || 'none',
          rsvps: e.rsvps || { going: 0, notGoing: 0, maybe: 0 },
          userRsvp: e.userRsvps?.[firebaseUser?.uid || ''] as RSVPStatus
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime())
    : (activeTeam ? generateMockEvents(activeTeam.id) : []);

  // Fetch Chats
  const chatsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db || !firebaseUser) return null;
    return query(
      collection(db, 'teams', activeTeam.id, 'groupChats'),
      where(`members.${firebaseUser.uid}`, 'in', ['Admin', 'Member'])
    );
  }, [activeTeam?.id, db, firebaseUser?.uid]);
  const { data: chatsData } = useCollection(chatsQuery);
  const chats: Chat[] = chatsData && chatsData.length > 0
    ? (chatsData || []).map(c => ({
        id: c.id,
        teamId: c.teamId,
        name: c.name,
        memberIds: c.memberIds,
        lastMessage: 'Open to view messages',
        time: 'Now'
      }))
    : (activeTeam ? generateMockChats(activeTeam.id) : []);

  // Fetch Messages for active chat
  const messagesQuery = useMemoFirebase(() => {
    if (!activeTeam || !activeChatId || !db || !firebaseUser) return null;
    return query(
      collection(db, 'teams', activeTeam.id, 'groupChats', activeChatId, 'messages'),
      where(`members.${firebaseUser.uid}`, 'in', ['Admin', 'Member'])
    );
  }, [activeTeam?.id, activeChatId, db, firebaseUser?.uid]);
  const { data: messagesData } = useCollection(messagesQuery);
  const messages: Message[] = (messagesData || [])
    .map(m => ({
      id: m.id,
      chatId: m.chatId,
      author: m.authorName || 'Unknown',
      content: m.content,
      type: m.type as 'text' | 'poll',
      createdAt: m.createdAt,
      poll: m.pollData
    }))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Fetch Files
  const filesQuery = useMemoFirebase(() => {
    if (!activeTeam || !db || !firebaseUser) return null;
    return query(
      collection(db, 'teams', activeTeam.id, 'files'),
      where(`members.${firebaseUser.uid}`, 'in', ['Admin', 'Member'])
    );
  }, [activeTeam?.id, db, firebaseUser?.uid]);
  const { data: filesData } = useCollection(filesQuery);
  const files: TeamFile[] = filesData && filesData.length > 0
    ? (filesData || [])
        .map(f => ({
          id: f.id,
          teamId: f.teamId,
          name: f.fileName,
          type: f.fileType,
          size: f.fileSize,
          uploadedBy: f.uploaderName || 'Unknown',
          date: new Date(f.createdAt)
        }))
        .sort((a, b) => b.date.getTime() - a.date.getTime())
    : (activeTeam ? generateMockFiles(activeTeam.id) : []);

  // Methods
  const updateUser = (updates: Partial<UserProfile>) => {
    if (!firebaseUser) return;
    const docRef = doc(db, 'users', firebaseUser.uid);
    updateDoc(docRef, {
      fullName: updates.name,
      email: updates.email,
      phone: updates.phone
    }).catch(err => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'update' }));
    });
    setUserProfile(prev => prev ? { ...prev, ...updates } : null);
  };

  const updateMember = (id: string, updates: Partial<Member>) => {
    if (!activeTeam) return;
    const docRef = doc(db, 'teams', activeTeam.id, 'members', id);
    updateDoc(docRef, updates).catch(err => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'update' }));
    });
  };

  const createChat = async (name: string, memberIds: string[]) => {
    if (!activeTeam || !firebaseUser) return '';
    const colRef = collection(db, 'teams', activeTeam.id, 'groupChats');
    const teamDocSnap = await getDoc(doc(db, 'teams', activeTeam.id));
    const membersMap = teamDocSnap.exists() ? teamDocSnap.data().members : {};

    const newChat = {
      teamId: activeTeam.id,
      name,
      createdBy: firebaseUser.uid,
      memberIds: [firebaseUser.uid, ...memberIds],
      members: membersMap,
      createdAt: new Date().toISOString(),
      isDeleted: false
    };
    const docRef = await addDoc(colRef, newChat);
    return docRef.id;
  };

  const addMessage = async (chatId: string, author: string, content: string, type: 'text' | 'poll', poll?: any) => {
    if (!activeTeam || !firebaseUser) return;
    const colRef = collection(db, 'teams', activeTeam.id, 'groupChats', chatId, 'messages');
    const teamDocSnap = await getDoc(doc(db, 'teams', activeTeam.id));
    const membersMap = teamDocSnap.exists() ? teamDocSnap.data().members : {};

    addDoc(colRef, {
      chatId,
      authorId: firebaseUser.uid,
      authorName: author,
      members: membersMap,
      content,
      type,
      pollData: poll || null,
      createdAt: new Date().toISOString()
    });
  };

  const addPost = async (content: string, imageUrl?: string) => {
    if (!activeTeam || !userProfile || !firebaseUser) return;
    const colRef = collection(db, 'teams', activeTeam.id, 'feedPosts');
    const teamDocSnap = await getDoc(doc(db, 'teams', activeTeam.id));
    const membersMap = teamDocSnap.exists() ? teamDocSnap.data().members : {};

    addDoc(colRef, {
      teamId: activeTeam.id,
      author: { name: userProfile.name, avatar: userProfile.avatar },
      authorId: firebaseUser.uid,
      members: membersMap,
      content,
      type: 'user',
      imageUrl: imageUrl || '',
      createdAt: new Date().toISOString()
    });
  };

  const addComment = async (postId: string, content: string) => {
    if (!activeTeam || !userProfile || !firebaseUser) return;
    const colRef = collection(db, 'teams', activeTeam.id, 'feedPosts', postId, 'comments');
    const teamDocSnap = await getDoc(doc(db, 'teams', activeTeam.id));
    const membersMap = teamDocSnap.exists() ? teamDocSnap.data().members : {};

    addDoc(colRef, {
      postId,
      authorId: firebaseUser.uid,
      authorName: userProfile.name,
      members: membersMap,
      content,
      createdAt: new Date().toISOString()
    });
  };

  const addEvent = async (eventData: Omit<TeamEvent, 'id' | 'teamId' | 'rsvps'>) => {
    if (!activeTeam || !firebaseUser) return;
    const colRef = collection(db, 'teams', activeTeam.id, 'events');
    const teamDocSnap = await getDoc(doc(db, 'teams', activeTeam.id));
    const membersMap = teamDocSnap.exists() ? teamDocSnap.data().members : {};

    addDoc(colRef, {
      ...eventData,
      teamId: activeTeam.id,
      members: membersMap,
      date: eventData.date.toISOString(),
      createdBy: firebaseUser.uid,
      createdAt: new Date().toISOString(),
      rsvps: { going: 1, notGoing: 0, maybe: 0 },
      userRsvps: { [firebaseUser.uid]: 'going' }
    });
  };

  const updateRSVP = (eventId: string, status: RSVPStatus) => {
    if (!activeTeam || !firebaseUser) return;
    const docRef = doc(db, 'teams', activeTeam.id, 'events', eventId);
    updateDoc(docRef, {
      [`userRsvps.${firebaseUser.uid}`]: status
    });
  };

  const addFile = async (name: string, type: string, size: string) => {
    if (!activeTeam || !userProfile || !firebaseUser) return;
    const colRef = collection(db, 'teams', activeTeam.id, 'files');
    const teamDocSnap = await getDoc(doc(db, 'teams', activeTeam.id));
    const membersMap = teamDocSnap.exists() ? teamDocSnap.data().members : {};

    addDoc(colRef, {
      teamId: activeTeam.id,
      fileName: name,
      fileType: type,
      fileSize: size,
      members: membersMap,
      uploadedBy: firebaseUser.uid,
      uploaderName: userProfile.name,
      createdAt: new Date().toISOString()
    });
  };

  const createNewTeam = async (name: string, organizerPosition: string) => {
    if (!firebaseUser) return;
    const teamId = `team_${Date.now()}`;
    const teamCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    await setDoc(doc(db, 'teams', teamId), {
      id: teamId,
      teamName: name,
      sport: 'General',
      teamCode: teamCode,
      createdBy: firebaseUser.uid,
      createdAt: new Date().toISOString(),
      members: { [firebaseUser.uid]: 'Admin' }
    });

    await setDoc(doc(db, 'teams', teamId, 'members', firebaseUser.uid), {
      userId: firebaseUser.uid,
      teamId: teamId,
      role: 'Admin',
      position: organizerPosition || 'Coach',
      name: userProfile?.name || 'Organizer',
      joinedAt: new Date().toISOString()
    });

    setActiveTeam({ id: teamId, name, code: teamCode });
  };

  const inviteMember = async (name: string, position: MemberPosition) => {
    if (!activeTeam) return;
    const teamId = activeTeam.id;
    const mockUserId = `invited_${Date.now()}`;
    
    const teamRef = doc(db, 'teams', teamId);
    await updateDoc(teamRef, {
      [`members.${mockUserId}`]: 'Member'
    });

    await setDoc(doc(db, 'teams', teamId, 'members', mockUserId), {
      userId: mockUserId,
      teamId: teamId,
      role: 'Member',
      position,
      name,
      joinedAt: new Date().toISOString()
    });
  };

  return (
    <TeamContext.Provider value={{ 
      user: userProfile,
      updateUser,
      activeTeam, 
      setActiveTeam, 
      teams, 
      members, 
      updateMember,
      chats,
      createChat,
      messages,
      activeChatId,
      setActiveChatId,
      addMessage,
      posts,
      addPost,
      addComment,
      events,
      addEvent,
      updateRSVP,
      files,
      addFile,
      createNewTeam,
      inviteMember,
      isLoading: isAuthLoading
    }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (context === undefined) {
    throw new Error('useTeam must be used within a TeamProvider');
  }
  return context;
}
