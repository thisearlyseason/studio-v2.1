
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  MapPin, 
  Clock, 
  Plus, 
  ChevronRight, 
  Info, 
  CheckCircle2, 
  Users, 
  Link as LinkIcon, 
  Trash2, 
  Edit3, 
  Copy,
  Trophy,
  CalendarDays,
  Lock,
  Sparkles,
  ChevronLeft,
  Loader2,
  CalendarPlus,
  ShieldCheck,
  Share2,
  Check,
  Zap,
  X,
  ShieldAlert,
  Signature,
  Wand2,
  Timer,
  FileText,
  ExternalLink,
  Globe,
  Settings,
  LayoutGrid
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useTeam, TeamEvent, TournamentGame } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format, isSameDay, isPast, addMinutes, addDays, parse } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouter } from 'next/navigation';
import { generateGoogleCalendarLink, downloadICS } from '@/lib/calendar-utils';
import { Switch } from '@/components/ui/switch';

interface EventDetailDialogProps {
  event: TeamEvent;
  updateRSVP: (id: string, status: string) => void;
  formatTime: (date: string | Date) => string;
  isAdmin: boolean;
  onEdit: (event: TeamEvent) => void;
  onDelete: (eventId: string) => void;
  hasAttendance: boolean;
  purchasePro: () => void;
  children: React.ReactNode;
}

const formatDateRange = (start: string | Date, end?: string | Date) => {
  const startDate = new Date(start);
  if (!end) return format(startDate, 'MMM dd');
  const endDate = new Date(end);
  if (isSameDay(startDate, endDate)) return format(startDate, 'MMM dd');
  if (startDate.getMonth() === endDate.getMonth()) return `${format(startDate, 'MMM d')}-${format(endDate, 'd')}`;
  return `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d')}`;
};

function calculateTournamentStandings(teams: string[], games: TournamentGame[]) {
  const standings = teams.reduce((acc, team) => {
    acc[team] = { name: team, wins: 0, losses: 0, ties: 0, points: 0 };
    return acc;
  }, {} as Record<string, any>);
  games.forEach(game => {
    if (!game.isCompleted) return;
    const t1 = game.team1; const t2 = game.team2;
    if (!standings[t1]) standings[t1] = { name: t1, wins: 0, losses: 0, ties: 0, points: 0 };
    if (!standings[t2]) standings[t2] = { name: t2, wins: 0, losses: 0, ties: 0, points: 0 };
    if (game.score1 > game.score2) { standings[t1].wins += 1; standings[t1].points += 1; standings[t2].losses += 1; standings[t2].points -= 1; }
    else if (game.score2 > game.score1) { standings[t2].wins += 1; standings[t2].points += 1; standings[t1].losses += 1; standings[t1].points -= 1; }
    else { standings[t1].ties += 1; standings[t2].ties += 1; }
  });
  return Object.values(standings).sort((a, b) => b.points - a.points || b.wins - a.wins);
}

