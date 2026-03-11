
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  MapPin, 
  Clock, 
  Plus, 
  ChevronRight, 
  CheckCircle2, 
  Trash2, 
  CalendarDays, 
  Lock, 
  Sparkles, 
  Loader2, 
  ShieldCheck, 
  Zap, 
  X, 
  FileText, 
  Globe, 
  Calendar as CalendarIcon, 
  Terminal, 
  Download, 
  Signature,
  Users,
  Copy,
  Share2,
  ExternalLink,
  Eye,
  Shield,
  ClipboardList,
  ArrowRight,
  Target,
  Check,
  XCircle,
  HelpCircle
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
import { Checkbox } from '@/components/ui/checkbox';
import { useTeam, TeamEvent, TournamentGame, EventType, Facility, Field, Member } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useDoc, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, doc, where } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { format, isSameDay, isPast, addMinutes, addDays, parse } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';

const EVENT_TYPE_COLORS: Record<EventType, string> = {
  game: 'bg-primary border-primary text-white',
  practice: 'bg-emerald-600 border-emerald-600 text-white',
  meeting: 'bg-amber-500 border-amber-500 text-white',
  tournament: 'bg-black border-black text-white',
  other: 'bg-slate-600 border-slate-600 text-white',
};

const normalizeTime = (t: string) => {
  if (!t || t === 'TBD') return '12:00';
  if (t.toUpperCase().includes('M')) {
    const parts = t.trim().split(/\s+/);
    const timePart = parts[0];
    const period = parts[1]?.toUpperCase() || (t.toUpperCase().includes('PM') ? 'PM' : 'AM');
    let [hStr, mStr] = timePart.split(':');
    let h = parseInt(hStr);
    let m = parseInt(mStr) || 0;
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }
  return t.includes(':') ? t : '12:00';
};

function calculateTournamentStandings(teams: string[], games: TournamentGame[]) {
  const standings = teams.reduce((acc, team) => {
    acc[team] = { name: team, wins: 0, losses: 0, ties: 0, points: 0 };
    return acc;
  }, {} as Record<string, any>);
  
  games.forEach(game => {
    if (!game.isCompleted) return;
    const t1 = game.team1; const t2 = game.team2;
    if (!standings[t1] || !standings[t2]) return;
    
    if (game.score1 > game.score2) { 
      standings[t1].wins += 1; 
      standings[t1].points += 1; 
      standings[t2].losses += 1; 
      standings[t2].points -= 1; 
    }
    else if (game.score2 > game.score1) { 
      standings[t2].wins += 1; 
      standings[t2].points += 1; 
      standings[t1].losses += 1; 
      standings[t1].points -= 1; 
    }
    else { 
      standings[t1].ties += 1; 
      standings[t2].ties += 1; 
    }
  });
  return Object.values(standings).sort((a, b) => b.points - a.points || b.wins - a.wins);
}

const formatDateRange = (start: string | Date, end?: string | Date) => {
  const startDate = new Date(start);
  if (!end) return format(startDate, 'MMM dd');
  const endDate = new Date(end);
  if (isSameDay(startDate, endDate)) return format(startDate, 'MMM dd');
  if (startDate.getMonth() === endDate.getMonth()) return `${format(startDate, 'MMM d')}-${format(endDate, 'd')}`;
  return `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d')}`;
};

interface EventDetailDialogProps {
  event: TeamEvent;
  updateRSVP: (id: string, status: string, gameId?: string) => void;
  formatTime: (date: string | Date) => string;
  isAdmin: boolean;
  onEdit: (event: TeamEvent) => void;
  onDelete: (eventId: string) => void;
  children: React.ReactNode;
}

