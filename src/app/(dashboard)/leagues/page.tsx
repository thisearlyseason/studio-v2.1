
"use client";

import React, { useState, useMemo } from 'react';
import { useTeam, League, LeagueInvite } from '@/components/providers/team-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  Trophy, 
  UserPlus, 
  Plus, 
  ChevronRight, 
  Mail, 
  Search, 
  Clock, 
  CheckCircle2, 
  Zap, 
  Lock,
  Loader2,
  Table as TableIcon,
  MessageSquare
} from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default function LeaguesPage() {
  const { activeTeam, user, createLeague, inviteTeamToLeague, acceptLeagueInvite, hasFeature, purchasePro } = useTeam();
  const db = useFirestore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const canUseLeagues = hasFeature('leagues');

  // Fetch leagues the active team is part of
  const leaguesQuery = useMemoFirebase(() => {
    if (!activeTeam?.id || !db) return null;
    return query(collection(db, 'leagues'), where(`teams.${activeTeam.id}`, '!=', null));
  }, [activeTeam?.id, db]);

  const { data: leagues = [], isLoading: isLeaguesLoading } = useCollection<League>(leaguesQuery);

  // Fetch invites for this user's email
  const invitesQuery = useMemoFirebase(() => {
    if (!user?.email || !db) return null;
    return query(collection(db, 'leagues', 'global', 'invites'), where('invitedEmail', '==', user.email.toLowerCase()), where('status', '==', 'pending'));
  }, [user?.email, db]);

  // Fallback if global collection doesn't exist, we fetch from all leagues (simulated for MVP)
  const { data: invites = [] } = useCollection<LeagueInvite>(invitesQuery);

  const activeLeague = useMemo(() => leagues[0] || null, [leagues]);

  if (!canUseLeagues) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 space-y-8 animate-in fade-in slide-in-from-bottom-4">
        <div className="relative">
          <div className="bg-primary/10 p-8 rounded-[3rem] shadow-2xl">
            <Shield className="h-20 w-20 text-primary" />
          </div>
          <div className="absolute -top-3 -right-3 bg-black text-white p-2.5 rounded-full shadow-lg border-4 border-background">
            <Lock className="h-5 w-5" />
          </div>
        </div>
        
        <div className="text-center max-w-md space-y-4">
          <h1 className="text-4xl font-black tracking-tight">Competitive Leagues</h1>
          <p className="text-muted-foreground font-bold leading-relaxed text-lg">
            Create or join high-stakes leagues, track global standings, and message opposing coaches. Reserved for Elite Pro squads.
          </p>
        </div>

        <Button className="h-14 px-10 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={purchasePro}>
          Unlock Competitive Tiers
        </Button>
      </div>
    );
  }

  const handleCreateLeague = async () => {
    if (!leagueName.trim()) return;
    setIsProcessing(true);
    await createLeague(leagueName);
    setIsCreateOpen(false);
    setLeagueName('');
    setIsProcessing(false);
    toast({ title: "League Established", description: `${leagueName} is now live.` });
  };

  const handleSendInvite = async () => {
    if (!inviteEmail.trim() || !activeLeague) return;
    setIsProcessing(true);
    await inviteTeamToLeague(activeLeague.id, activeLeague.name, inviteEmail.toLowerCase());
    setIsInviteOpen(false);
    setInviteEmail('');
    setIsProcessing(false);
  };

  const sortedStandings = useMemo(() => {
    if (!activeLeague) return [];
    return Object.entries(activeLeague.teams)
      .map(([id, stats]) => ({ id, ...stats }))
      .sort((a, b) => b.points - a.points || b.wins - a.wins);
  }, [activeLeague]);

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[9px] h-6 px-3">Competitive Ledger</Badge>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none">Leagues</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Official Leaderboards & Coordination</p>
        </div>

        {!activeLeague && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="h-14 px-8 rounded-2xl text-lg font-black shadow-xl shadow-primary/20">
                <Plus className="h-5 w-5 mr-2" /> Start New League
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black tracking-tight uppercase">League Identity</DialogTitle>
                <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">Establish a new competitive hub</DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">League Name</Label>
                  <Input placeholder="e.g. Regional Varsity Premier" value={leagueName} onChange={e => setLeagueName(e.target.value)} className="h-12 rounded-xl font-bold border-2" />
                </div>
              </div>
              <DialogFooter>
                <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={handleCreateLeague} disabled={isProcessing || !leagueName.trim()}>
                  {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : "Deploy League"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {activeLeague ? (
        <div className="space-y-8">
          <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-black text-white relative group">
            <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700">
              <Shield className="h-48 w-48" />
            </div>
            <CardContent className="p-10 relative z-10">
              <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="flex items-center gap-6">
                  <div className="bg-primary p-5 rounded-[1.5rem] shadow-xl shadow-primary/20">
                    <Trophy className="h-10 w-10 text-white" />
                  </div>
                  <div>
                    <Badge className="bg-primary text-white mb-2 h-5 text-[8px] uppercase tracking-[0.2em] font-black px-3">Premier Hub</Badge>
                    <h2 className="text-4xl font-black tracking-tight leading-none uppercase">{activeLeague.name}</h2>
                    <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-2">{activeLeague.sport} • {Object.keys(activeLeague.teams).length} Squads Enrolled</p>
                  </div>
                </div>
                
                {activeLeague.creatorId === user?.id && (
                  <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                    <DialogTrigger asChild>
                      <Button variant="secondary" className="h-12 px-8 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg">
                        <UserPlus className="h-4 w-4 mr-2" /> Invite Opponent
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="rounded-[2.5rem] sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase">Send Challenge</DialogTitle>
                        <DialogDescription className="font-bold text-muted-foreground uppercase text-[10px]">Invite an opponent coach by email</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Coach Email</Label>
                          <Input placeholder="coach@opposingteam.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="h-12 rounded-xl font-bold" />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button className="w-full h-12 rounded-xl font-black" onClick={handleSendInvite} disabled={isProcessing || !inviteEmail.trim()}>
                          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Dispatch Invite"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <TableIcon className="h-4 w-4 text-primary" />
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">League Standings</h3>
                </div>
                <p className="text-[9px] font-bold text-muted-foreground italic">Ranked by Wins & Points</p>
              </div>

              <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-muted/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b">
                        <tr>
                          <th className="px-8 py-5">Squad</th>
                          <th className="px-4 py-5 text-center">W</th>
                          <th className="px-4 py-5 text-center">L</th>
                          <th className="px-4 py-5 text-center">T</th>
                          <th className="px-8 py-5 text-right text-primary">PTS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-muted/50">
                        {sortedStandings.map((team, idx) => (
                          <tr key={team.id} className={cn("hover:bg-primary/5 transition-colors group", team.id === activeTeam?.id && "bg-primary/5")}>
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-4">
                                <span className="text-xs font-black text-muted-foreground/40 w-4">{idx + 1}</span>
                                <div className="flex flex-col">
                                  <span className="font-black text-sm uppercase tracking-tight group-hover:text-primary transition-colors">{team.teamName}</span>
                                  {team.id === activeTeam?.id && <Badge className="bg-primary/10 text-primary border-none text-[7px] font-black uppercase h-4 px-1.5 w-fit mt-1">My Squad</Badge>}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-6 text-center font-bold text-sm">{team.wins}</td>
                            <td className="px-4 py-6 text-center font-bold text-sm text-muted-foreground">{team.losses}</td>
                            <td className="px-4 py-6 text-center font-bold text-sm text-muted-foreground">{team.ties}</td>
                            <td className="px-8 py-6 text-right font-black text-lg text-primary">{team.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>

            <aside className="space-y-6">
              <div className="flex items-center gap-2 px-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Coach Directory</h3>
              </div>
              <div className="space-y-3">
                {sortedStandings.filter(t => t.id !== activeTeam?.id).map((team) => (
                  <Card key={team.id} className="rounded-2xl border-none shadow-md ring-1 ring-black/5 hover:ring-primary/20 transition-all cursor-pointer bg-white group">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 rounded-xl border shadow-inner">
                          <AvatarFallback className="font-black text-xs">{team.teamName[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-xs font-black uppercase tracking-tight leading-none mb-1">{team.teamName}</p>
                          <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">Head Coach</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="rounded-full hover:bg-primary/10 hover:text-primary">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </aside>
          </div>
        </div>
      ) : (
        <div className="text-center py-24 bg-muted/10 border-2 border-dashed rounded-[3rem] space-y-6">
          <div className="bg-white w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto shadow-xl relative">
            <Shield className="h-10 w-10 text-primary opacity-20" />
            <Trophy className="absolute -top-2 -right-2 h-8 w-8 text-amber-500 animate-bounce" />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black uppercase tracking-tight">Competitive Desert</h3>
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest max-w-sm mx-auto">
              Your squad hasn't joined a league yet. Start your own or accept a challenge to enter the standings.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button className="h-12 px-8 rounded-xl font-black uppercase text-xs tracking-widest" onClick={() => setIsCreateOpen(true)}>Create Hub League</Button>
            <Button variant="outline" className="h-12 px-8 rounded-xl font-black uppercase text-xs tracking-widest border-2">Browse Public Leagues</Button>
          </div>
        </div>
      )}

      {invites.length > 0 && (
        <div className="space-y-6 animate-in slide-in-from-bottom-8 duration-500">
          <div className="flex items-center gap-2 px-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Tactical Challenges ({invites.length})</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {invites.map((invite) => (
              <Card key={invite.id} className="rounded-3xl border-none shadow-xl ring-2 ring-amber-500/20 bg-amber-50 overflow-hidden">
                <CardContent className="p-6 flex items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="bg-white p-3 rounded-2xl shadow-sm">
                      <Shield className="h-6 w-6 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-[8px] font-black uppercase text-amber-700 tracking-widest">League Invitation</p>
                      <h4 className="text-lg font-black uppercase tracking-tight">{invite.leagueName}</h4>
                    </div>
                  </div>
                  <Button className="rounded-xl h-11 px-6 font-black bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-600/20" onClick={() => acceptLeagueInvite(invite.id, invite.leagueId)}>
                    Accept Challenge
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