function EventDetailDialog({ event, updateRSVP, isAdmin, onEdit, onDelete, hasAttendance, purchasePro, children }: EventDetailDialogProps) {
  const { members = [], teams = [], user, updateEvent, signTeamTournamentWaiver, submitEventWaiver, isPro, addCoOrganizerByEmail, removeCoOrganizer, isStaff, isPlayer, isParent } = useTeam();
  const db = useFirestore();
  const router = useRouter();
  const [editingGame, setEditingGame] = useState<TournamentGame | null>(null);
  const [isWaiverDialogOpen, setIsWaiverDialogOpen] = useState(false);
  const [isTeamAgreementOpen, setIsTeamAgreementOpen] = useState(false);
  const [isGenConfirmOpen, setIsGenConfirmOpen] = useState(false);
  const [coOrganizerEmail, setCoOrganizerEmail] = useState('');
  const [origin, setOrigin] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamCoach, setNewTeamCoach] = useState('');
  const [newTeamEmail, setNewTeamEmail] = useState('');
  const [genStartTime, setGenStartTime] = useState('09:00');
  const [genMatchLength, setGenMatchLength] = useState('60');
  const [genType, setGenType] = useState('round_robin');
  const [genPoolCount, setGenPoolCount] = useState('2');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const regQuery = useMemoFirebase(() => {
    if (!db || !event?.id || !event?.teamId) return null;
    return query(collection(db, 'teams', event.teamId, 'events', event.id, 'registrations'), orderBy('createdAt', 'desc'));
  }, [db, event?.id, event?.teamId]);
  const { data: rawRegistrations } = useCollection<any>(regQuery);
  const registrations = rawRegistrations || [];

  const isEliteUnlocked = !!event.isTournamentPaid;
  
  const myParticipatingTeamName = useMemo(() => {
    if (!event.tournamentTeams) return null;
    const myAdminTeamNamesLower = teams.filter(t => t.role === 'Admin').map(t => t.name.toLowerCase());
    return event.tournamentTeams.find(tn => myAdminTeamNamesLower.includes(tn.toLowerCase()));
  }, [teams, event.tournamentTeams]);

  const isWaiverSignedForMyTeam = myParticipatingTeamName ? !!event.teamAgreements?.[myParticipatingTeamName]?.agreed : false;
  const hasUserSignedIndividualWaiver = !!event.specialWaiverResponses?.[user?.id || '']?.agreed;

  const attendanceData = useMemo(() => {
    const rsvpMap = event.userRsvps || {};
    const rsvpIds = Object.keys(rsvpMap);

    const internal = Object.entries(rsvpMap).map(([uid, status]) => {
      const member = members.find(m => m.userId === uid);
      return { id: uid, name: member?.name || 'Unknown Member', avatar: member?.avatar, role: member?.position || 'Member', status };
    });

    const staffIdsToAutoInclude = members
      .filter(m => ['Coach', 'Assistant Coach', 'Team Lead', 'Squad Leader', 'Platform Admin'].includes(m.position))
      .filter(m => !rsvpIds.includes(m.userId))
      .map(m => m.userId);
    
    const autoStaff = staffIdsToAutoInclude.map(uid => {
      const member = members.find(m => m.userId === uid);
      return { id: uid, name: member?.name || 'Staff', avatar: member?.avatar, role: member?.position || 'Staff', status: 'going' };
    });

    const external = registrations.map(reg => ({ id: reg.id, name: reg.name, avatar: undefined, role: 'Public Registrant', status: 'going' }));
    return [...internal, ...autoStaff, ...external];
  }, [event.userRsvps, members, registrations]);

  const goingList = attendanceData.filter(a => a.status === 'going');
  const tournamentStandings = useMemo(() => (event.isTournament && event.tournamentTeams) ? calculateTournamentStandings(event.tournamentTeams, event.tournamentGames || []) : [], [event]);
  
  const groupedGames = useMemo(() => {
    if (!event.tournamentGames) return {};
    const groups: Record<string, TournamentGame[]> = {};
    [...event.tournamentGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(game => {
      const key = game.pool ? `Pool ${game.pool}` : format(new Date(game.date), 'EEEE, MMM d');
      if (!groups[key]) groups[key] = [];
      groups[key].push(game);
    });
    return groups;
  }, [event.tournamentGames]);

  const currentStatus = event.userRsvps?.[user?.id || ''];
  const isUserStaff = members.find(m => m.userId === user?.id && ['Coach', 'Team Lead', 'Assistant Coach', 'Squad Leader', 'Manager', 'Platform Admin'].includes(m.position)) || event.coOrganizers?.some(c => c.id === user?.id);

  const parseFlexibleTime = (dateStr: string, timeStr: string) => {
    const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const formats = ['yyyy-MM-dd h:mm a', 'yyyy-MM-dd HH:mm', 'yyyy-MM-dd h:mmA'];
    for (const f of formats) {
      const d = parse(`${cleanDate} ${timeStr}`, f, new Date());
      if (!isNaN(d.getTime())) return d;
    }
    return new Date(cleanDate);
  };

  const handleGenerateSchedule = async () => {
    if (!event.tournamentTeams || event.tournamentTeams.length < 2) return;
    setIsGenerating(true);
    await new Promise(r => setTimeout(r, 800));
    try {
      const games: TournamentGame[] = [];
      const teams = [...event.tournamentTeams];
      if (genType === 'round_robin') {
        if (teams.length % 2 !== 0) teams.push("BYE");
        const numTeams = teams.length; const rounds = numTeams - 1; const half = numTeams / 2;
        let currentDay = new Date(event.date || new Date()); let currentTime = genStartTime;
        for (let round = 0; round < rounds; round++) {
          for (let i = 0; i < half; i++) {
            const t1 = teams[i]; const t2 = teams[numTeams - 1 - i];
            if (t1 !== "BYE" && t2 !== "BYE") {
              const displayTime = format(parse(currentTime, 'HH:mm', new Date()), 'h:mm a');
              games.push({ id: `gen_${Date.now()}_${round}_${i}`, team1: t1, team2: t2, score1: 0, score2: 0, date: currentDay.toISOString().split('T')[0], time: displayTime, isCompleted: false, round: round + 1 });
              const [h, m] = currentTime.split(':').map(Number);
              const next = addMinutes(new Date(2000, 0, 1, h, m), parseInt(genMatchLength) + 15);
              currentTime = format(next, 'HH:mm');
              if (parseInt(currentTime.split(':')[0]) > 20) { currentDay = addDays(currentDay, 1); currentTime = genStartTime; }
            }
          }
          teams.splice(1, 0, teams.pop()!);
        }
      } else if (genType === 'pool_play') {
        const numPools = parseInt(genPoolCount); let currentDay = new Date(event.date || new Date());
        for (let p = 0; p < numPools; p++) {
          const poolTeams = teams.filter((_, idx) => idx % numPools === p);
          const poolChar = String.fromCharCode(65 + p); let poolTime = genStartTime;
          for (let i = 0; i < poolTeams.length; i++) {
            for (let j = i + 1; j < poolTeams.length; j++) {
              const displayTime = format(parse(poolTime, 'HH:mm', new Date()), 'h:mm a');
              games.push({ id: `gen_p${poolChar}_${Date.now()}_${i}_${j}`, team1: poolTeams[i], team2: poolTeams[j], score1: 0, score2: 0, date: currentDay.toISOString().split('T')[0], time: displayTime, isCompleted: false, pool: poolChar });
              const [h, m] = poolTime.split(':').map(Number);
              const next = addMinutes(new Date(2000, 0, 1, h, m), parseInt(genMatchLength) + 10);
              poolTime = format(next, 'HH:mm');
            }
          }
        }
      }
      await updateEvent(event.id, { tournamentGames: games });
      toast({ title: "Elite Schedule Forged" });
    } finally { setIsGenerating(false); }
  };

  const handleAddGuestSquad = async () => {
    const tName = newTeamName.trim();
    if (!tName || event.tournamentTeams?.includes(tName)) return;
    const updatedTeams = [...(event.tournamentTeams || []), tName];
    const updatedMetadata = { ...(event.tournamentTeamsMetadata || {}), [tName]: { coach: newTeamCoach.trim(), email: newTeamEmail.trim() } };
    await updateEvent(event.id, { tournamentTeams: updatedTeams, tournamentTeamsMetadata: updatedMetadata });
    setNewTeamName(''); setNewTeamCoach(''); setNewTeamEmail('');
    toast({ title: "Squad Enrolled" });
  };

  const syncTournamentSchedule = () => {
    if (!event.tournamentGames || !myParticipatingTeamName) return;
    const myGames = event.tournamentGames.filter(g => g.team1 === myParticipatingTeamName || g.team2 === myParticipatingTeamName);
    if (myGames.length === 0) { toast({ title: "No Matches Found", variant: "destructive" }); return; }
    const calendarEvents = myGames.map(g => ({ title: `${g.team1} vs ${g.team2}`, start: parseFlexibleTime(g.date, g.time), location: g.location || event.location, description: `Match for ${event.title}` }));
    downloadICS(calendarEvents, `${event.title.replace(/\s+/g, '_')}_Schedule.ics`);
    toast({ title: "Schedule Exported" });
  };

  const onGenerateClick = () => {
    if (event.tournamentGames && event.tournamentGames.length > 0) {
      setIsGenConfirmOpen(true);
    } else {
      handleGenerateSchedule();
    }
  };

  const publicWaiverLink = origin ? `${origin}/tournaments/${event.teamId}/waiver/${event.id}` : '';

  return (
    <Dialog onOpenChange={(open) => { if(!open) setEditingGame(null); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-7xl p-0 sm:rounded-[2.5rem] h-[100dvh] sm:h-[90vh] border-none shadow-2xl overflow-hidden flex flex-col">
        <DialogTitle className="sr-only">{event.title} Hub</DialogTitle>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col lg:flex-row min-h-full">
            <div className="w-full lg:w-1/3 flex flex-col text-white bg-black lg:border-r border-white/10 shrink-0">
              <div className="p-6 lg:p-8 flex justify-between items-start">
                <Badge className={cn("uppercase font-black tracking-widest text-[9px] h-6 px-3", event.isTournamentPaid ? "bg-primary text-white border-none" : "bg-white text-black border-none")}>
                  {event.isTournament ? (event.isTournamentPaid ? "Elite Hub" : "Tournament Hub") : "Team Match"}
                </Badge>
                <DialogClose asChild><X className="h-5 w-5 text-white/40 cursor-pointer hover:text-white" /></DialogClose>
              </div>
              <div className="flex-1 px-6 lg:px-8 space-y-8 pb-10">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h2 className="text-2xl lg:text-4xl font-black tracking-tighter leading-tight uppercase">{event.title}</h2>
                    <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em]">Official Coordination Hub</p>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-white/10 p-4 rounded-2xl border border-white/10 space-y-3">
                      <div className="flex items-center gap-3 font-bold text-sm"><CalendarDays className={cn("h-4 w-4", event.isTournamentPaid ? "text-primary" : "text-white/40")} /><span>{formatDateRange(event.date, event.endDate)}</span></div>
                      <div className="flex items-center gap-3 font-bold text-sm"><Clock className={cn("h-4 w-4", event.isTournamentPaid ? "text-primary" : "text-white/40")} /><span>{event.startTime}</span></div>
                      <div className="flex items-center gap-3 font-bold text-sm"><MapPin className={cn("h-4 w-4", event.isTournamentPaid ? "text-primary" : "text-white/40")} /><span className="truncate">{event.location}</span></div>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="outline" className="w-full rounded-xl h-12 font-black text-xs uppercase gap-3 border-white/20 bg-white/10 text-white hover:bg-white/20"><CalendarPlus className="h-4 w-4" /> Sync Hub</Button></DropdownMenuTrigger>
                        <DropdownMenuContent className="w-56 rounded-xl">
                          <DropdownMenuLabel className="text-[10px] font-black uppercase">Calendar Sync</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {event.isTournament ? (<DropdownMenuItem className="font-bold py-3 cursor-pointer" onClick={syncTournamentSchedule}>Download Full iCal</DropdownMenuItem>) : (
                            <><DropdownMenuItem className="font-bold py-3 cursor-pointer" onClick={() => window.open(generateGoogleCalendarLink({ title: event.title, start: new Date(event.date), location: event.location, description: event.description }), '_blank')}>Google Calendar</DropdownMenuItem>
                            <DropdownMenuItem className="font-bold py-3 cursor-pointer" onClick={() => downloadICS([{ title: event.title, start: new Date(event.date), location: event.location, description: event.description }], `${event.title}.ics`)}>iCal / Outlook</DropdownMenuItem></>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {event.requiresSpecialWaiver && !hasUserSignedIndividualWaiver && (<Button onClick={() => setIsWaiverDialogOpen(true)} className="w-full rounded-xl h-14 font-black text-sm uppercase gap-3 bg-red-600 text-white shadow-xl">Sign Required Waiver</Button>)}
                    {myParticipatingTeamName && !isWaiverSignedForMyTeam && (<Button onClick={() => setIsTeamAgreementOpen(true)} className={cn("w-full rounded-xl h-14 font-black text-sm uppercase gap-3 text-white shadow-xl", event.isTournamentPaid ? "bg-primary" : "bg-white text-black")}>Sign for {myParticipatingTeamName}</Button>)}
                  </div>
                </div>
                {event.isTournament && (
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em] px-1">Leaderboard</h4>
                    {isEliteUnlocked ? (
                      tournamentStandings.length > 0 ? (
                        <div className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden">
                          {tournamentStandings.map((team, i) => (
                            <div key={team.name} className="flex justify-between items-center px-5 py-4 border-b border-white/5 last:border-0">
                              <div className="flex items-center gap-3 min-w-0"><span className="text-[10px] font-black text-white/60 w-4">{i + 1}</span><span className="text-xs font-black uppercase truncate pr-2">{team.name}</span></div>
                              <Badge className={cn("border-none font-black text-[9px] px-2 h-5 shrink-0", event.isTournamentPaid ? "bg-primary text-white" : "bg-white text-black")}>{team.points} PTS</Badge>
                            </div>
                          ))}
                        </div>
                      ) : (<div className="p-8 text-center bg-white/5 rounded-3xl border border-dashed border-white/10"><p className="text-[10px] font-black uppercase text-white/40">No match data synced</p></div>)
                    ) : (isStaff ? (<div className="p-8 text-center bg-primary/10 rounded-3xl border border-dashed border-primary/40 space-y-4"><Lock className="h-8 w-8 text-primary mx-auto opacity-40" /><p className="text-[10px] font-black uppercase tracking-widest text-primary">Elite Standings Locked</p><Button variant="secondary" size="sm" className="h-8 rounded-lg text-[8px] font-black uppercase w-full bg-primary text-white" onClick={() => router.push('/pricing')}>Get Elite Module</Button></div>) : null)}
                  </div>
                )}
              </div>
              {isAdmin && (<div className="p-6 border-t border-white/10 flex gap-3 mt-auto"><Button variant="secondary" className="flex-1 rounded-xl h-12 font-black uppercase text-[10px] bg-white/10 text-white hover:bg-white/20" onClick={() => onEdit(event)}><Edit3 className="h-4 w-4 mr-2" /> Edit Hub</Button><Button variant="ghost" size="icon" className="h-12 w-12 rounded-xl text-white hover:bg-red-500/20" onClick={() => onDelete(event.id)}><Trash2 className="h-4 w-4" /></Button></div>)}
            </div>
            <div className="flex-1 flex flex-col bg-background">
              <Tabs defaultValue={event.isTournament ? "bracket" : "roster"} className="flex-1">
                <div className="px-6 lg:px-10 py-6 border-b bg-muted/30 sticky top-0 z-20 backdrop-blur-md">
                  <TabsList className="bg-white/50 h-14 p-1.5 rounded-2xl shadow-inner border w-full lg:w-fit">
                    {event.isTournament && (<TabsTrigger value="bracket" className="rounded-xl font-black text-[10px] lg:text-xs uppercase px-4 lg:px-8 flex-1 lg:flex-none data-[state=active]:bg-black data-[state=active]:text-white">Schedule</TabsTrigger>)}
                    <TabsTrigger value="roster" className="rounded-xl font-black text-[10px] lg:text-xs uppercase px-4 lg:px-8 flex-1 lg:flex-none data-[state=active]:bg-black data-[state=active]:text-white">Roster</TabsTrigger>
                    {isAdmin && (<TabsTrigger value="manage" className="rounded-xl font-black text-[10px] lg:text-xs uppercase px-4 lg:px-8 flex-1 lg:flex-none data-[state=active]:bg-primary data-[state=active]:text-white">Manage Hub</TabsTrigger>)}
                    {isStaff && <TabsTrigger value="compliance" className="rounded-xl font-black text-[10px] lg:text-xs uppercase px-4 lg:px-8 flex-1 lg:flex-none data-[state=active]:bg-black data-[state=active]:text-white">Compliance</TabsTrigger>}
                  </TabsList>
                </div>
                <div className="p-6 lg:p-10 pb-32">
                  <TabsContent value="bracket" className="mt-0 space-y-10">
                    {Object.entries(groupedGames).map(([groupTitle, games]) => (
                      <div key={groupTitle} className="space-y-6">
                        <div className="flex items-center gap-4 px-2"><Badge className="bg-black text-white font-black uppercase text-[10px] px-4 h-7 shadow-lg border-none">{groupTitle}</Badge><div className="h-px bg-muted flex-1" /></div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {games.map((game) => (
                            <button key={game.id} onClick={() => isAdmin && setEditingGame(game)} className="w-full p-5 bg-white rounded-3xl border shadow-sm transition-all text-left relative overflow-hidden group ring-1 ring-black/5 active:scale-95">
                              <div className="flex justify-between items-center mb-4">
                                <Badge variant="outline" className="text-[8px] font-black uppercase border-black/10 tracking-widest px-2 h-5">{game.time}</Badge>
                                {game.location && <Badge variant="outline" className="text-[8px] font-black uppercase border-primary/20 text-primary h-5 ml-2"><MapPin className="h-2 w-2 mr-1" /> {game.location}</Badge>}
                                {game.isCompleted && <Badge className="text-[8px] font-black uppercase h-5 px-2 bg-black text-white border-none">Final</Badge>}
                              </div>
                              <div className="grid grid-cols-7 items-center gap-4">
                                <div className="col-span-3 text-right"><p className="font-black text-xs uppercase truncate mb-1">{game.team1}</p><p className={cn("text-3xl font-black leading-none", event.isTournamentPaid ? "text-primary" : "text-foreground")}>{game.score1}</p></div>
                                <div className="col-span-1 flex items-center justify-center opacity-20 font-black text-[10px]">VS</div>
                                <div className="col-span-3"><p className="font-black text-xs uppercase truncate mb-1">{game.team2}</p><p className={cn("text-3xl font-black leading-none", event.isTournamentPaid ? "text-primary" : "text-foreground")}>{game.score2}</p></div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </TabsContent>
                  
                  <TabsContent value="roster" className="mt-0 space-y-10">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {goingList.map(person => (
                        <div key={person.id} className="flex items-center gap-4 p-4 bg-white rounded-2xl border shadow-sm">
                          <Avatar className="h-12 w-12 rounded-xl border-2 border-background shadow-sm"><AvatarImage src={person.avatar} /><AvatarFallback className="font-black bg-muted text-xs">{person.name[0]}</AvatarFallback></Avatar>
                          <div className="min-w-0 flex-1"><p className="font-black text-sm uppercase truncate leading-none mb-1">{person.name}</p><p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{person.role}</p></div>
                          <div className="bg-green-500 h-2 w-2 rounded-full" />
                        </div>
                      ))}
                    </div>
                    {event.coOrganizers?.length ? (
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary px-1">Tactical Co-Organizers</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {event.coOrganizers.map(co => (
                            <div key={co.id} className="flex items-center gap-4 p-4 bg-primary/5 rounded-2xl border border-primary/10 shadow-sm">
                              <Avatar className="h-10 w-10 rounded-xl border-2 border-background"><AvatarImage src={co.avatar} /><AvatarFallback className="font-black text-xs">{co.name[0]}</AvatarFallback></Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="font-black text-sm uppercase truncate leading-none mb-1">{co.name}</p>
                                <Badge className="bg-primary text-white text-[7px] font-black uppercase px-1.5 h-4 border-none">Organizer</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </TabsContent>

                  {isStaff && (
                    <>
                      <TabsContent value="manage" className="mt-0 space-y-12 animate-in fade-in slide-in-from-bottom-4">
                        <div className="space-y-10">
                          <div className="bg-primary/5 p-8 rounded-[2.5rem] border-2 border-dashed border-primary/20 space-y-8">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className="bg-white p-3 rounded-2xl shadow-sm text-primary"><Users className="h-6 w-6" /></div>
                                <div><h3 className="text-xl font-black uppercase tracking-tight">Coordination Staff</h3><p className="text-[10px] font-bold text-primary uppercase tracking-widest">Enroll additional organizers</p></div>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              <div className="space-y-4">
                                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Enroll via Email</Label>
                                <div className="flex gap-2">
                                  <Input placeholder="organizer@thesquad.pro" value={coOrganizerEmail} onChange={e => setCoOrganizerEmail(e.target.value)} className="rounded-xl h-12 border-2 bg-white" />
                                  <Button onClick={() => { addCoOrganizerByEmail(event.id, coOrganizerEmail); setCoOrganizerEmail(''); }} className="h-12 px-6 font-black uppercase text-xs">Enroll</Button>
                                </div>
                                <p className="text-[8px] font-bold text-muted-foreground uppercase leading-relaxed italic ml-1">Enter email of an existing squad member to grant admin access to this specific hub.</p>
                              </div>
                              <div className="space-y-3">
                                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Current Hub Staff</Label>
                                <div className="space-y-2">
                                  {event.coOrganizers?.map(co => (
                                    <div key={co.id} className="flex items-center justify-between p-3 bg-white rounded-xl border shadow-sm group">
                                      <div className="flex items-center gap-3"><Avatar className="h-8 w-8 rounded-lg"><AvatarImage src={co.avatar} /><AvatarFallback className="text-[10px] font-black">{co.name[0]}</AvatarFallback></Avatar><span className="text-xs font-bold uppercase truncate">{co.name}</span></div>
                                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100" onClick={() => removeCoOrganizer(event.id, co.id)}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                  ))}
                                  {(!event.coOrganizers || event.coOrganizers.length === 0) && <div className="p-4 text-center border-2 border-dashed rounded-xl opacity-30"><p className="text-[10px] font-black uppercase">No co-organizers</p></div>}
                                </div>
                              </div>
                            </div>
                          </div>
                          {event.isTournament && (
                            <div className="bg-primary/5 p-8 rounded-[2.5rem] border-2 border-dashed border-primary/20 space-y-8">
                              <div className="flex items-center gap-4"><div className="bg-white p-3 rounded-2xl shadow-sm text-primary"><Zap className="h-6 w-6" /></div><div><h3 className="text-xl font-black uppercase tracking-tight">Tactical Schedule Generator</h3><p className="text-[10px] font-bold text-primary uppercase tracking-widest">Automated Bracket Creation</p></div></div>
                              {isPro ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div className="space-y-4">
                                    <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">Format</Label><Select value={genType} onValueChange={setGenType}><SelectTrigger className="h-12 rounded-xl border-2 bg-white"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl"><SelectItem value="round_robin">Round Robin</SelectItem><SelectItem value="pool_play">Pool Play</SelectItem></SelectContent></Select></div>
                                    <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">Day Start Time</Label><Input type="time" value={genStartTime} onChange={e => setGenStartTime(e.target.value)} className="h-12 rounded-xl border-2 bg-white font-bold" /></div>
                                  </div>
                                  <div className="space-y-4">
                                    <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">Match Length (Min)</Label><Input type="number" value={genMatchLength} onChange={e => setGenMatchLength(e.target.value)} className="h-12 rounded-xl border-2 bg-white font-bold" /></div>
                                    {genType === 'pool_play' && (<div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">Number of Pools</Label><Input type="number" value={genPoolCount} onChange={e => setGenPoolCount(e.target.value)} className="h-12 rounded-xl border-2 bg-white font-bold" /></div>)}
                                  </div>
                                  <Button 
                                    className="md:col-span-2 h-14 rounded-2xl text-base font-black shadow-xl shadow-primary/20" 
                                    onClick={onGenerateClick} 
                                    disabled={isGenerating || !event.tournamentTeams || event.tournamentTeams.length < 2}
                                  >
                                    {isGenerating ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Sparkles className="h-5 w-5 mr-2" />} 
                                    Forage Bracket Data
                                  </Button>

                                  <AlertDialog open={isGenConfirmOpen} onOpenChange={setIsGenConfirmOpen}>
                                    <AlertDialogContent className="rounded-[2.5rem] border-none shadow-2xl">
                                      <AlertDialogHeader>
                                        <AlertDialogTitle className="text-2xl font-black uppercase">Overwrite Schedule?</AlertDialogTitle>
                                        <AlertDialogDescription className="font-bold text-base pt-2 text-foreground/80 leading-relaxed">
                                          Generating a new tactical schedule will permanently delete all {event.tournamentGames?.length || ''} existing matches in this hub. This action cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter className="mt-6">
                                        <AlertDialogCancel className="rounded-xl font-bold border-2">Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => { handleGenerateSchedule(); setIsGenConfirmOpen(false); }} className="rounded-xl font-black bg-primary text-white shadow-xl shadow-primary/20">Purge & Re-generate</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              ) : (<div className="text-center py-10 space-y-4"><Lock className="h-10 w-10 text-muted-foreground opacity-20 mx-auto" /><p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Elite Module Required</p><Button size="sm" onClick={purchasePro}>Upgrade to Elite</Button></div>)}
                            </div>
                          )}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="space-y-6">
                              <div className="flex items-center justify-between px-2"><h4 className="text-[10px] font-black uppercase tracking-[0.2em]">Participating Squads</h4><Badge variant="outline" className="text-[8px] font-black">{event.tournamentTeams?.length || 0} ENROLLED</Badge></div>
                              <div className="bg-muted/30 p-6 rounded-[2rem] border-2 border-dashed space-y-4">
                                <div className="space-y-2"><Label className="text-[9px] font-black uppercase tracking-widest ml-1">New Guest Squad</Label><Input placeholder="Squad Name..." value={newTeamName} onChange={e => setNewTeamName(e.target.value)} className="h-11 rounded-xl bg-white border-2" /></div>
                                <div className="grid grid-cols-2 gap-3"><Input placeholder="Coach Name" value={newTeamCoach} onChange={e => setNewTeamCoach(e.target.value)} className="h-10 rounded-xl bg-white border-2 text-xs" /><Input placeholder="Coach Email" value={newTeamEmail} onChange={e => setNewTeamEmail(e.target.value)} className="h-10 rounded-xl bg-white border-2 text-xs" /></div>
                                <Button onClick={handleAddGuestSquad} className="w-full h-11 rounded-xl font-black uppercase text-xs">Enroll Squad</Button>
                              </div>
                              <div className="space-y-2">
                                {event.tournamentTeams?.map((t, idx) => (
                                  <div key={idx} className="flex items-center justify-between p-4 bg-white rounded-2xl border shadow-sm group"><span className="font-black text-sm uppercase tracking-tight">{t}</span><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100" onClick={() => updateEvent(event.id, { tournamentTeams: event.tournamentTeams?.filter((_, i) => i !== idx) })}><Trash2 className="h-4 w-4" /></Button></div>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-6">
                              <div className="flex items-center justify-between px-2"><h4 className="text-[10px] font-black uppercase tracking-[0.2em]">Manual Match Ledger</h4><Button variant="outline" size="sm" onClick={() => updateEvent(event.id, { tournamentGames: [...(event.tournamentGames || []), { id: `game_${Date.now()}`, team1: event.tournamentTeams?.[0] || 'Team A', team2: event.tournamentTeams?.[1] || 'Team B', score1: 0, score2: 0, date: event.date, time: '10:00 AM', isCompleted: false, location: event.location }] })} className="h-8 text-[8px] font-black uppercase border-2">+ New Match</Button></div>
                              <div className="space-y-3">
                                {event.tournamentGames?.map((game) => (
                                  <div key={game.id} className="p-4 bg-white rounded-2xl border shadow-sm space-y-3 relative">
                                    <div className="flex flex-col gap-2">
                                      <div className="flex gap-2">
                                        <input type="date" value={game.date} onChange={e => updateEvent(event.id, { tournamentGames: event.tournamentGames?.map(g => g.id === game.id ? {...g, date: e.target.value} : g) })} className="flex-1 h-8 rounded-lg bg-muted/20 px-2 border text-[10px] font-bold" />
                                        <input type="time" value={game.time} onChange={e => updateEvent(event.id, { tournamentGames: event.tournamentGames?.map(g => g.id === game.id ? {...g, time: e.target.value} : g) })} className="w-24 h-8 rounded-lg bg-muted/20 px-2 border text-[10px] font-bold" />
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <MapPin className="h-3 w-3 text-primary" />
                                        <Input placeholder="Custom Match Location..." value={game.location || ''} onChange={e => updateEvent(event.id, { tournamentGames: event.tournamentGames?.map(g => g.id === game.id ? {...g, location: e.target.value} : g) })} className="h-8 rounded-lg bg-muted/20 px-2 border text-[10px] font-bold" />
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                      <Select value={game.team1} onValueChange={v => updateEvent(event.id, { tournamentGames: event.tournamentGames?.map(g => g.id === game.id ? {...g, team1: v} : g) })}>
                                        <SelectTrigger className="h-8 text-[10px] font-black uppercase border-none bg-muted/30 w-32"><SelectValue placeholder="Team 1" /></SelectTrigger>
                                        <SelectContent className="rounded-xl">{event.tournamentTeams?.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                                      </Select>
                                      <span className="opacity-20 text-[8px] font-black">VS</span>
                                      <Select value={game.team2} onValueChange={v => updateEvent(event.id, { tournamentGames: event.tournamentGames?.map(g => g.id === game.id ? {...g, team2: v} : g) })}>
                                        <SelectTrigger className="h-8 text-[10px] font-black uppercase border-none bg-muted/30 w-32"><SelectValue placeholder="Team 2" /></SelectTrigger>
                                        <SelectContent className="rounded-xl">{event.tournamentTeams?.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                                      </Select>
                                    </div>
                                    <Button variant="ghost" size="icon" className="absolute -top-2 -right-2 h-6 w-6 bg-white rounded-full border shadow-sm text-destructive" onClick={() => updateEvent(event.id, { tournamentGames: event.tournamentGames?.filter(g => g.id !== game.id) })}><X className="h-3 w-3" /></Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </TabsContent>
                      <TabsContent value="compliance" className="mt-0 space-y-12">
                        {event.isTournament && (
                          <div className="space-y-6">
                            <Card className="border-2 border-dashed border-primary/20 bg-primary/5 rounded-[2.5rem] overflow-hidden">
                              <CardContent className="p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                                <div className="flex items-center gap-4"><div className="bg-white p-4 rounded-2xl shadow-sm"><Globe className="h-8 w-8 text-primary" /></div><div className="space-y-1"><h4 className="text-xl font-black uppercase tracking-tight">Public Signature Portal</h4><p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Share this link with participating squads</p></div></div>
                                <div className="flex gap-2 w-full md:w-auto"><Button className="flex-1 md:flex-none h-12 rounded-xl font-black uppercase text-xs" onClick={() => { if(publicWaiverLink) { navigator.clipboard.writeText(publicWaiverLink); toast({ title: "Link Copied" }); } }}><Copy className="h-4 w-4 mr-2" /> Copy Waiver URL</Button><Button variant="outline" className="h-12 rounded-xl border-2 font-black uppercase text-xs" onClick={() => { if(publicWaiverLink) window.open(publicWaiverLink, '_blank'); }}><ExternalLink className="h-4 w-4 mr-2" /> Open</Button></div>
                              </CardContent>
                            </Card>
                            <div className="space-y-4">
                              <div className="flex items-center gap-2 px-1"><ShieldCheck className="h-4 w-4 text-primary" /><h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Official Squad Agreements</h4></div>
                              <div className="grid grid-cols-1 gap-3">
                                {event.tournamentTeams?.map(teamName => { 
                                  const res = event.teamAgreements?.[teamName]; const metadata = event.tournamentTeamsMetadata?.[teamName];
                                  return (
                                    <div key={teamName} className="flex items-center justify-between p-5 rounded-2xl border bg-white shadow-sm">
                                      <div className="flex items-center gap-4"><div className="h-10 w-10 rounded-xl bg-primary/5 flex items-center justify-center border text-primary"><ShieldAlert className="h-5 w-5" /></div><div><p className="font-black text-sm uppercase tracking-tight">{teamName}</p><p className="text-[8px] font-bold text-muted-foreground uppercase">{res?.captainName ? `Verified by ${res.captainName}` : metadata?.coach ? `Target Coach: ${metadata.coach}` : 'Participating Squad'}</p></div></div>
                                      <div className="flex items-center gap-4">{res?.agreed ? (<Badge className="bg-green-100 text-green-700 h-8 px-5 border-none font-black text-[10px] uppercase tracking-widest rounded-full"><Check className="h-3.5 w-3.5 mr-2" /> Verified</Badge>) : (<Badge variant="outline" className="h-8 px-5 font-black text-[10px] uppercase tracking-widest opacity-40 rounded-full border-dashed">Pending Signature</Badge>)}{isAdmin && (<Checkbox checked={res?.agreed || false} onCheckedChange={(v) => { updateEvent(event.id, { [`teamAgreements.${teamName}`]: { agreed: !!v, captainName: user?.name || 'Verified by Host', timestamp: new Date().toISOString() } }); }} className="h-6 w-6 rounded-lg" />)}</div>
                                    </div>
                                  ); 
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                        {event.requiresSpecialWaiver && (
                          <div className="space-y-4">
                            <div className="flex items-center gap-2 px-1"><Signature className="h-4 w-4 text-red-600" /><h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600">Individual Participant Signatures</h4></div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {Object.entries(event.specialWaiverResponses || {}).map(([uid, sig]: [string, any]) => {
                                const member = members.find(m => m.userId === uid);
                                return (
                                  <div key={uid} className="flex items-center justify-between p-4 rounded-2xl border bg-white shadow-sm"><div className="flex items-center gap-3"><Avatar className="h-8 w-8 rounded-lg"><AvatarImage src={member?.avatar} /><AvatarFallback className="text-[10px] font-black">{member?.name?.[0] || '?'}</AvatarFallback></Avatar><div><p className="text-xs font-black uppercase">{member?.name}</p><p className="text-[7px] font-bold text-muted-foreground uppercase">{format(new Date(sig.timestamp), 'MMM d, h:mm a')}</p></div></div><CheckCircle2 className="h-4 w-4 text-green-600" /></div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </TabsContent>
                    </>
                  )}
                </div>
              </Tabs>
            </div>
          </div>
        </div>
        
        {(isUserStaff || isPlayer) && !isParent && (
          <div className="p-6 border-t bg-muted/20 shrink-0 z-20 backdrop-blur-md">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 max-w-4xl mx-auto">
              <div className="text-center sm:text-left space-y-1">
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">Match Response</p>
                <p className="text-xs font-medium text-foreground/60 italic">Your status updates the roster.</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button variant="outline" className={cn("flex-1 sm:w-28 h-12 rounded-xl font-black text-[10px] uppercase", currentStatus === 'notGoing' ? "bg-red-600 text-white" : "bg-white border-2")} onClick={() => updateRSVP(event.id, 'notGoing')}>Decline</Button>
                <Button variant="outline" className={cn("flex-1 sm:w-28 h-12 rounded-xl font-black text-[10px] uppercase", currentStatus === 'maybe' ? "bg-amber-500 text-white" : "bg-white border-2")} onClick={() => updateRSVP(event.id, 'maybe')}>Maybe</Button>
                <Button variant="outline" className={cn("flex-1 sm:w-40 h-12 rounded-xl font-black text-xs uppercase", currentStatus === 'going' ? "bg-primary text-white" : "bg-white border-2")} onClick={() => updateRSVP(event.id, 'going')}><CheckCircle2 className="h-4 w-4 mr-2" /> I'm Going</Button>
              </div>
            </div>
          </div>
        )}
        
        <Dialog open={isWaiverDialogOpen} onOpenChange={setIsWaiverDialogOpen}><DialogContent className="sm:max-w-md rounded-3xl border-none shadow-2xl overflow-hidden p-0"><div className="h-2 bg-red-600 w-full" /><div className="p-8"><DialogHeader className="mb-6"><DialogTitle className="text-2xl font-black uppercase tracking-tight">Required Participant Waiver</DialogTitle><DialogDescription className="font-bold text-red-600 uppercase text-[10px] tracking-widest">Action Required for Participation</DialogDescription></DialogHeader><div className="max-h-[300px] border-2 rounded-2xl p-6 bg-muted/30 mb-6 overflow-y-auto"><p className="text-sm font-bold leading-relaxed whitespace-pre-wrap">{event.specialWaiverText}</p></div><div className="bg-primary/5 p-4 rounded-2xl border flex items-start gap-3 mb-6"><div className="bg-white p-1 rounded text-primary shrink-0 mt-0.5"><Info className="h-4 w-4" /></div><p className="text-[10px] font-medium leading-relaxed italic text-muted-foreground">By clicking below, you officially sign this waiver for {event.title} as {user?.name}.</p></div><DialogFooter><Button className="w-full h-14 rounded-2xl text-lg font-black bg-red-600 text-white shadow-xl" onClick={() => { submitEventWaiver(event.id, true); setIsWaiverDialogOpen(false); toast({ title: "Waiver Signed" }); }}>Verify & Sign Legally</Button></DialogFooter></div></DialogContent></Dialog>
        <Dialog open={isTeamAgreementOpen} onOpenChange={setIsTeamAgreementOpen}><DialogContent className="sm:max-w-xl rounded-3xl border-none shadow-2xl overflow-hidden p-0"><div className="h-2 bg-primary w-full" /><div className="p-8"><DialogHeader className="mb-6"><DialogTitle className="text-2xl font-black uppercase tracking-tight">Squad Participation Agreement</DialogTitle><DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Formal Enrollment Certification</DialogDescription></DialogHeader><div className="p-1 bg-muted rounded-2xl border-2 mb-6"><div className="max-h-[350px] p-6 bg-white rounded-xl overflow-y-auto">{event.teamWaiverText ? (<p className="text-sm font-bold leading-relaxed whitespace-pre-wrap text-foreground/80">{event.teamWaiverText}</p>) : (<div className="text-center py-10 opacity-40 space-y-2"><FileText className="h-8 w-8 mx-auto" /><p className="text-xs font-black uppercase">Standard Participation Terms Apply</p></div>)}</div></div><div className="bg-primary/5 p-5 rounded-2xl border border-primary/10 space-y-3 mb-6"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><p className="text-[10px] font-black uppercase tracking-widest text-primary">Authority Verification</p></div><p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">As a representative of <strong>{myParticipatingTeamName}</strong>, clicking below verifies that your squad understands and accepts all tournament coordination protocols.</p></div><DialogFooter><Button className="w-full h-16 rounded-2xl text-lg font-black bg-primary text-white shadow-xl" onClick={() => { if(myParticipatingTeamName) { signTeamTournamentWaiver(event.teamId, event.id, myParticipatingTeamName); setIsTeamAgreementOpen(false); } }}>Verify & Sign for Squad</Button></DialogFooter></div></DialogContent></Dialog>
        <Dialog open={!!editingGame} onOpenChange={(o) => !o && setEditingGame(null)}>
          <DialogContent className="sm:max-w-md rounded-3xl border-none shadow-2xl overflow-hidden p-0">
            <div className="h-2 bg-primary w-full" />
            <div className="p-8 space-y-6">
              <DialogHeader><DialogTitle className="text-2xl font-black uppercase tracking-tight">Game Ledger Entry</DialogTitle><DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Update Match Results</DialogDescription></DialogHeader>
              {editingGame && (
                <div className="space-y-6 py-2">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Scorekeeper URL</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={origin ? `${origin}/tournaments/scorekeeper/${event.teamId}/${event.id}/${editingGame.id}` : ''} className="rounded-xl h-10 text-[10px] font-mono bg-muted/30" />
                      <Button size="icon" variant="ghost" className="rounded-xl h-10 w-10 border" onClick={() => { if(origin) { navigator.clipboard.writeText(`${origin}/tournaments/scorekeeper/${event.teamId}/${event.id}/${editingGame.id}`); toast({ title: "Score Link Copied" }); } }}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Game Date</Label><input type="date" value={editingGame.date} onChange={e => setEditingGame({...editingGame, date: e.target.value})} className="w-full h-12 rounded-xl font-bold border-2 bg-background px-3" /></div>
                  <div className="grid grid-cols-2 gap-6 items-end">
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase truncate">{editingGame.team1}</Label><Input type="number" value={editingGame.score1} onChange={e => setEditingGame({...editingGame, score1: parseInt(e.target.value) || 0})} className="h-12 rounded-xl font-black text-xl text-center" /></div>
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase truncate">{editingGame.team2}</Label><Input type="number" value={editingGame.score2} onChange={e => setEditingGame({...editingGame, score2: parseInt(e.target.value) || 0})} className="h-12 rounded-xl font-black text-xl text-center" /></div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border"><div className="space-y-0.5"><p className="text-[10px] font-black uppercase">Final Result</p><p className="text-[8px] font-bold text-muted-foreground uppercase">Mark match as complete</p></div><Checkbox checked={editingGame.isCompleted} onCheckedChange={v => setEditingGame({...editingGame, isCompleted: !!v})} className="h-6 w-6 rounded-lg border-2" /></div>
                </div>
              )}
              <DialogFooter><Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={async () => { const updatedGames = (event.tournamentGames || []).map(g => g.id === editingGame?.id ? editingGame : g); await updateEvent(event.id, { tournamentGames: updatedGames }); setEditingGame(null); toast({ title: "Ledger Updated" }); }}>Commit Results</Button></DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

export default function EventsPage() {
  const { activeTeam, addEvent, updateEvent, deleteEvent, updateRSVP, formatTime, isSuperAdmin, purchasePro, isStaff } = useTeam();
  const db = useFirestore();
  const router = useRouter();
  const [filterMode, setFilterMode] = useState<'live' | 'past'>('live');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTournamentMode, setIsTournamentMode] = useState(false);
  const [isEliteTournament, setIsEliteTournament] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TeamEvent | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [requiresWaiver, setRequiresWaiver] = useState(false);
  const [waiverText, setWaiverText] = useState('');
  const [teamWaiverText, setTeamWaiverText] = useState('');
  const [tournamentTeams, setTournamentTeams] = useState<string[]>([]);
  const [tournamentTeamsMetadata, setTournamentTeamsMetadata] = useState<Record<string, { coach: string; email: string }>>({});
  const [tournamentGames, setTournamentGames] = useState<TournamentGame[]>([]);

  const eventsQuery = useMemoFirebase(() => { if (!activeTeam?.id || !db) return null; return query(collection(db, 'teams', activeTeam.id, 'events'), orderBy('date', 'asc')); }, [activeTeam?.id, db]);
  const { data: rawEvents } = useCollection<TeamEvent>(eventsQuery);
  const allEvents = rawEvents || [];
  
  const filteredEvents = useMemo(() => {
    const now = new Date();
    if (filterMode === 'live') {
      return allEvents.filter(e => {
        const d = new Date(e.date);
        return !isPast(d) || isSameDay(d, now);
      });
    }
    return allEvents.filter(e => {
      const d = new Date(e.date);
      return isPast(d) && !isSameDay(d, now);
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allEvents, filterMode]);

  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;

  const handleEdit = (event: TeamEvent) => { 
    setEditingEvent(event); 
    setIsTournamentMode(!!event.isTournament); 
    setIsEliteTournament(!!event.isTournamentPaid); 
    setNewTitle(event.title); 
    const d = new Date(event.date);
    setNewDate(format(d, 'yyyy-MM-dd')); 
    if (event.endDate) setNewEndDate(format(new Date(event.endDate), 'yyyy-MM-dd')); 
    setNewTime(event.startTime); 
    setNewLocation(event.location); 
    setNewDescription(event.description); 
    setRequiresWaiver(!!event.requiresSpecialWaiver); 
    setWaiverText(event.specialWaiverText || ''); 
    setTeamWaiverText(event.teamWaiverText || ''); 
    setTournamentTeams(event.tournamentTeams || []); 
    setTournamentTeamsMetadata(event.tournamentTeamsMetadata || {}); 
    setTournamentGames(event.tournamentGames || []); 
    setIsCreateOpen(true); 
  };

  const resetForm = () => { setEditingEvent(null); setNewTitle(''); setNewDate(''); setNewEndDate(''); setNewTime(''); setNewLocation(''); setNewDescription(''); setRequiresWaiver(false); setWaiverText(''); setTeamWaiverText(''); setTournamentTeams([]); setTournamentTeamsMetadata({}); setTournamentGames([]); };
  
  const handleCreateEvent = () => { 
    if (!newTitle || !newDate) return; 
    
    const dateObj = new Date(`${newDate}T${newTime || '12:00'}`);
    const payload: any = { 
      title: newTitle, 
      date: dateObj.toISOString(), 
      startTime: newTime || 'TBD', 
      location: newLocation, 
      description: newDescription, 
      isTournament: isTournamentMode, 
      isTournamentPaid: isEliteTournament, 
      requiresSpecialWaiver: requiresWaiver, 
      specialWaiverText: waiverText, 
      teamWaiverText, 
      tournamentTeams, 
      tournamentTeamsMetadata, 
      tournamentGames, 
      lastUpdated: new Date().toISOString() 
    }; 
    
    if (isTournamentMode && newEndDate) {
      payload.endDate = new Date(`${newEndDate}T12:00:00`).toISOString();
    }
    
    if (editingEvent) updateEvent(editingEvent.id, payload); else addEvent(payload); 
    setIsCreateOpen(false); 
    resetForm(); 
  };

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1"><Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">Tactical Hub</Badge><h1 className="text-4xl font-black uppercase tracking-tight">Schedule</h1></div>
        {isStaff && (<div className="flex flex-wrap gap-2"><Button size="sm" className="rounded-full h-11 px-6 font-black uppercase text-xs shadow-lg" onClick={() => { resetForm(); setIsTournamentMode(false); setIsEliteTournament(false); setIsCreateOpen(true); }}>+ Match</Button><Button size="sm" className="rounded-full h-11 px-6 font-black uppercase text-xs shadow-lg bg-black text-white" onClick={() => { resetForm(); setIsTournamentMode(true); setIsEliteTournament(false); setIsCreateOpen(true); }}><Trophy className="h-4 w-4 mr-2 text-primary" /> Tournament</Button><Button size="sm" className="rounded-full h-11 px-6 font-black uppercase text-xs shadow-lg bg-primary text-white border-none" onClick={() => { resetForm(); setIsTournamentMode(true); setIsEliteTournament(true); setIsCreateOpen(true); }}><Sparkles className="h-4 w-4 mr-2" /> Elite Hub</Button></div>)}
      </div>
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-5xl p-0 sm:rounded-[2.5rem] h-[100dvh] sm:h-[90vh] border-none shadow-2xl overflow-hidden flex flex-col">
          <DialogTitle className="sr-only">{editingEvent ? "Update" : "Launch"} Event Hub</DialogTitle>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex flex-col lg:flex-row min-h-full">
              <div className={cn("w-full lg:w-5/12 flex flex-col shrink-0 lg:border-r", isEliteTournament ? "bg-primary/5" : "bg-muted/30")}>
                <div className="space-y-6 p-6 lg:p-10">
                  <DialogHeader><DialogTitle className="text-2xl lg:text-3xl font-black tracking-tight">{editingEvent ? "Update" : "Launch"} {isTournamentMode ? (isEliteTournament ? "Elite Hub" : "Tournament") : "Match"}</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Event Title</Label><Input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="h-12 rounded-xl font-black border-2" /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Start Date</Label><input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full h-12 rounded-xl font-black border-2 bg-background px-3" /></div>
                      {isTournamentMode ? (<div className="space-y-1.5"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">End Date</Label><input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} className="w-full h-12 rounded-xl font-black border-2 bg-background px-3" /></div>) : (<div className="space-y-1.5"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Time</Label><input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="w-full h-12 rounded-xl font-black border-2 bg-background px-3" /></div>)}
                    </div>
                    <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Base Location</Label><Input value={newLocation} onChange={e => setNewLocation(e.target.value)} className="h-12 rounded-xl font-bold border-2" /></div>
                    <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">General Description</Label><Textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} className="rounded-xl min-h-[80px] border-2 text-xs font-bold" /></div>
                  </div>
                </div>
              </div>
              <div className="flex-1 flex flex-col bg-background min-h-0">
                <div className="p-6 lg:p-10 space-y-8">
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-2 rounded-xl text-primary"><FileText className="h-5 w-5" /></div>
                      <h3 className="text-xl font-black uppercase tracking-tight">Compliance Setup</h3>
                    </div>
                    
                    <div className="space-y-6 bg-muted/20 p-6 rounded-[2rem] border-2 border-dashed">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-black uppercase">Individual Waiver</Label>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase">Require signatures from all squad members</p>
                        </div>
                        <Switch checked={requiresWaiver} onCheckedChange={setRequiresWaiver} />
                      </div>
                      {requiresWaiver && (
                        <div className="space-y-2 animate-in fade-in duration-300">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Individual Waiver Terms</Label>
                          <Textarea placeholder="Paste your liability terms here..." value={waiverText} onChange={e => setWaiverText(e.target.value)} className="min-h-[120px] rounded-xl border-2 bg-white font-medium" />
                        </div>
                      )}
                    </div>

                    {isTournamentMode && (
                      <div className="space-y-4 bg-primary/5 p-6 rounded-[2rem] border-2 border-dashed border-primary/20">
                        <div className="flex items-center gap-3 mb-2">
                          <ShieldCheck className="h-5 w-5 text-primary" />
                          <h4 className="text-sm font-black uppercase">Guest Squad Agreement</h4>
                        </div>
                        <p className="text-[10px] font-bold text-primary/60 uppercase tracking-widest leading-relaxed">This text appears on the public signature portal for participating teams.</p>
                        <Textarea placeholder="Terms for participating squads (Liability, sportsmanship, etc)..." value={teamWaiverText} onChange={e => setTeamWaiverText(e.target.value)} className="min-h-[150px] rounded-xl border-2 bg-white font-medium" />
                      </div>
                    )}
                  </div>
                  
                  {!isTournamentMode && (
                    <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-[2rem] text-center opacity-60">
                      <Zap className="h-10 w-10 text-primary mx-auto mb-2" />
                      <p className="font-bold uppercase tracking-widest text-xs">Standard Match Protocol</p>
                      <p className="text-[10px] mt-2 font-medium max-w-xs">Use Tournaments for multi-team coordination, scheduling, and live standings.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="p-6 lg:p-8 bg-background border-t shrink-0 flex justify-center z-30">
            <Button className="w-full max-w-4xl h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95" onClick={handleCreateEvent}>
              {editingEvent ? "Update" : "Publish"} Event Hub
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="space-y-12">
        <section className="space-y-4">
          <div className="flex items-center justify-between px-2"><h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Itinerary</h2><div className="flex bg-muted/50 p-1 rounded-xl border"><Button variant={filterMode === 'live' ? 'default' : 'ghost'} size="sm" onClick={() => setFilterMode('live')} className="h-8 rounded-lg font-black text-[10px] uppercase">Live</Button><Button variant={filterMode === 'past' ? 'default' : 'ghost'} size="sm" onClick={() => setFilterMode('past')} className="h-8 rounded-lg font-black text-[10px] uppercase">History</Button></div></div>
          <div className="grid gap-4">
            {filteredEvents.map((event) => (
              <EventDetailDialog key={event.id} event={event} updateRSVP={updateRSVP} formatTime={formatTime} isAdmin={isAdmin} onEdit={handleEdit} onDelete={deleteEvent} hasAttendance={true} purchasePro={purchasePro}>
                <Card className="hover:border-primary/30 transition-all duration-500 cursor-pointer group rounded-3xl border-none shadow-md ring-1 ring-black/5 overflow-hidden bg-white">
                  <div className="flex items-stretch h-32">
                    <div className={cn("w-20 lg:w-24 flex flex-col items-center justify-center border-r-2 shrink-0 transition-colors duration-500", event.isTournamentPaid ? "bg-primary text-white border-primary" : event.isTournament ? "bg-black text-white border-black" : "bg-muted text-muted-foreground border-muted")}>
                      <span className="text-[8px] font-black uppercase opacity-60">{format(new Date(event.date), 'MMM')}</span>
                      <span className="text-3xl lg:text-4xl font-black">{format(new Date(event.date), 'dd')}</span>
                    </div>
                    <div className="flex-1 p-4 lg:p-6 flex flex-col justify-center min-w-0">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex gap-2 mb-1.5">{event.isTournament && (<Badge className={cn("text-[7px] uppercase border-none", event.isTournamentPaid ? "bg-black text-white border-2 border-primary/20" : "bg-black text-white")}>{event.isTournamentPaid ? 'Elite Hub' : 'Tournament'}</Badge>)}<Badge variant="outline" className="text-[7px] uppercase">{event.startTime}</Badge></div>
                          <h3 className="text-lg lg:text-xl font-black tracking-tight leading-none truncate">{event.title}</h3>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1 mt-1"><MapPin className="h-3 w-3" /> {event.location}</p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-primary opacity-20 group-hover:opacity-100 transition-all mt-2" />
                      </div>
                    </div>
                  </div>
                </Card>
              </EventDetailDialog>
            ))}
            {filteredEvents.length === 0 && (<div className="text-center py-20 bg-muted/10 border-2 border-dashed rounded-[2rem] opacity-40"><CalendarDays className="h-10 w-10 mx-auto mb-4" /><p className="text-xs font-black uppercase tracking-widest">No scheduled activities</p></div>)}
          </div>
        </section>
      </div>
      <div className="text-center pt-8 opacity-30">
        <p className="text-[8px] font-black uppercase tracking-widest leading-relaxed">Prices listed are current promotional rates and are subject to change without notice.</p>
      </div>
    </div>
  );
}
