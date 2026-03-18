"use client";

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  Trophy, 
  UserPlus, 
  Plus, 
  ChevronLeft, 
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
  Activity,
  CalendarDays,
  Sparkles,
  MapPin,
  ExternalLink,
  Building,
  List,
  X,
  ChevronRight,
  Hash,
  Copy,
  Link as LinkIcon,
  Trash2,
  DollarSign,
  History,
  AlertCircle,
  Phone,
  Edit3,
  ShieldCheck,
  PenTool
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription, 
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, where, doc, updateDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { generateLeagueSchedule } from '@/lib/scheduler-utils';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { useTeam, League, TournamentGame, Member, Facility, Field, TeamDocument, LeagueInvite } from '@/components/providers/team-provider';

const DAYS_OF_WEEK = [
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
  { id: 0, label: 'Sun' },
];

function SeasonSchedulerDialog({ league, isOpen, onOpenChange }: { league: League, isOpen: boolean, onOpenChange: (o: boolean) => void }) {
  const { user: authUser } = useUser();
  const { db, updateLeagueSchedule } = useTeam();
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [config, setConfig] = useState({
    startDate: '',
    endDate: '',
    startTime: '18:00',
    endTime: '22:00',
    gameLength: '60',
    breakLength: '15',
    playDays: [1, 3] as number[],
    gamesPerTeam: '10',
    doubleHeaders: false,
    selectedVenues: [] as string[],
    selectedFields: [] as string[],
    blackoutDates: [] as Date[]
  });

  const facilitiesQuery = useMemoFirebase(() => {
    if (!db || !authUser?.uid) return null;
    return query(collection(db, 'facilities'), where('clubId', '==', authUser.uid));
  }, [db, authUser?.uid]);

  const { data: facilities } = useCollection<Facility>(facilitiesQuery);

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
        doubleHeaders: config.doubleHeaders,
        blackoutDates: config.blackoutDates.map(d => d.toISOString())
      });
      await updateLeagueSchedule(league.id, schedule);
      onOpenChange(false);
      toast({ title: "Season Deployed", description: `${schedule.length} matches distributed.` });
    } catch (e) {
      toast({ title: "Generation Failed", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleVenue = (vid: string) => {
    setConfig(p => ({
      ...p,
      selectedVenues: p.selectedVenues.includes(vid) ? p.selectedVenues.filter(v => v !== vid) : [...p.selectedVenues, vid]
    }));
  };

  const toggleDay = (dayId: number) => {
    setConfig(p => ({
      ...p,
      playDays: p.playDays.includes(dayId) ? p.playDays.filter(d => d !== dayId) : [...p.playDays, dayId]
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl rounded-[3rem] p-0 border-none shadow-2xl overflow-hidden bg-white text-foreground">
        <DialogTitle className="sr-only">Season Architect Protocol</DialogTitle>
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 lg:p-12 space-y-10 overflow-y-auto max-h-[90vh] custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="text-3xl font-black uppercase tracking-tight text-foreground">Season Architect</DialogTitle>
            <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest mt-2">Institutional Scheduling Engine</DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 text-foreground">
            <div className="lg:col-span-7 space-y-10">
              <section className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Timeline & Parameters</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Season Start</Label><Input type="date" value={config.startDate} onChange={e => setConfig({...config, startDate: e.target.value})} className="h-12 border-2 rounded-xl" /></div>
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Season End</Label><Input type="date" value={config.endDate} onChange={e => setConfig({...config, endDate: e.target.value})} className="h-12 border-2 rounded-xl" /></div>
                </div>
                <div className="space-y-4">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Schedule Days</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map(day => (
                      <button key={day.id} onClick={() => toggleDay(day.id)} className={cn("h-10 px-4 rounded-xl font-black text-[10px] uppercase transition-all border-2", config.playDays.includes(day.id) ? "bg-primary border-primary text-white" : "bg-white text-muted-foreground hover:border-primary/20")}>{day.label}</button>
                    ))}
                  </div>
                </div>
              </section>
              <section className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Resource Allocation</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {facilities?.map(f => (
                    <div key={f.id} className={cn("p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between", config.selectedVenues.includes(f.id) ? "border-primary bg-primary/5" : "border-muted/50")} onClick={() => toggleVenue(f.id)}>
                      <div className="flex items-center gap-3"><Building className={cn("h-4 w-4", config.selectedVenues.includes(f.id) ? "text-primary" : "text-muted-foreground")} /><span className="text-xs font-black uppercase">{f.name}</span></div>
                      {config.selectedVenues.includes(f.id) && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <aside className="lg:col-span-5"><Calendar mode="multiple" selected={config.blackoutDates} onSelect={(dates) => setConfig({...config, blackoutDates: dates || []})} /></aside>
          </div>
          <DialogFooter className="pt-10"><Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20" onClick={handleGenerate} disabled={isProcessing || !config.startDate}>{isProcessing ? <Loader2 className="h-6 w-6 animate-spin mr-3" /> : <Sparkles className="h-6 w-6 mr-3" />}Deploy Seasonal Pipeline</Button></DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeagueOverview({ league, schedule }: { league: League, schedule: TournamentGame[] }) {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const gamesOnSelectedDate = useMemo(() => (schedule || []).filter(g => format(new Date(g.date), 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd')), [schedule, selectedDate]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3"><Activity className="h-5 w-5 text-primary" /><h3 className="text-xl font-black uppercase tracking-tight text-foreground">League Overview</h3></div>
        <div className="bg-muted/50 p-1 rounded-xl border flex items-center shadow-inner">
          <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('list')} className="h-8 px-4 rounded-lg font-black text-[10px] uppercase">List</Button>
          <Button variant={viewMode === 'calendar' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('calendar')} className="h-8 px-4 rounded-lg font-black text-[10px] uppercase">Calendar</Button>
        </div>
      </div>
      {viewMode === 'list' ? (
        <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b"><tr><th className="px-8 py-5">Date/Time</th><th className="px-4 py-5">Matchup</th><th className="px-4 py-5">Venue</th><th className="px-8 py-5 text-right">Status</th></tr></thead>
                <tbody className="divide-y">{(schedule || []).map(game => (<tr key={game.id} className="hover:bg-muted/5"><td className="px-8 py-6"><p className="font-black text-xs uppercase">{game.date}</p><p className="text-[10px] font-bold text-muted-foreground">{game.time}</p></td><td className="px-4 py-6 font-black text-xs uppercase">{game.team1} vs {game.team2}</td><td className="px-4 py-6 text-[10px] font-black uppercase text-primary flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {game.location || 'Venue TBD'}</td><td className="px-8 py-6 text-right"><Badge variant={game.isCompleted ? 'default' : 'outline'} className="font-black text-[8px] uppercase">{game.isCompleted ? 'Final' : 'Scheduled'}</Badge></td></tr>))}</tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <Card className="lg:col-span-5 rounded-[2.5rem] border-none shadow-xl bg-white p-6"><Calendar mode="single" selected={selectedDate} onSelect={(d) => d && setSelectedDate(d)} /></Card>
          <div className="lg:col-span-7 space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2">{format(selectedDate, 'EEEE, MMM do')}</h4>
            {gamesOnSelectedDate.map(game => (<Card key={game.id} className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 p-5 flex items-center justify-between bg-white"><div className="flex items-center gap-6"><div className="w-12 h-12 rounded-xl bg-primary/5 flex flex-col items-center justify-center border shrink-0"><Clock className="h-4 w-4 text-primary" /><span className="text-[8px] font-black text-primary uppercase">{game.time}</span></div><div className="min-w-0"><p className="font-black text-sm uppercase truncate text-foreground">{game.team1} vs {game.team2}</p><p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5 mt-1"><MapPin className="h-3 w-3" /> {game.location}</p></div></div><ChevronRight className="h-4 w-4 opacity-20" /></Card>))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LeaguesPage() {
  const { activeTeam, createLeague, inviteTeamToLeague, manuallyAddTeamToLeague, isStaff, isPro, deleteLeagueInvite, purchasePro } = useTeam();
  const db = useFirestore();
  const { user: authUser, isAuthResolved } = useUser();
  const router = useRouter();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isSeasonOpen, setIsSeasonOpen] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteTeamName, setInviteTeamName] = useState('');
  const [inviteMethod, setInviteMethod] = useState<'manual' | 'digital' | 'code' | 'portal'>('digital');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('standings');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const leaguesQuery = useMemoFirebase(() => {
    if (!isAuthResolved || !activeTeam?.id || !db || !authUser?.uid) return null;
    return query(collection(db, 'leagues'), where('memberTeamIds', 'array-contains', activeTeam.id));
  }, [isAuthResolved, activeTeam?.id, db, authUser?.uid]);

  const { data: leagues, isLoading: isLeaguesLoading } = useCollection<League>(leaguesQuery);
  const activeLeague = (leagues || [])[0] || null;

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

  const copyToClipboard = (text: string, successMsg: string) => {
    try {
      navigator.clipboard.writeText(text);
      toast({ title: successMsg });
    } catch (err) {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast({ title: successMsg });
    }
  };

  if (!mounted || isLeaguesLoading || !activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center animate-in fade-in duration-700">
        <div className="bg-primary/10 p-8 rounded-[3rem] shadow-xl mb-6"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
        <p className="text-xl font-black uppercase tracking-tight text-foreground">Synchronizing Hub...</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-20 text-foreground">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1"><Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3 tracking-widest">Master Hub</Badge><h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none text-foreground">Leagues</h1></div>
        {!activeLeague && isStaff && (
          <Button className="h-14 px-8 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={() => setIsCreateOpen(true)}><Plus className="h-5 w-5 mr-2" /> Launch League</Button>
        )}
      </div>

      {activeLeague ? (
        <div className="space-y-8 animate-in fade-in duration-700">
          <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-black text-white p-10 relative group">
            <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700"><ShieldCheck className="h-48 w-48" /></div>
            <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
              <div className="flex items-center gap-6">
                <div className="bg-primary p-5 rounded-[1.5rem] shadow-xl"><Trophy className="h-10 w-10 text-white" /></div>
                <div>
                  <Badge className="bg-primary text-white border-none h-5 text-[8px] uppercase font-black px-3 mb-2">Premier Series</Badge>
                  <h2 className="text-4xl font-black uppercase tracking-tight leading-none">{activeLeague.name}</h2>
                  <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-2">{activeLeague.sport} • {Object.keys(activeLeague.teams || {}).length} Squads</p>
                </div>
              </div>
              {isStaff && activeLeague.creatorId === authUser?.uid && (
                <div className="flex gap-2">
                  <Button onClick={() => isPro ? setIsSeasonOpen(true) : purchasePro()} variant="outline" className="rounded-xl h-12 px-6 border-white/20 bg-white/5 text-white hover:bg-white hover:text-black transition-all">Season Architect</Button>
                  <Button onClick={() => setIsInviteOpen(true)} className="rounded-xl h-12 px-6 font-black uppercase text-xs">Recruit Teams</Button>
                </div>
              )}
            </div>
          </Card>

          <div className="bg-muted/50 p-1.5 rounded-2xl border-2 inline-flex">
            <Button variant={activeTab === 'standings' ? 'default' : 'ghost'} className="rounded-xl font-black text-[10px] uppercase px-8" onClick={() => setActiveTab('standings')}>Standings</Button>
            <Button variant={activeTab === 'command' ? 'default' : 'ghost'} className="rounded-xl font-black text-[10px] uppercase px-8" onClick={() => setActiveTab('command')}>Schedule</Button>
          </div>

          <Tabs value={activeTab} className="mt-0">
            <TabsContent value="standings" className="mt-0">
              <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b"><tr><th className="px-8 py-5">Squad</th><th className="px-4 py-5 text-center">W</th><th className="px-4 py-5 text-center">L</th><th className="px-4 py-5 text-center">T</th><th className="px-8 py-5 text-right text-primary">PTS</th></tr></thead>
                    <tbody className="divide-y">{sortedStandings.map((team, idx) => (<tr key={team.id} className="hover:bg-primary/5 transition-colors group"><td className="px-8 py-6"><div className="flex items-center gap-4"><span className="text-xs font-black text-muted-foreground/40">{idx + 1}</span><div className="font-black text-sm uppercase truncate text-foreground">{team.teamName}</div></div></td><td className="px-4 py-6 text-center font-bold text-sm text-foreground">{team.wins}</td><td className="px-4 py-6 text-center font-bold text-sm text-muted-foreground">{team.losses}</td><td className="px-4 py-6 text-center font-bold text-sm text-muted-foreground">{team.ties}</td><td className="px-8 py-6 text-right font-black text-lg text-primary">{team.points}</td></tr>))}</tbody>
                  </table>
                </div>
              </Card>
            </TabsContent>
            <TabsContent value="command" className="mt-0"><LeagueOverview league={activeLeague} schedule={activeLeague.schedule || []} /></TabsContent>
          </Tabs>
        </div>
      ) : (
        <div className="text-center py-24 bg-muted/10 border-2 border-dashed rounded-[3rem] space-y-6"><div className="bg-white w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto shadow-xl"><Shield className="h-10 w-10 text-primary opacity-20" /></div><div className="space-y-2"><h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Competitive Desert</h3><p className="text-sm font-bold text-muted-foreground uppercase tracking-widest max-w-sm mx-auto">No active league enrollment found. Launch your own tournament or accept a diplomatic invite to enter the standings.</p></div></div>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md p-0 overflow-hidden bg-white text-foreground">
          <div className="h-2 bg-primary w-full" />
          <div className="p-10 space-y-8">
            <DialogHeader><DialogTitle className="text-3xl font-black uppercase tracking-tight">League Architect</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">League Name</Label>
              <Input placeholder="e.g. State Varsity Premier" value={leagueName} onChange={e => setLeagueName(e.target.value)} className="h-14 rounded-2xl border-2 font-black text-lg" />
            </div>
            <DialogFooter><Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl" onClick={handleCreateLeague} disabled={isProcessing}>{isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Deploy Competitive Hub"}</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <SeasonSchedulerDialog league={activeLeague!} isOpen={isSeasonOpen} onOpenChange={setIsSeasonOpen} />
    </div>
  );
}