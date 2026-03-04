
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
  ArrowUpRight
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

export default function ClubManagementPage() {
  const { teams, user, isClubManager, createNewTeam, setActiveTeam } = useTeam();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [initialCoach, setInitialCoach] = useState('');

  const clubTeams = useMemo(() => {
    return teams.filter(t => t.createdBy === user?.id && t.planId === 'squad_organization');
  }, [teams, user?.id]);

  const filteredTeams = useMemo(() => {
    return clubTeams.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [clubTeams, searchTerm]);

  if (!isClubManager) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-6">
        <div className="bg-muted p-6 rounded-[2.5rem] opacity-20">
          <Building className="h-16 w-16" />
        </div>
        <h1 className="text-3xl font-black uppercase tracking-tight">Access Restricted</h1>
        <p className="text-muted-foreground font-bold">This dashboard is reserved for Club Managers on a custom enterprise plan.</p>
        <Button onClick={() => router.push('/pricing')}>Explore Club Solutions</Button>
      </div>
    );
  }

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setIsCreating(true);
    try {
      // Align with canonical squad_organization plan ID
      const tid = await createNewTeam(newTeamName, 'Coach', `Official club squad managed by ${user?.name}`, 'squad_organization');
      
      setIsCreating(false);
      setNewTeamName('');
      setInitialCoach('');
      toast({ title: "Club Squad Enrolled", description: `${newTeamName} is now live.` });
    } catch (e) {
      setIsCreating(false);
      toast({ title: "Enrollment Failed", variant: "destructive" });
    }
  };

  const handleManageTeam = (team: Team) => {
    setActiveTeam(team);
    router.push('/team');
  };

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[9px] h-6 px-3">Elite Infrastructure</Badge>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none">Club Hub</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Centralized Organization Dashboard</p>
        </div>
        
        <Dialog>
          <DialogTrigger asChild>
            <Button className="h-14 px-8 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all">
              <Plus className="h-5 w-5 mr-2" /> Add Club Team
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black tracking-tight uppercase">New Club Squad</DialogTitle>
              <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">Scale your organization</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Squad Name</Label>
                <Input 
                  placeholder="e.g. U14 Regional Stars" 
                  value={newTeamName} 
                  onChange={e => setNewTeamName(e.target.value)}
                  className="h-12 rounded-xl font-bold border-2" 
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Initial Coach Email (Optional)</Label>
                <Input 
                  type="email" 
                  placeholder="coach@example.com" 
                  value={initialCoach}
                  onChange={e => setInitialCoach(e.target.value)}
                  className="h-12 rounded-xl font-bold border-2" 
                />
                <p className="text-[9px] text-muted-foreground font-medium italic ml-1">Coaches inherit full Pro access for their assigned squads.</p>
              </div>
            </div>
            <DialogFooter>
              <Button 
                className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" 
                onClick={handleCreateTeam}
                disabled={isCreating || !newTeamName.trim()}
              >
                {isCreating ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <ShieldCheck className="h-5 w-5 mr-2" />}
                Enroll Squad
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="rounded-[2.5rem] border-none shadow-md ring-1 ring-black/5 bg-primary text-white overflow-hidden">
          <CardContent className="p-8 space-y-2">
            <div className="flex justify-between items-start">
              <Trophy className="h-10 w-10 text-white/40" />
              <Badge className="bg-white/20 text-white font-black text-[8px] uppercase tracking-widest px-2">Scale</Badge>
            </div>
            <div>
              <p className="text-4xl font-black leading-none">{clubTeams.length}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Active Club Teams</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[2.5rem] border-none shadow-md ring-1 ring-black/5 bg-white overflow-hidden">
          <CardContent className="p-8 space-y-2">
            <div className="flex justify-between items-start">
              <Zap className="h-10 w-10 text-primary/40" />
              <Badge className="bg-primary/5 text-primary font-black text-[8px] uppercase tracking-widest px-2">Status</Badge>
            </div>
            <div>
              <p className="text-4xl font-black leading-none text-primary">Pro</p>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Enabled for all staff</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[2.5rem] border-none shadow-md ring-1 ring-black/5 bg-black text-white overflow-hidden">
          <CardContent className="p-8 space-y-2">
            <div className="flex justify-between items-start">
              <Building className="h-10 w-10 text-white/40" />
              <Badge className="bg-white/20 text-white font-black text-[8px] uppercase tracking-widest px-2">Authority</Badge>
            </div>
            <div>
              <p className="text-lg font-black leading-tight uppercase truncate">{user?.name}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Primary Club Manager</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Organization Roster</h2>
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
          {filteredTeams.length > 0 ? filteredTeams.map((team) => (
            <Card key={team.id} className="rounded-[2rem] border-none shadow-sm ring-1 ring-black/5 hover:shadow-xl hover:ring-primary/20 transition-all group overflow-hidden bg-white">
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row items-stretch">
                  <div className="w-full md:w-24 bg-muted/30 flex items-center justify-center p-6 border-r group-hover:bg-primary/5 transition-colors shrink-0">
                    <Avatar className="h-14 w-14 rounded-2xl shadow-lg border-2 border-background ring-2 ring-primary/10">
                      <AvatarImage src={team.teamLogoUrl} className="object-cover" />
                      <AvatarFallback className="font-black bg-white text-xs">{team.name[0]}</AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="flex-1 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-1">
                      <h3 className="text-xl font-black tracking-tight leading-tight group-hover:text-primary transition-colors">{team.name}</h3>
                      <div className="flex items-center gap-4 text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                        <span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-primary" /> Active Pro Squad</span>
                        <span className="flex items-center gap-1.5"><LayoutGrid className="h-3 w-3" /> Code: {team.code}</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2 bg-muted/30 px-4 py-2 rounded-xl border">
                        <Users className="h-4 w-4 text-primary" />
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase leading-none">Roster</span>
                          <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-tighter">Sync Active</span>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="rounded-full h-12 w-12 hover:bg-primary hover:text-white shadow-sm ring-1 ring-black/5"
                        onClick={() => handleManageTeam(team)}
                      >
                        <ArrowUpRight className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )) : (
            <div className="text-center py-20 bg-muted/10 rounded-[2.5rem] border-2 border-dashed">
              <Building className="h-12 w-12 text-muted-foreground opacity-20 mx-auto mb-4" />
              <p className="text-sm font-black uppercase tracking-widest text-muted-foreground opacity-60">No club squads found matching your search.</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-black text-white rounded-[3rem] p-10 md:p-16 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none avoid-pointer-events">
          <Building className="h-64 w-64" />
        </div>
        <div className="relative z-10 max-w-xl space-y-6">
          <Badge className="bg-primary text-white border-none font-black uppercase tracking-widest text-[10px] px-4 h-7 shadow-lg shadow-primary/40">Club Infrastructure</Badge>
          <h2 className="text-4xl md:text-5xl font-black tracking-tighter leading-[0.9]">SCALE YOUR <br className="hidden md:block" /> LEGACY.</h2>
          <p className="text-white/60 font-medium text-lg leading-relaxed">
            As a Club Manager, you maintain master control over the organization. Coaches you assign to teams will have Pro features enabled automatically, while your primary administrative authority remains protected globally.
          </p>
          <div className="flex items-center gap-6 pt-4">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Support Channel</span>
              <span className="font-bold flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> club-support@thesquad.pro</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
