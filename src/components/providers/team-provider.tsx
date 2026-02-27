
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
  getDocs,
  limit
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

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
  heroImageUrl?: string;
  membersMap?: Record<string, string>;
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
    voters?: Record<string, number>; // uid: optionIndex
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
  recurrenceDays?: string[];
  recurrenceEndDate?: string;
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
  updateTeamHero: (url: string) => Promise<void>;
  teams: Team[];
  members: Member[];
  updateMember: (id: string, updates: Partial<Member>) => void;
  chats: Chat[];
  createChat: (name: string, memberIds: string[]) => Promise<string>;
  messages: Message[];
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  addMessage: (chatId: string, author: string, content: string, type: 'text' | 'poll', poll?: any) => void;
  votePoll: (chatId: string, messageId: string, optionIndex: number) => Promise<void>;
  posts: Post[];
  addPost: (content: string, imageUrl?: string) => void;
  addComment: (postId: string, content: string) => void;
  events: TeamEvent[];
  addEvent: (event: Omit<TeamEvent, 'id' | 'teamId' | 'rsvps'>) => void;
  updateRSVP: (eventId: string, status: RSVPStatus) => void;
  files: TeamFile[];
  addFile: (name: string, type: string, size: string) => void;
  createNewTeam: (name: string, organizerPosition: string) => Promise<void>;
  inviteMember: (name: string, email: string, position: MemberPosition) => void;
  joinTeamWithCode: (code: string, position: string) => Promise<boolean>;
  isLoading: boolean;
  formatTime: (date: string | Date) => string;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user: firebaseUser, isUserLoading: isAuthLoading } = useUser();
  const db = useFirestore();
  
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

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
    return query(
      collection(db, 'teams'), 
      where(`members.${firebaseUser.uid}`, 'in', ['Admin', 'Member'])
    );
  }, [firebaseUser?.uid, db]);
  const { data: teamsData } = useCollection(teamsQuery);
  const teams = (teamsData || []).map(t => ({ 
    id: t.id, 
    name: t.teamName, 
    code: t.teamCode,
    heroImageUrl: t.heroImageUrl,
    membersMap: t.members
  }));

  useEffect(() => {
    if (teams.length > 0) {
      if (!activeTeam) {
        setActiveTeam(teams[0]);
      } else {
        const updated = teams.find(t => t.id === activeTeam.id);
        if (updated && (updated.heroImageUrl !== activeTeam.heroImageUrl || updated.name !== activeTeam.name)) {
          setActiveTeam(updated);
        }
      }
    }
  }, [teams, activeTeam]);

  const membersQuery = useMemoFirebase(() => {
    if (!activeTeam || !db || !firebaseUser) return null;
    return query(
      collection(db, 'teams', activeTeam.id, 'members'),
      where(`members.${firebaseUser.uid}`, 'in', ['Admin', 'Member'])
    );
  }, [activeTeam?.id, db, firebaseUser?.uid]);
  const { data: membersData } = useCollection(membersQuery);
  const members: Member[] = (membersData || []).map(m => ({
    id: m.userId,
    teamId: m.teamId,
    name: m.name || 'Member',
    role: m.role,
    position: m.position || 'Player',
    jersey: m.jersey || 'TBD',
    avatar: m.avatar || `https://picsum.photos/seed/${m.userId}/150/150`
  }));

  const postsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db || !firebaseUser) return null;
    return query(
      collection(db, 'teams', activeTeam.id, 'feedPosts'),
      where(`members.${firebaseUser.uid}`, 'in', ['Admin', 'Member'])
    );
  }, [activeTeam?.id, db, firebaseUser?.uid]);
  const { data: postsData } = useCollection(postsQuery);
  const posts: Post[] = (postsData || [])
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
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const eventsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db || !firebaseUser) return null;
    return query(
      collection(db, 'teams', activeTeam.id, 'events'),
      where(`members.${firebaseUser.uid}`, 'in', ['Admin', 'Member'])
    );
  }, [activeTeam?.id, db, firebaseUser?.uid]);
  const { data: eventsData } = useCollection(eventsQuery);
  const events: TeamEvent[] = (eventsData || [])
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
      recurrenceDays: e.recurrenceDays,
      recurrenceEndDate: e.recurrenceEndDate,
      rsvps: e.rsvps || { going: 0, notGoing: 0, maybe: 0 },
      userRsvp: e.userRsvps?.[firebaseUser?.uid || ''] as RSVPStatus
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const chatsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db || !firebaseUser) return null;
    return query(
      collection(db, 'teams', activeTeam.id, 'groupChats'),
      where(`members.${firebaseUser.uid}`, 'in', ['Admin', 'Member'])
    );
  }, [activeTeam?.id, db, firebaseUser?.uid]);
  const { data: chatsData } = useCollection(chatsQuery);
  const chats: Chat[] = (chatsData || []).map(c => ({
    id: c.id,
    teamId: c.teamId,
    name: c.name,
    memberIds: c.memberIds
  }));

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

  const filesQuery = useMemoFirebase(() => {
    if (!activeTeam || !db || !firebaseUser) return null;
    return query(
      collection(db, 'teams', activeTeam.id, 'files'),
      where(`members.${firebaseUser.uid}`, 'in', ['Admin', 'Member'])
    );
  }, [activeTeam?.id, db, firebaseUser?.uid]);
  const { data: filesData } = useCollection(filesQuery);
  const files: TeamFile[] = (filesData || [])
    .map(f => ({
      id: f.id,
      teamId: f.teamId,
      name: f.fileName,
      type: f.fileType,
      size: f.fileSize,
      uploadedBy: f.uploaderName || 'Unknown',
      date: new Date(f.createdAt)
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const formatTime = (date: string | Date) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const updateUser = (updates: Partial<UserProfile>) => {
    if (!firebaseUser) return;
    const docRef = doc(db, 'users', firebaseUser.uid);
    
    const firestoreUpdates: any = {};
    if (updates.name !== undefined) firestoreUpdates.fullName = updates.name;
    if (updates.email !== undefined) firestoreUpdates.email = updates.email;
    if (updates.phone !== undefined) firestoreUpdates.phone = updates.phone;
    if (updates.avatar !== undefined) firestoreUpdates.avatarUrl = updates.avatar;

    updateDoc(docRef, firestoreUpdates).catch(err => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'update' }));
    });

    if (userProfile) {
      setUserProfile({ ...userProfile, ...updates });
    }
  };

  const updateTeamHero = async (url: string) => {
    if (!activeTeam) return;
    const docRef = doc(db, 'teams', activeTeam.id);
    await updateDoc(docRef, { heroImageUrl: url }).catch(err => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'update' }));
    });
  };

  const updateMember = (id: string, updates: Partial<Member>) => {
    if (!activeTeam) return;
    const docRef = doc(db, 'teams', activeTeam.id, 'members', id);
    
    // If the Admin changes the position to Coach or Admin, we might want to toggle the Firestore role as well
    const firestoreUpdates: any = { ...updates };
    if (updates.position) {
      if (['Coach', 'Team Lead', 'Assistant Coach', 'Squad Leader'].includes(updates.position)) {
        firestoreUpdates.role = 'Admin';
      } else {
        firestoreUpdates.role = 'Member';
      }
    }

    updateDoc(docRef, firestoreUpdates).catch(err => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'update' }));
    });

    // Also update the parent team members map for authorization sync
    if (firestoreUpdates.role) {
      updateDoc(doc(db, 'teams', activeTeam.id), {
        [`members.${id}`]: firestoreUpdates.role
      });
      // Also update the membership document's own members map
      updateDoc(docRef, {
        [`members.${id}`]: firestoreUpdates.role
      });
    }
  };

  const createChat = async (name: string, memberIds: string[]) => {
    if (!activeTeam || !firebaseUser) return '';
    const colRef = collection(db, 'teams', activeTeam.id, 'groupChats');
    const docRef = await addDoc(colRef, {
      teamId: activeTeam.id,
      name,
      createdBy: firebaseUser.uid,
      memberIds: [firebaseUser.uid, ...memberIds],
      members: activeTeam.membersMap || { [firebaseUser.uid]: 'Admin' },
      createdAt: new Date().toISOString(),
      isDeleted: false
    });
    return docRef.id;
  };

  const addMessage = async (chatId: string, author: string, content: string, type: 'text' | 'poll', poll?: any) => {
    if (!activeTeam || !firebaseUser) return;
    const colRef = collection(db, 'teams', activeTeam.id, 'groupChats', chatId, 'messages');
    addDoc(colRef, {
      chatId,
      authorId: firebaseUser.uid,
      authorName: author,
      members: activeTeam.membersMap || {},
      content,
      type,
      pollData: poll || null,
      createdAt: new Date().toISOString()
    });
  };

  const votePoll = async (chatId: string, messageId: string, optionIndex: number) => {
    if (!activeTeam || !firebaseUser) return;
    const docRef = doc(db, 'teams', activeTeam.id, 'groupChats', chatId, 'messages', messageId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return;

    const msg = docSnap.data() as any;
    const poll = msg.pollData;
    if (!poll) return;

    const voters = poll.voters || {};
    const previousVote = voters[firebaseUser.uid];

    if (previousVote === optionIndex) return;

    const newVoters = { ...voters, [firebaseUser.uid]: optionIndex };
    
    const newOptions = poll.options.map((opt: any, idx: number) => {
      let count = 0;
      Object.values(newVoters).forEach(v => { if (v === idx) count++; });
      return { ...opt, votes: count };
    });

    await updateDoc(docRef, {
      'pollData.voters': newVoters,
      'pollData.options': newOptions,
      'pollData.totalVotes': Object.keys(newVoters).length
    }).catch(err => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'update' }));
    });
  };

  const addPost = async (content: string, imageUrl?: string) => {
    if (!activeTeam || !userProfile || !firebaseUser) return;
    const colRef = collection(db, 'teams', activeTeam.id, 'feedPosts');
    addDoc(colRef, {
      teamId: activeTeam.id,
      author: { name: userProfile.name, avatar: userProfile.avatar },
      authorId: firebaseUser.uid,
      members: activeTeam.membersMap || {},
      content,
      type: 'user',
      imageUrl: imageUrl || '',
      createdAt: new Date().toISOString()
    });
  };

  const addComment = async (postId: string, content: string) => {
    if (!activeTeam || !userProfile || !firebaseUser) return;
    const colRef = collection(db, 'teams', activeTeam.id, 'feedPosts', postId, 'comments');
    addDoc(colRef, {
      postId,
      authorId: firebaseUser.uid,
      authorName: userProfile.name,
      members: activeTeam.membersMap || {},
      content,
      createdAt: new Date().toISOString()
    });
  };

  const addEvent = async (eventData: Omit<TeamEvent, 'id' | 'teamId' | 'rsvps'>) => {
    if (!activeTeam || !firebaseUser) return;
    const colRef = collection(db, 'teams', activeTeam.id, 'events');
    addDoc(colRef, {
      ...eventData,
      teamId: activeTeam.id,
      members: activeTeam.membersMap || {},
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
    updateDoc(docRef, { [`userRsvps.${firebaseUser.uid}`]: status });
  };

  const addFile = async (name: string, type: string, size: string) => {
    if (!activeTeam || !userProfile || !firebaseUser) return;
    const colRef = collection(db, 'teams', activeTeam.id, 'files');
    addDoc(colRef, {
      teamId: activeTeam.id,
      fileName: name,
      fileType: type,
      fileSize: size,
      members: activeTeam.membersMap || {},
      uploadedBy: firebaseUser.uid,
      uploaderName: userProfile.name,
      createdAt: new Date().toISOString()
    });
  };

  const createNewTeam = async (name: string, organizerPosition: string) => {
    if (!firebaseUser) return;
    const teamId = `team_${Date.now()}`;
    const teamCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const membersMap = { [firebaseUser.uid]: 'Admin' };

    await setDoc(doc(db, 'teams', teamId), {
      id: teamId,
      teamName: name,
      sport: 'General',
      teamCode: teamCode,
      createdBy: firebaseUser.uid,
      createdAt: new Date().toISOString(),
      members: membersMap
    });

    await setDoc(doc(db, 'teams', teamId, 'members', firebaseUser.uid), {
      userId: firebaseUser.uid,
      teamId: teamId,
      role: 'Admin',
      position: organizerPosition || 'Coach',
      name: userProfile?.name || 'Organizer',
      avatar: userProfile?.avatar || `https://picsum.photos/seed/${firebaseUser.uid}/150/150`,
      joinedAt: new Date().toISOString(),
      members: membersMap
    });

    setActiveTeam({ id: teamId, name, code: teamCode, membersMap });
  };

  const joinTeamWithCode = async (code: string, position: string): Promise<boolean> => {
    if (!firebaseUser || !userProfile) return false;
    
    const teamsRef = collection(db, 'teams');
    const q = query(teamsRef, where('teamCode', '==', code.toUpperCase()), limit(1));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) return false;
    
    const teamDoc = querySnapshot.docs[0];
    const teamData = teamDoc.data();
    const teamId = teamDoc.id;
    
    const newMembersMap = { ...(teamData.members || {}), [firebaseUser.uid]: 'Member' };
    
    await updateDoc(doc(db, 'teams', teamId), {
      [`members.${firebaseUser.uid}`]: 'Member'
    });
    
    await setDoc(doc(db, 'teams', teamId, 'members', firebaseUser.uid), {
      userId: firebaseUser.uid,
      teamId: teamId,
      role: 'Member',
      position: position || 'Player',
      name: userProfile.name,
      avatar: userProfile.avatar,
      joinedAt: new Date().toISOString(),
      members: newMembersMap
    });
    
    return true;
  };

  const inviteMember = async (name: string, email: string, position: MemberPosition) => {
    if (!activeTeam) return;
    console.log(`[PROTOTYPE INVITE] To: ${name} (${email})`);
    console.log(`[PROTOTYPE INVITE] Team Code: ${activeTeam.code}`);
  };

  return (
    <TeamContext.Provider value={{ 
      user: userProfile, updateUser, activeTeam, setActiveTeam, updateTeamHero, teams, members, updateMember,
      chats, createChat, messages, activeChatId, setActiveChatId, addMessage, votePoll, posts, addPost, addComment,
      events, addEvent, updateRSVP, files, addFile, createNewTeam, inviteMember, joinTeamWithCode, isLoading: isAuthLoading, formatTime
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
