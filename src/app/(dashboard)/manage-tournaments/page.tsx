"use client";

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Trophy, 
  Plus, 
  MapPin, 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  Clock, 
  ChevronRight,
  ArrowRight,
  Loader2,
  CalendarDays,
  Table as TableIcon,
  Zap,
  Target,
  List,
  ShieldAlert,
  Edit3,
  ExternalLink,
  Users,
  FileSignature,
  Info,
  X,
  Download,
  Share2,
  Sparkles,
  Settings,
  Building,
  CheckCircle2,
  Calendar as CalendarDaysIcon,
  Save,
  Mail,
  User,
  Trash2,
  Signature
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTeam, TeamEvent, TournamentGame, Member, Facility, Field, TeamDocument, League, RegistrationEntry } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, where, doc, updateDoc, collectionGroup, getDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { format, isPast, isSameDay, eachDayOfInterval } from 'date-fns';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';
import { generateTournamentSchedule, DailyWindow, TeamIdentity } from '@/lib/scheduler-utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { downloadICS } from '@/lib/calendar-utils';
import html2canvas from 'html2canvas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TournamentTeam extends TeamIdentity {
  coach?: string;
  email?: string;
}

function calculateTournamentStandings(teams: TournamentTeam[], games: TournamentGame[]) {
  const standings = teams.reduce((acc, team) => {
    acc[team.name] = { name: team.name, wins: 0, losses: 0, ties: 0, points: 0 };
    return acc;
  }, {} as Record<string, any>);
  
  games.forEach(game => {
    if (!game.isCompleted) return;
    const t1 = game.team1; const t2 = game.team2;
    if (!standings[t1] || !standings[t2]) return;
    
    if (game.score1 > game.score2) { standings[t1].wins += 1; standings[t1].points += 1; standings[t2].losses += 1; standings[t2].points -= 1; }
    else if (game.score2 > game.score1) { standings[t2].wins += 1; standings[t2].points += 1; standings[t1].losses += 1; standings[t1].points -= 1; }
    else { standings[t1].ties += 1; standings[t2].ties += 1; }
  });
  return Object.values(standings).sort((a, b) => b.points - a.points || b.wins - a.wins);
}

