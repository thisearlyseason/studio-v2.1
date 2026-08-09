
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, MessageSquare, ChevronRight, Hash, Lock, Sparkles, ShieldAlert, Users, Search, MessageCircle, Radio, UserRoundCheck } from 'lucide-react';
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
import { collection, collectionGroup, query, orderBy, where, getDocs } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useAuth } from '@/firebase';
import { authHeader, getAuthToken } from '@/lib/client-auth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { isStaffPosition } from '@/lib/staff-position';

type ChatContext = {
  id: string;
  name: string;
  type: 'team' | 'league' | 'tournament';
  recipients: any[];
};

export default function ChatsPage() {
  const { activeTeam, setActiveTeam, members, createChat, isStaff, isParent, isPlayer, isSuperAdmin, user, teams, isPrimaryClubAuthority, isSchoolMode, isEliteAccount } = useTeam();
  const db = useFirestore();
  const auth = useAuth();
  const router = useRouter();
  
  const [newChatName, setNewChatName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [allStaffMembers, setAllStaffMembers] = useState<any[]>([]);
  const [chatContexts, setChatContexts] = useState<ChatContext[]>([]);
  const [selectedContextId, setSelectedContextId] = useState('');
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [updatingParentSetting, setUpdatingParentSetting] = useState<string | null>(null);

  // Localized chat fetching for performance
  const chatsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db || !user?.id) return null;
    
    return query(
      collection(db, 'teams', activeTeam.id, 'groupChats'), 
      where('memberIds', 'array-contains', user.id),
      orderBy('createdAt', 'desc')
    );
  }, [activeTeam?.id, db, user?.id]);

  const { data: chatsData, isLoading: isChatsLoading } = useCollection(chatsQuery);
  const sharedChatsQuery = useMemoFirebase(() => {
    if (!db || !user?.id || activeTeam?.id.startsWith('demo_')) return null;
    return query(collectionGroup(db, 'groupChats'), where('memberIds', 'array-contains', user.id));
  }, [db, user?.id, activeTeam?.id]);
  const { data: sharedChatsData, isLoading: isSharedChatsLoading } = useCollection(sharedChatsQuery);
  const teamChats = useMemo(() => {
    const raw = Array.from(
      new Map(
        [...(chatsData || []), ...(sharedChatsData || [])]
          .filter(chat => chat.isDeleted !== true)
          .map(chat => [chat.id, chat])
      ).values()
    ).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    if (!searchTerm.trim()) return raw;
    return raw.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [chatsData, sharedChatsData, searchTerm]);

  // Governance: Filter member list based on position
  const filteredMembers = useMemo(() => {
    const serverContext = chatContexts.find(context => context.id === selectedContextId);
    if (serverContext) return serverContext.recipients;
    // For AD or elite organizer: show all coaching staff from all teams
    if (isPrimaryClubAuthority && allStaffMembers.length > 0) return allStaffMembers;
    if (!activeTeam) return [];
    if (isSuperAdmin || isStaff) return members;
    
    if (isParent) {
      return members.filter(m => {
        // Parents can ONLY message other parents and staff/coaches
        if (isStaffPosition(m.position)) return true;
        if (m.position === 'Parent') return true;
        return false;
      });
    }

    if (isPlayer) {
      // Players can message everyone EXCEPT parents
      return members.filter(m => m.position !== 'Parent');
    }

    return members;
  }, [members, allStaffMembers, isPrimaryClubAuthority, isStaff, isParent, isPlayer, isSuperAdmin, activeTeam, chatContexts, selectedContextId]);

  useEffect(() => {
    if (!activeTeam?.id || !auth) return;
    let cancelled = false;
    getAuthToken(auth)
      .then(token => {
        if (!token) throw new Error('Your session has expired.');
        return fetch(`/api/teams/chat?teamId=${encodeURIComponent(activeTeam.id)}`, {
          headers: authHeader(token),
        });
      })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to load chat recipients.');
        if (!cancelled) {
          const contexts = payload.contexts as ChatContext[];
          setChatContexts(contexts);
          setSelectedContextId(current =>
            contexts.some(context => context.id === current) ? current : (contexts[0]?.id || '')
          );
        }
      })
      .catch(() => {
        if (!cancelled) setChatContexts([]);
      });
    return () => { cancelled = true; };
  }, [activeTeam?.id, auth]);

  // Fetch coaching staff from all teams for AD/elite organizer
  useEffect(() => {
    if (!isPrimaryClubAuthority || !db || !teams?.length) return;
    const staffKeywords = ['coach', 'director', 'coordinator', 'staff', 'manager', 'trainer'];
    let cancelled = false;

    const fetchAllStaff = async () => {
      const staffMap = new Map<string, any>();
      for (const team of teams) {
        try {
          const snap = await getDocs(collection(db, 'teams', team.id, 'members'));
          snap.forEach(d => {
            const m = d.data();
            if (!m.userId || m.status === 'removed') return;
            const pos = (m.position || '').toLowerCase();
            const role = (m.role || '').toLowerCase();
            const isStaffMember = staffKeywords.some(kw => pos.includes(kw)) || role === 'admin';
            if (isStaffMember && !staffMap.has(m.userId)) {
              staffMap.set(m.userId, { ...m, squadName: team.name || team.teamName });
            }
          });
        } catch (e) {
          // Permission on some teams might fail — skip silently
        }
      }
      if (!cancelled) setAllStaffMembers(Array.from(staffMap.values()));
    };

    fetchAllStaff();
    return () => { cancelled = true; };
  }, [isPrimaryClubAuthority, db, teams]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !activeTeam || ((isChatsLoading || isSharedChatsLoading) && !teamChats.length)) {
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
    if (!newChatName.trim() || !selectedContextId || isCreatingChat) return;
    setIsCreatingChat(true);
    try {
      const chatId = await createChat(newChatName, selectedMembers, selectedContextId);
      setIsNewChatOpen(false);
      setNewChatName('');
      setSelectedMembers([]);
      router.push(`/chats/${chatId}`);
    } finally {
      setIsCreatingChat(false);
    }
  };

  const getMemberId = (m: any) => m.userId || m.id;

  const toggleMember = (memberId: string) => {
    setSelectedMembers(prev => 
      prev.includes(memberId) 
        ? prev.filter(id => id !== memberId) 
        : [...prev, memberId]
    );
  };

  const updateParentAccess = async (
    setting: 'parentChatEnabled' | 'parentCommentsEnabled' | 'parentFeedEnabled',
    enabled: boolean
  ) => {
    if (!activeTeam?.id || !auth || updatingParentSetting) return;
    setUpdatingParentSetting(setting);
    try {
      const token = await getAuthToken(auth);
      if (!token) throw new Error('Your session has expired. Sign in again.');
      const response = await fetch('/api/teams/parent-access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({ teamId: activeTeam.id, [setting]: enabled }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to update parent access.');
      setActiveTeam({ ...activeTeam, [setting]: enabled });
      toast({
        title: 'Parent Access Updated',
        description: `${enabled ? 'Enabled' : 'Disabled'} successfully.`,
      });
    } catch (error: any) {
      toast({
        title: 'Access Update Failed',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingParentSetting(null);
    }
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
                  {chatContexts.length > 1 && (
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">
                        Squad, League, or Tournament
                      </Label>
                      <Select
                        value={selectedContextId}
                        onValueChange={value => {
                          setSelectedContextId(value);
                          setSelectedMembers([]);
                        }}
                      >
                        <SelectTrigger className="h-12 rounded-xl border-2 font-black">
                          <SelectValue placeholder="Select messaging scope" />
                        </SelectTrigger>
                        <SelectContent>
                          {chatContexts.map(context => (
                            <SelectItem key={context.id} value={context.id}>
                              {context.name} · {context.type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
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
                          key={getMemberId(member)} 
                          className={cn(
                            "flex items-center justify-between p-3 hover:bg-white rounded-xl cursor-pointer transition-all group",
                            selectedMembers.includes(getMemberId(member)) ? "bg-white shadow-sm ring-1 ring-primary/10" : ""
                          )}
                          onClick={() => toggleMember(getMemberId(member))}
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9 rounded-xl border-2 border-background shadow-sm">
                              <AvatarImage src={member.avatar} />
                              <AvatarFallback className="font-black text-xs bg-muted">{member.name?.[0] ?? '?'}</AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                              <span className="text-sm font-black tracking-tight">{member.name}</span>
                              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{member.position}</span>
                              {member.squadName && (
                                <span className="text-[9px] font-bold text-primary/60 uppercase tracking-widest">{member.squadName}</span>
                              )}
                            </div>
                          </div>
                          <Checkbox checked={selectedMembers.includes(getMemberId(member))} className="rounded-lg h-5 w-5 border-2" onCheckedChange={() => {}} />
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
                  disabled={!newChatName.trim() || selectedMembers.length === 0 || !selectedContextId || isCreatingChat}
                >
                  {isCreatingChat ? 'Authorizing…' : 'Authorize Channel'}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isStaff && (
        <Card className="overflow-hidden rounded-[2rem] border-2 border-primary/20 bg-white shadow-lg">
          <div className="h-2 bg-primary" />
          <CardContent className="p-6 md:p-8">
            <div className="mb-6 flex items-start gap-4">
              <div className="rounded-2xl bg-primary p-3 text-white">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <Badge className="mb-2 border-none bg-primary/10 text-primary">Coach & Organizer Controls</Badge>
                <h2 className="text-2xl font-black uppercase tracking-tight">Parent Communication Access</h2>
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  These settings take effect immediately for this squad.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {[
                {
                  setting: 'parentChatEnabled' as const,
                  title: 'Parent-to-Parent Chat',
                  description: 'Parents can start chats with other parents on this squad.',
                  checked: activeTeam.parentChatEnabled === true,
                  icon: UserRoundCheck,
                },
                {
                  setting: 'parentFeedEnabled' as const,
                  title: 'Parent Live Feed',
                  description: 'Parents can open and view this squad’s live feed.',
                  checked: activeTeam.parentFeedEnabled !== false,
                  icon: Radio,
                },
                {
                  setting: 'parentCommentsEnabled' as const,
                  title: 'Parent Feed Comments',
                  description: 'Parents can participate in live-feed discussions.',
                  checked: activeTeam.parentCommentsEnabled === true,
                  icon: MessageSquare,
                },
              ].map(control => {
                const Icon = control.icon;
                const isUpdating = updatingParentSetting === control.setting;
                return (
                  <div key={control.setting} className="flex items-center justify-between gap-4 rounded-2xl border bg-muted/20 p-5">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="rounded-xl bg-white p-2 text-primary shadow-sm">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-black uppercase">{control.title}</p>
                        <p className="mt-1 text-xs font-medium leading-relaxed text-muted-foreground">{control.description}</p>
                        <p className={`mt-2 text-[10px] font-black uppercase ${control.checked ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {isUpdating ? 'Updating…' : control.checked ? 'Currently On' : 'Currently Off'}
                        </p>
                      </div>
                    </div>
                    <Switch
                      aria-label={control.title}
                      checked={control.checked}
                      disabled={Boolean(updatingParentSetting)}
                      onCheckedChange={enabled => updateParentAccess(control.setting, enabled)}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

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
            <Link key={chat.id} href={`/chats/${chat.id}?teamId=${encodeURIComponent(chat.teamId || activeTeam.id)}`}>
              <Card className="hover:border-primary transition-all duration-300 cursor-pointer group rounded-3xl border-none shadow-sm hover:shadow-xl ring-1 ring-black/5 hover:ring-primary/20 overflow-hidden bg-white">
                <CardContent className="p-5 flex items-center gap-5">
                  <div className="h-16 w-16 rounded-2xl bg-primary/5 flex items-center justify-center text-primary shrink-0 border border-primary/10 group-hover:bg-primary group-hover:text-white transition-all shadow-inner">
                    <Hash className="h-8 w-8 stroke-[3px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-black text-xl tracking-tight truncate group-hover:text-primary transition-colors">{chat.name}</h3>
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest bg-muted/50 px-2 py-1 rounded-lg">
                        {chat.lastMessageAt ? format(new Date(chat.lastMessageAt), 'MMMM d, yyyy h:mm a') : 'ACTIVE'}
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
