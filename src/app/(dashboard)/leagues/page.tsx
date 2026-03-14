
"use client";

import React, { useState, useMemo } from 'react';
import { useTeam, League, LeagueInvite, Member, TournamentGame, Facility, Field } from '@/components/providers/team-provider';
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
  MessageSquare,
  Users,
  Settings,
  Globe,
  Info,
  ClipboardList,
  ArrowUpRight,
  TrendingUp,
  Activity,
  BarChart2,
  CalendarDays,
  Sparkles,
  MapPin,
  ExternalLink,
  ChevronDown
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
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where, orderBy, doc, updateDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useRouter } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';
import Link from 'next/link';
import { generateLeagueSchedule } from '@/lib/scheduler-utils';

function SeasonSchedulerDialog({ league, isOpen, onOpenChange }: { league: League, isOpen: boolean, onOpenChange: (o: boolean) => void }) {
  const { user: authUser } = useUser();
  const { db, activeTeam, updateLeagueSchedule } = useTeam();
  const [isProcessing, setIsProcessing] = useState(false);
  const [config, setConfig] = useState({
    startDate: '',
    endDate: '',
    startTime: '18:00',
    endTime: '22:00',
    gameLength: '60',
    breakLength: '15',
    playDays: [1, 3] as number[], // Mon, Wed
    gamesPerTeam: '10',
    doubleHeaders: false,
    selectedFacilityId: '',
    selectedFields: [] as string[]
  });

  // Only show facilities belonging to the league creator
  const facilitiesQuery = useMemoFirebase(() => {
    if (!db || !authUser?.uid) return null;
    return query(collection(db, 'facilities'), where('clubId', '==', authUser.uid));
  }, [db, authUser?.uid]);

  const { data: facilities } = useCollection<Facility>(facilitiesQuery);
  
  const fieldsQuery = useMemoFirebase(() => {
    if (!db || !config.selectedFacilityId) return null;
    return query(collection(db, 'facilities', config.selectedFacilityId, 'fields'), orderBy('name', 'asc'));
  }, [db, config.selectedFacilityId]);

  const { data: fields } = useCollection<Field>(fieldsQuery);

  const toggleDay = (day: number) => {
    setConfig(p => ({ ...p, playDays: p.playDays.includes(day) ? p.playDays.filter(d => d !== day) : [...p.playDays, day] }));
  };

  const handleGenerate = async () => {
    if (!config.startDate || !config.selectedFields.length || !Object.keys(league.teams || {}).length) {
      toast({ title: "Configuration Required", description: "Set dates, teams and fields.", variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    try {
      const schedule = generateLeagueSchedule({
        teams: Object.keys(league.teams),
        fields: config.selectedFields,
        startDate: config.startDate,
        endDate: config.endDate || undefined,
        startTime: config.startTime,
        endTime: config.endTime,
        gameLength: parseInt(config.gameLength),
        breakLength: parseInt(config.breakLength),
        playDays: config.playDays,
        gamesPerTeam: parseInt(config.gamesPerTeam),
        doubleHeaders: config.doubleHeaders
      });
      await updateLeagueSchedule(league.id, schedule);
      onOpenChange(false);
      toast({ title: "Season Deployed", description: `${schedule.length} matches distributed evenly.` });
    } catch (e) {
      toast({ title: "Generation Failed", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleField = (fieldName: string) => {
    setConfig(p => ({
      ...p,
      selectedFields: p.selectedFields.includes(fieldName)
        ? p.selectedFields.filter(f => f !== fieldName)
        : [...p.selectedFields, fieldName]
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl rounded-[3rem] p-0 border-none shadow-2xl overflow-hidden bg-white">
        <DialogTitle className="sr-only">Season Architect Wizard</DialogTitle>
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 lg:p-12 space-y-10 overflow-y-auto max-h-[90vh] custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="text-3xl font-black uppercase tracking-tight leading-none">Season Architect</DialogTitle>
            <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest mt-2">Automated Resource Distribution Protocol</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="space-y-8">
              <div className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Timeline & Volume</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Season Start</Label><Input type="date" value={config.startDate} onChange={e => setConfig({...config, startDate: e.target.value})} className="h-12 border-2 rounded-xl" /></div>
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Season End (Opt)</Label><Input type="date" value={config.endDate} onChange={e => setConfig({...config, endDate: e.target.value})} className="h-12 border-2 rounded-xl" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Games/Team</Label><Input type="number" value={config.gamesPerTeam} onChange={e => setConfig({...config, gamesPerTeam: e.target.value})} className="h-12 border-2 rounded-xl" /></div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Double Headers</Label>
                    <div className="flex items-center h-12">
                      <button onClick={() => setConfig({...config, doubleHeaders: !config.doubleHeaders})} className={cn("h-7 w-12 rounded-full transition-all relative", config.doubleHeaders ? "bg-primary" : "bg-muted")}>
                        <div className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all", config.doubleHeaders ? "left-6" : "left-1")} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Recurring Play Days</Label>
                <div className="flex flex-wrap gap-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                    <button key={i} onClick={() => toggleDay(i)} className={cn("h-12 w-12 rounded-2xl font-black text-xs transition-all border-2", config.playDays.includes(i) ? "bg-primary border-primary text-white shadow-lg shadow-primary/20" : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50")}>{d[0]}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-8">
              <div className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Host Logistics</h3>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Organizational Venue</Label>
                  <select className="w-full h-12 rounded-xl border-2 px-3 font-bold bg-muted/10 outline-none focus:ring-2 focus:ring-primary/20 transition-all" value={config.selectedFacilityId} onChange={e => setConfig({...config, selectedFacilityId: e.target.value, selectedFields: []})}>
                    <option value="">Select organizational venue...</option>
                    {facilities?.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Resource Allocation (Select Fields/Courts)</Label>
                  <ScrollArea className="h-48 border-2 rounded-2xl p-2 bg-muted/5">
                    <div className="space-y-1 p-1">
                      {fields?.map(f => (
                        <div key={f.id} className={cn("flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all group", config.selectedFields.includes(f.name) ? "bg-primary text-white" : "hover:bg-white")} onClick={() => toggleField(f.name)}>
                          <span className="text-[10px] font-black uppercase tracking-widest">{f.name}</span>
                          {config.selectedFields.includes(f.name) ? <CheckCircle2 className="h-4 w-4" /> : <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />}
                        </div>
                      ))}
                      {(!fields || fields.length === 0) && (
                        <div className="flex flex-col items-center justify-center py-12 text-center opacity-30">
                          <Building className="h-8 w-8 mb-2" />
                          <p className="text-[9px] font-bold uppercase tracking-widest max-w-[150px]">Select a facility to allocate field resources.</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-6">
            <Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" onClick={handleGenerate} disabled={isProcessing || !config.startDate || config.selectedFields.length === 0}>
              {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : <Sparkles className="h-6 w-6 mr-3" />}
              Deploy Seasonal Itinerary
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function LeaguesPage() {
  const { user: authUser, isAuthResolved } = useUser();
  const { activeTeam, createLeague, inviteTeamToLeague, manuallyAddTeamToLeague, isStaff, isPro } = useTeam();
  const db = useFirestore();
  const router = useRouter();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isSeasonOpen, setIsSeasonOpen] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const leaguesQuery = useMemoFirebase(() => (isAuthResolved && activeTeam?.id && db) ? query(collection(db, 'leagues'), where(`teams.${activeTeam.id}`, '!=', null)) : null, [isAuthResolved, activeTeam?.id, db]);
  const { data: rawLeagues, isLoading: isLeaguesLoading } = useCollection<League>(leaguesQuery);
  const leagues = rawLeagues || [];
  const activeLeague = leagues[0] || null;

  const sortedStandings = useMemo(() => {
    if (!activeLeague || !activeLeague.teams) return [];
    return Object.entries(activeLeague.teams).map(([id, stats]) => ({ id, ...stats })).sort((a, b) => b.points - a.points || b.wins - a.wins);
  }, [activeLeague]);

  const handleCreateLeague = async () => {
    if (!leagueName.trim()) return;
    setIsProcessing(true);
    try {
      await createLeague(leagueName);
      setIsCreateOpen(false); setLeagueName('');
      toast({ title: "League Established" });
    } finally { setIsProcessing(false); }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail.trim() || !activeLeague) return;
    setIsProcessing(true);
    await inviteTeamToLeague(activeLeague.id, activeLeague.name, inviteEmail.toLowerCase());
    setIsInviteOpen(false); setInviteEmail(''); setIsProcessing(false);
  };

  if (isLeaguesLoading) return <div className="flex flex-col items-center justify-center py-20 animate-pulse"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="text-xs font-black uppercase mt-4">Opening Standings Hub...</p></div>;

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1"><Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">Competitive Ledger</Badge><h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none">Leagues</h1></div>
        {!activeLeague && isStaff && (
          <Button className="h-14 px-8 rounded-2xl text-lg font-black shadow-xl" onClick={() => setIsCreateOpen(true)}><Plus className="h-5 w-5 mr-2" /> Start New League</Button>
        )}
      </div>

      {activeLeague ? (
        <div className="space-y-8 animate-in fade-in duration-700">
          <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-black text-white relative group">
            <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700"><Shield className="h-48 w-48" /></div>
            <CardContent className="p-10 relative z-10">
              <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="flex items-center gap-6">
                  <div className="bg-primary p-5 rounded-[1.5rem] shadow-xl shadow-primary/20"><Trophy className="h-10 w-10 text-white" /></div>
                  <div>
                    <div className="flex items-center gap-2 mb-2"><Badge className="bg-primary text-white border-none h-5 text-[8px] uppercase font-black px-3">Premier Hub</Badge></div>
                    <h2 className="text-4xl font-black tracking-tight leading-none uppercase">{activeLeague.name}</h2>
                    <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-2">{activeLeague.sport} • {Object.keys(activeLeague.teams || {}).length} Squads Enrolled</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {isStaff && activeLeague.creatorId === authUser?.uid && (
                    <>
                      <Button onClick={() => setIsSeasonOpen(true)} className="h-12 px-8 rounded-xl font-black text-xs uppercase bg-white text-black hover:bg-primary hover:text-white"><CalendarDays className="h-4 w-4 mr-2" /> Season Architect</Button>
                      <Button asChild variant="outline" className="h-12 px-8 rounded-xl font-black text-xs uppercase border-white/20 text-white hover:bg-white/10 hover:text-white hover:border-primary">
                        <Link href={`/leagues/registration/${activeLeague.id}`}><ClipboardList className="h-4 w-4 mr-2" /> Registration Hub</Link>
                      </Button>
                      <Button variant="secondary" className="h-12 px-8 rounded-xl font-black text-xs uppercase" onClick={() => setIsInviteOpen(true)}><UserPlus className="h-4 w-4 mr-2" /> Add/Invite Team</Button>
                    </>
                  )}
                  <Button asChild variant="ghost" className="h-12 px-6 rounded-xl font-black text-xs uppercase text-white/60 hover:text-white"><Link href={`/leagues/spectator/${activeLeague.id}`} target="_blank"><ExternalLink className="h-4 w-4 mr-2" /> Public Portal</Link></Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between px-2"><div className="flex items-center gap-2"><TableIcon className="h-4 w-4 text-primary" /><h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">League Standings</h3></div></div>
              <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-muted/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b"><tr><th className="px-8 py-5">Squad</th><th className="px-4 py-5 text-center">W</th><th className="px-4 py-5 text-center">L</th><th className="px-4 py-5 text-center">T</th><th className="px-8 py-5 text-right text-primary">PTS</th></tr></thead>
                      <tbody className="divide-y">{sortedStandings.map((team, idx) => (<tr key={team.id} className={cn("hover:bg-primary/5 transition-colors group", team.id === activeTeam?.id && "bg-primary/5")}><td className="px-8 py-6"><div className="flex items-center gap-4"><span className="text-xs font-black text-muted-foreground/40 w-4">{idx + 1}</span><div className="flex items-center gap-3"><Avatar className="h-10 w-10 rounded-xl border shadow-inner shrink-0"><AvatarImage src={team.teamLogoUrl} className="object-cover" /><AvatarFallback className="font-black text-xs">{team.teamName?.[0] || 'T'}</AvatarFallback></Avatar><div className="flex flex-col min-w-0"><div className="flex items-center gap-2"><span className="font-black text-sm uppercase tracking-tight group-hover:text-primary transition-colors truncate">{team.teamName}</span></div></div></div></div></td><td className="px-4 py-6 text-center font-bold text-sm">{team.wins}</td><td className="px-4 py-6 text-center font-bold text-sm text-muted-foreground">{team.losses}</td><td className="px-4 py-6 text-center font-bold text-sm text-muted-foreground">{team.ties}</td><td className="px-8 py-6 text-right font-black text-lg text-primary">{team.points}</td></tr>))}</tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
            <aside className="space-y-6">
              <div className="flex items-center gap-2 px-2"><CalendarDays className="h-4 w-4 text-primary" /><h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Upcoming Schedule</h3></div>
              <div className="space-y-3">
                {activeLeague.schedule?.filter(g => !g.isCompleted).slice(0, 5).map((game) => (
                  <Card key={game.id} className="rounded-2xl border-none shadow-md ring-1 ring-black/5 p-4 bg-white group">
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-center"><span className="text-[10px] font-black text-primary uppercase tracking-widest">{game.time}</span><span className="text-[10px] font-bold text-muted-foreground">{game.date}</span></div>
                      <div className="flex items-center justify-center gap-4"><span className="font-black text-xs uppercase truncate max-w-[80px]">{game.team1}</span><span className="opacity-20 text-[10px] font-black">VS</span><span className="font-black text-xs uppercase truncate max-w-[80px] text-right">{game.team2}</span></div>
                    </div>
                  </Card>
                ))}
                {(!activeLeague.schedule || activeLeague.schedule.length === 0) && <div className="text-center py-10 bg-muted/10 rounded-2xl border-2 border-dashed opacity-40 text-[10px] font-black uppercase">Schedule Pending</div>}
              </div>
            </aside>
          </div>
        </div>
      ) : (
        <div className="text-center py-24 bg-muted/10 border-2 border-dashed rounded-[3rem] space-y-6"><div className="bg-white w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto shadow-xl relative"><Shield className="h-10 w-10 text-primary opacity-20" /><Trophy className="absolute -top-2 -right-2 h-8 w-8 text-amber-500 animate-bounce" /></div><div className="space-y-2"><h3 className="text-2xl font-black uppercase tracking-tight">Competitive Desert</h3><p className="text-sm font-bold text-muted-foreground uppercase tracking-widest max-sm:px-4 max-w-sm mx-auto">Your squad hasn't joined a league yet. Start your own or accept a challenge to enter the standings.</p></div></div>
      )}

      {activeLeague && <SeasonSchedulerDialog league={activeLeague} isOpen={isSeasonOpen} onOpenChange={setIsSeasonOpen} />}
      
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="rounded-[3rem] sm:max-w-xl p-0 border-none shadow-2xl overflow-hidden bg-white"><div className="h-2 bg-primary w-full" /><div className="p-8 lg:p-12 space-y-10"><DialogHeader><div className="flex items-center gap-4 mb-2"><div className="bg-primary/10 p-3 rounded-2xl text-primary"><Shield className="h-6 w-6" /></div><div><DialogTitle className="text-3xl font-black uppercase tracking-tight">League Identity</DialogTitle><DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">Establish a new competitive hub</DialogDescription></div></div></DialogHeader><div className="space-y-6"><div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Official League Name</Label><Input placeholder="e.g. Regional Varsity Premier" value={leagueName} onChange={e => setLeagueName(e.target.value)} className="h-14 rounded-2xl font-bold border-2" /></div></div><DialogFooter className="pt-4"><Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl" onClick={handleCreateLeague} disabled={isProcessing || !leagueName.trim()}>{isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Deploy Competitive Hub"}</Button></DialogFooter></div></DialogContent>
      </Dialog>

      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-lg p-0 border-none shadow-2xl"><div className="bg-primary/5 p-8 border-b"><DialogHeader><DialogTitle className="text-2xl font-black uppercase tracking-tight">Expand Competition</DialogTitle><DialogDescription className="font-bold text-primary/60 uppercase text-[10px] tracking-widest">Enroll verified squads</DialogDescription></DialogHeader></div><div className="p-8 space-y-6"><div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Coach Email</Label><Input placeholder="coach@opposingteam.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="h-12 rounded-xl font-bold border-2" /></div><Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleSendInvite} disabled={isProcessing || !inviteEmail.trim()}>{isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Dispatch Digital Invite"}</Button></div></DialogContent>
      </Dialog>
    </div>
  );
}
