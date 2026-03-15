
"use client";

import React, { useState, useMemo, useRef } from 'react';
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
  Calendar as CalendarDaysIcon
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
import { useTeam, TeamEvent, TournamentGame, Member, Facility, Field, TeamDocument } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, where, doc, updateDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { format, isPast, isSameDay, eachDayOfInterval } from 'date-fns';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';
import { generateTournamentSchedule, DailyWindow } from '@/lib/scheduler-utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { downloadICS } from '@/lib/calendar-utils';
import html2canvas from 'html2canvas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function calculateTournamentStandings(teams: string[], games: TournamentGame[]) {
  const standings = teams.reduce((acc, team) => {
    acc[team] = { name: team, wins: 0, losses: 0, ties: 0, points: 0 };
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
  const { members, isStaff, activeTeam, db, exportTournamentStandingsCSV, exportAttendanceCSV, updateRSVP } = useTeam();
  const standings = useMemo(() => calculateTournamentStandings(event.tournamentTeams || [], event.tournamentGames || []), [event.tournamentTeams, event.tournamentGames]);
  const isOrganizer = isStaff && event.teamId === activeTeam?.id;
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isGenOpen, setIsGenOpen] = useState(false);
  const [editForm, setEditForm] = useState({ 
    teams: event.tournamentTeams?.join(', ') || '', 
    invitedEmails: Object.keys(event.invitedTeamEmails || {}).join(', ') 
  });

  const [genConfig, setGenConfig] = useState<{
    dailyWindows: DailyWindow[];
    gameLength: string;
    breakLength: string;
    selectedFacilityId: string;
    selectedFields: string[];
    manualVenue: string;
  }>({
    dailyWindows: [],
    gameLength: '60',
    breakLength: '15',
    selectedFacilityId: '',
    selectedFields: [],
    manualVenue: event.location || ''
  });

  const initGenModal = () => {
    const days = eachDayOfInterval({ start: new Date(event.date), end: new Date(event.endDate || event.date) });
    setGenConfig(p => ({
      ...p,
      dailyWindows: days.map(d => ({
        date: format(d, 'yyyy-MM-dd'),
        startTime: event.startTime || '08:00',
        endTime: '20:00'
      }))
    }));
    setIsGenOpen(true);
  };

  const facilitiesQuery = useMemoFirebase(() => {
    if (!db || !authUser?.uid) return null;
    return query(collection(db, 'facilities'), where('clubId', '==', authUser.uid));
  }, [db, authUser?.uid]);

  const { data: facilities } = useCollection<Facility>(facilitiesQuery);
  
  const fieldsQuery = useMemoFirebase(() => {
    if (!db || !genConfig.selectedFacilityId) return null;
    return query(collection(db, 'facilities', genConfig.selectedFacilityId, 'fields'), orderBy('name', 'asc'));
  }, [db, genConfig.selectedFacilityId]);

  const { data: fields } = useCollection<Field>(fieldsQuery);

  const handleUpdateTeams = async () => {
    if (!db || !event.id) return;
    const teams = editForm.teams.split(',').map(t => t.trim()).filter(t => t);
    const emails = editForm.invitedEmails.split(',').map(e => e.trim()).filter(e => e);
    const invitedMap: Record<string, string> = {};
    emails.forEach((email, i) => { invitedMap[email] = teams[i] || `Team ${i+1}`; });
    await updateDoc(doc(db, 'teams', event.teamId, 'events', event.id), { tournamentTeams: teams, invitedTeamEmails: invitedMap });
    setIsEditOpen(false);
    toast({ title: "Tournament Roster Updated" });
  };

  const handleGenerateItinerary = async () => {
    const finalFields = genConfig.selectedFields.length > 0 ? genConfig.selectedFields : [genConfig.manualVenue || 'TBD'];
    if (!event.tournamentTeams?.length || finalFields.length === 0) {
      toast({ title: "Resource Error", description: "Select teams and fields/venue first.", variant: "destructive" });
      return;
    }
    const schedule = generateTournamentSchedule({
      teams: event.tournamentTeams,
      fields: finalFields,
      startDate: event.date,
      endDate: event.endDate,
      startTime: genConfig.dailyWindows[0]?.startTime || '08:00',
      endTime: genConfig.dailyWindows[0]?.endTime || '20:00',
      gameLength: parseInt(genConfig.gameLength),
      breakLength: parseInt(genConfig.breakLength),
      dailyWindows: genConfig.dailyWindows
    });
    await updateDoc(doc(db, 'teams', event.teamId, 'events', event.id), { tournamentGames: schedule, location: genConfig.manualVenue || facilities?.find(f => f.id === genConfig.selectedFacilityId)?.name });
    setIsGenOpen(false);
    toast({ title: "Itinerary Deployed", description: `Auto-generated ${schedule.length} matches.` });
  };

  const toggleField = (fieldName: string) => {
    setGenConfig(p => ({
      ...p,
      selectedFields: p.selectedFields.includes(fieldName)
        ? p.selectedFields.filter(f => f !== fieldName)
        : [...p.selectedFields, fieldName]
    }));
  };

  const handleAddCalendar = () => {
    downloadICS([{
      title: event.title,
      start: new Date(event.date),
      end: event.endDate ? new Date(event.endDate) : undefined,
      location: event.location,
      description: event.description
    }], `${event.title.replace(/\s+/g, '_')}.ics`);
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
            <Button variant="outline" className="w-full h-12 rounded-xl bg-white text-black font-black uppercase text-[10px] border-none hover:bg-primary hover:text-white transition-all shadow-xl" onClick={handleAddCalendar}>
              <CalendarIcon className="h-4 w-4 mr-2 text-black group-hover:text-white" /> <span className="text-black group-hover:text-white">Add to Calendar</span>
            </Button>
            {isOrganizer && (
              <Button variant="outline" className="w-full h-12 rounded-xl bg-white text-black font-black uppercase text-[10px] border-none hover:bg-primary hover:text-white transition-all shadow-xl" onClick={() => exportAttendanceCSV(event.id)}>
                <Download className="h-4 w-4 mr-2 text-black group-hover:text-white" /> <span className="text-black group-hover:text-white">Export RSVP Ledger</span>
              </Button>
            )}
          </div>

          <div className="space-y-4 pt-4 border-t border-white/10">
            <div className="flex justify-between items-center"><h4 className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Leaderboard Pulse</h4>{isOrganizer && <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-white/10" onClick={() => exportTournamentStandingsCSV(event.id)}><Download className="h-4 w-4" /></Button>}</div>
            <div className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden">{standings.map((team) => (<div key={team.name} className="flex justify-between items-center px-5 py-4 border-b border-white/5 last:border-0"><span className="text-xs font-black uppercase truncate pr-2">{team.name}</span><Badge className="bg-primary text-white border-none font-black text-[9px] px-2 h-5">{team.points} PTS</Badge></div>))}</div>
          </div>
        </aside>

        <div className="flex-1 min-w-0 bg-white rounded-[3rem] border-2 shadow-sm overflow-hidden">
          <Tabs defaultValue="itinerary" className="w-full h-full flex flex-col">
            <div className="bg-muted/30 p-6 border-b">
              <TabsList className="bg-white/50 h-auto p-1.5 rounded-2xl border w-full flex-wrap gap-1">
                <TabsTrigger value="itinerary" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Matches</TabsTrigger>
                <TabsTrigger value="bracket" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white">Bracket</TabsTrigger>
                <TabsTrigger value="portals" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white">Portals</TabsTrigger>
                <TabsTrigger value="compliance" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Legal</TabsTrigger>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card className="rounded-[2rem] border-none shadow-md bg-black text-white p-6 space-y-4 group cursor-pointer hover:ring-2 hover:ring-primary transition-all" onClick={() => window.open(`${baseUrl}/tournaments/spectator/${event.teamId}/${event.id}`, '_blank')}>
                    <Badge className="bg-primary text-white border-none font-black text-[8px] h-5 px-2">LIVE HUB</Badge>
                    <h4 className="text-xl font-black uppercase tracking-tight">Spectator Portal</h4>
                    <p className="text-[10px] text-white/60 font-medium leading-relaxed italic">Public link for fans to track real-time standings and schedules.</p>
                    <Button variant="outline" className="w-full h-10 rounded-xl font-black uppercase text-[10px] bg-white/10 border-white/20 text-white hover:bg-primary hover:border-transparent transition-all">Open Live View <ExternalLink className="ml-2 h-3 w-3" /></Button>
                  </Card>
                  <Card className="rounded-[2rem] border-none shadow-md bg-white border-2 p-6 space-y-4 group cursor-pointer hover:ring-2 hover:ring-black transition-all" onClick={() => window.open(`${baseUrl}/tournaments/scorekeeper/${event.teamId}/${event.id}`, '_blank')}>
                    <Badge className="bg-muted text-muted-foreground border-none font-black text-[8px] h-5 px-2">ADMIN ONLY</Badge>
                    <h4 className="text-xl font-black uppercase tracking-tight">Scorekeeper Portal</h4>
                    <p className="text-[10px] text-muted-foreground font-medium leading-relaxed italic">Mobile entry hub for field marshals to post verified match results.</p>
                    <Button className="w-full h-10 rounded-xl font-black uppercase text-[10px]">Open Scorer Hub <ExternalLink className="ml-2 h-3 w-3" /></Button>
                  </Card>
                </div>
              </TabsContent>
              <TabsContent value="compliance" className="mt-0">
                <div className="space-y-6">
                  <div className="flex items-center justify-between px-2"><div className="flex items-center gap-3"><FileSignature className="h-5 w-5 text-primary" /><h3 className="text-xl font-black uppercase tracking-tight">Team Agreement Ledger</h3></div></div>
                  <div className="grid grid-cols-1 gap-3">{event.tournamentTeams?.map(teamName => { const agreement = event.teamAgreements?.[teamName]; return (<Card key={teamName} className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 p-4 bg-white flex items-center justify-between"><div className="flex items-center gap-4"><div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", agreement ? "bg-green-100 text-green-600" : "bg-muted text-muted-foreground/30")}>{agreement ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}</div><span className="font-black text-sm uppercase truncate">{teamName}</span></div>{agreement ? (<div className="text-right"><p className="text-[8px] font-black uppercase text-muted-foreground">Signed by {agreement.captainName}</p><p className="text-[7px] font-bold text-muted-foreground opacity-40">{format(new Date(agreement.signedAt), 'MMM d, h:mm a')}</p></div>) : (<Badge variant="outline" className="text-[7px] font-black uppercase border-muted-foreground/20 text-muted-foreground">Pending Execution</Badge>)}</Card>); })}</div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-lg p-0 overflow-hidden border-none shadow-2xl">
          <DialogTitle className="sr-only">Roster Management Hub</DialogTitle>
          <div className="bg-primary/5 p-8 border-b">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight">Expand Competition</DialogTitle>
              <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest mt-1">Enroll participating squads</DialogDescription>
            </DialogHeader>
          </div>
          <div className="space-y-6 p-8 overflow-y-auto max-h-[70vh] custom-scrollbar">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Squad Names (Comma separated)</Label>
              <Input value={editForm.teams} onChange={e => setEditForm({ ...editForm, teams: e.target.value })} className="h-12 rounded-xl border-2 font-bold" placeholder="Tigers, Lions, Warriors..." />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Team Email Invites (Optional)</Label>
              <Input value={editForm.invitedEmails} onChange={e => setEditForm({ ...editForm, invitedEmails: e.target.value })} className="h-12 rounded-xl border-2 font-bold" placeholder="coach@tigers.com, coach@lions.com..." />
            </div>
          </div>
          <div className="p-8 bg-muted/10 border-t">
            <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleUpdateTeams}>Synchronize Roster</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isGenOpen} onOpenChange={setIsGenOpen}>
        <DialogContent className="rounded-[3rem] sm:max-w-3xl p-0 border-none shadow-2xl overflow-hidden bg-white text-foreground">
          <DialogTitle className="sr-only">Tournament Itinerary Architect</DialogTitle>
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 lg:p-12 space-y-10 overflow-y-auto max-h-[90vh] custom-scrollbar">
            <DialogHeader>
              <DialogTitle className="text-3xl font-black uppercase tracking-tight leading-none">Itinerary Architect</DialogTitle>
              <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest mt-2">Precision Multi-Day Resource Mapping</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 text-foreground">
              <div className="space-y-8">
                <div className="space-y-6">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Day Distribution</h3>
                  <ScrollArea className="h-[250px] border-2 rounded-2xl p-4 bg-muted/5">
                    <div className="space-y-6">
                      {genConfig.dailyWindows.map((win, idx) => (
                        <div key={win.date} className="space-y-3 pb-4 border-b last:border-0">
                          <p className="text-[9px] font-black uppercase text-muted-foreground">{format(new Date(win.date), 'EEEE, MMM do')}</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[8px] font-black uppercase text-foreground">Start</Label>
                              <Input type="time" value={win.startTime} onChange={e => {
                                const n = [...genConfig.dailyWindows];
                                n[idx].startTime = e.target.value;
                                setGenConfig({...genConfig, dailyWindows: n});
                              }} className="h-9 text-xs text-foreground" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[8px] font-black uppercase text-foreground">End</Label>
                              <Input type="time" value={win.endTime} onChange={e => {
                                const n = [...genConfig.dailyWindows];
                                n[idx].endTime = e.target.value;
                                setGenConfig({...genConfig, dailyWindows: n});
                              }} className="h-9 text-xs text-foreground" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1 text-foreground">Length (Min)</Label><Input type="number" value={genConfig.gameLength} onChange={e => setGenConfig({...genConfig, gameLength: e.target.value})} className="h-12 border-2 rounded-xl text-foreground" /></div>
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1 text-foreground">Break (Min)</Label><Input type="number" value={genConfig.breakLength} onChange={e => setGenConfig({...genConfig, breakLength: e.target.value})} className="h-12 border-2 rounded-xl text-foreground" /></div>
                </div>
              </div>
              <div className="space-y-8">
                <div className="space-y-6">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Facility Allocation</h3>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Host Venue</Label>
                    <select className="w-full h-12 rounded-xl border-2 px-3 font-bold bg-muted/10 outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground" value={genConfig.selectedFacilityId} onChange={e => setGenConfig({...genConfig, selectedFacilityId: e.target.value, selectedFields: []})}>
                      <option value="">Select venue...</option>
                      {facilities?.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Or Manual Venue</Label>
                    <Input placeholder="e.g. Regional Sports Park" value={genConfig.manualVenue} onChange={e => setGenConfig({...genConfig, manualVenue: e.target.value})} className="h-12 rounded-xl border-2 font-bold text-foreground" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Resource Pool</Label>
                    <ScrollArea className="h-40 border-2 rounded-xl p-2 bg-muted/5">
                      <div className="space-y-1 p-1">
                        {fields?.map(f => (
                          <div key={f.id} className={cn("flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all group", genConfig.selectedFields.includes(f.name) ? "bg-primary text-white shadow-md" : "hover:bg-muted/50 text-foreground")} onClick={() => toggleField(f.name)}>
                            <span className="text-[10px] font-black uppercase tracking-widest">{f.name}</span>
                            {genConfig.selectedFields.includes(f.name) ? <CheckCircle2 className="h-4 w-4" /> : <div className="h-4 w-4 rounded-full border border-muted-foreground/30" />}
                          </div>
                        ))}
                        {(!fields || fields.length === 0) && (
                          <div className="flex flex-col items-center justify-center py-12 text-center opacity-30 text-foreground">
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
              <Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" onClick={handleGenerateItinerary} disabled={(genConfig.selectedFields.length === 0 && !genConfig.manualVenue) || !event.tournamentTeams?.length}>
                Deploy Balanced Itinerary
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TournamentsPage({ preSelectedTournament, onExit }: { preSelectedTournament?: TeamEvent | null, onExit?: () => void }) {
  const { isStaff, addEvent, activeTeam, householdEvents, db } = useTeam();
  const [isDeployOpen, setIsDeployOpen] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<TeamEvent | null>(preSelectedTournament || null);
  const [newTourney, setNewTourney] = useState({ title: '', date: '', endDate: '', location: '', description: '', selectedWaiverId: '' });
  const [isProcessing, setIsProcessing] = useState(false);

  const tournaments = useMemo(() => {
    return householdEvents.filter(e => (e.isTournament || e.eventType === 'tournament') && e.teamId === activeTeam?.id);
  }, [householdEvents, activeTeam?.id]);

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
        tournamentGames: [],
        invitedTeamEmails: {},
        startTime: '08:00',
        teamWaiverText: selectedWaiver?.content || ''
      });
      setIsDeployOpen(false);
      setNewTourney({ title: '', date: '', endDate: '', location: '', description: '', selectedWaiverId: '' });
      toast({ title: "Tournament Initialized", description: "Organizer team automatically enrolled." });
    } catch (e) {
      toast({ title: "Deployment Failed", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBack = () => {
    if (onExit) onExit();
    else setSelectedTournament(null);
  };

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
          <Dialog open={isDeployOpen} onOpenChange={setIsDeployOpen}>
            <DialogTrigger asChild>
              <Button className="h-16 px-10 rounded-[2rem] text-lg font-black shadow-2xl shadow-primary/20 transition-all active:scale-95">
                <Plus className="h-5 w-5 mr-2" /> Deploy Tourney
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[3rem] sm:max-w-2xl p-0 border-none shadow-2xl overflow-hidden bg-white text-foreground">
              <DialogTitle className="sr-only">Tournament Deployment wizard</DialogTitle>
              <div className="h-2 bg-primary w-full" />
              <div className="p-8 lg:p-12 space-y-10 overflow-y-auto max-h-[90vh] custom-scrollbar">
                <DialogHeader>
                  <div className="flex items-center gap-4 mb-2">
                    <div className="bg-primary/10 p-3 rounded-2xl text-primary">
                      <Trophy className="h-6 w-6" />
                    </div>
                    <div>
                      <DialogTitle className="text-3xl font-black uppercase tracking-tight">Deploy Tourney</DialogTitle>
                      <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">Initialize a new championship event</DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                <div className="space-y-6">
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Tournament Title</Label><Input placeholder="e.g. Winter Regional Finals" value={newTourney.title} onChange={e => setNewTourney({...newTourney, title: e.target.value})} className="h-14 rounded-2xl font-bold border-2 focus:border-primary/20 transition-all text-foreground" /></div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Series Start Date</Label><Input type="date" value={newTourney.date} onChange={e => setNewTourney({...newTourney, date: e.target.value})} className="h-14 rounded-2xl font-black border-2 focus:border-primary/20 transition-all text-foreground" /></div>
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Series End Date</Label><Input type="date" value={newTourney.endDate} onChange={e => setNewTourney({...newTourney, endDate: e.target.value})} className="h-14 rounded-2xl font-black border-2 focus:border-primary/20 transition-all text-foreground" /></div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Execution Waiver</Label>
                    <Select value={newTourney.selectedWaiverId} onValueChange={(v) => setNewTourney({...newTourney, selectedWaiverId: v})}>
                      <SelectTrigger className="h-12 rounded-xl border-2 font-bold focus:border-primary/20 transition-all text-foreground">
                        <SelectValue placeholder="Select from active protocols..." />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {waiverOptions.map(w => (
                          <SelectItem key={w.id} value={w.id} className="font-bold">{w.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[8px] font-bold text-muted-foreground uppercase px-1">Selected waiver text will be mandatory for participating squads.</p>
                  </div>
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Initial Location</Label><Input placeholder="Official Venue..." value={newTourney.location} onChange={e => setNewTourney({...newTourney, location: e.target.value})} className="h-14 rounded-2xl font-bold border-2 focus:border-primary/20 transition-all text-foreground" /></div>
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Operational Brief</Label><Textarea placeholder="Define rules, coordination notes, and championship structure..." value={newTourney.description} onChange={e => setNewTourney({...newTourney, description: e.target.value})} className="rounded-[1.5rem] min-h-[120px] border-2 font-medium focus:border-primary/20 transition-all p-4 resize-none text-foreground" /></div>
                </div>
                <DialogFooter className="pt-4"><Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all" onClick={handleDeployTournament} disabled={isProcessing || !newTourney.title || !newTourney.date}>{isProcessing ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : "Deploy Tournament"}</Button></DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8">
        {tournaments.map((tournament) => (
          <Card key={tournament.id} className="rounded-[3rem] border-none shadow-xl hover:shadow-2xl transition-all duration-500 overflow-hidden ring-1 ring-black/5 bg-white group cursor-pointer" onClick={() => setSelectedTournament(tournament)}>
            <div className="flex flex-col md:flex-row items-stretch">
              <div className="w-full md:w-40 bg-black text-white flex flex-col items-center justify-center p-8 border-r group-hover:bg-primary transition-colors">
                <span className="text-[11px] font-black uppercase opacity-60 mb-1">{new Date(tournament.date).toLocaleString('default', { month: 'short' }).toUpperCase()}</span>
                <span className="text-5xl font-black tracking-tighter">
                  {new Date(tournament.date).getDate()}
                  {tournament.endDate && new Date(tournament.endDate).getDate() !== new Date(tournament.date).getDate() && ` - ${new Date(tournament.endDate).getDate()}`}
                </span>
              </div>
              <div className="flex-1 p-10 flex items-center justify-between">
                <div className="space-y-3">
                  <h3 className="text-4xl font-black uppercase tracking-tight leading-none group-hover:text-primary transition-colors uppercase">{tournament.title}</h3>
                  <div className="flex items-center gap-6">
                    <p className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> {tournament.location || 'Location TBD'}</p>
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">
                      {format(new Date(tournament.date), 'MMM d')} - {format(new Date(tournament.endDate || tournament.date), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-8 w-8 text-primary opacity-20 group-hover:opacity-100 group-hover:translate-x-2 transition-all" />
              </div>
            </div>
          </Card>
        ))}
        {tournaments.length === 0 && <div className="text-center py-24 border-2 border-dashed rounded-[3rem] bg-muted/10 opacity-40"><Trophy className="h-16 w-16 mx-auto mb-4" /><p className="text-sm font-black uppercase tracking-widest">No active championship series.</p></div>}
      </div>
    </div>
  );
}