function BracketVisualizer({ games }: { games: TournamentGame[] }) {
  const bracketRef = useRef<HTMLDivElement>(null);

  const handleDownload = async () => {
    if (!bracketRef.current) return;
    const canvas = await html2canvas(bracketRef.current, { backgroundColor: '#000' });
    const link = document.createElement('a');
    link.download = 'tournament_bracket.png';
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" className="font-black text-[10px] uppercase border-black text-black hover:bg-black hover:text-white" onClick={handleDownload}>
          <Download className="h-3 w-3 mr-2" /> Download Bracket
        </Button>
      </div>
      <div ref={bracketRef} className="p-12 bg-black rounded-[3rem] border-2 border-primary/20 overflow-x-auto min-h-[500px] flex items-center justify-center text-white">
        <div className="flex gap-16 items-center">
          <div className="flex flex-col gap-12">
            <p className="text-[10px] font-black uppercase text-center text-primary/40 mb-2 tracking-[0.2em]">Pool Stage</p>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="w-56 h-20 bg-white/5 rounded-2xl border-2 border-white/10 flex flex-col justify-center px-5 shadow-lg">
                <div className="flex justify-between items-center mb-2"><div className="h-2 w-24 bg-white/20 rounded-full" /><div className="h-2 w-4 bg-white/10 rounded-full" /></div>
                <div className="flex justify-between items-center"><div className="h-2 w-16 bg-white/10 rounded-full" /><div className="h-2 w-4 bg-white/10 rounded-full" /></div>
              </div>
            ))}
          </div>
          <ArrowRight className="h-8 w-8 text-primary opacity-20" />
          <div className="flex flex-col gap-32">
            <p className="text-[10px] font-black uppercase text-center text-primary/40 mb-2 tracking-[0.2em]">Semi Finals</p>
            {[1, 2].map(i => (
              <div key={i} className="w-60 h-24 bg-primary/5 rounded-[2rem] border-2 border-primary/20 flex flex-col justify-center px-6 shadow-xl relative">
                <div className="absolute -left-2 top-1/2 -translate-y-1/2 h-8 w-1 bg-primary rounded-full" />
                <div className="flex justify-between items-center mb-3"><span className="text-xs font-black uppercase text-white/40">TBD</span><span className="text-xs font-bold text-primary">0</span></div>
                <div className="flex justify-between items-center"><span className="text-xs font-black uppercase text-white/40">TBD</span><span className="text-xs font-bold text-primary">0</span></div>
              </div>
            ))}
          </div>
          <ArrowRight className="h-10 w-10 text-primary opacity-40 animate-pulse" />
          <div className="flex flex-col">
            <p className="text-[10px] font-black uppercase text-center text-primary mb-6 tracking-widest">Championship Final</p>
            <div className="w-72 h-40 bg-white text-black rounded-[2.5rem] border-4 border-primary flex flex-col justify-center items-center gap-4 shadow-[0_0_50px_rgba(255,0,0,0.3)] relative group">
              <div className="absolute inset-0 bg-primary opacity-0 group-hover:opacity-5 transition-opacity" />
              <Trophy className="absolute -top-8 h-16 w-16 text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]" />
              <div className="text-center pt-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Finalist Matchup</p>
                <div className="flex items-center gap-4">
                  <span className="font-black text-xl uppercase opacity-20 tracking-tighter">TBD</span>
                  <span className="font-black text-sm opacity-10">VS</span>
                  <span className="font-black text-xl uppercase opacity-20 tracking-tighter">TBD</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TournamentDetailView({ event, onBack }: { event: TeamEvent, onBack: () => void }) {
  const { user: authUser } = useUser();
  const { members, isStaff, activeTeam, db, exportTournamentStandingsCSV, exportAttendanceCSV } = useTeam();
  
  const [tournamentTeams, setTournamentTeams] = useState<TournamentTeam[]>([]);
  const standings = useMemo(() => calculateTournamentStandings(tournamentTeams, event.tournamentGames || []), [tournamentTeams, event.tournamentGames]);
  const isOrganizer = isStaff && event.teamId === activeTeam?.id;
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isGenOpen, setIsGenOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('itinerary');
  const [genStep, setGenStep] = useState(1);
  
  const [teamRows, setTeamRows] = useState<TournamentTeam[]>([]);

  const [genConfig, setGenConfig] = useState<{
    dailyWindows: DailyWindow[];
    gameLength: string;
    breakLength: string;
    selectedFields: string[];
    manualVenue: string;
    tournamentType: 'round_robin' | 'single_elimination' | 'double_elimination';
  }>({
    dailyWindows: [],
    gameLength: '60',
    breakLength: '15',
    selectedFields: [],
    manualVenue: event.location || '',
    tournamentType: 'round_robin'
  });

  useEffect(() => {
    if (event.tournamentTeamsData) {
      setTournamentTeams(event.tournamentTeamsData);
      setTeamRows(event.tournamentTeamsData);
    } else if (event.tournamentTeams) {
      const legacy = event.tournamentTeams.map((name, i) => ({ id: `t_${i}`, name }));
      setTournamentTeams(legacy);
      setTeamRows(legacy);
    }
  }, [event.tournamentTeamsData, event.tournamentTeams]);

  const leaguesQuery = useMemoFirebase(() => (db && isOrganizer) ? query(collection(db, 'leagues'), where('creatorId', '==', authUser?.uid)) : null, [db, isOrganizer, authUser?.uid]);
  const { data: myLeagues } = useCollection<League>(leaguesQuery);

  const pipelineQuery = useMemoFirebase(() => (db && isOrganizer) ? query(collectionGroup(db, 'registrationEntries'), where('status', '==', 'accepted')) : null, [db, isOrganizer]);
  const { data: pipelineEntries } = useCollection<RegistrationEntry>(pipelineQuery);

  const facilitiesQuery = useMemoFirebase(() => {
    if (!db || !authUser?.uid) return null;
    return query(collection(db, 'facilities'), where('clubId', '==', authUser.uid));
  }, [db, authUser?.uid]);
  const { data: facilities } = useCollection<Facility>(facilitiesQuery);

  const initGenModal = () => {
    const days = eachDayOfInterval({ start: new Date(event.date), end: new Date(event.endDate || event.date) });
    let normalizedStartTime = '08:00';
    if (event.startTime) {
      const timeMatch = event.startTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (timeMatch) {
        let [_, hours, mins, ampm] = timeMatch;
        let h = parseInt(hours);
        if (ampm.toUpperCase() === 'PM' && h < 12) h += 12;
        if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
        normalizedStartTime = `${h.toString().padStart(2, '0')}:${mins}`;
      } else if (event.startTime.includes(':')) {
        normalizedStartTime = event.startTime;
      }
    }

    setGenConfig(p => ({
      ...p,
      dailyWindows: days.map(d => ({
        date: format(d, 'yyyy-MM-dd'),
        startTime: normalizedStartTime,
        endTime: '20:00'
      }))
    }));
    setGenStep(1);
    setIsGenOpen(true);
  };

  const handleUpdateTeams = async () => {
    if (!db || !event.id) return;
    const validTeams = teamRows.filter(t => t.name.trim());
    const invitedMap: Record<string, string> = {};
    validTeams.forEach((t) => { if (t.email) invitedMap[t.email] = t.name; });
    
    await updateDoc(doc(db, 'teams', event.teamId, 'events', event.id), { 
      tournamentTeams: validTeams.map(t => t.name),
      tournamentTeamsData: validTeams,
      invitedTeamEmails: invitedMap 
    });
    setIsEditOpen(false);
    toast({ title: "Tournament Roster Updated" });
  };

  const handleGenerateItinerary = async () => {
    if (!tournamentTeams.length || (genConfig.selectedFields.length === 0 && !genConfig.manualVenue)) {
      toast({ title: "Config Required", description: "Enroll squads and select venues first.", variant: "destructive" });
      return;
    }

    const schedule = generateTournamentSchedule({
      teams: tournamentTeams,
      fields: genConfig.selectedFields.length > 0 ? genConfig.selectedFields : [genConfig.manualVenue],
      startDate: event.date,
      endDate: event.endDate,
      startTime: genConfig.dailyWindows[0]?.startTime || '08:00',
      endTime: genConfig.dailyWindows[0]?.endTime || '20:00',
      gameLength: parseInt(genConfig.gameLength),
      breakLength: parseInt(genConfig.breakLength),
      dailyWindows: genConfig.dailyWindows,
      tournamentType: genConfig.tournamentType
    });

    if (schedule.length === 0) {
      toast({ title: "Generation Failure", description: "Check time windows and field allocation.", variant: "destructive" });
      return;
    }

    await updateDoc(doc(db, 'teams', event.teamId, 'events', event.id), { 
      tournamentGames: schedule,
      updatedAt: new Date().toISOString()
    });
    setIsGenOpen(false);
    toast({ title: "Itinerary Synchronized", description: `Deployed ${schedule.length} matches.` });
  };

  const importFromLeague = (league: League) => {
    const leagueTeams = Object.values(league.teams || {}).map((t: any) => ({
      id: `l_${Date.now()}_${Math.random()}`,
      name: t.teamName,
      coach: t.coachName || '',
      email: t.coachEmail || ''
    }));
    setTeamRows(prev => [...prev, ...leagueTeams]);
    toast({ title: "Import Successful", description: `Added ${leagueTeams.length} squads.` });
  };

  const addTeamRow = () => {
    setTeamRows([...teamRows, { id: `manual_${Date.now()}`, name: '', coach: '', email: '' }]);
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-12 w-12 border-2 hover:bg-muted shrink-0 text-black border-black"><ChevronLeft className="h-6 w-6" /></Button>
          <div>
            <Badge className="bg-primary text-white border-none font-black uppercase text-[10px] h-6 px-3 shadow-lg">Live Series</Badge>
            <h1 className="text-2xl md:text-4xl font-black uppercase tracking-tight mt-1">{event.title}</h1>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
              <span className="flex items-center gap-1.5"><CalendarDaysIcon className="h-3 w-3 text-primary" /> {format(new Date(event.date), 'MMM d')} - {format(new Date(event.endDate || event.date), 'MMM d, yyyy')}</span>
              <span className="flex items-center gap-1.5"><MapPin className="h-3 w-3 text-primary" /> {event.location || 'Location TBD'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isOrganizer && (
            <>
              <Button variant="outline" className="rounded-xl h-10 px-6 border-2 font-black uppercase text-[10px] bg-white text-black border-black hover:bg-black hover:text-white transition-all shadow-sm" onClick={initGenModal}><Sparkles className="h-4 w-4 mr-2" /> Itinerary</Button>
              <Button variant="outline" className="rounded-xl h-10 px-6 border-2 font-black uppercase text-[10px] bg-white text-black border-black hover:bg-black hover:text-white transition-all shadow-sm" onClick={() => setIsEditOpen(true)}><Edit3 className="h-4 w-4 mr-2" /> Roster</Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="w-full lg:w-1/3 flex flex-col text-white bg-black rounded-[3rem] p-8 lg:p-10 space-y-8">
          <div className="space-y-4"><p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Operational Brief</p><p className="text-sm font-medium text-white/80 leading-relaxed italic">"{event.description || 'Championship coordination itinerary established.'}"</p></div>
          
          <div className="grid grid-cols-1 gap-3">
            <Button variant="outline" className="w-full h-12 rounded-xl bg-white text-black font-black uppercase text-[10px] border-none hover:bg-primary hover:text-white transition-all shadow-xl" onClick={() => downloadICS([{ title: event.title, start: new Date(event.date), end: event.endDate ? new Date(event.endDate) : undefined, location: event.location, description: event.description }], `${event.title.replace(/\s+/g, '_')}.ics`)}>
              <CalendarIcon className="h-4 w-4 mr-2 text-black" /> <span className="text-black">Add to Calendar</span>
            </Button>
            {isOrganizer && (
              <Button variant="outline" className="w-full h-12 rounded-xl bg-white text-black font-black uppercase text-[10px] border-none hover:bg-primary hover:text-white transition-all shadow-xl" onClick={() => exportAttendanceCSV(event.id)}>
                <Download className="h-4 w-4 mr-2 text-black" /> <span className="text-black">Export RSVP Ledger</span>
              </Button>
            )}
          </div>

          <div className="space-y-4 pt-4 border-t border-white/10">
            <div className="flex justify-between items-center"><h4 className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Leaderboard Pulse</h4>{isOrganizer && <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-white/10" onClick={() => exportTournamentStandingsCSV(event.id)}><Download className="h-4 w-4" /></Button>}</div>
            <div className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden">
              {standings.length > 0 ? standings.map((team) => (
                <div key={team.name} className="flex justify-between items-center px-5 py-4 border-b border-white/5 last:border-0">
                  <span className="text-xs font-black uppercase truncate pr-2">{team.name}</span>
                  <Badge className="bg-primary text-white border-none font-black text-[9px] px-2 h-5">{team.points} PTS</Badge>
                </div>
              )) : <div className="p-8 text-center opacity-20 text-[10px] font-black uppercase">No standing data.</div>}
            </div>
          </div>
        </aside>

        <div className="flex-1 min-w-0 bg-white rounded-[3rem] border-2 shadow-sm overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
            <div className="bg-muted/30 p-6 border-b">
              <TabsList className="bg-white/50 h-auto p-1.5 rounded-2xl border w-full flex-wrap gap-1">
                <TabsTrigger value="itinerary" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Matches</TabsTrigger>
                <TabsTrigger value="bracket" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white">Bracket</TabsTrigger>
                <TabsTrigger value="portals" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white">Portals</TabsTrigger>
                <TabsTrigger value="compliance" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Compliance</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex-1 p-8 lg:p-10">
              <TabsContent value="itinerary" className="mt-0 space-y-4">
                {event.tournamentGames?.map((game) => (
                  <Card key={game.id} className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 p-6 flex items-center justify-between group bg-white hover:shadow-md transition-all">
                    <div className="flex items-center gap-6 flex-1">
                      <div className="w-12 h-12 rounded-xl bg-muted/30 flex flex-col items-center justify-center shrink-0 border"><Clock className="h-4 w-4 text-primary" /><span className="text-[8px] font-black uppercase">{game.time}</span></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-4 justify-center">
                          <span className="font-black text-sm uppercase truncate text-right flex-1">{game.team1}</span>
                          <span className="text-xl font-black text-primary">{game.score1}</span>
                          <span className="opacity-20 text-[10px] font-black">VS</span>
                          <span className="text-xl font-black text-primary">{game.score2}</span>
                          <span className="font-black text-sm uppercase truncate flex-1">{game.team2}</span>
                        </div>
                        {game.location && <p className="text-[8px] font-black text-center text-muted-foreground uppercase mt-2 tracking-widest">{game.location}</p>}
                      </div>
                    </div>
                  </Card>
                ))}
                {(!event.tournamentGames || event.tournamentGames.length === 0) && <div className="text-center py-20 opacity-30"><Clock className="h-12 w-12 mx-auto mb-4" /><p className="text-sm font-black uppercase">No matches scheduled.</p></div>}
              </TabsContent>
              <TabsContent value="bracket" className="mt-0"><BracketVisualizer games={event.tournamentGames || []} /></TabsContent>
              <TabsContent value="portals" className="mt-0 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <Card className="rounded-[2.5rem] border-none shadow-xl bg-primary text-white p-8 space-y-4 group cursor-pointer hover:ring-4 hover:ring-primary/20 transition-all" onClick={() => { navigator.clipboard.writeText(`${baseUrl}/tournaments/${event.teamId}/waiver/${event.id}`); toast({ title: "Waiver URL Copied" }); }}>
                    <Badge className="bg-white text-primary border-none font-black text-[8px] h-5 px-2">COMPLIANCE HUB</Badge>
                    <h4 className="text-2xl font-black uppercase tracking-tight">Public Waiver Link</h4>
                    <p className="text-xs text-white/80 font-medium leading-relaxed italic">Unauthenticated link for participating squad representatives to execute agreements.</p>
                    <Button variant="outline" className="w-full h-12 rounded-xl font-black uppercase text-[10px] bg-white/10 border-white/20 text-white hover:bg-white hover:text-primary transition-all">Copy Portal URL <Share2 className="ml-2 h-3 w-3" /></Button>
                  </Card>
                  <Card className="rounded-[2.5rem] border-none shadow-xl bg-black text-white p-8 space-y-4 group cursor-pointer hover:ring-4 hover:ring-primary/20 transition-all" onClick={() => window.open(`${baseUrl}/tournaments/spectator/${event.teamId}/${event.id}`, '_blank')}>
                    <Badge className="bg-primary text-white border-none font-black text-[8px] h-5 px-2">LIVE PORTAL</Badge>
                    <h4 className="text-2xl font-black uppercase tracking-tight">Spectator Portal</h4>
                    <p className="text-xs text-white/60 font-medium leading-relaxed italic">Public link for fans to track real-time standings and championships.</p>
                    <Button variant="outline" className="w-full h-12 rounded-xl font-black uppercase text-[10px] bg-white/10 border-white/20 text-white hover:bg-primary hover:border-transparent transition-all">Open Live View <ExternalLink className="ml-2 h-3 w-3" /></Button>
                  </Card>
                </div>
              </TabsContent>
              <TabsContent value="compliance" className="mt-0">
                <div className="space-y-6">
                  <div className="flex items-center justify-between px-2"><div className="flex items-center gap-3"><FileSignature className="h-5 w-5 text-primary" /><h3 className="text-xl font-black uppercase tracking-tight">Team Agreement Ledger</h3></div></div>
                  <div className="grid grid-cols-1 gap-3">{tournamentTeams.map(t => { const agreement = event.teamAgreements?.[t.name]; return (<Card key={t.id} className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 p-4 bg-white flex items-center justify-between"><div className="flex items-center gap-4"><div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", agreement ? "bg-green-100 text-green-600" : "bg-muted text-muted-foreground/30")}>{agreement ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}</div><span className="font-black text-sm uppercase truncate">{t.name}</span></div>{agreement ? (<div className="text-right"><p className="text-[8px] font-black uppercase text-muted-foreground">Signed by {agreement.captainName}</p><p className="text-[7px] font-bold text-muted-foreground opacity-40">{format(new Date(agreement.signedAt), 'MMM d, h:mm a')}</p></div>) : (<Badge variant="outline" className="text-[7px] font-black uppercase border-muted-foreground/20 text-muted-foreground">Pending Execution</Badge>)}</Card>); })}</div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-5xl p-0 overflow-hidden border-none shadow-2xl bg-white">
          <div className="bg-primary/5 p-8 border-b"><DialogHeader><DialogTitle className="text-3xl font-black uppercase">Tournament Roster Architect</DialogTitle><DialogDescription className="font-bold text-primary uppercase text-[10px] mt-1">Enroll participating squads & manage personnel metadata</DialogDescription></DialogHeader></div>
          <div className="grid grid-cols-1 lg:grid-cols-12 h-[600px]">
            <div className="lg:col-span-8 flex flex-col overflow-hidden">
              <div className="p-6 bg-muted/30 border-b flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Squad Entries ({teamRows.length})</p><Button variant="ghost" size="sm" className="h-8 text-[10px] font-black uppercase text-primary" onClick={addTeamRow}><Plus className="h-3 w-3 mr-1" /> Add Squad</Button></div>
              <ScrollArea className="flex-1 p-6">
                <div className="space-y-4">
                  {teamRows.map((team, idx) => (
                    <div key={team.id} className="grid grid-cols-12 gap-3 items-center animate-in fade-in transition-all">
                      <div className="col-span-1 text-[10px] font-black opacity-20 text-center">{idx + 1}</div>
                      <div className="col-span-4"><Input placeholder="Squad Name" value={team.name} onChange={e => { const n = [...teamRows]; n[idx].name = e.target.value; setTeamRows(n); }} className="h-10 rounded-xl font-bold border-2" /></div>
                      <div className="col-span-3"><Input placeholder="Coach Name" value={team.coach} onChange={e => { const n = [...teamRows]; n[idx].coach = e.target.value; setTeamRows(n); }} className="h-10 rounded-xl font-medium border-2" /></div>
                      <div className="col-span-3"><Input placeholder="Coach Email" type="email" value={team.email} onChange={e => { const n = [...teamRows]; n[idx].email = e.target.value; setTeamRows(n); }} className="h-10 rounded-xl font-medium border-2" /></div>
                      <div className="col-span-1 flex justify-end"><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-40 hover:opacity-100" onClick={() => setTeamRows(teamRows.filter(t => t.id !== team.id))}><X className="h-4 w-4" /></Button></div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <div className="lg:col-span-4 bg-black text-white p-8 space-y-8 border-l border-white/5">
              <div className="bg-primary/10 p-6 rounded-[2rem] border-2 border-dashed border-primary/20 space-y-3">
                <div className="flex items-center gap-2"><Info className="h-4 w-4 text-primary" /><span className="text-[10px] font-black uppercase">Elite Strategy</span></div>
                <p className="text-[10px] font-medium leading-relaxed italic text-white/60">Finalize the roster before generating the itinerary to ensure balanced pairings.</p>
              </div>
            </div>
          </div>
          <div className="p-8 bg-muted/10 border-t"><Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl" onClick={handleUpdateTeams}>Commit Roster Synchronization</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={isGenOpen} onOpenChange={setIsGenOpen}>
        <DialogContent className="rounded-[3rem] sm:max-w-5xl p-0 border-none shadow-2xl overflow-hidden bg-white">
          <div className="h-2 bg-primary w-full" />
          <div className="flex flex-col h-[85vh]">
            <div className="p-8 lg:p-12 space-y-10 overflow-y-auto custom-scrollbar text-foreground flex-1">
              <DialogHeader>
                <DialogTitle className="text-3xl font-black uppercase tracking-tight">Tournament Deployment Wizard</DialogTitle>
                <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest mt-1">Multi-Venue Resource Allocation & Match Distribution</DialogDescription>
              </DialogHeader>

              <div className="flex items-center justify-center gap-4 mb-8">
                {[1, 2, 3, 4].map(step => (
                  <div key={step} className="flex items-center gap-2">
                    <div className={cn("h-8 w-8 rounded-full flex items-center justify-center font-black text-xs transition-all", genStep >= step ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground")}>{step}</div>
                    {step < 4 && <div className={cn("h-1 w-8 rounded-full transition-all", genStep > step ? "bg-primary" : "bg-muted")} />}
                  </div>
                ))}
              </div>

              <div className="min-h-[400px]">
                {genStep === 1 && (
                  <div className="space-y-8 animate-in slide-in-from-right-4">
                    <section className="space-y-6">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Competition Protocol</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {(['round_robin', 'single_elimination', 'double_elimination'] as const).map(type => (
                          <button key={type} onClick={() => setGenConfig({...genConfig, tournamentType: type})} className={cn("p-6 rounded-[2rem] border-2 transition-all text-left space-y-2", genConfig.tournamentType === type ? "border-primary bg-primary/5 shadow-md" : "border-muted hover:border-muted-foreground/20")}>
                            <Badge variant="outline" className="border-primary/20 text-primary font-black uppercase text-[8px] px-2">{type.replace('_', ' ')}</Badge>
                            <p className="text-sm font-black uppercase tracking-widest">{type === 'round_robin' ? 'Pool Play' : 'Knockout'}</p>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase leading-relaxed">{type === 'round_robin' ? 'Every squad plays every other squad.' : 'Winners advance to the championship.'}</p>
                          </button>
                        ))}
                      </div>
                    </section>
                  </div>
                )}

                {genStep === 2 && (
                  <div className="space-y-8 animate-in slide-in-from-right-4">
                    <section className="space-y-6">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Timeline Mapping</h3>
                      <div className="grid grid-cols-1 gap-4">
                        {genConfig.dailyWindows.map((win, idx) => (
                          <div key={win.date} className="bg-muted/30 p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-6 border-2 border-transparent hover:border-primary/10 transition-all">
                            <p className="text-sm font-black uppercase tracking-widest text-foreground min-w-[150px]">{format(new Date(win.date), 'EEEE, MMM d')}</p>
                            <div className="flex items-center gap-8 w-full sm:w-auto">
                              <div className="space-y-2 flex-1 sm:w-32"><Label className="text-[8px] font-black uppercase ml-1 opacity-40">Start Window</Label><Input type="time" value={win.startTime} onChange={e => { const n = [...genConfig.dailyWindows]; n[idx].startTime = e.target.value; setGenConfig({...genConfig, dailyWindows: n}); }} className="h-12 rounded-xl font-bold bg-white" /></div>
                              <div className="space-y-2 flex-1 sm:w-32"><Label className="text-[8px] font-black uppercase ml-1 opacity-40">End Window</Label><Input type="time" value={win.endTime} onChange={e => { const n = [...genConfig.dailyWindows]; n[idx].endTime = e.target.value; setGenConfig({...genConfig, dailyWindows: n}); }} className="h-12 rounded-xl font-bold bg-white" /></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                )}

                {genStep === 3 && (
                  <div className="space-y-8 animate-in slide-in-from-right-4">
                    <section className="space-y-6">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Multi-Venue Allocation</h3>
                      <ScrollArea className="h-[400px] border-2 rounded-[2.5rem] bg-muted/5 p-8 shadow-inner">
                        <div className="space-y-10">
                          {facilities?.map(f => (
                            <div key={f.id} className="space-y-4">
                              <div className="flex items-center gap-3"><Building className="h-5 w-5 text-primary" /><span className="text-sm font-black uppercase tracking-widest">{f.name}</span></div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pl-8">
                                <FacilityFieldLoader facilityId={f.id} selectedFields={genConfig.selectedFields} onToggleField={(name) => {
                                  const fullName = `${f.name}: ${name}`;
                                  setGenConfig(p => ({ ...p, selectedFields: p.selectedFields.includes(fullName) ? p.selectedFields.filter(sf => sf !== fullName) : [...p.selectedFields, fullName] }));
                                }} />
                              </div>
                            </div>
                          ))}
                          <div className="space-y-4 pt-6 border-t border-muted"><Label className="text-[10px] font-black uppercase ml-1">Venue Override</Label><Input placeholder="e.g. Regional Field 4" value={genConfig.manualVenue} onChange={e => setGenConfig({...genConfig, manualVenue: e.target.value})} className="h-14 rounded-2xl border-2 font-bold" /></div>
                        </div>
                      </ScrollArea>
                    </section>
                  </div>
                )}

                {genStep === 4 && (
                  <div className="space-y-8 animate-in slide-in-from-right-4 text-center py-10">
                    <div className="bg-primary/10 w-24 h-24 rounded-[2rem] flex items-center justify-center mx-auto shadow-xl"><Sparkles className="h-12 w-12 text-primary" /></div>
                    <div className="space-y-3 max-w-md mx-auto">
                      <h3 className="text-3xl font-black uppercase tracking-tight">Review Deployment</h3>
                      <p className="text-sm font-medium text-muted-foreground leading-relaxed uppercase tracking-widest">Authorize the {genConfig.tournamentType.replace('_', ' ')} itinerary for {tournamentTeams.length} squads across {genConfig.selectedFields.length || 'manual'} resources.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-8 bg-background border-t flex gap-4 shrink-0">
              {genStep > 1 && <Button variant="outline" className="h-16 px-10 rounded-2xl font-black uppercase text-xs border-2" onClick={() => setGenStep(genStep - 1)}>Previous</Button>}
              {genStep < 4 ? <Button className="flex-1 h-16 rounded-2xl text-lg font-black shadow-xl" onClick={() => setGenStep(genStep + 1)}>Next Protocol Step</Button> : <Button className="flex-1 h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" onClick={handleGenerateItinerary}>Authorize Deployment</Button>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FacilityFieldLoader({ facilityId, selectedFields, onToggleField }: { facilityId: string, selectedFields: string[], onToggleField: (name: string) => void }) {
  const db = useFirestore();
  const q = useMemoFirebase(() => db ? query(collection(db, 'facilities', facilityId, 'fields'), orderBy('name', 'asc')) : null, [db, facilityId]);
  const { data: fields } = useCollection<Field>(q);

  return (
    <>
      {fields?.map(field => (
        <div key={field.id} className={cn("p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between group", selectedFields.some(sf => sf.includes(field.name)) ? "border-primary bg-primary/5 shadow-sm" : "border-muted hover:border-muted-foreground/20")} onClick={() => onToggleField(field.name)}>
          <span className="text-[10px] font-black uppercase tracking-widest truncate">{field.name}</span>
          {selectedFields.some(sf => sf.includes(field.name)) ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <div className="h-4 w-4 rounded-lg border-2 border-muted" />}
        </div>
      ))}
    </>
  );
}

export default function TournamentsPage({ preSelectedTournament, onExit }: { preSelectedTournament?: TeamEvent | null, onExit?: () => void }) {
  const { isStaff, addEvent, activeTeam, activeTeamEvents, db } = useTeam();
  const [isDeployOpen, setIsDeployOpen] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<TeamEvent | null>(preSelectedTournament || null);
  const [newTourney, setNewTourney] = useState({ title: '', date: '', endDate: '', location: '', description: '', selectedWaiverId: '' });
  const [isProcessing, setIsProcessing] = useState(false);

  const tournaments = useMemo(() => activeTeamEvents.filter(e => (e.isTournament || e.eventType === 'tournament')), [activeTeamEvents]);

  const docsQuery = useMemoFirebase(() => (db && activeTeam?.id) ? query(collection(db, 'teams', activeTeam.id, 'documents'), where('isActive', '==', true)) : null, [db, activeTeam?.id]);
  const { data: activeDocs } = useCollection<TeamDocument>(docsQuery);
  const waiverOptions = useMemo(() => activeDocs?.filter(d => d.type === 'waiver' || d.type === 'tournament_waiver') || [], [activeDocs]);

  const handleDeployTournament = async () => {
    if (!newTourney.title || !newTourney.date || !activeTeam) return;
    setIsProcessing(true);
    try {
      const selectedWaiver = waiverOptions.find(w => w.id === newTourney.selectedWaiverId);
      await addEvent({
        title: newTourney.title,
        date: new Date(newTourney.date).toISOString(),
        endDate: newTourney.endDate ? new Date(newTourney.endDate).toISOString() : new Date(newTourney.date).toISOString(),
        location: newTourney.location,
        description: newTourney.description,
        isTournament: true,
        eventType: 'tournament',
        tournamentTeams: [activeTeam.name], 
        tournamentTeamsData: [{ id: `t_${Date.now()}`, name: activeTeam.name, coach: 'Organizer', email: '' }],
        tournamentGames: [],
        startTime: '08:00',
        teamWaiverText: selectedWaiver?.content || ''
      });
      setIsDeployOpen(false);
      setNewTourney({ title: '', date: '', endDate: '', location: '', description: '', selectedWaiverId: '' });
      toast({ title: "Tournament Initialized" });
    } finally { setIsProcessing(false); }
  };

  const handleBack = () => { if (onExit) onExit(); else setSelectedTournament(null); };

  if (selectedTournament) return <TournamentDetailView event={selectedTournament} onBack={handleBack} />;

  return (
    <div className="space-y-12 pb-32 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div className="space-y-2">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[10px] h-7 px-4">Institutional Hub</Badge>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-[0.9]">Tournaments</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[11px] ml-1">Elite Bracket & Operational Command</p>
        </div>
        {isStaff && (
          <Button className="h-16 px-10 rounded-[2rem] text-lg font-black shadow-2xl shadow-primary/20 transition-all active:scale-95" onClick={() => setIsDeployOpen(true)}>
            <Plus className="h-5 w-5 mr-2" /> Deploy Tourney
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8">
        {tournaments.map((tournament) => (
          <Card key={tournament.id} className="rounded-[3rem] border-none shadow-xl hover:shadow-2xl transition-all duration-500 overflow-hidden bg-white group cursor-pointer" onClick={() => setSelectedTournament(tournament)}>
            <div className="flex flex-col md:flex-row items-stretch">
              <div className="w-full md:w-40 bg-black text-white flex flex-col items-center justify-center p-8 border-r group-hover:bg-primary transition-colors">
                <span className="text-[11px] font-black uppercase opacity-60 mb-1">{new Date(tournament.date).toLocaleString('default', { month: 'short' }).toUpperCase()}</span>
                <span className="text-5xl font-black tracking-tighter">{new Date(tournament.date).getDate()}</span>
              </div>
              <div className="flex-1 p-10 flex items-center justify-between">
                <div className="space-y-3">
                  <h3 className="text-4xl font-black uppercase tracking-tight leading-none group-hover:text-primary transition-colors uppercase">{tournament.title}</h3>
                  <p className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> {tournament.location || 'Location TBD'}</p>
                </div>
                <ChevronRight className="h-8 w-8 text-primary opacity-20 group-hover:opacity-100 group-hover:translate-x-2 transition-all" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={isDeployOpen} onOpenChange={setIsDeployOpen}>
        <DialogContent className="rounded-[3rem] sm:max-w-2xl p-0 border-none shadow-2xl overflow-hidden bg-white">
          <div className="h-2 bg-primary w-full" />
          <div className="p-10 space-y-8">
            <DialogHeader><DialogTitle className="text-3xl font-black uppercase">Initialize Series</DialogTitle></DialogHeader>
            <div className="space-y-6">
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Series Title</Label><Input placeholder="e.g. Winter Regionals" value={newTourney.title} onChange={e => setNewTourney({...newTourney, title: e.target.value})} className="h-14 rounded-2xl border-2 font-bold" /></div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Start Date</Label><Input type="date" value={newTourney.date} onChange={e => setNewTourney({...newTourney, date: e.target.value})} className="h-12 border-2" /></div>
                <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">End Date</Label><Input type="date" value={newTourney.endDate} onChange={e => setNewTourney({...newTourney, endDate: e.target.value})} className="h-12 border-2" /></div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase ml-1">Participation Protocol (Waiver)</Label>
                <Select value={newTourney.selectedWaiverId} onValueChange={(v) => setNewTourney({...newTourney, selectedWaiverId: v})}>
                  <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue placeholder="Select waiver..." /></SelectTrigger>
                  <SelectContent className="rounded-xl">{waiverOptions.map(w => <SelectItem key={w.id} value={w.id} className="font-bold">{w.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="pt-4"><Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl" onClick={handleDeployTournament} disabled={isProcessing || !newTourney.title || !newTourney.date}>{isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Deploy Championship Hub"}</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
