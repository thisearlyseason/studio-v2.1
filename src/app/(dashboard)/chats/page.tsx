
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, MessageSquare, ChevronRight, Hash } from 'lucide-react';
import { useTeam } from '@/components/providers/team-provider';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';

export default function ChatsPage() {
  const { activeTeam, members, createChat } = useTeam();
  const db = useFirestore();
  const router = useRouter();
  
  const [newChatName, setNewChatName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Localized chat fetching for performance
  const chatsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'groupChats'), orderBy('createdAt', 'desc'));
  }, [activeTeam?.id, db]);

  const { data: chatsData, isLoading: isChatsLoading } = useCollection(chatsQuery);
  const teamChats = useMemo(() => chatsData || [], [chatsData]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !activeTeam || isChatsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse">
        <div className="h-12 w-12 bg-primary/10 rounded-full mb-4" />
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Opening discussions...</p>
      </div>
    );
  }

  const teamMembers = members;

  const handleCreateChat = async () => {
    if (!newChatName.trim()) return;
    const chatId = await createChat(newChatName, selectedMembers);
    setIsNewChatOpen(false);
    setNewChatName('');
    setSelectedMembers([]);
    router.push(`/chats/${chatId}`);
  };

  const toggleMember = (memberId: string) => {
    setSelectedMembers(prev => 
      prev.includes(memberId) 
        ? prev.filter(id => id !== memberId) 
        : [...prev, memberId]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Messages</h1>
        <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-full shadow-lg shadow-primary/20 h-11 px-6 font-black uppercase text-xs">
              <Plus className="h-4 w-4 mr-2" />
              New Chat
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md rounded-[2.5rem] border-none shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black tracking-tight">Create Group Chat</DialogTitle>
              <DialogDescription className="font-bold text-primary/60 uppercase tracking-widest text-[10px]">
                Start a new discussion for {activeTeam.name}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-[10px] font-black uppercase tracking-widest ml-1">Chat Name</Label>
                <Input 
                  id="name" 
                  placeholder="e.g. Travel Planning, Tactics" 
                  value={newChatName}
                  onChange={(e) => setNewChatName(e.target.value)}
                  className="h-12 rounded-xl border-2 font-black"
                />
              </div>
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Select Team Members</Label>
                <ScrollArea className="h-48 border-2 rounded-2xl p-2 bg-muted/30">
                  <div className="space-y-2">
                    {teamMembers.map((member) => (
                      <div 
                        key={member.id} 
                        className="flex items-center justify-between p-3 hover:bg-background rounded-xl cursor-pointer transition-colors"
                        onClick={() => toggleMember(member.id)}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 rounded-xl border shadow-sm">
                            <AvatarImage src={member.avatar} />
                            <AvatarFallback className="font-black text-xs">{member.name[0]}</AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="text-sm font-black tracking-tight">{member.name}</span>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{member.position}</span>
                          </div>
                        </div>
                        <Checkbox checked={selectedMembers.includes(member.id)} className="rounded-lg h-5 w-5 border-2" onCheckedChange={() => {}} />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
            <DialogFooter>
              <Button 
                className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" 
                onClick={handleCreateChat}
                disabled={!newChatName.trim() || selectedMembers.length === 0}
              >
                Create Hub Chat
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {teamChats.length > 0 ? teamChats.map((chat) => (
          <Link key={chat.id} href={`/chats/${chat.id}`}>
            <Card className="hover:border-primary transition-all duration-300 cursor-pointer group mb-3 rounded-3xl border-none shadow-md ring-1 ring-black/5 overflow-hidden">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-primary/5 flex items-center justify-center text-primary shrink-0 border border-primary/10 group-hover:bg-primary group-hover:text-white transition-colors">
                  <Hash className="h-7 w-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h3 className="font-black text-lg tracking-tight truncate">{chat.name}</h3>
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                      {chat.createdAt ? new Date(chat.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground font-medium truncate pr-6">{chat.lastMessage || 'No recent activity'}</p>
                </div>
                {chat.unread && chat.unread > 0 ? (
                  <div className="bg-primary text-white text-[10px] font-black h-6 w-6 rounded-full flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
                    {chat.unread}
                  </div>
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground opacity-30 group-hover:opacity-100 transition-opacity shrink-0" />
                )}
              </CardContent>
            </Card>
          </Link>
        )) : (
          <div className="text-center py-20 bg-muted/20 border-2 border-dashed rounded-[2.5rem] space-y-4">
            <MessageSquare className="h-12 w-12 text-muted-foreground opacity-20 mx-auto" />
            <div>
              <p className="font-black text-lg uppercase tracking-tight">No discussions found</p>
              <p className="text-sm text-muted-foreground font-bold uppercase tracking-widest opacity-60">Time to coordinate your next win.</p>
            </div>
            <Button variant="outline" className="rounded-full px-8 font-black uppercase text-xs tracking-widest border-2" onClick={() => setIsNewChatOpen(true)}>Launch First Chat</Button>
          </div>
        )}
      </div>
      
      <div className="bg-primary/5 rounded-[2.5rem] p-8 text-center space-y-4 border-2 border-dashed border-primary/10">
        <div className="bg-white w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-xl">
          <MessageSquare className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-1">
          <h3 className="font-black text-2xl tracking-tight">Need to coordinate?</h3>
          <p className="text-sm text-muted-foreground font-bold uppercase tracking-widest max-w-[280px] mx-auto opacity-60">
            Create high-priority chats for positions or strategy.
          </p>
        </div>
        <Button className="w-full max-w-[240px] h-12 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-primary/20" onClick={() => setIsNewChatOpen(true)}>Start a Discussion</Button>
      </div>
    </div>
  );
}
