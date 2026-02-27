
"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';

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

const MOCK_TEAMS: Team[] = [
  { id: '1', name: 'Eagles Soccer Club', code: 'EAGL01' },
  { id: '2', name: 'Wildcats Basketball', code: 'CAT99X' }
];

const INITIAL_MEMBERS: Member[] = [
  { id: 'me_id', teamId: '1', name: 'James Miller', role: 'Admin', position: 'Coach', jersey: 'COACH', avatar: 'https://picsum.photos/seed/me/150/150' },
  { id: '2', teamId: '1', name: 'Alex Smith', role: 'Member', position: 'Player', jersey: '10', avatar: 'https://picsum.photos/seed/alex/150/150' },
  { id: '3', teamId: '1', name: 'Sarah Connor', role: 'Member', position: 'Parent', jersey: '08', avatar: 'https://picsum.photos/seed/sarah/150/150' },
  { id: '4', teamId: '2', name: 'Mike Ross', role: 'Member', position: 'Player', jersey: '04', avatar: 'https://picsum.photos/seed/mike/150/150' },
  { id: '5', teamId: '2', name: 'Donna Paulsen', role: 'Admin', position: 'Team Lead', jersey: 'MGR', avatar: 'https://picsum.photos/seed/donna/150/150' },
];

interface TeamContextType {
  user: UserProfile;
  updateUser: (updates: Partial<UserProfile>) => void;
  activeTeam: Team;
  setActiveTeam: (team: Team) => void;
  teams: Team[];
  members: Member[];
  updateMember: (id: string, updates: Partial<Member>) => void;
  chats: Chat[];
  createChat: (name: string, memberIds: string[]) => string;
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
  createNewTeam: (name: string, organizerPosition: string) => void;
  inviteMember: (name: string, position: MemberPosition) => void;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export function TeamProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile>({
    name: 'James Miller',
    email: 'j.miller@squadforge.com',
    phone: '+1 (555) 000-0000',
    avatar: 'https://picsum.photos/seed/me/150/150'
  });
  
  const [teams, setTeams] = useState<Team[]>(MOCK_TEAMS);
  const [activeTeam, setActiveTeam] = useState<Team>(MOCK_TEAMS[0]);
  const [members, setMembers] = useState<Member[]>(INITIAL_MEMBERS);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [events, setEvents] = useState<TeamEvent[]>([]);
  const [files, setFiles] = useState<TeamFile[]>([]);

  useEffect(() => {
    if (posts.length === 0) {
      setPosts([
        {
          id: '1',
          teamId: '1',
          author: { name: 'Coach Miller', avatar: 'https://picsum.photos/seed/coach/150/150' },
          content: "Great job today everyone! Let's keep this energy up for the tournament this weekend.",
          type: 'user',
          imageUrl: 'https://picsum.photos/seed/tournament/800/600',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          comments: [
            { id: 'c1', author: 'Alex Smith', content: 'Ready when you are!', createdAt: new Date(Date.now() - 1800000).toISOString() }
          ]
        },
        {
          id: '2',
          teamId: '1',
          author: { name: 'System', avatar: '' },
          content: "New Event: Regional Qualifiers - Saturday at 9:00 AM",
          type: 'system',
          createdAt: new Date(Date.now() - 7200000).toISOString(),
          comments: []
        }
      ]);
    }
    if (events.length === 0) {
      setEvents([
        {
          id: 'e1',
          teamId: '1',
          title: 'Morning Practice',
          date: new Date(),
          startTime: '07:00 AM',
          endTime: '09:00 AM',
          location: 'Pitch 4, Central Park',
          description: 'Drills and tactical session. Please bring both kits.',
          recurrence: 'weekly',
          rsvps: { going: 12, notGoing: 2, maybe: 4 }
        }
      ]);
    }
    if (files.length === 0) {
      setFiles([
        { id: 'f1', teamId: '1', name: 'Tournament_Schedule.pdf', type: 'pdf', size: '2.4 MB', uploadedBy: 'Coach Miller', date: new Date() }
      ]);
    }
    if (chats.length === 0) {
      setChats([
        { id: 'c1', teamId: '1', name: 'General Discussion', memberIds: ['me_id', '2', '3'], lastMessage: 'Training tomorrow is at 7am sharp!', time: '2m ago', unread: 3 }
      ]);
    }
  }, []);

  const updateUser = (updates: Partial<UserProfile>) => {
    setUser(prev => ({ ...prev, ...updates }));
    // Also update current member name for "Me"
    setMembers(prev => prev.map(m => m.id === 'me_id' ? { ...m, name: updates.name || m.name } : m));
  };

  const updateMember = (id: string, updates: Partial<Member>) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const createChat = (name: string, memberIds: string[]) => {
    const id = `chat_${Date.now()}`;
    const newChat: Chat = {
      id,
      teamId: activeTeam.id,
      name,
      memberIds: ['me_id', ...memberIds],
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
    const newPost: Post = {
      id: `post_${Date.now()}`,
      teamId: activeTeam.id,
      author: { name: user.name, avatar: user.avatar },
      content,
      type: 'user',
      imageUrl,
      createdAt: new Date().toISOString(),
      comments: []
    };
    setPosts(prev => [newPost, ...prev]);
  };

  const addComment = (postId: string, content: string) => {
    const newComment: Comment = {
      id: `comment_${Date.now()}`,
      author: user.name,
      content,
      createdAt: new Date().toISOString()
    };
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments: [...p.comments, newComment] } : p));
  };

  const addEvent = (eventData: Omit<TeamEvent, 'id' | 'teamId' | 'rsvps'>) => {
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
    const newFile: TeamFile = {
      id: `file_${Date.now()}`,
      teamId: activeTeam.id,
      name,
      type,
      size,
      uploadedBy: user.name,
      date: new Date()
    };
    setFiles(prev => [newFile, ...prev]);
  };

  const createNewTeam = (name: string, organizerPosition: string) => {
    const id = `team_${Date.now()}`;
    const newTeam: Team = {
      id,
      name,
      code: Math.random().toString(36).substring(2, 8).toUpperCase()
    };
    setTeams(prev => [...prev, newTeam]);
    
    // Add organizer as admin member
    const newMember: Member = {
      id: 'me_id',
      teamId: id,
      name: user.name,
      role: 'Admin',
      position: organizerPosition || 'Coach',
      jersey: 'COACH',
      avatar: user.avatar
    };
    setMembers(prev => [...prev, newMember]);
    setActiveTeam(newTeam);
  };

  const inviteMember = (name: string, position: MemberPosition) => {
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
      user,
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
      inviteMember
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
