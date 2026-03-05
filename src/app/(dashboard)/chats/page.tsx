
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, MessageSquare, ChevronRight, Hash, Lock, Sparkles, ShieldAlert, Users, Search, MessageCircle } from 'lucide-react';
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
import { collection, query, orderBy, where } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function ChatsPage() {
  const { activeTeam, members, createChat, isStaff, isParent, isSuperAdmin, user } = useTeam();
  const db = useFirestore();
  const router = useRouter();
  
  const [newChatName, setNewChatName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Localized chat fetching for performance
  const chatsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db || !user?.id) return null;
    
    /**
     * TACTICAL OPTIMIZATION: For demo guest users, we allow listing all team chats
     * to ensure immediate coordination availability without roster field delays.
     */
    if (activeTeam.id.startsWith('demo_')) {
      return query(
        collection(db, 'teams', activeTeam.id, 'groupChats'),
        orderBy('createdAt', 'desc')
      );
    }

    return query(
      collection(db, 'teams', activeTeam.id, 'groupChats'), 
      where('memberIds', 'array-contains', user.id),
      orderBy('createdAt', 'desc')
    );
  }, [activeTeam?.id, db, user?.id]);

  const { data: chatsData, isLoading: isChatsLoading } = useCollection(chatsQuery);
  const teamChats = useMemo(() => {
    const raw = chatsData || [];
    if (!searchTerm.trim()) return raw;
    return raw.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [chatsData, searchTerm]);

  // Governance: Filter member list based on position
  const filteredMembers = useMemo(() => {
    if (!activeTeam) return [];
    if (isStaff || isSuperAdmin) return members;
    
    if (isParent) {
      return members.filter(m => {
        if (['Coach', 'Assistant Coach', 'Team Lead', 'Squad Leader', 'Platform Admin'].includes(m.position)) return true;
        if (m.position === 'Parent') return activeTeam.parentChatEnabled;
        return false;
      });
    }

    return members;
  }, [members, isStaff, isParent, activeTeam?.parentChatEnabled, isSuperAdmin, activeTeam]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !activeTeam || (isChatsLoading && !teamChats.length)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse">
        <div className="h-12 w-12 bg-primary/10 rounded-full mb-4 flex items-center justify-center">
          <MessageCircle className="h-6 w-6 text-primary animate-bounce" />
        </div>
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Establishing secure channels...</p>
      </div>
    );
  }

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
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[9px] h-6 px-3">Squad Ops</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tight">Coordination Hub</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Real-time Tactical Messaging</p>
        </div>
        
        <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-2xl shadow-xl shadow-primary/20 h-14 px-8 font-black uppercase text-sm active:scale-95 transition-all">
              <Plus className="h-5 w-5 mr-2" />
              Establish Channel
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
            <div className="h-2 bg-primary w-full" />
            <div className="p-8">
              <DialogHeader>
                <DialogTitle className="text-3xl font-black tracking-tight uppercase">New Tactical Group</DialogTitle>
                <DialogDescription className="font-bold text-primary/60 uppercase tracking-widest text-[10px]">
                  Secure coordination for {activeTeam.name}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-[10px] font-black uppercase tracking-widest ml-1">Channel Name</Label>
                  <Input 
                    id="name" 
                    placeholder="e.g. Travel Planning, Defensive Drill" 
                    value={newChatName}
                    onChange={(e) => setNewChatName(e.target.value)}
                    className="h-12 rounded-xl border-2 font-black text-base"
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between ml-1">
                    <Label className="text-[10px] font-black uppercase tracking-widest">Enroll Squad Members</Label>
                    {isParent && !activeTeam.parentChatEnabled && (
                      <Badge variant="outline" className="text-[7px] font-black uppercase border-primary/20 text-primary">Coaches Only</Badge>
                    )}
                  </div>
                  <ScrollArea className="h-56 border-2 rounded-2xl p-2 bg-muted/10">
                    <div className="space-y-1.5">
                      {filteredMembers.map((member) => (
                        <div 
                          key={member.id} 
                          className={cn(
                            "flex items-center justify-between p-3 hover:bg-white rounded-xl cursor-pointer transition-all group",
                            selectedMembers.includes(member.id) ? "bg-white shadow-sm ring-1 ring-primary/10" : ""
                          )}
                          onClick={() => toggleMember(member.id)}
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9 rounded-xl border-2 border-background shadow-sm">
                              <AvatarImage src={member.avatar} />
                              <AvatarFallback className="font-black text-xs bg-muted">{member.name[0]}</AvatarFallback>
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
                  className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" 
                  onClick={handleCreateChat}
                  disabled={!newChatName.trim() || selectedMembers.length === 0}
                >
                  Authorize Channel
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="lg:col-span-1 space-y-6">
          <Card className="rounded-[2rem] border-none shadow-md ring-1 ring-black/5 bg-white overflow-hidden">
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Search Channels</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Tactical search..." 
                    className="pl-9 h-11 rounded-xl bg-muted/30 border-none font-bold"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="pt-4 border-t space-y-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Intelligence</p>
                <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-primary" />
                    <p className="text-[10px] font-black uppercase">Secure Ops</p>
                  </div>
                  <p className="text-[10px] font-medium leading-relaxed italic text-muted-foreground">
                    All channels are end-to-end coordinated and restricted to verified squad members.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>

        <div className="lg:col-span-3 space-y-4">
          {teamChats.length > 0 ? teamChats.map((chat) => (
            <Link key={chat.id} href={`/chats/${chat.id}`}>
              <Card className="hover:border-primary transition-all duration-300 cursor-pointer group rounded-3xl border-none shadow-sm hover:shadow-xl ring-1 ring-black/5 hover:ring-primary/20 overflow-hidden bg-white">
                <CardContent className="p-5 flex items-center gap-5">
                  <div className="h-16 w-16 rounded-2xl bg-primary/5 flex items-center justify-center text-primary shrink-0 border border-primary/10 group-hover:bg-primary group-hover:text-white transition-all shadow-inner">
                    <Hash className="h-8 w-8 stroke-[3px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-black text-xl tracking-tight truncate group-hover:text-primary transition-colors">{chat.name}</h3>
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest bg-muted/50 px-2 py-1 rounded-lg">
                        {chat.lastMessageAt ? new Date(chat.lastMessageAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'ACTIVE'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm text-muted-foreground font-medium truncate pr-6 leading-none">
                        {chat.lastMessage || 'Channel established. Ready for coordination.'}
                      </p>
                      {chat.unread && chat.unread > 0 && (
                        <div className="bg-primary text-white text-[10px] font-black h-6 w-6 rounded-full flex items-center justify-center shrink-0 shadow-lg shadow-primary/20 animate-in zoom-in duration-300">
                          {chat.unread}
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-6 w-6 text-primary opacity-10 group-hover:opacity-100 group-hover:translate-x-1 transition-all shrink-0" />
                </CardContent>
              </Card>
            </Link>
          )) : (
            <div className="text-center py-24 bg-muted/10 border-2 border-dashed rounded-[3rem] space-y-6">
              <div className="bg-white w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto shadow-xl relative">
                <MessageSquare className="h-10 w-10 text-primary opacity-20" />
                <Sparkles className="absolute -top-2 -right-2 h-8 w-8 text-amber-500 animate-pulse" />
              </div>
              <div className="space-y-2">
                <p className="font-black text-2xl uppercase tracking-tight">Silent Channels</p>
                <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest opacity-60">Time to coordinate your next strategic win.</p>
              </div>
              <Button variant="outline" className="rounded-full px-10 h-12 font-black uppercase text-xs tracking-widest border-2 hover:bg-primary hover:text-white transition-all" onClick={() => setIsNewChatOpen(true)}>Launch Hub Chat</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
