
"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useUser, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { collection, query, where, doc, getDoc, setDoc, updateDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

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

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user: firebaseUser, isUserLoading: isAuthLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [events, setEvents] = useState<TeamEvent[]>([]);
  const [files, setFiles] = useState<TeamFile[]>([]);

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

  // Fetch Teams (Mocking the membership lookup for now via collection group or just listing)
  // In a real app, you'd query team memberships collection.
  useEffect(() => {
    if (firebaseUser) {
      // Mocking some initial team data if none exists
      setTeams([
        { id: '1', name: 'Eagles Soccer Club', code: 'EAGL01' },
        { id: '2', name: 'Wildcats Basketball', code: 'CAT99X' }
      ]);
      setActiveTeam({ id: '1', name: 'Eagles Soccer Club', code: 'EAGL01' });
    }
  }, [firebaseUser]);

  const updateUser = async (updates: Partial<UserProfile>) => {
    if (!firebaseUser) return;
    const docRef = doc(db, 'users', firebaseUser.uid);
    await updateDoc(docRef, {
      fullName: updates.name,
      email: updates.email,
      phone: updates.phone
    });
    setUserProfile(prev => prev ? { ...prev, ...updates } : null);
  };

  const updateMember = (id: string, updates: Partial<Member>) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const createChat = async (name: string, memberIds: string[]) => {
    if (!activeTeam || !firebaseUser) return '';
    const id = `chat_${Date.now()}`;
    const newChat: Chat = {
      id,
      teamId: activeTeam.id,
      name,
      memberIds: [firebaseUser.uid, ...memberIds],
      time: 'Just now',
      unread: 0
    };
    setChats(prev => [...prev, newChat]);
    return id;
  };

  const addMessage = (chatId: string, author: string, content: string, type: 'text' | 'poll', poll?: any) => {
    const newMessage: Message = {
      id: `m${Date.now()}`,
      chatId,
      author,
      content,
      type,
      poll,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, newMessage]);
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, lastMessage: content || 'Poll created', time: 'Just now' } : c));
  };

  const addPost = (content: string, imageUrl?: string) => {
    if (!activeTeam || !userProfile) return;
    const newPost: Post = {
      id: `post_${Date.now()}`,
      teamId: activeTeam.id,
      author: { name: userProfile.name, avatar: userProfile.avatar },
      content,
      type: 'user',
      imageUrl,
      createdAt: new Date().toISOString(),
      comments: []
    };
    setPosts(prev => [newPost, ...prev]);
  };

  const addComment = (postId: string, content: string) => {
    if (!userProfile) return;
    const newComment: Comment = {
      id: `comment_${Date.now()}`,
      author: userProfile.name,
      content,
      createdAt: new Date().toISOString()
    };
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments: [...p.comments, newComment] } : p));
  };

  const addEvent = (eventData: Omit<TeamEvent, 'id' | 'teamId' | 'rsvps'>) => {
    if (!activeTeam) return;
    const newEvent: TeamEvent = {
      ...eventData,
      id: `event_${Date.now()}`,
      teamId: activeTeam.id,
      rsvps: { going: 1, notGoing: 0, maybe: 0 },
      userRsvp: 'going'
    };
    setEvents(prev => [...prev, newEvent]);
  };

  const updateRSVP = (eventId: string, status: RSVPStatus) => {
    setEvents(prev => prev.map(e => {
      if (e.id !== eventId) return e;
      
      const newRsvps = { ...e.rsvps };
      if (e.userRsvp) {
        newRsvps[e.userRsvp]--;
      }
      newRsvps[status]++;
      
      return { ...e, rsvps: newRsvps, userRsvp: status };
    }));
  };

  const addFile = (name: string, type: string, size: string) => {
    if (!activeTeam || !userProfile) return;
    const newFile: TeamFile = {
      id: `file_${Date.now()}`,
      teamId: activeTeam.id,
      name,
      type,
      size,
      uploadedBy: userProfile.name,
      date: new Date()
    };
    setFiles(prev => [newFile, ...prev]);
  };

  const createNewTeam = async (name: string, organizerPosition: string) => {
    if (!firebaseUser) return;
    const teamId = `team_${Date.now()}`;
    const teamCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const newTeam: Team = {
      id: teamId,
      name,
      code: teamCode
    };

    // Create Team Document in Firestore
    await setDoc(doc(db, 'teams', teamId), {
      id: teamId,
      teamName: name,
      sport: 'General',
      teamCode: teamCode,
      createdBy: firebaseUser.uid,
      createdAt: new Date().toISOString()
    });

    // Add organizer as admin member
    const membershipId = `${teamId}_${firebaseUser.uid}`;
    await setDoc(doc(db, 'teams', teamId, 'members', firebaseUser.uid), {
      id: membershipId,
      userId: firebaseUser.uid,
      teamId: teamId,
      role: 'Admin',
      position: organizerPosition || 'Coach',
      jersey: 'COACH',
      joinedAt: new Date().toISOString()
    });

    setTeams(prev => [...prev, newTeam]);
    setActiveTeam(newTeam);
  };

  const inviteMember = (name: string, position: MemberPosition) => {
    if (!activeTeam) return;
    const newMember: Member = {
      id: `mem_${Date.now()}`,
      teamId: activeTeam.id,
      name,
      role: 'Member',
      position,
      jersey: position === 'Parent' ? 'PAR' : 'TBD',
      avatar: `https://picsum.photos/seed/${name}/150/150`
    };
    setMembers(prev => [...prev, newMember]);
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
