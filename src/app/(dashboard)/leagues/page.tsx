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
  ChevronDown,
  Building,
  Calendar as CalendarIcon,
  List,
  LayoutGrid,
  X
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
import { Calendar } from '@/components/ui/calendar';
import { format, isSameDay } from 'date-fns';

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
  
  const allFields = useMemo(() => {
    // In a real scenario, we'd fetch fields for all selected venues.
    // For MVP, we allow selection from the current organizational facilities.
    return [];
  }, [facilities]);

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
      toast({ title: "Season Deployed", description: `${schedule.length} matches distributed evenly.` });
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

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl rounded-[3rem] p-0 border-none shadow-2xl overflow-hidden bg-white">
        <DialogTitle className="sr-only">Season Architect Protocol</DialogTitle>
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 lg:p-12 space-y-10 overflow-y-auto max-h-[90vh] custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="text-3xl font-black uppercase tracking-tight">Season Architect</DialogTitle>
            <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest mt-2">Institutional Scheduling Engine</DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-7 space-y-10">
              <section className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Timeline & Parameters</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Season Start</Label><Input type="date" value={config.startDate} onChange={e => setConfig({...config, startDate: e.target.value})} className="h-12 border-2 rounded-xl" /></div>
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Season End</Label><Input type="date" value={config.endDate} onChange={e => setConfig({...config, endDate: e.target.value})} className="h-12 border-2 rounded-xl" /></div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Games/Team</Label><Input type="number" value={config.gamesPerTeam} onChange={e => setConfig({...config, gamesPerTeam: e.target.value})} className="h-12 border-2 rounded-xl" /></div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Double Headers</Label>
                    <div className="flex items-center gap-3 h-12">
                      <button onClick={() => setConfig({...config, doubleHeaders: !config.doubleHeaders})} className={cn("h-7 w-12 rounded-full transition-all relative", config.doubleHeaders ? "bg-primary" : "bg-muted")}>
                        <div className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all", config.doubleHeaders ? "left-6" : "left-1")} />
                      </button>
                      <span className="text-[10px] font-bold uppercase text-muted-foreground">Alt Home/Away</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Resource Allocation</h3>
                <div className="space-y-4">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Select Active Venues</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {facilities?.map(f => (
                      <div key={f.id} className={cn("p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between", config.selectedVenues.includes(f.id) ? "border-primary bg-primary/5 shadow-sm" : "border-muted/50 hover:border-muted")} onClick={() => toggleVenue(f.id)}>
                        <div className="flex items-center gap-3">
                          <Building className={cn("h-4 w-4", config.selectedVenues.includes(f.id) ? "text-primary" : "text-muted-foreground")} />
                          <span className="text-xs font-black uppercase">{f.name}</span>
                        </div>
                        {config.selectedVenues.includes(f.id) && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      </div>
                    ))}
                  </div>
                </div>
                
                {config.selectedVenues.length > 0 && (
                  <div className="space-y-4 animate-in slide-in-from-top-4">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Assign Fields/Courts</Label>
                    <div className="bg-muted/20 rounded-2xl p-4 border-2 border-dashed space-y-2">
                      {/* For simplicity we use all fields of selected venues. Real app would fetch specific fields per venue */}
                      <p className="text-[9px] font-bold text-muted-foreground uppercase text-center py-4">Select fields manually in Facilities to map them here.</p>
                      <Button variant="outline" className="w-full h-10 rounded-xl font-black uppercase text-[10px]" onClick={() => setConfig({...config, selectedFields: ['Field 1', 'Field 2', 'Court A']})}>Map Standard Resources</Button>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <aside className="lg:col-span-5 space-y-10">
              <section className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Blackout Dates</h3>
                <div className="bg-white border-2 rounded-[2rem] p-4 shadow-inner">
                  <Calendar 
                    mode="multiple"
                    selected={config.blackoutDates}
                    onSelect={(dates) => setConfig({...config, blackoutDates: dates || []})}
                    className="w-full"
                  />
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-[9px] font-black uppercase text-muted-foreground px-2">{config.blackoutDates.length} Dates Booked Off</p>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <DialogFooter className="pt-10">
            <Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" onClick={handleGenerate} disabled={isProcessing || !config.startDate}>
              {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : <Sparkles className="h-6 w-6 mr-3" />}
              Deploy Seasonal Pipeline
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeagueOverview({ league, schedule }: { league: League, schedule: TournamentGame[] }) {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const gamesOnSelectedDate = useMemo(() => {
    return schedule.filter(g => format(new Date(g.date), 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd'));
  }, [schedule, selectedDate]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-primary" />
          <h3 className="text-xl font-black uppercase tracking-tight">League command Overview</h3>
        </div>
        <div className="bg-muted/50 p-1 rounded-xl border flex items-center shadow-inner">
          <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('list')} className="h-8 px-4 rounded-lg font-black text-[10px] uppercase"><List className="h-3.5 w-3.5 mr-2" /> List</Button>
          <Button variant={viewMode === 'calendar' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('calendar')} className="h-8 px-4 rounded-lg font-black text-[10px] uppercase"><CalendarIcon className="h-3.5 w-3.5 mr-2" /> Calendar</Button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b">
                  <tr>
                    <th className="px-8 py-5">Date/Time</th>
                    <th className="px-4 py-5">Matchup</th>
                    <th className="px-4 py-5">Venue</th>
                    <th className="px-8 py-5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {schedule.map(game => (
                    <tr key={game.id} className="hover:bg-muted/5 transition-colors">
                      <td className="px-8 py-6">
                        <p className="font-black text-xs uppercase">{game.date}</p>
                        <p className="text-[10px] font-bold text-muted-foreground">{game.time}</p>
                      </td>
                      <td className="px-4 py-6">
                        <div className="flex items-center gap-3">
                          <span className="font-black text-xs uppercase truncate max-w-[100px]">{game.team1}</span>
                          <span className="opacity-20 text-[10px] font-black">VS</span>
                          <span className="font-black text-xs uppercase truncate max-w-[100px]">{game.team2}</span>
                        </div>
                      </td>
                      <td className="px-4 py-6">
                        <p className="text-[10px] font-black uppercase text-primary flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {game.location || 'League Venue'}</p>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <Badge variant={game.isCompleted ? 'default' : 'outline'} className="font-black text-[8px] uppercase">{game.isCompleted ? 'Final' : 'Scheduled'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <Card className="lg:col-span-5 rounded-[2.5rem] border-none shadow-xl bg-white p-6">
            <Calendar 
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              className="w-full"
            />
          </Card>
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between px-2">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{format(selectedDate, 'EEEE, MMMM do')}</h4>
              <Badge className="bg-primary text-white h-5 text-[8px] uppercase px-2">{gamesOnSelectedDate.length} MATCHES</Badge>
            </div>
            <div className="space-y-3">
              {gamesOnSelectedDate.map(game => (
                <Card key={game.id} className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 p-5 flex items-center justify-between bg-white">
                  <div className="flex items-center gap-6">
                    <div className="w-12 h-12 rounded-xl bg-primary/5 flex flex-col items-center justify-center shrink-0 border border-primary/10">
                      <Clock className="h-4 w-4 text-primary" />
                      <span className="text-[8px] font-black text-primary uppercase">{game.time}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-sm uppercase truncate">{game.team1} vs {game.team2}</p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5 mt-1"><MapPin className="h-3 w-3" /> {game.location}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 opacity-20" />
                </Card>
              ))}
              {gamesOnSelectedDate.length === 0 && (
                <div className="py-20 text-center border-2 border-dashed rounded-[2.5rem] opacity-30">
                  <CalendarDays className="h-10 w-10 mx-auto mb-2" />
                  <p className="text-xs font-black uppercase">No matches scheduled for this date.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LeaguesPage() {
  const { user: authUser, isAuthResolved } = useUser();
  const { activeTeam, createLeague, inviteTeamToLeague, manuallyAddTeamToLeague, isStaff, isPro, householdEvents } = useTeam();
  const db = useFirestore();
  const router = useRouter();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isSeasonOpen, setIsSeasonOpen] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('standings');

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

  const isOrganizer = activeLeague?.creatorId === authUser?.uid;

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
                  {isStaff && isOrganizer && (
                    <>
                      <Button onClick={() => setIsSeasonOpen(true)} className="h-12 px-8 rounded-xl font-black text-xs uppercase bg-white text-black hover:bg-primary hover:text-white"><CalendarDays className="h-4 w-4 mr-2" /> Season Architect</Button>
                      <Button asChild variant="outline" className="h-12 px-8 rounded-xl font-black text-xs uppercase border-white/20 text-white hover:bg-white/10 hover:text-primary hover:border-primary transition-all">
                        <Link href={`/leagues/registration/${activeLeague.id}`} className="flex items-center text-white hover:text-primary">
                          <ClipboardList className="h-4 w-4 mr-2" /> 
                          <span>Registration Hub</span>
                        </Link>
                      </Button>
                      <Button variant="secondary" className="h-12 px-8 rounded-xl font-black text-xs uppercase" onClick={() => setIsInviteOpen(true)}><UserPlus className="h-4 w-4 mr-2" /> Add/Invite Team</Button>
                    </>
                  )}
                  <Button asChild variant="ghost" className="h-12 px-6 rounded-xl font-black text-xs uppercase text-white/60 hover:text-white"><Link href={`/leagues/spectator/${activeLeague.id}`} target="_blank"><ExternalLink className="h-4 w-4 mr-2" /> Public Portal</Link></Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {isOrganizer && (
            <div className="bg-muted/50 p-1.5 rounded-2xl border-2 inline-flex w-full md:w-auto">
              <Button variant={activeTab === 'standings' ? 'default' : 'ghost'} className="rounded-xl flex-1 md:flex-none font-black text-[10px] uppercase px-8" onClick={() => setActiveTab('standings')}>Standings</Button>
              <Button variant={activeTab === 'command' ? 'default' : 'ghost'} className="rounded-xl flex-1 md:flex-none font-black text-[10px] uppercase px-8" onClick={() => setActiveTab('command')}>League Command</Button>
            </div>
          )}

          {activeTab === 'standings' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between px-2"><div className="flex items-center gap-2"><TableIcon className="h-4 w-4 text-primary" /><h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">League Standings</h3></div></div>
                <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b"><tr><th className="px-8 py-5">Squad</th><th className="px-4 py-5 text-center">W</th><th className="px-4 py-5 text-center">L</th><th className="px-4 py-5 text-center">T</th><th className="px-8 py-5 text-right text-primary">PTS</th></tr></thead>
                        <tbody className="divide-y">{sortedStandings.map((team, idx) => (<tr key={team.id} className={cn("hover:bg-primary/5 transition-colors group", team.id === activeTeam?.id && "bg-primary/5")}><td className="px-8 py-6"><div className="flex items-center gap-4"><span className="text-xs font-black text-muted-foreground/40 w-4">{idx + 1}</span><div className="flex items-center gap-3"><Avatar className="h-10 w-10 rounded-xl border shadow-inner shrink-0"><AvatarImage src={team.teamLogoUrl} className="object-cover" /><AvatarFallback className="font-black text-xs">{team.teamName?.[0] || 'T'}</AvatarFallback></Avatar><div className="flex flex-col min-w-0"><div className="flex items-center gap-2"><span className="font-black text-sm uppercase tracking-tight group-hover:text-primary transition-colors truncate">{team.teamName}</span></div></div></div></div></td><td className="px-4 py-6 text-center font-bold text-sm">{team.wins}</td><td className="px-4 py-6 text-center font-bold text-sm text-muted-foreground">{team.losses}</td><td className="px-4 py-6 text-center font-bold text-sm text-muted-foreground">{team.ties}</td><td className="px-8 py-6 text-right font-black text-lg text-primary">{team.points}</td></tr>))}</tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
              <aside className="space-y-6">
                <div className="flex items-center gap-2 px-2"><CalendarDays className="h-4 w-4 text-primary" /><h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">My Squad Itinerary</h3></div>
                <div className="space-y-3">
                  {activeLeague.schedule?.filter(g => !g.isCompleted && (g.team1 === activeTeam?.name || g.team2 === activeTeam?.name)).slice(0, 5).map((game) => (
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
          ) : (
            <LeagueOverview league={activeLeague} schedule={activeLeague.schedule || []} />
          )}
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