function EventDetailDialog({ event, updateRSVP, isAdmin, onEdit, onDelete, children }: EventDetailDialogProps) {
  const { user, updateEvent, signTeamTournamentWaiver, isPro, activeTeam, hasFeature, members } = useTeam();
  const db = useFirestore();
  const [editingGame, setEditingGame] = useState<TournamentGame | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genStartTime, setGenStartTime] = useState('09:00');
  const [genMatchLength, setGenMatchLength] = useState('60');
  const [genBreakLength, setGenBreakLength] = useState('15');
  const [genFieldCount, setGenFieldCount] = useState('2');
  const [isEditingWaiver, setIsEditingWaiver] = useState(false);
  const [tempWaiver, setTempWaiver] = useState(event.teamWaiverText || '');
  const [baseUrl, setBaseUrl] = useState('');

  // Manual Match State
  const [manualMatch, setManualMatch] = useState({ team1: '', team2: '', date: format(new Date(event.date), 'yyyy-MM-dd'), time: '12:00', location: '' });

  useEffect(() => {
    if (typeof window !== 'undefined') setBaseUrl(window.location.origin);
  }, []);

  const facilityRef = useMemoFirebase(() => (db && event.facilityId) ? doc(db, 'facilities', event.facilityId) : null, [db, event.facilityId]);
  const { data: facility } = useDoc<Facility>(facilityRef);

  const isEliteUnlocked = isPro || hasFeature('tournament_elite');
  const myParticipatingTeamName = useMemo(() => {
    if (!event.tournamentTeams || !activeTeam) return null;
    return event.tournamentTeams.find(tn => tn.toLowerCase() === activeTeam.name.toLowerCase());
  }, [activeTeam, event.tournamentTeams]);

  const tournamentStandings = useMemo(() => (event.isTournament && event.tournamentTeams) ? calculateTournamentStandings(event.tournamentTeams, event.tournamentGames || []) : [], [event]);
  
  const groupedGames = useMemo(() => {
    if (!event.tournamentGames) return {};
    const groups: Record<string, TournamentGame[]> = {};
    [...event.tournamentGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(game => {
      const key = game.location || format(new Date(game.date), 'EEEE, MMM d');
      if (!groups[key]) groups[key] = [];
      groups[key].push(game);
    });
    return groups;
  }, [event.tournamentGames]);

  const handleGenerateSchedule = async () => {
    if (!event.tournamentTeams || event.tournamentTeams.length < 2) return;
    setIsGenerating(true);
    await new Promise(r => setTimeout(r, 1000));
    try {
      const games: TournamentGame[] = [];
      const teams = [...event.tournamentTeams];
      const fieldCount = parseInt(genFieldCount) || 1;
      const matchMinutes = parseInt(genMatchLength);
      const breakMinutes = parseInt(genBreakLength);
      const pairings: [string, string][] = [];
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) pairings.push([teams[i], teams[j]]);
      }
      let currentDay = new Date(event.date);
      let fieldTimes = Array(fieldCount).fill(genStartTime);
      pairings.forEach((pair, idx) => {
        const fieldIdx = idx % fieldCount;
        const startTimeStr = fieldTimes[fieldIdx];
        const displayTime = format(parse(startTimeStr, 'HH:mm', new Date()), 'h:mm a');
        games.push({ id: `gen_${Date.now()}_${idx}`, team1: pair[0], team2: pair[1], score1: 0, score2: 0, date: currentDay.toISOString().split('T')[0], time: displayTime, location: `Field ${fieldIdx + 1}`, isCompleted: false });
        const [h, m] = startTimeStr.split(':').map(Number);
        const next = addMinutes(new Date(2000, 0, 1, h, m), matchMinutes + breakMinutes);
        fieldTimes[fieldIdx] = format(next, 'HH:mm');
        if (parseInt(fieldTimes[fieldIdx].split(':')[0]) > 21) { fieldTimes = Array(fieldCount).fill(genStartTime); currentDay = addDays(currentDay, 1); }
      });
      await updateEvent(event.id, { tournamentGames: games });
      toast({ title: "Itinerary Generated" });
    } finally { setIsGenerating(false); }
  };

  const handleAddManualMatch = async () => {
    if (!manualMatch.team1 || !manualMatch.team2 || !manualMatch.date || !manualMatch.time) return;
    const newGame: TournamentGame = {
      id: `manual_${Date.now()}`,
      team1: manualMatch.team1,
      team2: manualMatch.team2,
      score1: 0,
      score2: 0,
      date: manualMatch.date,
      time: format(parse(manualMatch.time, 'HH:mm', new Date()), 'h:mm a'),
      location: manualMatch.location || 'Main Field',
      isCompleted: false
    };
    const updatedGames = [...(event.tournamentGames || []), newGame];
    await updateEvent(event.id, { tournamentGames: updatedGames });
    setManualMatch({ team1: '', team2: '', date: format(new Date(event.date), 'yyyy-MM-dd'), time: '12:00', location: '' });
    toast({ title: "Match Added" });
  };

  const handleSaveWaiver = async () => {
    await updateEvent(event.id, { teamWaiverText: tempWaiver });
    setIsEditingWaiver(false);
    toast({ title: "Protocol Updated" });
  };

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        toast({ title: "Link Synchronized" });
      } else { throw new Error("Blocked"); }
    } catch (err) { toast({ title: "Copy Failed", variant: "destructive" }); }
  };

  const myRsvp = event.userRsvps?.[user?.id || ''];

  const attendanceGroups = useMemo(() => {
    const going: Member[] = [];
    const maybe: Member[] = [];
    const declined: Member[] = [];
    const pending: Member[] = [];

    members.forEach(m => {
      const rsvp = event.userRsvps?.[m.userId];
      if (rsvp === 'going') going.push(m);
      else if (rsvp === 'maybe') maybe.push(m);
      else if (rsvp === 'declined') declined.push(m);
      else pending.push(m);
    });

    return { going, maybe, declined, pending };
  }, [members, event.userRsvps]);

  return (
    <Dialog onOpenChange={(open) => { if(!open) setEditingGame(null); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-7xl p-0 sm:rounded-[2.5rem] h-[100dvh] sm:h-[90vh] border-none shadow-2xl overflow-hidden flex flex-col">
        <DialogTitle className="sr-only">{event.title} Hub</DialogTitle>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col lg:flex-row min-h-full">
            <div className="w-full lg:w-1/3 flex flex-col text-white bg-black lg:border-r border-white/10 shrink-0 p-8">
              <div className="flex justify-between items-start mb-8">
                <Badge className="uppercase font-black tracking-widest text-[9px] h-6 px-3 bg-primary text-white border-none">{event.isTournament ? "Tournament Hub" : (event.eventType || 'other').toUpperCase()}</Badge>
                <DialogClose asChild><X className="h-5 w-5 text-white/40 cursor-pointer hover:text-white" /></DialogClose>
              </div>
              <div className="space-y-8">
                <div className="space-y-4">
                  <h2 className="text-3xl font-black tracking-tighter leading-tight uppercase">{event.title}</h2>
                  <div className="bg-white/10 p-4 rounded-2xl border border-white/10 space-y-3 font-bold text-sm">
                    <div className="flex items-center gap-3"><CalendarDays className="h-4 w-4 text-primary" />{formatDateRange(event.date, event.endDate)}</div>
                    <div className="flex items-center gap-3"><Clock className="h-4 w-4 text-primary" />{event.startTime} {event.endTime && ` - ${event.endTime}`}</div>
                    <div className="flex items-center gap-3"><MapPin className="h-4 w-4 text-primary" /><span className="truncate">{facility?.name || event.location}</span></div>
                  </div>
                </div>

                {!event.isTournament && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-500">
                    <h4 className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Deployment RSVP</h4>
                    <div className="grid grid-cols-1 gap-2">
                      <Button 
                        variant={myRsvp === 'going' ? 'default' : 'outline'} 
                        className={cn("h-12 rounded-xl font-black text-xs uppercase transition-all", myRsvp === 'going' ? "bg-primary border-none shadow-lg shadow-primary/20" : "bg-white/5 border-white/10 text-white")}
                        onClick={() => updateRSVP(event.id, 'going')}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" /> I'm Going
                      </Button>
                      <div className="grid grid-cols-2 gap-2">
                        <Button 
                          variant={myRsvp === 'maybe' ? 'default' : 'outline'} 
                          className={cn("h-12 rounded-xl font-black text-xs uppercase", myRsvp === 'maybe' ? "bg-amber-500 border-none" : "bg-white/5 border-white/10 text-white")}
                          onClick={() => updateRSVP(event.id, 'maybe')}
                        >
                          Maybe
                        </Button>
                        <Button 
                          variant={myRsvp === 'declined' ? 'default' : 'outline'} 
                          className={cn("h-12 rounded-xl font-black text-xs uppercase", myRsvp === 'declined' ? "bg-red-600 border-none" : "bg-white/5 border-white/10 text-white")}
                          onClick={() => updateRSVP(event.id, 'declined')}
                        >
                          Decline
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {event.isTournament && (
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Leaderboard</h4>
                    {isEliteUnlocked ? (
                      <div className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden">
                        {tournamentStandings.map((team) => (
                          <div key={team.name} className="flex justify-between items-center px-5 py-4 border-b border-white/5 last:border-0">
                            <span className="text-xs font-black uppercase truncate pr-2">{team.name}</span>
                            <Badge className={cn("text-white border-none font-black text-[9px] px-2 h-5", team.points >= 0 ? "bg-primary" : "bg-destructive")}>{team.points} PTS</Badge>
                          </div>
                        ))}
                      </div>
                    ) : <div className="p-8 text-center bg-primary/10 rounded-3xl border-2 border-dashed border-primary/40"><Lock className="h-8 w-8 mx-auto text-primary opacity-40 mb-2" /><p className="text-[10px] font-black uppercase tracking-widest text-primary">Elite Mode Required</p></div>}
                  </div>
                )}
              </div>
              {isAdmin && <div className="mt-auto pt-8 flex gap-3"><Button variant="secondary" className="flex-1 rounded-xl h-12 font-black uppercase text-[10px]" onClick={() => onEdit(event)}>Edit Hub</Button></div>}
            </div>
            <div className="flex-1 flex flex-col bg-background">
              <Tabs defaultValue={event.isTournament ? "bracket" : "roster"} className="flex-1">
                <div className="px-6 py-6 border-b bg-muted/30 sticky top-0 z-20 backdrop-blur-md">
                  <TabsList className="bg-white/50 h-14 p-1.5 rounded-2xl shadow-inner border w-full lg:w-fit overflow-x-auto scrollbar-none">
                    {event.isTournament && <TabsTrigger value="bracket" className="rounded-xl font-black text-xs uppercase px-8 data-[state=active]:bg-black data-[state=active]:text-white">Schedule</TabsTrigger>}
                    <TabsTrigger value="roster" className="rounded-xl font-black text-xs uppercase px-8 data-[state=active]:bg-black data-[state=active]:text-white">Attendance</TabsTrigger>
                    {event.isTournament && <TabsTrigger value="compliance" className="rounded-xl font-black text-xs uppercase px-8 data-[state=active]:bg-black data-[state=active]:text-white">Compliance</TabsTrigger>}
                    {event.isTournament && isAdmin && <TabsTrigger value="portals" className="rounded-xl font-black text-xs uppercase px-8 data-[state=active]:bg-primary data-[state=active]:text-white">Portals</TabsTrigger>}
                    {isAdmin && event.isTournament && <TabsTrigger value="manage" className="rounded-xl font-black text-xs uppercase px-8 data-[state=active]:bg-primary data-[state=active]:text-white">Manage</TabsTrigger>}
                  </TabsList>
                </div>
                <div className="p-10">
                  <TabsContent value="bracket" className="mt-0 space-y-10">
                    {Object.entries(groupedGames).map(([groupTitle, games]) => (
                      <div key={groupTitle} className="space-y-6">
                        <Badge className="bg-primary text-white font-black uppercase text-[10px] px-4 h-7">{groupTitle}</Badge>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {games.map((game) => (
                            <button key={game.id} onClick={() => isAdmin && setEditingGame(game)} className="w-full p-5 bg-white rounded-3xl border shadow-sm transition-all text-left relative overflow-hidden group ring-1 ring-black/5 active:scale-95">
                              <div className="flex justify-between items-center mb-4"><Badge variant="outline" className="text-[8px] font-black uppercase">{game.time}</Badge>{game.isCompleted && <Badge className="text-[8px] font-black uppercase h-5 px-2 bg-black text-white border-none">Final</Badge>}</div>
                              <div className="grid grid-cols-7 items-center gap-4 text-center">
                                <div className="col-span-3"><p className="font-black text-xs uppercase truncate">{game.team1}</p><p className="text-3xl font-black">{game.score1}</p></div>
                                <div className="col-span-1 opacity-20 font-black text-[10px]">VS</div>
                                <div className="col-span-3"><p className="font-black text-xs uppercase truncate">{game.team2}</p><p className="text-3xl font-black">{game.score2}</p></div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </TabsContent>
                  <TabsContent value="compliance" className="mt-0 space-y-8">
                    {isAdmin ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                        <div className="space-y-6">
                          <div className="flex items-center justify-between"><div className="flex items-center gap-3"><FileText className="h-5 w-5 text-primary" /><h3 className="text-xl font-black uppercase tracking-tight">Tournament Protocol</h3></div><Button variant="ghost" size="sm" onClick={() => setIsEditingWaiver(true)} className="text-[10px] font-black uppercase">Edit Terms</Button></div>
                          {isEditingWaiver ? (
                            <div className="space-y-4"><Textarea value={tempWaiver} onChange={e => setTempWaiver(e.target.value)} className="min-h-[250px] border-2 rounded-2xl p-6 font-medium" /><div className="flex gap-2"><Button className="flex-1 rounded-xl h-12 font-black" onClick={handleSaveWaiver}>Commit Terms</Button><Button variant="outline" className="rounded-xl h-12 font-black" onClick={() => setIsEditingWaiver(false)}>Cancel</Button></div></div>
                          ) : (
                            <div className="p-6 bg-muted/30 rounded-[2rem] border-2 border-dashed"><p className="text-sm font-medium italic text-muted-foreground whitespace-pre-wrap">{event.teamWaiverText || 'Standard participation protocol.'}</p></div>
                          )}
                        </div>
                        <div className="space-y-6">
                          <div className="flex items-center justify-between"><h3 className="text-xl font-black uppercase tracking-tight">Audit Trail</h3><Button variant="outline" size="sm" className="h-9 rounded-xl border-2 font-black uppercase text-[10px]">Export Ledger</Button></div>
                          <div className="space-y-3">{(event.tournamentTeams || []).map(team => { const signed = event.teamAgreements?.[team]?.agreed; return ( <div key={team} className="flex items-center justify-between p-4 bg-white border rounded-2xl shadow-sm"><span className="text-sm font-black uppercase">{team}</span>{signed ? <Badge className="bg-green-100 text-green-700 h-5 px-2">VERIFIED</Badge> : <Badge variant="outline" className="h-5 px-2">PENDING</Badge>}</div> ); })}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-2xl mx-auto space-y-8">
                        <div className="p-8 bg-muted/30 border-2 border-dashed rounded-[2.5rem]"><p className="text-base font-bold italic leading-relaxed text-center">"{event.teamWaiverText || 'Official Agreement Required.'}"</p></div>
                        {myParticipatingTeamName && !event.teamAgreements?.[myParticipatingTeamName]?.agreed && (
                          <Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl" onClick={() => signTeamTournamentWaiver(event.teamId, event.id, myParticipatingTeamName)}><Signature className="h-6 w-6 mr-3" /> Sign Legally for {myParticipatingTeamName}</Button>
                        )}
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="roster" className="mt-0 space-y-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 px-1 text-primary"><CheckCircle2 className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-widest">Going ({attendanceGroups.going.length})</span></div>
                        <div className="space-y-2">
                          {attendanceGroups.going.map(m => (
                            <div key={m.id} className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-2xl">
                              <Avatar className="h-8 w-8 rounded-lg border shadow-sm"><AvatarImage src={m.avatar} /><AvatarFallback className="font-black text-[10px]">{m.name[0]}</AvatarFallback></Avatar>
                              <span className="text-xs font-black uppercase truncate">{m.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 px-1 text-amber-600"><HelpCircle className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-widest">Maybe ({attendanceGroups.maybe.length})</span></div>
                        <div className="space-y-2">
                          {attendanceGroups.maybe.map(m => (
                            <div key={m.id} className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-100 rounded-2xl">
                              <Avatar className="h-8 w-8 rounded-lg border shadow-sm"><AvatarImage src={m.avatar} /><AvatarFallback className="font-black text-[10px]">{m.name[0]}</AvatarFallback></Avatar>
                              <span className="text-xs font-black uppercase truncate">{m.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 px-1 text-red-600"><XCircle className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-widest">Declined ({attendanceGroups.declined.length})</span></div>
                        <div className="space-y-2">
                          {attendanceGroups.declined.map(m => (
                            <div key={m.id} className="flex items-center gap-3 p-3 bg-red-50 border border-red-100 rounded-2xl">
                              <Avatar className="h-8 w-8 rounded-lg border shadow-sm"><AvatarImage src={m.avatar} /><AvatarFallback className="font-black text-[10px]">{m.name[0]}</AvatarFallback></Avatar>
                              <span className="text-xs font-black uppercase truncate">{m.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 px-1 text-muted-foreground"><Clock className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-widest">Pending ({attendanceGroups.pending.length})</span></div>
                        <div className="space-y-2">
                          {attendanceGroups.pending.map(m => (
                            <div key={m.id} className="flex items-center gap-3 p-3 bg-muted/30 border rounded-2xl opacity-60 grayscale-[0.5]">
                              <Avatar className="h-8 w-8 rounded-lg border shadow-sm"><AvatarImage src={m.avatar} /><AvatarFallback className="font-black text-[10px]">{m.name[0]}</AvatarFallback></Avatar>
                              <span className="text-xs font-black uppercase truncate">{m.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="portals" className="mt-0 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Card className="rounded-[2rem] border-none shadow-md ring-1 ring-black/5 bg-white overflow-hidden group">
                        <CardHeader className="bg-primary/5 p-6 border-b"><div className="flex items-center gap-3"><Eye className="h-5 w-5 text-primary" /><CardTitle className="text-sm font-black uppercase">Spectator Hub</CardTitle></div></CardHeader>
                        <CardContent className="p-6 space-y-4">
                          <p className="text-xs font-medium text-muted-foreground italic">Public link for parents and fans to follow live scores and standings.</p>
                          <div className="flex gap-2"><Input readOnly value={`${baseUrl}/tournaments/spectator/${event.teamId}/${event.id}`} className="h-10 text-[10px] font-mono bg-muted/30 border-none" /><Button size="icon" variant="secondary" className="h-10 w-10 shrink-0 rounded-xl" onClick={() => copyToClipboard(`${baseUrl}/tournaments/spectator/${event.teamId}/${event.id}`)}><Copy className="h-4 w-4" /></Button></div>
                        </CardContent>
                      </Card>
                      <Card className="rounded-[2rem] border-none shadow-md ring-1 ring-black/5 bg-white overflow-hidden group">
                        <CardHeader className="bg-black text-white p-6 border-b"><div className="flex items-center gap-3"><Terminal className="h-5 w-5 text-primary" /><CardTitle className="text-sm font-black uppercase">Scorekeeper Portal</CardTitle></div></CardHeader>
                        <CardContent className="p-6 space-y-4">
                          <p className="text-xs font-medium text-muted-foreground italic">Share this with field marshals to log scores without a login.</p>
                          <div className="flex gap-2"><Input readOnly value={`${baseUrl}/tournaments/scorekeeper/${event.teamId}/${event.id}`} className="h-10 text-[10px] font-mono bg-muted/30 border-none" /><Button size="icon" variant="secondary" className="h-10 w-10 shrink-0 rounded-xl" onClick={() => copyToClipboard(`${baseUrl}/tournaments/scorekeeper/${event.teamId}/${event.id}`)}><Copy className="h-4 w-4" /></Button></div>
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>
                  <TabsContent value="manage" className="mt-0 space-y-10">
                    <div className="bg-primary/5 p-8 rounded-[2.5rem] border-2 border-dashed border-primary/20 space-y-8">
                      <div className="flex items-center gap-4"><div className="bg-white p-3 rounded-2xl shadow-sm text-primary"><Zap className="h-6 w-6" /></div><h3 className="text-xl font-black uppercase tracking-tight">Auto-Scheduler</h3></div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase ml-1">Field Count</Label><Input type="number" value={genFieldCount} onChange={e => setGenFieldCount(e.target.value)} className="h-12 rounded-xl border-2 bg-white" /></div>
                        <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase ml-1">Start Time</Label><Input type="time" value={genStartTime} onChange={e => setGenStartTime(e.target.value)} className="h-12 rounded-xl border-2 bg-white" /></div>
                        <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase ml-1">Match (Min)</Label><Input type="number" value={genMatchLength} onChange={e => setGenMatchLength(e.target.value)} className="h-12 rounded-xl border-2 bg-white" /></div>
                        <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase ml-1">Break (Min)</Label><Input type="number" value={genBreakLength} onChange={e => setGenBreakLength(e.target.value)} className="h-12 rounded-xl border-2 bg-white" /></div>
                        <Button className="col-span-full h-16 rounded-2xl text-lg font-black shadow-xl" onClick={handleGenerateSchedule} disabled={isGenerating}>{isGenerating ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : "Deploy Itinerary"}</Button>
                      </div>
                    </div>

                    <div className="bg-black/5 p-8 rounded-[2.5rem] border-2 border-dashed border-black/10 space-y-8">
                      <div className="flex items-center gap-4"><div className="bg-white p-3 rounded-2xl shadow-sm text-black"><Target className="h-6 w-6" /></div><h3 className="text-xl font-black uppercase tracking-tight">Manual Match Entry</h3></div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase ml-1">Squad A</Label><Input value={manualMatch.team1} onChange={e => setManualMatch({...manualMatch, team1: e.target.value})} className="h-12 rounded-xl border-2 bg-white" /></div>
                        <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase ml-1">Squad B</Label><Input value={manualMatch.team2} onChange={e => setManualMatch({...manualMatch, team2: e.target.value})} className="h-12 rounded-xl border-2 bg-white" /></div>
                        <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase ml-1">Date</Label><Input type="date" value={manualMatch.date} onChange={e => setManualMatch({...manualMatch, date: e.target.value})} className="h-12 rounded-xl border-2 bg-white" /></div>
                        <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase ml-1">Time</Label><Input type="time" value={manualMatch.time} onChange={e => setManualMatch({...manualMatch, time: e.target.value})} className="h-12 rounded-xl border-2 bg-white" /></div>
                        <div className="space-y-1.5 lg:col-span-2"><Label className="text-[9px] font-black uppercase ml-1">Location Label</Label><Input value={manualMatch.location} onChange={e => setManualMatch({...manualMatch, location: e.target.value})} className="h-12 rounded-xl border-2 bg-white" /></div>
                        <Button className="col-span-full h-16 rounded-2xl text-lg font-black shadow-xl" onClick={handleAddManualMatch} disabled={!manualMatch.team1 || !manualMatch.team2}>Establish Matchup</Button>
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        </div>
        <Dialog open={!!editingGame} onOpenChange={(open) => !open && setEditingGame(null)}>
          <DialogContent className="sm:max-w-md rounded-3xl border-none shadow-2xl overflow-hidden p-0">
            <div className="h-2 bg-primary w-full" />
            <div className="p-8 space-y-6">
              <DialogHeader><DialogTitle className="text-2xl font-black uppercase tracking-tight">Ledger Entry</DialogTitle></DialogHeader>
              {editingGame && (
                <div className="space-y-6 py-2">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase truncate">{editingGame.team1}</Label><Input type="number" value={editingGame.score1} onChange={e => setEditingGame({...editingGame, score1: parseInt(e.target.value) || 0})} className="h-12 rounded-xl font-black text-xl text-center" /></div>
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase truncate">{editingGame.team2}</Label><Input type="number" value={editingGame.score2} onChange={e => setEditingGame({...editingGame, score2: parseInt(e.target.value) || 0})} className="h-12 rounded-xl font-black text-xl text-center" /></div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border"><p className="text-[10px] font-black uppercase">Mark Final</p><Checkbox checked={editingGame.isCompleted} onCheckedChange={v => setEditingGame({...editingGame, isCompleted: !!v})} className="h-6 w-6 rounded-lg border-2" /></div>
                </div>
              )}
              <DialogFooter>
                <div className="flex flex-col w-full gap-3">
                  <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={async () => { const updatedGames = (event.tournamentGames || []).map(g => g.id === editingGame?.id ? editingGame : g); await updateEvent(event.id, { tournamentGames: updatedGames }); setEditingGame(null); }}>Commit Results</Button>
                  <Button variant="ghost" className="w-full text-destructive text-[10px] font-black uppercase" onClick={async () => { const updatedGames = (event.tournamentGames || []).filter(g => g.id !== editingGame?.id); await updateEvent(event.id, { tournamentGames: updatedGames }); setEditingGame(null); }}>Delete Matchup</Button>
                </div>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

export default function EventsPage() {
  const { activeTeam, addEvent, updateEvent, deleteEvent, updateRSVP, formatTime, isSuperAdmin, isStaff, user, hasFeature, isPro } = useTeam();
  const db = useFirestore();
  const router = useRouter();
  const [filterMode, setFilterMode] = useState<'live' | 'past'>('live');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTournamentMode, setIsTournamentMode] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TeamEvent | null>(null);
  
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newEndTime, setNewEndTime] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newFacilityId, setNewFacilityId] = useState<string>('manual');
  const [newFieldId, setNewFieldId] = useState<string>('manual');
  const [newDescription, setNewDescription] = useState('');
  const [eventType, setEventType] = useState<EventType>('game');

  const eventsQuery = useMemoFirebase(() => { 
    if (!activeTeam?.id || !db) return null; 
    return query(collection(db, 'teams', activeTeam.id, 'events'), orderBy('date', 'asc')); 
  }, [activeTeam?.id, db]);

  const { data: allEvents } = useCollection<TeamEvent>(eventsQuery);

  const facilitiesQuery = useMemoFirebase(() => (db && user?.id) ? query(collection(db, 'facilities'), where('clubId', '==', user.id)) : null, [db, user?.id]);
  const { data: facilities } = useCollection<Facility>(facilitiesQuery);

  const fieldsQuery = useMemoFirebase(() => (db && newFacilityId !== 'manual') ? query(collection(db, 'facilities', newFacilityId, 'fields'), orderBy('name', 'asc')) : null, [db, newFacilityId]);
  const { data: fields } = useCollection<Field>(fieldsQuery);

  const filteredEvents = useMemo(() => { 
    const now = new Date(); 
    const list = allEvents || []; 
    if (filterMode === 'live') return list.filter(e => !isPast(new Date(e.date)) || isSameDay(new Date(e.date), now)); 
    return list.filter(e => isPast(new Date(e.date)) && !isSameDay(new Date(e.date), now)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); 
  }, [allEvents, filterMode]);

  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;

  const handleEdit = (event: TeamEvent) => { 
    setEditingEvent(event); 
    setIsTournamentMode(!!event.isTournament); 
    setNewTitle(event.title); 
    setEventType(event.eventType || 'game'); 
    setNewDate(format(new Date(event.date), 'yyyy-MM-dd')); 
    setNewTime(event.startTime); 
    setNewEndTime(event.endTime || ''); 
    setNewLocation(event.location); 
    setNewFacilityId(event.facilityId || 'manual'); 
    setNewFieldId(event.fieldId || 'manual'); 
    setNewDescription(event.description); 
    setIsCreateOpen(true); 
  };

  const handleCreateEvent = async () => { 
    if (!newTitle || !newDate || !newTime) { toast({ title: "Incomplete Data", variant: "destructive" }); return; }
    const timeISO = normalizeTime(newTime);
    try {
      const [year, month, day] = newDate.split('-').map(Number);
      const [hour, minute] = timeISO.split(':').map(Number);
      const eventDate = new Date(year, month - 1, day, hour, minute);
      
      const payload: any = { 
        title: newTitle, 
        eventType: isTournamentMode ? 'tournament' : eventType, 
        date: eventDate.toISOString(), 
        startTime: newTime, 
        endTime: newEndTime || 'TBD', 
        location: newLocation, 
        facilityId: newFacilityId === 'manual' ? null : newFacilityId, 
        fieldId: newFieldId === 'manual' ? null : newFieldId, 
        description: newDescription, 
        isTournament: isTournamentMode, 
        lastUpdated: new Date().toISOString() 
      }; 
      const success = editingEvent ? await updateEvent(editingEvent.id, payload) : await addEvent(payload); 
      if (success) { setIsCreateOpen(false); setEditingEvent(null); }
    } catch (e) { toast({ title: "Itinerary Error", variant: "destructive" }); }
  };

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1"><Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">Squad Itinerary</Badge><h1 className="text-4xl font-black uppercase tracking-tight">Schedule Hub</h1></div>
        {isStaff && ( <div className="flex gap-2"><Button size="sm" className="rounded-full h-11 px-6 font-black uppercase text-xs" onClick={() => { setIsTournamentMode(false); setIsCreateOpen(true); }}>+ New Activity</Button><Button size="sm" className="rounded-full h-11 px-6 font-black uppercase text-xs bg-black text-white" onClick={() => { setIsTournamentMode(true); setIsCreateOpen(true); }}>+ Tournament</Button></div> )}
      </div>
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-5xl p-0 sm:rounded-[2.5rem] h-[100dvh] sm:h-[90vh] border-none shadow-2xl overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col lg:flex-row min-h-full">
              <div className="w-full lg:w-5/12 bg-muted/30 p-10 space-y-8 lg:border-r shrink-0">
                <DialogHeader><DialogTitle className="text-3xl font-black uppercase">{editingEvent ? "Update" : "Launch"} Event</DialogTitle></DialogHeader>
                <div className="space-y-6">
                  {!isTournamentMode && ( 
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Activity Type</Label>
                      <Select value={eventType} onValueChange={(v: EventType) => setEventType(v)}>
                        <SelectTrigger className="h-12 rounded-xl font-black border-2 bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-xl"><SelectItem value="game">Match Day</SelectItem><SelectItem value="practice">Training</SelectItem><SelectItem value="meeting">Tactical Meeting</SelectItem><SelectItem value="other">Event</SelectItem></SelectContent>
                      </Select>
                    </div> 
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Title *</Label>
                    <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="h-12 rounded-xl font-bold border-2" />
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Start Date *</Label>
                      <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="h-12 rounded-xl border-2 font-black" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Time Block</Label>
                      <div className="flex flex-col gap-3">
                        <div className="space-y-1">
                          <p className="text-[8px] font-bold uppercase opacity-40 ml-1">Start</p>
                          <Input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="h-12 rounded-xl border-2 font-black" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[8px] font-bold uppercase opacity-40 ml-1">End (Optional)</p>
                          <Input type="time" value={newEndTime} onChange={e => setNewEndTime(e.target.value)} className="h-12 rounded-xl border-2 font-black" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1 p-10 space-y-8 bg-background">
                <div className="bg-primary/5 p-6 rounded-2xl border-2 border-dashed space-y-4">
                  <Label className="text-[10px] font-black uppercase tracking-widest">Venue Selection</Label>
                  <div className="grid gap-3">
                    <Select value={newFacilityId} onValueChange={(val) => { setNewFacilityId(val); if(val !== 'manual') setNewLocation(facilities?.find(f => f.id === val)?.address || ''); }}>
                      <SelectTrigger className="h-11 rounded-xl border-2 font-bold bg-white"><SelectValue placeholder="Select Facility" /></SelectTrigger>
                      <SelectContent className="rounded-xl"><SelectItem value="manual">Manual Entry</SelectItem>{facilities?.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                    </Select>
                    {newFacilityId !== 'manual' && ( 
                      <Select value={newFieldId} onValueChange={setNewFieldId}>
                        <SelectTrigger className="h-11 rounded-xl border-2 font-bold bg-white"><SelectValue placeholder="Field/Court" /></SelectTrigger>
                        <SelectContent className="rounded-xl"><SelectItem value="manual">General</SelectItem>{fields?.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                      </Select> 
                    )}
                    <Input placeholder="Location Label" value={newLocation} onChange={e => setNewLocation(e.target.value)} className="h-11 rounded-xl font-bold border-2 bg-white" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase ml-1">Brief</Label>
                  <Textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} className="rounded-xl min-h-[120px] border-2 font-medium" />
                </div>
              </div>
            </div>
          </div>
          <div className="p-8 bg-background border-t shrink-0 flex justify-center"><Button className="w-full max-w-4xl h-16 rounded-2xl text-lg font-black shadow-xl" onClick={handleCreateEvent}>Commit Event</Button></div>
        </DialogContent>
      </Dialog>
      <section className="space-y-4"><div className="flex items-center justify-between px-2"><h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Itinerary</h2><div className="flex bg-muted/50 p-1 rounded-xl border"><Button variant={filterMode === 'live' ? 'default' : 'ghost'} size="sm" onClick={() => setFilterMode('live')} className="h-8 rounded-lg font-black text-[10px] uppercase">Live</Button><Button variant={filterMode === 'past' ? 'default' : 'ghost'} size="sm" onClick={() => setFilterMode('past')} className="h-8 rounded-lg font-black text-[10px] uppercase">History</Button></div></div><div className="grid gap-4">{filteredEvents.map((event) => ( <EventDetailDialog key={event.id} event={event} updateRSVP={updateRSVP} formatTime={formatTime} isAdmin={isAdmin} onEdit={handleEdit} onDelete={deleteEvent}><Card className="hover:border-primary/30 transition-all duration-500 cursor-pointer group rounded-3xl border-none shadow-md ring-1 ring-black/5 overflow-hidden bg-white"><div className="flex items-stretch h-32"><div className={cn("w-20 lg:w-24 flex flex-col items-center justify-center border-r-2 shrink-0", event.isTournament ? "bg-black text-white" : EVENT_TYPE_COLORS[event.eventType || 'other'])}><span className="text-[8px] font-black uppercase opacity-60">{format(new Date(event.date), 'MMM')}</span><span className="text-3xl lg:text-4xl font-black">{format(new Date(event.date), 'dd')}</span></div><div className="flex-1 p-6 flex flex-col justify-center min-w-0"><div className="flex items-start justify-between"><div><div className="flex gap-2 mb-1.5"><Badge className="text-[7px] uppercase">{event.isTournament ? 'Tournament' : (event.eventType || 'Activity')}</Badge><Badge variant="outline" className="text-[7px] uppercase">{event.startTime}</Badge></div><h3 className="text-xl font-black tracking-tight leading-none truncate">{event.title}</h3><p className="text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1 mt-1"><MapPin className="h-3 w-3" /> {event.location}</p></div><ChevronRight className="h-5 w-5 text-primary opacity-20 group-hover:opacity-100 transition-all mt-2" /></div></div></div></Card></EventDetailDialog> ))}</div></section>
    </div>
  );
}
