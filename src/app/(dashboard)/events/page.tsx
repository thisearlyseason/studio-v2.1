"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  HelpCircle,
  AlertCircle,
  Settings,
  Building,
  Table as TableIcon,
  ChevronDown,
  Mail,
  UserPlus,
  Info,
  FileSignature
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
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, doc, where, collectionGroup, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { format, isPast, isSameDay, addMinutes, parse, eachDayOfInterval, isValid } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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
    try {
      const parts = t.trim().split(/\s+/);
      const timePart = parts[0];
      const period = parts[1]?.toUpperCase() || (t.toUpperCase().includes('PM') ? 'PM' : 'AM');
      let [hStr, mStr] = timePart.split(':');
      let h = parseInt(hStr);
      let m = parseInt(mStr) || 0;
      if (period === 'PM' && h !== 12) h += 12;
      if (period === 'AM' && h === 12) h = 0;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    } catch (e) {
      return '12:00';
    }
  }
  return t.includes(':') ? t : '12:00';
};

const formatDateRange = (start: string | Date, end?: string | Date) => {
  const startDate = new Date(start);
  if (!end) return format(startDate, 'MMM dd');
  const endDate = new Date(end);
  if (isSameDay(startDate, endDate)) return format(startDate, 'MMM dd');
  
  if (startDate.getMonth() === endDate.getMonth()) {
    return `${format(startDate, 'MMM d')} - ${format(endDate, 'd')}`;
  }
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

interface EventDetailDialogProps {
  event: TeamEvent;
  updateRSVP: (id: string, status: string) => void;
  formatTime: (date: string | Date) => string;
  isAdmin: boolean;
  onEdit: (event: TeamEvent) => void;
  onDelete: (eventId: string) => void;
  children: React.ReactNode;
  facilities: Facility[];
  allFields: Field[];
}

function EventDetailDialog({ event, updateRSVP, isAdmin, onEdit, onDelete, children, facilities, allFields }: EventDetailDialogProps) {
  const { user, updateEvent, signTeamTournamentWaiver, isPro, activeTeam, members, isStaff } = useTeam();
  const [editingGame, setEditingGame] = useState<TournamentGame | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [genMatchLength, setGenMatchLength] = useState('60');
  const [genBreakLength, setGenBreakLength] = useState('15');
  const [maxGamesPerDay, setMaxGamesPerDay] = useState('10');
  const [maxGamesPerTeam, setMaxGamesPerTeam] = useState('5');
  const [maxTotalGames, setMaxTotalGames] = useState('20');
  const [dayConfigs, setDayConfigs] = useState<Record<string, { start: string, end: string }>>({});
  
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamEmail, setNewTeamEmail] = useState('');
  
  const [baseUrl, setBaseUrl] = useState('');

  const myRsvp = event.userRsvps?.[user?.id || ''] || 'no_response';

  const isOrganizer = isStaff && event.teamId === activeTeam?.id;

  useEffect(() => {
    if (typeof window !== 'undefined') setBaseUrl(window.location.origin);
    
    if (event.isTournament && event.date) {
      const start = new Date(event.date);
      const end = event.endDate ? new Date(event.endDate) : start;
      
      if (isValid(start)) {
        try {
          const days = eachDayOfInterval({ start, end: isValid(end) ? end : start });
          const config: Record<string, { start: string, end: string }> = {};
          days.forEach(day => {
            const key = format(day, 'yyyy-MM-dd');
            config[key] = { start: '09:00', end: '21:00' };
          });
          setDayConfigs(config);
        } catch (e) {}
      }
    }
  }, [event.date, event.endDate, event.isTournament]);

  const tournamentStandings = useMemo(() => (event.isTournament && event.tournamentTeams) ? calculateTournamentStandings(event.tournamentTeams, event.tournamentGames || []) : [], [event]);
  
  const itineraryDays = useMemo(() => {
    if (!event.tournamentGames) return [];
    const daysSet = new Set<string>();
    event.tournamentGames.forEach(g => daysSet.add(g.date));
    return Array.from(daysSet).sort();
  }, [event.tournamentGames]);

  const [activeItineraryDay, setActiveItineraryDay] = useState<string>('');

  useEffect(() => {
    if (itineraryDays.length > 0 && !activeItineraryDay) {
      setActiveItineraryDay(itineraryDays[0]);
    }
  }, [itineraryDays, activeItineraryDay]);

  const dayGamesByField = useMemo(() => {
    if (!event.tournamentGames || !activeItineraryDay) return {};
    const filtered = event.tournamentGames.filter(g => g.date === activeItineraryDay);
    const groups: Record<string, TournamentGame[]> = {};
    filtered.forEach(game => {
      const key = game.location || 'Main Hub';
      if (!groups[key]) groups[key] = [];
      groups[key].push(game);
    });
    return groups;
  }, [event.tournamentGames, activeItineraryDay]);

  const poolResources = useMemo(() => {
    const list: { id: string, label: string }[] = [];
    event.fieldIds?.forEach(fid => {
      const parts = fid.split(':');
      const fac = facilities.find(f => f.id === parts[0]);
      if (fac) list.push({ id: `field:${fid}`, label: `${fac.name} - ${parts[1]}` });
    });
    event.facilityIds?.forEach(facId => {
      const hasFields = event.fieldIds?.some(fid => fid.startsWith(`${facId}:`));
      if (!hasFields) {
        const fac = facilities.find(f => f.id === facId);
        if (fac) list.push({ id: `fac:${facId}`, label: fac.name });
      }
    });
    event.manualLocations?.forEach(loc => list.push({ id: `manual:${loc}`, label: loc }));
    return list;
  }, [event.facilityIds, event.fieldIds, event.manualLocations, facilities]);

  const handleGenerateSchedule = async () => {
    if (!event.tournamentTeams || event.tournamentTeams.length < 2) {
      toast({ title: "Incomplete Roster", description: "At least 2 squads must be enrolled.", variant: "destructive" });
      return;
    }

    const resources = poolResources.map(r => r.id);
    if (resources.length === 0) resources.push(`manual:${event.location || 'Main Venue'}`);

    setIsGenerating(true);
    await new Promise(r => setTimeout(r, 1500));
    try {
      const games: TournamentGame[] = [];
      const teams = [...event.tournamentTeams];
      const matchMinutes = parseInt(genMatchLength);
      const breakMinutes = parseInt(genBreakLength);
      const maxPerDayLimit = parseInt(maxGamesPerDay);
      const maxPerTeamLimit = parseInt(maxGamesPerTeam);
      const totalMatchLimit = parseInt(maxTotalGames);
      
      const teamGameCounts: Record<string, number> = {};
      teams.forEach(t => teamGameCounts[t] = 0);

      const pairings: [string, string][] = [];
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) pairings.push([teams[i], teams[j]]);
      }

      const days = Object.keys(dayConfigs).sort();
      const totalPairings = pairings.length;
      const totalDays = days.length;
      
      const targetMatchesPerDay = Math.ceil(totalPairings / totalDays);
      let pairingIdx = 0;

      for (const dayKey of days) {
        if (games.length >= totalMatchLimit || pairingIdx >= pairings.length) break;
        const config = dayConfigs[dayKey];
        let dayGameCount = 0;
        
        const resourceTimes: Record<string, string> = {};
        resources.forEach(rid => resourceTimes[rid] = config.start);

        const teamAvailability: Record<string, string> = {};
        teams.forEach(t => teamAvailability[t] = config.start);

        while (pairingIdx < pairings.length && dayGameCount < maxPerDayLimit && dayGameCount < targetMatchesPerDay && games.length < totalMatchLimit) {
          const pair = pairings[pairingIdx];
          if (teamGameCounts[pair[0]] >= maxPerTeamLimit || teamGameCounts[pair[1]] >= maxPerTeamLimit) {
            pairingIdx++; continue;
          }

          let bestResourceId = null;
          let earliestMatchTime = "23:59";

          for (const rid of resources) {
            const fieldReadyAt = resourceTimes[rid];
            const teamsReadyAt = teamAvailability[pair[0]] > teamAvailability[pair[1]] ? teamAvailability[pair[0]] : teamAvailability[pair[1]];
            const actualStart = fieldReadyAt > teamsReadyAt ? fieldReadyAt : teamsReadyAt;

            if (actualStart < earliestMatchTime && actualStart < config.end) {
              earliestMatchTime = actualStart;
              bestResourceId = rid;
            }
          }

          if (!bestResourceId) break;

          const displayTime = format(parse(earliestMatchTime, 'HH:mm', new Date()), 'h:mm a');
          const resObj = poolResources.find(r => r.id === bestResourceId);
          let locationLabel = resObj ? resObj.label : (bestResourceId.includes(':') ? bestResourceId.split(':')[1] : bestResourceId);

          games.push({ 
            id: `gen_${Date.now()}_${pairingIdx}`, 
            team1: pair[0], team2: pair[1], score1: 0, score2: 0, 
            date: dayKey, time: displayTime, location: locationLabel, isCompleted: false 
          });

          const [h, m] = earliestMatchTime.split(':').map(Number);
          const nextAvailable = format(addMinutes(new Date(2000, 0, 1, h, m), matchMinutes + breakMinutes), 'HH:mm');
          resourceTimes[bestResourceId] = nextAvailable;
          teamAvailability[pair[0]] = nextAvailable;
          teamAvailability[pair[1]] = nextAvailable;
          teamGameCounts[pair[0]]++; teamGameCounts[pair[1]]++;
          pairingIdx++; dayGameCount++;
        }
      }

      await updateEvent(event.id, { tournamentGames: games });
      toast({ title: "Itinerary Synchronized", description: `${games.length} matchups established.` });
    } catch (err) {
      toast({ title: "Deployment Failure", variant: "destructive" });
    } finally { setIsGenerating(false); }
  };

  const handleAddTeam = async () => {
    if (!newTeamName.trim()) return;
    const currentTeams = event.tournamentTeams || [];
    const updatedTeams = [...currentTeams, newTeamName.trim()];
    const emails = event.invitedTeamEmails || {};
    if (newTeamEmail.trim()) {
      emails[newTeamName.trim()] = newTeamEmail.trim();
    }
    await updateEvent(event.id, { tournamentTeams: updatedTeams, invitedTeamEmails: emails });
    setNewTeamName('');
    setNewTeamEmail('');
    toast({ title: "Team Enrolled", description: `${newTeamName} added to roster.` });
  };

  const confirmedTeams = useMemo(() => {
    if (!event.tournamentTeams || !event.teamAgreements) return [];
    return event.tournamentTeams.filter(team => event.teamAgreements?.[team]?.agreed);
  }, [event.tournamentTeams, event.teamAgreements]);

  return (
    <Dialog onOpenChange={(open) => { if(!open) setEditingGame(null); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-7xl p-0 sm:rounded-[2.5rem] border-none shadow-2xl bg-white overflow-hidden flex flex-col">
        <DialogTitle className="sr-only">{event.title} Hub</DialogTitle>
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto sm:overflow-hidden">
          <div className="flex flex-col lg:flex-row flex-1 min-h-0">
            <div className="w-full lg:w-1/3 flex flex-col text-white bg-black lg:border-r border-white/10 shrink-0 p-8 relative overflow-y-auto custom-scrollbar">
              <div className="flex justify-between items-start mb-8 relative z-10">
                <Badge className="uppercase font-black tracking-widest text-[9px] h-6 px-3 bg-primary text-white border-none">{event.isTournament ? "Elite Hub" : (event.eventType || 'other').toUpperCase()}</Badge>
                <DialogClose asChild><X className="h-5 w-5 text-white/40 cursor-pointer hover:text-white" /></DialogClose>
              </div>
              <div className="space-y-8 relative z-10 pb-10">
                <div className="space-y-4">
                  <h2 className="text-3xl font-black tracking-tighter leading-tight uppercase">{event.title}</h2>
                  <div className="bg-white/10 p-4 rounded-2xl border border-white/10 space-y-3 font-bold text-sm">
                    <div className="flex items-center gap-3"><CalendarDays className="h-4 w-4 text-primary" />{formatDateRange(event.date, event.endDate)}</div>
                    <div className="flex items-center gap-3"><Clock className="h-4 w-4 text-primary" />{event.startTime} {event.endTime && ` - ${event.endTime}`}</div>
                    <div className="flex items-center gap-3"><MapPin className="h-4 w-4 text-primary" /><span className="truncate">{event.location}</span></div>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-white/10">
                  <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em] mb-4">Tactical RSVP</p>
                  <div className="grid grid-cols-1 gap-2">
                    <Button 
                      variant={myRsvp === 'going' ? 'default' : 'outline'} 
                      className={cn("h-12 rounded-xl font-black text-xs uppercase", myRsvp === 'going' ? "bg-primary border-none shadow-lg" : "bg-white/5 border-white/10 hover:bg-white/10")}
                      onClick={() => updateRSVP(event.id, 'going')}
                    >
                      Going
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                      <Button 
                        variant={myRsvp === 'maybe' ? 'default' : 'outline'} 
                        className={cn("h-12 rounded-xl font-black text-xs uppercase", myRsvp === 'maybe' ? "bg-amber-50 border-none shadow-lg" : "bg-white/5 border-white/10 hover:bg-white/10")}
                        onClick={() => updateRSVP(event.id, 'maybe')}
                      >
                        Maybe
                      </Button>
                      <Button 
                        variant={myRsvp === 'declined' ? 'default' : 'outline'} 
                        className={cn("h-12 rounded-xl font-black text-xs uppercase", myRsvp === 'declined' ? "bg-red-600 border-none shadow-lg" : "bg-white/5 border-white/10 hover:bg-white/10")}
                        onClick={() => updateRSVP(event.id, 'declined')}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                </div>

                {event.isTournament && (
                  <div className="space-y-4 pb-8 border-t border-white/10 pt-4">
                    <h4 className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Leadership Board</h4>
                    <div className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden">
                      {tournamentStandings.length > 0 ? tournamentStandings.map((team) => (
                        <div key={team.name} className="flex justify-between items-center px-5 py-4 border-b border-white/5 last:border-0">
                          <span className="text-xs font-black uppercase truncate pr-2">{team.name}</span>
                          <Badge className={cn("text-white border-none font-black text-[9px] px-2 h-5", team.points >= 0 ? "bg-primary" : "bg-destructive")}>{team.points > 0 ? `+${team.points}` : team.points} PTS</Badge>
                        </div>
                      )) : (
                        <p className="p-6 text-center text-[10px] font-bold text-white/20 uppercase tracking-widest italic">Awaiting results...</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {isOrganizer && (
                <div className="mt-auto pt-8 flex gap-3 relative z-10 pb-8">
                  <Button variant="secondary" className="flex-1 rounded-xl h-12 font-black uppercase text-[10px]" onClick={() => onEdit(event)}>Edit Hub</Button>
                </div>
              )}
            </div>
            
            <div className="flex-1 flex flex-col bg-background relative overflow-y-auto sm:overflow-hidden">
              <Tabs defaultValue={event.isTournament ? "bracket" : "roster"} className="flex-1 flex flex-col min-h-0">
                <div className="px-6 py-6 border-b bg-muted/30 backdrop-blur-md shrink-0">
                  <TabsList className="bg-white/50 h-auto p-1.5 rounded-2xl shadow-inner border w-full overflow-x-auto flex-wrap sm:flex-nowrap custom-scrollbar">
                    {event.isTournament && <TabsTrigger value="bracket" className="rounded-xl font-black text-xs uppercase px-6 sm:px-8 data-[state=active]:bg-black data-[state=active]:text-white">Itinerary</TabsTrigger>}
                    <TabsTrigger value="roster" className="rounded-xl font-black text-xs uppercase px-6 sm:px-8 data-[state=active]:bg-black data-[state=active]:text-white">Attendance</TabsTrigger>
                    <TabsTrigger value="portals" className="rounded-xl font-black text-xs uppercase px-6 sm:px-8 data-[state=active]:bg-primary data-[state=active]:text-white">Portals</TabsTrigger>
                    {isOrganizer && (
                      <>
                        <TabsTrigger value="compliance" className="rounded-xl font-black text-xs uppercase px-6 sm:px-8 data-[state=active]:bg-black data-[state=active]:text-white">Compliance</TabsTrigger>
                        <TabsTrigger value="manage" className="rounded-xl font-black text-xs uppercase px-6 sm:px-8 data-[state=active]:bg-primary data-[state=active]:text-white">Deploy</TabsTrigger>
                      </>
                    )}
                  </TabsList>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <div className="p-6 lg:p-10 pb-24">
                    <TabsContent value="bracket" className="mt-0 space-y-10">
                      {itineraryDays.length > 0 ? (
                        <div className="space-y-8">
                          <div className="flex bg-muted/50 p-1.5 rounded-2xl border w-fit mx-auto shadow-inner overflow-x-auto custom-scrollbar max-w-full">
                            {itineraryDays.map(day => (
                              <Button 
                                key={day} 
                                variant={activeItineraryDay === day ? 'default' : 'ghost'} 
                                onClick={() => setActiveItineraryDay(day)}
                                className="h-10 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest whitespace-nowrap"
                              >
                                {format(new Date(day), 'MMM d')}
                              </Button>
                            ))}
                          </div>

                          <div className="space-y-12">
                            {Object.entries(dayGamesByField).map(([fieldName, games]) => (
                              <div key={fieldName} className="space-y-6">
                                <Badge className="bg-primary text-white font-black uppercase text-[10px] px-4 h-7 rounded-full shadow-lg">{fieldName}</Badge>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                  {games.map((game) => (
                                    <button 
                                      key={game.id} 
                                      onClick={() => isOrganizer && setEditingGame(game)} 
                                      className="w-full p-8 bg-white rounded-[2.5rem] border-2 shadow-sm transition-all text-left relative group ring-1 ring-black/5 active:scale-95 hover:border-primary/20"
                                    >
                                      <div className="absolute top-6 left-8">
                                        <Badge variant="outline" className="text-[10px] font-black uppercase h-7 px-3 border-2">{game.time}</Badge>
                                      </div>
                                      <div className="grid grid-cols-7 items-center gap-4 text-center mt-10">
                                        <div className="col-span-3 space-y-2">
                                          <p className="font-black text-xs uppercase truncate leading-tight">{game.team1}</p>
                                          <p className="text-5xl font-black tracking-tighter">{game.score1}</p>
                                        </div>
                                        <div className="col-span-1 opacity-20 font-black text-xs">VS</div>
                                        <div className="col-span-3 space-y-2">
                                          <p className="font-black text-xs uppercase truncate leading-tight">{game.team2}</p>
                                          <p className="text-5xl font-black tracking-tighter">{game.score2}</p>
                                        </div>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-24 opacity-20">
                          <Zap className="h-12 w-12 mx-auto mb-4 text-primary animate-pulse" />
                          <p className="font-black uppercase tracking-widest text-sm">Itinerary not yet deployed.</p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="roster" className="mt-0 space-y-12">
                      <div className="space-y-6">
                        <div className="flex items-center gap-3 px-2">
                          <Users className="h-5 w-5 text-primary" />
                          <h3 className="text-xl font-black uppercase tracking-tight">{activeTeam?.name} Tourney Roster</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {members.map(member => {
                            const rsvp = event.userRsvps?.[member.userId] || 'no_response';
                            return (
                              <Card key={member.id} className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 p-4 bg-white">
                                <div className="flex items-center gap-4">
                                  <Avatar className="h-10 w-10 rounded-xl border">
                                    <AvatarImage src={member.avatar} />
                                    <AvatarFallback className="font-black text-xs">{member.name[0]}</AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-black text-xs uppercase truncate">{member.name}</p>
                                    <p className="text-[8px] font-bold text-muted-foreground uppercase">{member.position}</p>
                                  </div>
                                  <Badge className={cn(
                                    "border-none font-black text-[8px] uppercase px-2 h-5",
                                    rsvp === 'going' ? "bg-green-100 text-green-700" : rsvp === 'maybe' ? "bg-amber-100 text-amber-700" : rsvp === 'declined' ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"
                                  )}>{rsvp.replace('_', ' ')}</Badge>
                                </div>
                              </Card>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div className="flex items-center gap-3 px-2">
                          <ShieldCheck className="h-5 w-5 text-primary" />
                          <h3 className="text-xl font-black uppercase tracking-tight">Confirmed Strategic Partners</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {confirmedTeams.map(teamName => (
                            <Card key={teamName} className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 p-5 bg-green-50/30 border-green-100/50">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div className="bg-white p-2.5 rounded-xl shadow-sm border border-green-100">
                                    <ShieldCheck className="h-5 w-5 text-green-600" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-black text-sm uppercase truncate">{teamName}</p>
                                    <p className="text-[8px] font-bold text-green-700 uppercase tracking-widest">VERIFIED SQUAD</p>
                                  </div>
                                </div>
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                              </div>
                            </Card>
                          ))}
                          {confirmedTeams.length === 0 && (
                            <div className="col-span-full py-12 text-center border-2 border-dashed rounded-3xl opacity-30 italic font-bold text-xs uppercase tracking-widest">
                              Awaiting squad confirmations...
                            </div>
                          )}
                        </div>
                      </div>
                    </TabsContent>

                    {isOrganizer && (
                      <TabsContent value="compliance" className="mt-0">
                        <div className="space-y-6">
                          <div className="flex items-center justify-between px-2">
                            <div className="flex items-center gap-3">
                              <FileSignature className="h-5 w-5 text-primary" />
                              <h3 className="text-xl font-black uppercase tracking-tight">Team Agreement Ledger</h3>
                            </div>
                            <Button variant="outline" className="h-9 px-4 rounded-xl font-black uppercase text-[10px] border-2" onClick={() => window.open(`${baseUrl}/tournaments/${event.teamId}/waiver/${event.id}`, '_blank')}>Open Waiver Portal <ExternalLink className="ml-2 h-3 w-3" /></Button>
                          </div>
                          <div className="grid grid-cols-1 gap-4">
                            {event.tournamentTeams?.map(team => {
                              const signed = event.teamAgreements?.[team]?.agreed;
                              return (
                                <Card key={team} className="rounded-[2rem] border-none shadow-sm ring-1 ring-black/5 p-6 bg-white flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                    <div className="bg-muted p-3 rounded-2xl"><Users className="h-5 w-5 text-muted-foreground" /></div>
                                    <div>
                                      <p className="font-black text-sm uppercase">{team}</p>
                                      {signed && <p className="text-[8px] font-bold text-muted-foreground uppercase">Signed by: {event.teamAgreements![team].captainName}</p>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    {signed ? (
                                      <div className="flex items-center gap-2">
                                        <Badge className="bg-green-100 text-green-700 border-none font-black text-[8px] px-3 h-6 flex items-center gap-1.5 rounded-full"><CheckCircle2 className="h-3 w-3" /> VERIFIED</Badge>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => toast({ title: "Audit Success", description: "Verification document archived in squad vault." })}><Download className="h-4 w-4" /></Button>
                                      </div>
                                    ) : (
                                      <>
                                        <Badge variant="outline" className="border-amber-500/20 text-amber-600 font-black text-[8px] h-6 rounded-full">PENDING</Badge>
                                        <Button size="sm" variant="ghost" className="h-6 px-3 text-[8px] font-black uppercase border rounded-full" onClick={() => signTeamTournamentWaiver(event.teamId, event.id, team)}>Manual Override</Button>
                                      </>
                                    )}
                                  </div>
                                </Card>
                              );
                            })}
                          </div>
                        </div>
                      </TabsContent>
                    )}

                    <TabsContent value="portals" className="mt-0">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <Card className="rounded-[2rem] border-none shadow-xl ring-1 ring-black/5 bg-white overflow-hidden group">
                          <CardHeader className="bg-primary/5 p-6 border-b"><div className="flex items-center gap-3"><Eye className="h-5 w-5 text-primary" /><CardTitle className="text-sm font-black uppercase">Spectator Hub</CardTitle></div></CardHeader>
                          <CardContent className="p-6 space-y-4">
                            <p className="text-[10px] font-medium leading-relaxed italic text-muted-foreground">Public-facing link for fans to follow live scores and standings.</p>
                            <div className="flex gap-2">
                              <Input readOnly value={`${baseUrl}/tournaments/spectator/${event.teamId}/${event.id}`} className="h-10 text-[9px] font-mono bg-muted/30 border-none" />
                              <Button size="icon" variant="secondary" className="h-10 w-10 shrink-0 rounded-xl" onClick={() => { navigator.clipboard.writeText(`${baseUrl}/tournaments/spectator/${event.teamId}/${event.id}`); toast({ title: "Link Copied" }); }}><Copy className="h-4 w-4" /></Button>
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="rounded-[2rem] border-none shadow-xl ring-1 ring-black/5 bg-white overflow-hidden group">
                          <CardHeader className="bg-black text-white p-6 border-b"><div className="flex items-center gap-3"><Terminal className="h-5 w-5 text-primary" /><CardTitle className="text-sm font-black uppercase">Scorekeeper Hub</CardTitle></div></CardHeader>
                          <CardContent className="p-6 space-y-4">
                            <p className="text-[10px] font-medium leading-relaxed italic text-muted-foreground">Administrative portal for field marshals to log official match results.</p>
                            <div className="flex gap-2">
                              <Input readOnly value={`${baseUrl}/tournaments/scorekeeper/${event.teamId}/${event.id}`} className="h-10 text-[9px] font-mono bg-muted/30 border-none" />
                              <Button size="icon" variant="secondary" className="h-10 w-10 shrink-0 rounded-xl" onClick={() => { navigator.clipboard.writeText(`${baseUrl}/tournaments/scorekeeper/${event.teamId}/${event.id}`); toast({ title: "Link Copied" }); }}><Copy className="h-4 w-4" /></Button>
                            </div>
                          </CardContent>
                        </Card>
                        {isOrganizer && (
                          <Card className="rounded-[2rem] border-none shadow-xl ring-1 ring-black/5 bg-white overflow-hidden group">
                            <CardHeader className="bg-amber-500/5 p-6 border-b"><div className="flex items-center gap-3"><FileSignature className="h-5 w-5 text-amber-600" /><CardTitle className="text-sm font-black uppercase">Waiver Portal</CardTitle></div></CardHeader>
                            <CardContent className="p-6 space-y-4">
                              <p className="text-[10px] font-medium leading-relaxed italic text-muted-foreground">Verification link for participating squad leads to sign the digital agreement.</p>
                              <div className="flex gap-2">
                                <Input readOnly value={`${baseUrl}/tournaments/${event.teamId}/waiver/${event.id}`} className="h-10 text-[9px] font-mono bg-muted/30 border-none" />
                                <Button size="icon" variant="secondary" className="h-10 w-10 shrink-0 rounded-xl" onClick={() => { navigator.clipboard.writeText(`${baseUrl}/tournaments/${event.teamId}/waiver/${event.id}`); toast({ title: "Link Copied" }); }}><Copy className="h-4 w-4" /></Button>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    </TabsContent>

                    {isOrganizer && (
                      <TabsContent value="manage" className="mt-0 space-y-10">
                        <div className="bg-muted/20 p-8 rounded-[2.5rem] border-2 border-dashed space-y-6">
                          <div className="flex items-center gap-3"><Users className="h-6 w-6 text-primary" /><h3 className="text-lg font-black uppercase tracking-tight">Tournament Roster</h3></div>
                          <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-6 rounded-2xl border shadow-sm">
                              <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Team Name</Label>
                                <Input placeholder="e.g. Metro Warriors" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} className="h-12 border-2 rounded-xl" />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Coach Email (Auto-Enroll)</Label>
                                <Input placeholder="coach@example.com" value={newTeamEmail} onChange={e => setNewTeamEmail(e.target.value)} className="h-12 border-2 rounded-xl" />
                              </div>
                              <Button className="md:col-span-2 h-12 rounded-xl font-black uppercase text-xs" onClick={handleAddTeam} disabled={!newTeamName.trim()}><Plus className="h-4 w-4 mr-2" /> Enroll Squad & Send Challenge</Button>
                            </div>
                            
                            <div className="space-y-3">
                              <p className="text-[10px] font-black uppercase text-muted-foreground px-1">Enrolled Squads ({event.tournamentTeams?.length || 0})</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {event.tournamentTeams?.map(team => (
                                  <div key={team} className="flex items-center justify-between p-4 bg-white rounded-2xl border shadow-sm group">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="bg-primary/5 p-2 rounded-lg text-primary"><Users className="h-4 w-4" /></div>
                                      <div className="min-w-0">
                                        <p className="font-black text-sm uppercase truncate">{team}</p>
                                        {event.invitedTeamEmails?.[team] && <p className="text-[8px] font-bold text-muted-foreground truncate">{event.invitedTeamEmails[team]}</p>}
                                      </div>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100" onClick={() => updateEvent(event.id, { tournamentTeams: event.tournamentTeams!.filter(t => t !== team) })}><Trash2 className="h-4 w-4" /></Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="bg-primary/5 p-8 rounded-[2.5rem] border-2 border-dashed border-primary/20 space-y-8">
                          <div className="flex items-center gap-3"><Zap className="h-6 w-6 text-primary" /><h3 className="text-lg font-black uppercase tracking-tight">Itinerary Deployment Deck</h3></div>
                          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                            <div className="space-y-1.5"><Label className="text-[8px] font-black uppercase tracking-widest ml-1">Match Length (Min)</Label><Input type="number" value={genMatchLength} onChange={e => setGenMatchLength(e.target.value)} className="h-11 rounded-xl border-2 font-black" /></div>
                            <div className="space-y-1.5"><Label className="text-[8px] font-black uppercase tracking-widest ml-1">Break Length (Min)</Label><Input type="number" value={genBreakLength} onChange={e => setGenBreakLength(e.target.value)} className="h-11 rounded-xl border-2 font-black" /></div>
                            <div className="space-y-1.5"><Label className="text-[8px] font-black uppercase tracking-widest ml-1">Max Matches / Day</Label><Input type="number" value={maxGamesPerDay} onChange={e => setMaxGamesPerDay(e.target.value)} className="h-11 rounded-xl border-2 font-black" /></div>
                            <div className="space-y-1.5"><Label className="text-[8px] font-black uppercase tracking-widest ml-1">Max Matches / Team</Label><Input type="number" value={maxGamesPerTeam} onChange={e => setMaxGamesPerTeam(e.target.value)} className="h-11 rounded-xl border-2 font-black" /></div>
                            <div className="space-y-1.5"><Label className="text-[8px] font-black uppercase tracking-widest ml-1">Total Match Limit</Label><Input type="number" value={maxTotalGames} onChange={e => setMaxTotalGames(e.target.value)} className="h-11 rounded-xl border-2 font-black" /></div>
                          </div>
                          <Button className="w-full h-16 rounded-2xl text-base font-black shadow-xl shadow-primary/20" onClick={handleGenerateSchedule} disabled={isGenerating}>{isGenerating ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : "Deploy Complex Itinerary"}</Button>
                        </div>
                      </TabsContent>
                    )}
                  </div>
                </div>
              </Tabs>
            </div>
          </div>
        </div>
        
        <Dialog open={!!editingGame} onOpenChange={(open) => !open && setEditingGame(null)}>
          <DialogContent className="sm:max-w-md rounded-3xl border-none shadow-2xl overflow-hidden p-0">
            <div className="h-2 bg-primary w-full" />
            <div className="p-8 space-y-6">
              <DialogHeader><DialogTitle className="text-2xl font-black uppercase">Result Entry</DialogTitle></DialogHeader>
              {editingGame && (
                <div className="space-y-6 py-2">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2"><Label className="text-xs font-black uppercase">{editingGame.team1}</Label><Input type="number" value={editingGame.score1} onChange={e => setEditingGame({...editingGame, score1: parseInt(e.target.value) || 0})} className="h-12 rounded-xl border-2 font-black text-xl text-center" /></div>
                    <div className="space-y-2"><Label className="text-xs font-black uppercase">{editingGame.team2}</Label><Input type="number" value={editingGame.score2} onChange={e => setEditingGame({...editingGame, score2: parseInt(e.target.value) || 0})} className="h-12 rounded-xl border-2 font-black text-xl text-center" /></div>
                  </div>
                </div>
              )}
              <DialogFooter><Button className="w-full h-14 rounded-2xl font-black shadow-xl" onClick={async () => { const updatedGames = (event.tournamentGames || []).map(g => g.id === editingGame?.id ? editingGame : g); await updateEvent(event.id, { tournamentGames: updatedGames }); setEditingGame(null); }}>Commit Result</Button></DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

export default function EventsPage() {
  const { householdEvents, updateRSVP, formatTime, isSuperAdmin, isStaff, activeTeam, addEvent, updateEvent, deleteEvent } = useTeam();
  const { user: firebaseUser } = useUser();
  const db = useFirestore();
  
  const [filterMode, setFilterMode] = useState<'live' | 'past'>('live');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTournamentMode, setIsTournamentMode] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TeamEvent | null>(null);
  
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newEndTime, setNewEndTime] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newTournamentTeams, setNewTournamentTeams] = useState('');
  const [newWaiverText, setNewWaiverText] = useState('');
  const [selectedFacilityIds, setSelectedFacilityIds] = useState<string[]>([]);
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [manualLocations, setManualLocations] = useState<string[]>([]);
  const [manualLocInput, setManualLocInput] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [eventType, setEventType] = useState<EventType>('game');

  const facilitiesQuery = useMemoFirebase(() => (db && firebaseUser?.uid) ? query(collection(db, 'facilities'), where('clubId', '==', firebaseUser.uid)) : null, [db, firebaseUser?.uid]);
  const { data: facilities } = useCollection<Facility>(facilitiesQuery);

  const fieldsQuery = useMemoFirebase(() => db ? query(collectionGroup(db, 'fields')) : null, [db]);
  const { data: allFields, isLoading: isFieldsLoading } = useCollection<Field>(fieldsQuery);

  const filteredEvents = useMemo(() => { 
    const now = new Date(); 
    const list = householdEvents || []; 
    if (filterMode === 'live') return list.filter(e => !isPast(new Date(e.endDate || e.date)) || isSameDay(new Date(e.endDate || e.date), now)); 
    return list.filter(e => isPast(new Date(e.endDate || e.date)) && !isSameDay(new Date(e.endDate || e.date), now)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); 
  }, [householdEvents, filterMode]);

  const poolResources = useMemo(() => {
    const list: { id: string, label: string }[] = [];
    selectedFacilityIds.forEach(id => {
      const fac = facilities?.find(f => f.id === id);
      if (!fac) return;
      const selectedFieldsInFac = selectedFieldIds.filter(fid => fid.startsWith(`${id}:`));
      if (selectedFieldsInFac.length > 0) {
        selectedFieldsInFac.forEach(fid => {
          const fieldName = fid.split(':')[1];
          list.push({ id: `field:${fid}`, label: `${fac.name} - ${fieldName}` });
        });
      } else {
        list.push({ id: `fac:${id}`, label: fac.name });
      }
    });
    manualLocations.forEach(loc => list.push({ id: `manual:${loc}`, label: loc }));
    return list;
  }, [selectedFacilityIds, selectedFieldIds, manualLocations, facilities]);

  const handleEdit = (event: TeamEvent) => { 
    setEditingEvent(event); 
    setIsTournamentMode(!!event.isTournament); 
    setNewTitle(event.title); 
    setEventType(event.eventType || 'game'); 
    setNewDate(format(new Date(event.date), 'yyyy-MM-dd')); 
    setNewEndDate(event.endDate ? format(new Date(event.endDate), 'yyyy-MM-dd') : '');
    setNewTime(event.startTime); 
    setNewTime(event.endTime || ''); 
    setNewLocation(event.location); 
    setNewTournamentTeams(event.tournamentTeams?.join(', ') || '');
    setNewWaiverText(event.teamWaiverText || '');
    setSelectedFacilityIds(event.facilityIds || []); 
    setSelectedFieldIds(event.fieldIds || []); 
    setManualLocations(event.manualLocations || []);
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
      
      let teamsList = newTournamentTeams.split(',').map(t => t.trim()).filter(t => !!t);
      if (isTournamentMode && activeTeam && !teamsList.includes(activeTeam.name)) {
        teamsList.unshift(activeTeam.name);
      }

      const payload: any = { 
        title: newTitle, 
        eventType: isTournamentMode ? 'tournament' : eventType, 
        date: eventDate.toISOString(), 
        endDate: isTournamentMode && newEndDate ? new Date(newEndDate).toISOString() : eventDate.toISOString(),
        startTime: newTime, 
        endTime: newEndTime || 'TBD', 
        location: newLocation, 
        facilityIds: selectedFacilityIds,
        fieldIds: selectedFieldIds,
        manualLocations: manualLocations,
        description: newDescription, 
        isTournament: isTournamentMode, 
        tournamentTeams: teamsList,
        teamWaiverText: newWaiverText,
        lastUpdated: new Date().toISOString() 
      }; 

      const success = editingEvent ? await updateEvent(editingEvent.id, payload) : await addEvent(payload); 
      if (success) { setIsCreateOpen(false); setEditingEvent(null); resetForm(); }
    } catch (e) { toast({ title: "Deployment Error", variant: "destructive" }); }
  };

  const resetForm = () => {
    setNewTitle(''); setNewDate(''); setNewEndDate(''); setNewTime(''); setNewEndTime('');
    setNewLocation(''); setSelectedFacilityIds([]); setSelectedFieldIds([]); setManualLocations([]); setManualLocInput('');
    setNewDescription(''); setEventType('game'); setEditingEvent(null);
    setNewTournamentTeams(''); setNewWaiverText('');
  };

  const toggleFacility = (facId: string) => {
    setSelectedFacilityIds(prev => {
      const isSelecting = !prev.includes(facId);
      if (!isSelecting) {
        setSelectedFieldIds(fields => fields.filter(fid => !fid.startsWith(`${facId}:`)));
        return prev.filter(id => id !== facId);
      }
      return [...prev, facId];
    });
  };

  const toggleField = (facId: string, fieldName: string) => {
    const id = `${facId}:${fieldName}`;
    setSelectedFieldIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const getCardDateDisplay = (event: TeamEvent) => {
    const startDate = new Date(event.date);
    const month = format(startDate, 'MMM').toUpperCase();
    if (event.endDate && !isSameDay(startDate, new Date(event.endDate))) {
      const startDay = format(startDate, 'd');
      const endDay = format(new Date(event.endDate), 'd');
      return { month, day: `${startDay}-${endDay}` };
    }
    return { month, day: format(startDate, 'd') };
  };

  const isAdmin = isStaff || isSuperAdmin;

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1"><Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">Squad Itinerary</Badge><h1 className="text-4xl font-black uppercase tracking-tight">Schedule Hub</h1></div>
        {isStaff && ( <div className="flex gap-2"><Button size="sm" className="rounded-full h-11 px-6 font-black uppercase text-xs shadow-lg" onClick={() => { setIsTournamentMode(false); resetForm(); setIsCreateOpen(true); }}>+ New Activity</Button><Button size="sm" className="rounded-full h-11 px-6 font-black uppercase text-xs bg-black text-white shadow-lg" onClick={() => { setIsTournamentMode(true); resetForm(); setIsCreateOpen(true); }}>+ Elite Tournament</Button></div> )}
      </div>
      
      <Dialog open={isCreateOpen} onOpenChange={(o) => { if(!o) resetForm(); setIsCreateOpen(o); }}>
        <DialogContent className="sm:max-w-5xl p-0 sm:rounded-[2.5rem] h-full sm:h-[90vh] border-none shadow-2xl bg-white flex flex-col">
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex flex-col lg:flex-row min-h-full">
              <div className="w-full lg:w-5/12 bg-muted/30 p-10 space-y-8 lg:border-r shrink-0">
                <DialogHeader className="relative pr-10">
                  <DialogTitle className="text-3xl font-black uppercase tracking-tight">{editingEvent ? "Update" : (isTournamentMode ? "Launch Tournament" : "Launch Activity")}</DialogTitle>
                  <Button variant="ghost" size="icon" className="absolute top-0 right-0 rounded-full h-8 w-8 hover:bg-black/5" onClick={() => setIsCreateOpen(false)}><X className="h-5 w-5" /></Button>
                </DialogHeader>
                <div className="space-y-6">
                  {!isTournamentMode && ( 
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Activity Type</Label>
                      <Select value={eventType} onValueChange={(v: EventType) => setEventType(v)}>
                        <SelectTrigger className="h-12 rounded-xl border-2 bg-white"><SelectValue /></SelectTrigger>
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
                    {isTournamentMode && (
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">End Date</Label>
                        <Input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} className="h-12 rounded-xl border-2 font-black" />
                      </div>
                    )}
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
              <div className="flex-1 p-10 space-y-8 bg-background relative overflow-hidden">
                <div className="bg-primary/5 p-6 rounded-3xl border-2 border-dashed space-y-6 relative z-10">
                  <div className="flex items-center gap-3">
                    <Building className="h-5 w-5 text-primary" />
                    <Label className="text-[10px] font-black uppercase tracking-widest">Resource Pool (Venues & Fields)</Label>
                  </div>
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="space-y-3">
                        {facilities?.map(f => (
                          <Collapsible key={f.id} open={selectedFacilityIds.includes(f.id)}>
                            <div className="flex items-center space-x-3 p-3 bg-white rounded-xl border-2 hover:border-primary/20 transition-all group shadow-sm">
                              <Checkbox id={`fac-${f.id}`} checked={selectedFacilityIds.includes(f.id)} onCheckedChange={() => toggleFacility(f.id)} className="h-5 w-5 rounded-lg border-2" />
                              <Label htmlFor={`fac-${f.id}`} className="flex-1 font-black text-xs uppercase tracking-tight cursor-pointer leading-none">{f.name}</Label>
                              <CollapsibleTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 opacity-40 group-hover:opacity-100"><ChevronDown className={cn("h-4 w-4 transition-transform", selectedFacilityIds.includes(f.id) ? "rotate-180" : "")} /></Button></CollapsibleTrigger>
                            </div>
                            <CollapsibleContent className="pt-2 pl-8 space-y-2 animate-in slide-in-from-top-2 duration-300">
                              {isFieldsLoading ? (
                                <div className="flex items-center gap-2 p-2"><Loader2 className="h-3 w-3 animate-spin text-primary" /><span className="text-[8px] font-black uppercase text-muted-foreground">Scouting Fields...</span></div>
                              ) : (
                                allFields?.filter(field => field.facilityId === f.id).map(field => {
                                  const fid = `${f.id}:${field.name}`;
                                  return (
                                    <div key={fid} className="flex items-center space-x-3 p-2.5 bg-muted/20 rounded-xl hover:bg-primary/5 transition-colors group">
                                      <Checkbox id={`field-${fid}`} checked={selectedFieldIds.includes(fid)} onCheckedChange={() => toggleField(f.id, field.name)} className="h-4 w-4 rounded-md" />
                                      <Label htmlFor={`field-${fid}`} className="text-[10px] font-bold uppercase cursor-pointer opacity-70 group-hover:opacity-100">{field.name}</Label>
                                    </div>
                                  );
                                })
                              )}
                            </CollapsibleContent>
                          </Collapsible>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3 border-t pt-4">
                      <p className="text-[9px] font-black uppercase text-muted-foreground ml-1">Add Manual Resource</p>
                      <div className="flex gap-2">
                        <Input placeholder="e.g. Field 4 or Main Gym" value={manualLocInput} onChange={e => setManualLocInput(e.target.value)} className="h-10 rounded-xl border-2 text-xs font-bold" />
                        <Button type="button" onClick={() => { if(manualLocInput.trim()) { setManualLocations(p => [...p, manualLocInput.trim()]); setManualLocInput(''); } }} className="h-10 px-4 rounded-xl font-black text-[10px] uppercase">Add</Button>
                      </div>
                    </div>
                    <div className="space-y-3 border-t pt-4">
                      <p className="text-[9px] font-black uppercase text-primary ml-1">Active Pool Ledger</p>
                      <div className="flex flex-wrap gap-2">
                        {poolResources.map((res) => (
                          <Badge key={res.id} className="bg-primary text-white h-8 px-3 flex items-center gap-2 rounded-lg border-none">
                            {res.label}
                            <button onClick={() => {
                              if (res.id.startsWith('manual:')) setManualLocations(p => p.filter(l => l !== res.label));
                              else if (res.id.startsWith('fac:')) toggleFacility(res.id.split(':')[1]);
                              else if (res.id.startsWith('field:')) setSelectedFieldIds(p => p.filter(id => id !== res.id.split('field:')[1]));
                            }}><X className="h-3.5 w-3.5" /></button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 border-t pt-4">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Primary Display Location</Label>
                      <Select value={poolResources.find(r => r.label === newLocation)?.id || 'manual'} onValueChange={v => { if (v !== 'manual') { const res = poolResources.find(r => r.id === v); if (res) setNewLocation(res.label); } }}>
                        <SelectTrigger className="h-11 rounded-xl border-2 bg-white font-bold"><SelectValue placeholder="Pick from pool..." /></SelectTrigger>
                        <SelectContent className="rounded-xl"><SelectItem value="manual" className="font-bold italic">Manual / Override</SelectItem>{poolResources.map(r => <SelectItem key={r.id} value={r.id} className="font-bold">{r.label}</SelectItem>)}</SelectContent>
                      </Select>
                      {(newLocation === '' || !poolResources.find(r => r.label === newLocation)) && (<Input placeholder="Type display location..." value={newLocation} onChange={e => setNewLocation(e.target.value)} className="h-10 mt-2 rounded-xl border-2 bg-white font-bold" />)}
                    </div>
                  </div>
                </div>
                {isTournamentMode && (
                  <div className="space-y-6">
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Participating Squads (Comma Separated)</Label><Textarea placeholder="e.g. Warriors, Elite, Knights..." value={newTournamentTeams} onChange={e => setNewTournamentTeams(e.target.value)} className="rounded-xl min-h-[80px] border-2 font-bold" /></div>
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Tournament Waiver Text</Label><Textarea placeholder="Define participation terms..." value={newWaiverText} onChange={e => setNewWaiverText(e.target.value)} className="rounded-xl min-h-[120px] border-2 font-medium bg-muted/10" /></div>
                  </div>
                )}
                <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">Event Brief</Label><Textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} className="rounded-xl min-h-[100px] border-2 font-medium" /></div>
              </div>
            </div>
          </div>
          <div className="p-8 bg-background border-t shrink-0 flex items-center justify-center gap-4 relative z-20">
            <Button variant="outline" className="h-16 px-10 rounded-2xl font-black uppercase tracking-widest text-xs border-2" onClick={() => setIsCreateOpen(false)}>Cancel & Close</Button>
            <Button className="flex-1 max-w-2xl h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={handleCreateEvent}>{isTournamentMode ? "Launch Tournament" : "Commit Activity"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <section className="space-y-4">
        <div className="flex items-center justify-between px-2"><h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Itinerary</h2><div className="flex bg-muted/50 p-1 rounded-xl border shadow-inner"><Button variant={filterMode === 'live' ? 'default' : 'ghost'} size="sm" onClick={() => setFilterMode('live')} className="h-8 rounded-lg font-black text-[10px] uppercase">Live</Button><Button variant={filterMode === 'past' ? 'default' : 'ghost'} size="sm" onClick={() => setFilterMode('past')} className="h-8 rounded-lg font-black text-[10px] uppercase">History</Button></div></div>
        <div className="grid gap-4">
          {filteredEvents.map((event) => {
            const { month, day } = getCardDateDisplay(event);
            return (
              <EventDetailDialog key={event.id} event={event} updateRSVP={updateRSVP} formatTime={formatTime} isAdmin={isAdmin} onEdit={handleEdit} onDelete={deleteEvent} facilities={facilities || []} allFields={allFields || []}>
                <Card className="hover:border-primary/30 transition-all duration-500 cursor-pointer group rounded-3xl border-none shadow-md ring-1 ring-black/5 overflow-hidden bg-white">
                  <div className="flex items-stretch h-32">
                    <div className={cn("w-24 lg:w-32 flex flex-col items-center justify-center border-r-2 shrink-0 px-2 text-center", event.isTournament ? "bg-black text-white" : EVENT_TYPE_COLORS[event.eventType || 'other'])}>
                      <span className="text-[9px] font-black uppercase opacity-60 leading-none mb-1">{month}</span>
                      <span className={cn("font-black tracking-tighter leading-none", day.includes('-') ? "text-xl lg:text-2xl" : "text-3xl lg:text-4xl")}>{day}</span>
                    </div>
                    <div className="flex-1 p-6 flex flex-col justify-center min-w-0">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex gap-2 mb-1.5"><Badge className="text-[7px] uppercase font-black">{event.isTournament ? 'Elite Tournament' : (event.eventType || 'Activity')}</Badge><Badge variant="outline" className="text-[7px] uppercase font-black text-primary border-primary/20">{formatDateRange(event.date, event.endDate)}</Badge><Badge variant="outline" className="text-[7px] uppercase font-black">{event.startTime}</Badge></div>
                          <h3 className="text-xl font-black tracking-tight leading-none truncate group-hover:text-primary transition-colors">{event.title}</h3>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1 mt-1"><MapPin className="h-3 w-3 text-primary" /> {event.location}</p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-primary opacity-20 group-hover:opacity-100 group-hover:translate-x-1 transition-all mt-2" />
                      </div>
                    </div>
                  </div>
                </Card>
              </EventDetailDialog> 
            );
          })}
        </div>
      </section>
    </div>
  );
}
