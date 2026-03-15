
"use client";

import React, { useState, useMemo } from 'react';
import { useTeam, Team, Member } from '@/components/providers/team-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Building, 
  Users, 
  Plus, 
  ChevronRight, 
  ShieldCheck, 
  Trophy, 
  UserPlus, 
  Settings,
  LayoutGrid,
  Search,
  Loader2,
  Mail,
  Zap,
  ArrowUpRight,
  DollarSign,
  TrendingUp,
  Activity,
  ShieldAlert,
  BarChart3
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription, 
  DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collectionGroup, query } from 'firebase/firestore';

export default function ClubManagementPage() {
  const { teams, user, isClubManager, createNewTeam, setActiveTeam } = useTeam();
  const db = useFirestore();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [initialCoach, setInitialCoach] = useState('');

  // TACTICAL AUDIT: Identify squads where user has management authority
  const clubTeams = useMemo(() => {
    return teams.filter(t => t.ownerUserId === user?.id && t.isPro);
  }, [teams, user?.id]);

  const clubTeamIds = useMemo(() => clubTeams.map(t => t.id), [clubTeams]);

  // LIVE ANALYTICS: Fetch all members across all club teams for real-time fiscal auditing
  const membersQuery = useMemoFirebase(() => {
    if (!db || clubTeamIds.length === 0) return null;
    return query(collectionGroup(db, 'members'));
  }, [db, clubTeamIds]);

  const { data: allMembersRaw, isLoading: isMembersLoading } = useCollection<Member>(membersQuery);
  
  const clubMembers = useMemo(() => {
    if (!allMembersRaw) return [];
    return allMembersRaw.filter(m => clubTeamIds.includes(m.teamId));
  }, [allMembersRaw, clubTeamIds]);

  const stats = useMemo(() => {
    let owed = 0;
    let total = 0;
    let cleared = 0;
    
    clubMembers.forEach(m => {
      owed += m.amountOwed || 0;
      total += m.totalFees || 0;
      if (m.medicalClearance) cleared++;
    });

    const collected = total - owed;
    const rate = total > 0 ? Math.round((collected / total) * 100) : 0;
    const compliance = clubMembers.length > 0 ? Math.round((cleared / clubMembers.length) * 100) : 0;

    return { owed, collected, total, rate, compliance };
  }, [clubMembers]);

  const filteredTeams = useMemo(() => {
    return clubTeams.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [clubTeams, searchTerm]);

  if (!isClubManager) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-6 animate-in fade-in duration-500">
        <div className="bg-muted/30 p-10 rounded-[3rem] opacity-20">
          <Building className="h-20 w-20" />
        </div>
        <h1 className="text-3xl font-black uppercase tracking-tight">Institutional Hub Locked</h1>
        <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest max-w-sm">This command center is reserved for multi-squad managers on Elite or Club tiers.</p>
        <Button onClick={() => router.push('/pricing')} className="rounded-full px-10 h-12 shadow-lg shadow-primary/20">Explore Institutional Solutions</Button>
      </div>
    );
  }

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setIsCreating(true);
    try {
      await createNewTeam(newTeamName, 'adult', 'Coach', `Official club squad managed by ${user?.name}`, 'squad_pro');
      setIsCreating(false);
      setNewTeamName('');
      setInitialCoach('');
      toast({ title: "Club Squad Enrolled" });
    } catch (e) {
      setIsCreating(false);
      toast({ title: "Enrollment Failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[9px] h-6 px-3">Institutional Command</Badge>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none">Club Hub</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Centralized Organizational Logistics</p>
        </div>
        
        <Dialog>
          <DialogTrigger asChild>
            <Button className="h-14 px-8 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all">
              <Plus className="h-5 w-5 mr-2" /> Add Club Team
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl overflow-hidden p-0">
            <DialogTitle className="sr-only">New Club Squad Enrollment</DialogTitle>
            <div className="h-2 bg-primary w-full" />
            <div className="p-8 lg:p-10 space-y-8">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black uppercase tracking-tight">New Club Squad</DialogTitle>
                <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">Scale your institutional roster</DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Squad Name</Label>
                  <Input placeholder="e.g. U14 Regional Stars" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} className="h-12 rounded-xl font-bold border-2 focus:border-primary/20 transition-all" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Initial Coach Email (Optional)</Label>
                  <Input type="email" placeholder="coach@example.com" value={initialCoach} onChange={e => setInitialCoach(e.target.value)} className="h-12 rounded-xl font-bold border-2 focus:border-primary/20 transition-all" />
                </div>
              </div>
              <DialogFooter>
                <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all" onClick={handleCreateTeam} disabled={isCreating || !newTeamName.trim()}>
                  {isCreating ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <ShieldCheck className="h-5 w-5 mr-2" />}
                  Enroll Squad
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="rounded-[2.5rem] border-none shadow-md ring-1 ring-black/5 bg-primary text-white overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-6 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700">
            <Trophy className="h-24 w-24" />
          </div>
          <CardContent className="p-8 space-y-2 relative z-10">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Total Squads</p>
            <p className="text-5xl font-black leading-none">{clubTeams.length}</p>
            <p className="text-[9px] font-bold uppercase tracking-widest opacity-40">Active Pro Seats</p>
          </CardContent>
        </Card>

        <Card className="rounded-[2.5rem] border-none shadow-md ring-1 ring-black/5 bg-black text-white overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-6 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700">
            <DollarSign className="h-24 w-24 text-primary" />
          </div>
          <CardContent className="p-8 space-y-4 relative z-10">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Fiscal Pulse</p>
              <p className="text-3xl font-black leading-none">${stats.collected.toLocaleString()}</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest">
                <span>Dues Collection</span>
                <span>{stats.rate}%</span>
              </div>
              <Progress value={stats.rate} className="h-1.5 bg-white/10" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2.5rem] border-none shadow-md ring-1 ring-black/5 bg-white overflow-hidden relative group">
          <CardContent className="p-8 space-y-2 relative z-10">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Compliance Rating</p>
            <p className="text-5xl font-black leading-none text-primary">{stats.compliance}%</p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground opacity-40">Medical Verified</p>
          </CardContent>
        </Card>

        <Card className="rounded-[2.5rem] border-none shadow-md ring-1 ring-black/5 bg-muted/20 overflow-hidden">
          <CardContent className="p-8 space-y-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <p className="text-[10px] font-black uppercase tracking-widest">Admin Oversight</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-black truncate uppercase">{user?.name}</p>
              <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-tighter">Master Organization Lead</p>
            </div>
            <Button variant="outline" className="w-full h-8 rounded-lg text-[8px] font-black uppercase border-primary/20 text-primary hover:bg-primary hover:text-white transition-all">Master Settings</Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-primary" />
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Organization Roster</h2>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input 
                placeholder="Search squads..." 
                className="h-9 pl-9 rounded-full bg-muted/50 border-none text-[10px] font-bold"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {filteredTeams.map((team) => {
              const teamMembers = clubMembers.filter(m => m.teamId === team.id);
              const teamOwed = teamMembers.reduce((sum, m) => sum + (m.amountOwed || 0), 0);
              
              return (
                <Card key={team.id} className="rounded-[2rem] border-none shadow-sm ring-1 ring-black/5 hover:shadow-xl hover:ring-primary/20 transition-all group overflow-hidden bg-white">
                  <CardContent className="p-0">
                    <div className="flex flex-col md:flex-row items-stretch">
                      <div className="w-full md:w-24 bg-muted/30 flex items-center justify-center p-6 border-r group-hover:bg-primary/5 transition-colors shrink-0">
                        <Avatar className="h-14 w-14 rounded-2xl shadow-lg border-2 border-background ring-2 ring-primary/10 transition-transform group-hover:scale-110">
                          <AvatarImage src={team.teamLogoUrl} className="object-cover" />
                          <AvatarFallback className="font-black bg-white text-xs">{team.name[0]}</AvatarFallback>
                        </Avatar>
                      </div>
                      <div className="flex-1 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="space-y-1">
                          <h3 className="text-xl font-black tracking-tight leading-tight group-hover:text-primary transition-colors uppercase">{team.name}</h3>
                          <div className="flex items-center gap-4 text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-primary" /> {teamMembers.length} Active Roster</span>
                            <span className="flex items-center gap-1.5"><Activity className="h-3 w-3" /> Elite Status</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-[8px] font-black uppercase text-muted-foreground">Owed</p>
                            <p className="text-sm font-black text-primary">${teamOwed.toLocaleString()}</p>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="rounded-full h-12 w-12 hover:bg-primary hover:text-white shadow-sm ring-1 ring-black/5 transition-all"
                            onClick={() => { setActiveTeam(team); router.push('/team'); }}
                          >
                            <ArrowUpRight className="h-5 w-5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filteredTeams.length === 0 && (
              <div className="py-20 text-center border-2 border-dashed rounded-[3rem] bg-muted/10 opacity-40">
                <LayoutGrid className="h-12 w-12 mx-auto mb-4" />
                <p className="text-sm font-black uppercase tracking-widest">No managed squads identified.</p>
              </div>
            )}
          </div>
        </div>

        <aside className="lg:col-span-4 space-y-8">
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-2 text-primary">
              <BarChart3 className="h-4 w-4" />
              <h3 className="text-xs font-black uppercase tracking-[0.2em]">Institutional Analytics</h3>
            </div>
            <Card className="rounded-[2.5rem] border-none shadow-xl bg-black text-white p-8 space-y-6">
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-white/40 tracking-widest">Organization Roster</p>
                  <div className="flex justify-between items-end">
                    <p className="text-3xl font-black">{clubMembers.length}</p>
                    <Badge className="bg-primary text-white border-none text-[8px] h-5">Verified Athletes</Badge>
                  </div>
                  <Progress value={100} className="h-1 bg-white/10" />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-white/40 tracking-widest">Total Fiscal Pipeline</p>
                  <p className="text-3xl font-black">${stats.total.toLocaleString()}</p>
                  <Progress value={stats.rate} className="h-1 bg-white/10" />
                </div>
              </div>
              <Button className="w-full h-12 rounded-xl bg-white text-black font-black uppercase text-[10px] tracking-widest hover:bg-primary hover:text-white transition-all">Export Org Audit</Button>
            </Card>
          </section>

          <Card className="rounded-[2.5rem] border-none shadow-md bg-white p-8 space-y-4 ring-1 ring-black/5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em]">Global Management active</h4>
            </div>
            <p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">
              Master organization lead protocols are established. You are currently monitoring {clubTeams.length} elite squads. Fiscal data is aggregated in real-time from active roster ledgers.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
