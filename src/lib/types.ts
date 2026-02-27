
export type UserRole = 'Admin' | 'Member';

export interface User {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  notificationsEnabled: boolean;
  createdAt: string;
}

export interface Team {
  id: string;
  teamName: string;
  sport: string;
  teamLogoUrl?: string;
  teamCode: string;
  creatorId: string;
}

export interface TeamMember {
  id: string;
  userId: string;
  teamId: string;
  role: UserRole;
  position?: string;
  jerseyNumber?: string;
}

export interface Post {
  id: string;
  teamId: string;
  authorId: string;
  content: string;
  imageUrl?: string;
  linkedEventId?: string;
  createdAt: string;
  type: 'user' | 'system';
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  createdAt: string;
}

export interface TeamEvent {
  id: string;
  teamId: string;
  title: string;
  date: string;
  startTime: string;
  endTime?: string;
  location?: string;
  description?: string;
  createdBy: string;
  createdAt: string;
}

export type RSVPStatus = 'Going' | 'Not Going' | 'Maybe';

export interface RSVP {
  id: string;
  eventId: string;
  userId: string;
  status: RSVPStatus;
  updatedAt: string;
}

export interface Availability {
  id: string;
  userId: string;
  teamId: string;
  date: string;
  status: 'unavailable';
}

export interface GroupChat {
  id: string;
  teamId: string;
  name: string;
  createdBy: string;
  memberIds: string[];
  createdAt: string;
  isDeleted: boolean;
}

export type MessageType = 'text' | 'poll';

export interface ChatMessage {
  id: string;
  chatId: string;
  authorId: string;
  type: MessageType;
  content?: string;
  pollId?: string;
  createdAt: string;
}

export interface Poll {
  id: string;
  chatId: string;
  question: string;
  options: string[];
  createdBy: string;
  createdAt: string;
  isClosed: boolean;
}

export interface Vote {
  id: string;
  pollId: string;
  userId: string;
  selectedOptionIndex: number;
  updatedAt: string;
}

export interface SharedFile {
  id: string;
  teamId: string;
  fileUrl: string;
  fileName: string;
  uploadedBy: string;
  createdAt: string;
}
