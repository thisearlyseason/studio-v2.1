
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  isToday,
  isWithinInterval,
  startOfDay,
  endOfDay
} from 'date-fns';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Filter, 
  LayoutGrid, 
  List, 
  MapPin, 
  Clock, 
  X,
  Info,
  CalendarDays,
  Users,
  Shield,
  Trophy,
  Zap,
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Download,
  Trash2,
  Plus,
  ExternalLink,
  FileSignature,
  Loader2,
  Eye
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTeam, TeamEvent, EventType } from '@/components/providers/team-provider';
import { downloadICS } from '@/lib/calendar-utils';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  Dialog, 
  DialogContent, 
  DialogTitle
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeatherPulse } from '@/components/WeatherPulse';

const EVENT_TYPE_COLORS: Record<EventType, string> = {
  game: 'bg-primary border-primary text-white',
  practice: 'bg-emerald-600 border-emerald-600 text-white',
  meeting: 'bg-amber-500 border-amber-500 text-white',
  tournament: 'bg-black border-black text-white',
  other: 'bg-slate-600 border-slate-600 text-white',
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

function EventItem({ event, teams, onClick }: { event: TeamEvent, teams: any[], onClick: () => void }) {
  const team = teams.find(t => t.id === event.teamId);
  return (
    <Card 
      className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 hover:shadow-lg transition-all cursor-pointer overflow-hidden group bg-white"
      onClick={onClick}
    >
      <div className={cn("h-1.5 w-full", EVENT_TYPE_COLORS[event.eventType || 'other'])} />
      <CardContent className="p-4 flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-muted/30 flex items-center justify-center shrink-0 border">
          <Avatar className="h-8 w-8 rounded-lg">
            <AvatarImage src={team?.teamLogoUrl} />
            <AvatarFallback className="font-black text-[10px] bg-white">{team?.name?.[0] || 'T'}</AvatarFallback>
          </Avatar>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-[7px] font-black uppercase px-1.5 h-4 border-none bg-muted/50">{event.eventType}</Badge>
            <span className="text-[10px] font-bold text-muted-foreground uppercase">{event.startTime}</span>
            {event.isLeagueGame && (
              <Badge className={cn("text-[7px] font-black uppercase px-1.5 h-4 border-none", event.isHome ? "bg-primary text-white" : "bg-black text-white")}>
                {event.isHome ? 'HOME' : 'AWAY'}
              </Badge>
            )}
          </div>
          <h4 className="font-black text-sm uppercase truncate group-hover:text-primary transition-colors text-foreground">{event.title}</h4>
          <p className="text-[9px] font-medium text-muted-foreground truncate uppercase flex items-center gap-1 mt-1"><MapPin className="h-2 w-2" /> {event.location}</p>
        </div>
      </CardContent>
    </Card>
  );
}



function EventDetailDialog({ event, isOpen, onOpenChange }: { event: TeamEvent | null, isOpen: boolean, onOpenChange: (open: boolean) => void }) {
  const { updateRSVP, user, myChildren, isParent, members, teams, getMember } = useTeam();
  const [pendingStatus, setPendingStatus] = useState<Record<string, string>>({});

  if (!event) return null;

  const handleRSVP = async (participantId: string, status: string) => {
    setPendingStatus(prev => ({ ...prev, [participantId]: status }));
    try {
      await updateRSVP(event.id, status, event.teamId, participantId);
    } finally {
      // Clear pending status after a short delay to allow Firestore to sync
      setTimeout(() => {
        setPendingStatus(prev => {
          const next = { ...prev };
          delete next[participantId];
          return next;
        });
      }, 1000);
    }
  };

  const team = teams.find(t => t.id === event.teamId);
  const relevantParticipants = [
    { id: user?.id, name: 'You', isChild: false },
    ...(isParent ? (myChildren || []).filter(c => c.joinedTeamIds?.includes(event.teamId)).map(c => ({ id: c.id, name: c.firstName, isChild: true })) : [])
  ];

  const attendees = Object.entries(event.userRsvps || {}).map(([uid, status]) => {
    const member = getMember(uid);
    return { name: member?.name || 'Unknown', status, avatar: member?.avatar, position: member?.position };
  });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl p-0 sm:rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white text-foreground flex flex-col h-[90vh] sm:h-auto sm:max-h-[85vh]">
        <DialogTitle className="sr-only">Event Details: {event.title}</DialogTitle>
        <div className="flex flex-col lg:flex-row h-full overflow-hidden">
          {/* LEFT PANEL: ELITE STATUS & RSVP */}
          <div className="w-full lg:w-2/5 flex flex-col text-white bg-black p-8 relative shrink-0">
            <div className="absolute top-0 right-0 p-8 opacity-10 -rotate-12 pointer-events-none">
              <Zap className="h-48 w-48" />
            </div>
            
            <div className="space-y-6 relative z-10 overflow-y-auto custom-scrollbar pr-2">
              <div className="flex gap-2 mb-4">
                <Badge className="uppercase font-black tracking-widest text-[9px] h-6 px-3 bg-primary text-white border-none">{(event.eventType || 'other').toUpperCase()}</Badge>
                {event.isLeagueGame && (
                  <Badge className={cn("uppercase font-black tracking-widest text-[9px] h-6 px-3 border-none", event.isHome ? "bg-white text-black" : "bg-primary/20 text-white")}>
                    {event.isHome ? 'HOME' : 'AWAY'}
                  </Badge>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase text-primary tracking-[0.3em]">{team?.name || 'SQUAD OPERATIONS'}</p>
                <h2 className="text-4xl font-black tracking-tighter leading-tight uppercase italic">{event.title}</h2>
              </div>

              <div className="bg-white/5 p-5 rounded-[2rem] border border-white/10 space-y-4 font-bold text-sm shadow-inner mt-8">
                <div className="flex items-center gap-4 text-white/80"><CalendarDays className="h-5 w-5 text-primary" />{formatDateRange(event.date, event.endDate)}</div>
                <div className="flex items-center gap-4 text-white/80"><Clock className="h-5 w-5 text-primary" />{event.startTime}</div>
                <div className="flex items-center gap-4 text-white/80"><MapPin className="h-5 w-5 text-primary" /><span className="truncate">{event.location}</span></div>
              </div>
              
              <div className="pt-8 border-t border-white/10 space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Deployment RSVP</p>
                  <Badge variant="outline" className="border-white/10 text-white/40 font-black text-[8px] h-5 uppercase">Tactical Status</Badge>
                </div>
                
                <div className="space-y-4">
                  {relevantParticipants.map((p) => {
                    const currentRsvp = pendingStatus[p.id || ''] || event.userRsvps?.[p.id || ''] || 'no_response';
                    const isPending = !!pendingStatus[p.id || ''];

                    return (
                      <div key={p.id || 'you'} className="space-y-4 p-5 bg-white/5 rounded-[2rem] border border-white/10 group hover:border-white/20 transition-all">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black uppercase text-primary tracking-widest flex items-center gap-2">
                            <span className={cn("h-1.5 w-1.5 rounded-full bg-primary inline-block", isPending && "animate-ping")} />
                            {p.name === 'You' ? 'Your RSVP' : `${p.name}'s RSVP`}
                          </span>
                          <Badge className={cn(
                            "text-[8px] font-black uppercase border-none h-5 px-3 shadow-lg transition-colors", 
                            currentRsvp === 'going' ? "bg-green-500 text-white" : 
                            currentRsvp === 'maybe' ? "bg-amber-400 text-black" : 
                            (currentRsvp === 'declined' || currentRsvp === 'no') ? "bg-red-500 text-white" : 
                            "bg-white/10 text-white/40"
                          )}>
                            {isPending && <Loader2 className="h-2 w-2 animate-spin mr-1 inline" />}
                            {currentRsvp === 'no' ? 'DECLINED' : currentRsvp.replace('_', ' ').toUpperCase()}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          <Button 
                            variant="outline" 
                            disabled={isPending}
                            className={cn(
                              "h-12 rounded-2xl font-black text-xs uppercase transition-all tracking-widest border-2", 
                              currentRsvp === 'going' ? "bg-green-600 border-none text-white shadow-xl shadow-green-600/20 active:scale-95" : "bg-white/5 border-white/10 hover:border-green-500/50 hover:bg-green-500/5"
                            )} 
                            onClick={() => handleRSVP(p.id!, 'going')}
                          >
                            Going
                          </Button>
                          <div className="grid grid-cols-2 gap-2">
                            <Button 
                              variant="outline" 
                              disabled={isPending}
                              className={cn(
                                "h-11 rounded-2xl font-black text-[10px] uppercase transition-all tracking-widest border-2", 
                                currentRsvp === 'maybe' ? "bg-amber-400 text-black border-none shadow-lg shadow-amber-400/20 active:scale-95" : "bg-white/5 border-white/10 hover:border-amber-400/50 hover:bg-amber-400/5"
                              )} 
                              onClick={() => handleRSVP(p.id!, 'maybe')}
                            >
                              Maybe
                            </Button>
                            <Button 
                              variant="outline" 
                              disabled={isPending}
                              className={cn(
                                "h-11 rounded-2xl font-black text-[10px] uppercase transition-all tracking-widest border-2", 
                                (currentRsvp === 'declined' || currentRsvp === 'no') ? "bg-red-600 text-white border-none shadow-lg shadow-red-600/20 active:scale-95" : "bg-white/5 border-white/10 hover:border-red-500/50 hover:bg-red-500/5"
                              )} 
                              onClick={() => handleRSVP(p.id!, 'declined')}
                            >
                              Decline
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: TABS & INTELLIGENCE */}
          <div className="flex-1 bg-white overflow-hidden flex flex-col h-full">
            <Tabs defaultValue="brief" className="flex flex-col h-full">
              <div className="px-8 pt-8 shrink-0">
                <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1.5 rounded-[1.5rem] border shadow-inner h-14">
                  <TabsTrigger value="brief" className="rounded-xl font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-md">Brief</TabsTrigger>
                  <TabsTrigger value="matches" className="rounded-xl font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-md" disabled={!event.isTournament}>Matches</TabsTrigger>
                  <TabsTrigger value="roster" className="rounded-xl font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-md">Attendance</TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar px-8 pb-8 pt-4">
                <TabsContent value="brief" className="space-y-8 mt-0 animate-in fade-in duration-300">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-2 rounded-xl text-primary"><Info className="h-5 w-5" /></div>
                      <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Mission Parameters</h3>
                    </div>
                    <div className="bg-muted/30 p-8 rounded-[2.5rem] border-2 border-dashed">
                      <p className="text-base font-medium text-foreground/80 leading-relaxed italic">
                        "{event.description || 'No specific coordination notes provided for this deployment.'}"
                      </p>
                    </div>
                  </div>

                  <WeatherPulse location={event.location} />
                </TabsContent>

                <TabsContent value="matches" className="space-y-6 mt-0 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-2 rounded-xl text-primary"><Trophy className="h-5 w-5" /></div>
                      <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Competition Itinerary</h3>
                    </div>
                    <Badge variant="outline" className="font-black text-[9px] border-primary/20 text-primary uppercase h-6 px-3">{event.tournamentGames?.length || 0} Matches</Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {event.tournamentGames?.map((game: any) => (
                      <Card key={game.id} className="rounded-[2rem] border-none shadow-sm ring-1 ring-black/5 bg-white overflow-hidden p-6 space-y-4 transition-all hover:shadow-md group">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge className="bg-black text-white border-none text-[8px] font-black uppercase px-2.5 h-6 tracking-widest">{game.time}</Badge>
                            {game.round && <Badge variant="outline" className="bg-muted text-foreground border-none text-[8px] font-black uppercase px-3 h-5">{game.round}</Badge>}
                          </div>
                          {game.isCompleted && (
                            <div className="flex items-center gap-1.5">
                              <div className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse" />
                              <span className="text-[10px] font-black text-foreground uppercase tracking-wider">Final Intelligence</span>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-7 items-center gap-4 text-center">
                          <div className="col-span-3 min-w-0">
                            <p className="font-black text-[10px] uppercase truncate opacity-50 mb-1">{game.team1}</p>
                            <p className={cn("text-3xl font-black tracking-tighter", game.isCompleted && game.score1 > game.score2 ? "text-primary scale-110" : "text-foreground")}>{game.score1}</p>
                          </div>
                          <div className="col-span-1 opacity-10 font-black text-xs uppercase italic">vs</div>
                          <div className="col-span-3 min-w-0">
                            <p className="font-black text-[10px] uppercase truncate opacity-50 mb-1">{game.team2}</p>
                            <p className={cn("text-3xl font-black tracking-tighter", game.isCompleted && game.score2 > game.score1 ? "text-primary scale-110" : "text-foreground")}>{game.score2}</p>
                          </div>
                        </div>
                        {game.location && (
                          <div className="pt-4 border-t border-muted/50 flex items-center justify-center gap-2 group-hover:scale-105 transition-transform">
                            <MapPin className="h-3 w-3 text-primary opacity-50" />
                            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{game.location}</span>
                          </div>
                        )}
                      </Card>
                    ))}
                    {(!event.tournamentGames || event.tournamentGames.length === 0) && (
                      <div className="text-center py-20 bg-muted/10 rounded-[2.5rem] border-2 border-dashed opacity-30">
                        <Trophy className="h-12 w-12 mx-auto mb-4" />
                        <p className="text-[10px] font-black uppercase tracking-widest italic">Squad match logistics pending deployment.</p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="roster" className="space-y-6 mt-0 animate-in fade-in duration-300">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-xl text-primary"><Users className="h-5 w-5" /></div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Attendance Pulse</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {attendees.length > 0 ? attendees.map((att, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 bg-muted/20 rounded-2xl border transition-all hover:bg-white hover:shadow-sm">
                        <span className="text-[10px] font-black uppercase truncate text-foreground pr-2">{att.name}</span>
                        <Badge className={cn(
                          "text-[7px] font-black uppercase border-none h-5 px-2 tracking-widest",
                          att.status === 'going' ? "bg-green-600 text-white" : 
                          att.status === 'maybe' ? "bg-amber-400 text-black" : 
                          (att.status === 'declined' || att.status === 'no') ? "bg-red-600 text-white" : 
                          "bg-muted text-muted-foreground"
                        )}>
                          {att.status === 'no' ? 'DECLINED' : att.status.toUpperCase()}
                        </Badge>
                      </div>
                    )) : (
                      <div className="col-span-full py-20 text-center opacity-30 italic text-[10px] font-black uppercase">No squad responses recorded.</div>
                    )}
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MasterCalendarPage() {
  const { teams, householdEvents, activeTeamEvents, isParent, activeTeam, db, updateRSVP } = useTeam();
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedEventTypes, setSelectedEventTypes] = useState<EventType[]>(['game', 'practice', 'tournament', 'meeting', 'other']);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeDetailedEventId, setActiveDetailedEventId] = useState<string | null>(null);

  // TACTICAL SYNC: Merge household events with the high-reliability active team stream
  const allEvents = useMemo(() => {
    const map = new Map<string, TeamEvent>();
    [...(householdEvents || []), ...(activeTeamEvents || [])].forEach(e => {
      map.set(e.id, e);
    });
    return Array.from(map.values());
  }, [householdEvents, activeTeamEvents]);

  const activeDetailedEvent = useMemo(() => {
    if (!activeDetailedEventId) return null;
    return allEvents.find(e => e.id === activeDetailedEventId) || null;
  }, [allEvents, activeDetailedEventId]);

  const discoveryTeamIds = useMemo(() => {
    const fromTeams = (teams || []).map(t => t.id);
    const fromEvents = allEvents.map(e => e.teamId);
    return Array.from(new Set([...fromTeams, ...fromEvents]));
  }, [teams, allEvents]);

  useEffect(() => {
    if (discoveryTeamIds.length > 0 && selectedTeamIds.length === 0) {
      setSelectedTeamIds(discoveryTeamIds);
    }
  }, [discoveryTeamIds, selectedTeamIds.length]);

  const filteredEvents = useMemo(() => {
    return allEvents.filter(event => {
      const matchesTeam = selectedTeamIds.includes(event.teamId);
      const matchesType = selectedEventTypes.includes(event.eventType as EventType || 'other');
      const matchesSearch = (event.title || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchesTeam && matchesType && matchesSearch;
    });
  }, [allEvents, selectedTeamIds, selectedEventTypes, searchTerm]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const eventsByDay = useMemo(() => {
    const map: Record<string, TeamEvent[]> = {};
    if (!Array.isArray(filteredEvents)) return map;
    
    calendarDays.forEach(day => {
      const dayKey = format(day, 'yyyy-MM-dd');
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);

      filteredEvents.forEach(event => {
        const start = startOfDay(new Date(event.date));
        const end = event.endDate ? startOfDay(new Date(event.endDate)) : start;
        
        if (isWithinInterval(dayStart, { start, end }) || isWithinInterval(dayEnd, { start, end })) {
          if (!map[dayKey]) map[dayKey] = [];
          map[dayKey].push(event);
        }
      });
    });
    return map;
  }, [filteredEvents, calendarDays]);

  const selectedDayEvents = useMemo(() => {
    if (!selectedDay) return [];
    return eventsByDay[format(selectedDay, 'yyyy-MM-dd')] || [];
  }, [selectedDay, eventsByDay]);

  const nextTournament = useMemo(() => {
    return allEvents
      .filter(e => e.isTournament || e.eventType === 'game')
      .filter(e => new Date(e.date) >= startOfDay(new Date()))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  }, [allEvents]);

  return (
    <div className="space-y-12 pb-32">
      {/* ELITE UPGRADE: COMPETITION SPOTLIGHT */}
      {nextTournament && (
        <div className="relative group overflow-hidden rounded-[3rem] border-2 shadow-2xl bg-black text-white p-10 flex flex-col md:flex-row items-center justify-between gap-10">
          <div className="absolute top-0 right-0 p-12 opacity-5 -rotate-12 group-hover:scale-110 transition-transform duration-1000">
             <Trophy className="h-64 w-64" />
          </div>
          <div className="relative z-10 space-y-6 flex-1">
             <div className="flex items-center gap-3">
               <Badge className="bg-primary text-white border-none font-black tracking-widest text-[10px] h-7 px-4 shadow-lg shadow-primary/20">NEXT FOCUS</Badge>
               <div className="flex items-center gap-2 text-white/40 font-black uppercase text-[10px] tracking-widest bg-white/5 px-3 py-1 rounded-full">
                  <Zap className="h-3 w-3 text-amber-500" /> High Intensity Conflict
               </div>
             </div>
             <div>
               <h3 className="text-4xl md:text-5xl font-black uppercase tracking-tighter leading-tight italic">{nextTournament.title}</h3>
               <div className="flex flex-wrap items-center gap-6 mt-4 opacity-70">
                 <div className="flex items-center gap-2 text-sm font-bold uppercase"><CalendarDays className="h-4 w-4" /> {formatDateRange(nextTournament.date, nextTournament.endDate)}</div>
                 <div className="flex items-center gap-2 text-sm font-bold uppercase"><MapPin className="h-4 w-4" /> {nextTournament.location}</div>
               </div>
             </div>
          </div>
          <div className="relative z-10 w-full md:w-auto shrink-0 flex flex-col items-center justify-center p-8 bg-white/5 backdrop-blur-xl rounded-[2.5rem] border border-white/10 ring-1 ring-white/5 space-y-4">
             <div className="text-center">
               <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Status Report</p>
               <p className="text-3xl font-black leading-none uppercase">Confirmed</p>
             </div>
              <Button className="w-full h-14 rounded-2xl bg-white text-black hover:bg-white/90 font-black uppercase text-xs tracking-widest shadow-xl px-10" onClick={() => setActiveDetailedEventId(nextTournament.id)}>
                Examine Intel <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">{isParent ? "Household Hub" : "Squad Operations"}</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tight text-foreground">Master Calendar</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-muted/50 p-1 rounded-xl border-2 flex items-center shadow-inner">
            <Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('grid')} className="h-9 px-4 rounded-lg font-black text-[10px] uppercase"><LayoutGrid className="h-3.5 w-3.5 mr-2" /> Grid</Button>
            <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('list')} className="h-9 px-4 rounded-lg font-black text-[10px] uppercase"><List className="h-3.5 w-3.5 mr-2" /> Agenda</Button>
          </div>
          <Popover>
            <PopoverTrigger asChild><Button variant="outline" className="rounded-xl h-11 border-2 font-black uppercase text-[10px] tracking-widest gap-2 text-foreground"><Filter className="h-4 w-4" /> Filters</Button></PopoverTrigger>
            <PopoverContent className="w-80 rounded-2xl shadow-2xl p-6" align="end">
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Squad Enrollment</p>
                <ScrollArea className="h-48">
                  <div className="space-y-2">
                    {discoveryTeamIds.map(tid => (
                      <div key={tid} className="flex items-center space-x-3 p-2 hover:bg-muted/5 rounded-lg transition-colors cursor-pointer" onClick={() => setSelectedTeamIds(prev => prev.includes(tid) ? prev.filter(id => id !== tid) : [...prev, tid])}>
                        <Checkbox checked={selectedTeamIds.includes(tid)} onCheckedChange={() => {}} />
                        <Label className="text-xs font-bold truncate uppercase text-foreground">{teams.find(t => t.id === tid)?.name || `Team ${tid.slice(-4)}`}</Label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white">
        <div className="bg-black text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-primary p-2 rounded-xl text-white shadow-lg"><CalendarIcon className="h-5 w-5" /></div>
            <h2 className="text-2xl font-black uppercase tracking-tight">{format(currentDate, 'MMMM yyyy')}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="text-white hover:bg-white/10 rounded-full"><ChevronLeft className="h-6 w-6" /></Button>
            <Button variant="ghost" size="sm" onClick={() => { setCurrentDate(new Date()); setSelectedDay(new Date()); }} className="text-white hover:bg-white/10 font-black uppercase text-[10px] tracking-widest px-4 rounded-full">Today</Button>
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="text-white hover:bg-white/10 rounded-full"><ChevronRight className="h-6 w-6" /></Button>
          </div>
        </div>

        <CardContent className="p-0">
          {viewMode === 'grid' ? (
            <div className="flex flex-col">
              <div className="grid grid-cols-7 border-b bg-muted/10">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="py-4 text-center text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground border-r last:border-r-0">{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 grid-rows-5 auto-rows-fr min-h-[600px]">
                {calendarDays.map((day, i) => {
                  const dayKey = format(day, 'yyyy-MM-dd');
                  const dayEvents = eventsByDay[dayKey] || [];
                  const isCurrentMonth = isSameMonth(day, monthStart);
                  const isTodayDate = isToday(day);
                  const isSelected = selectedDay && isSameDay(day, selectedDay);

                  return (
                    <div key={i} className={cn("p-2 border-r border-b min-h-[120px] transition-all cursor-pointer relative", !isCurrentMonth ? "bg-muted/5 opacity-30" : "bg-white", isTodayDate && "bg-primary/[0.02]", isSelected && "bg-primary/[0.05] ring-2 ring-inset ring-primary/20")} onClick={() => setSelectedDay(day)}>
                      <div className="flex justify-between items-center mb-2">
                        <span className={cn("h-7 w-7 flex items-center justify-center rounded-full text-xs font-black transition-all", isTodayDate ? "bg-primary text-white" : (isSelected ? "bg-black text-white" : "text-muted-foreground"))}>{format(day, 'd')}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {dayEvents.map(event => (
                          <div 
                            key={event.id} 
                            className={cn(
                              "p-1 rounded-md flex items-center justify-center shrink-0 border border-white/10",
                              EVENT_TYPE_COLORS[event.eventType as EventType || 'other']
                            )}
                            title={`${event.startTime} - ${event.title}`}
                          >
                            {event.isTournament ? <Trophy className="h-3 w-3" /> : (event.eventType === 'game' ? <Activity className="h-3 w-3" /> : <div className="h-3 w-3 rounded-full border-2 border-white/50" />)}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="p-8 border-t bg-muted/5 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black uppercase tracking-tight text-foreground">{selectedDay ? format(selectedDay, 'EEEE, MMMM do') : 'Select a day'}</h3>
                  <Badge variant="outline" className="font-black text-[10px] uppercase text-foreground">{selectedDayEvents.length} Events</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {selectedDayEvents.map(event => <EventItem key={event.id} event={event} teams={teams} onClick={() => setActiveDetailedEventId(event.id)} />)}
                </div>
              </div>
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="p-6 space-y-10">
                {Object.entries(eventsByDay).sort(([a], [b]) => a.localeCompare(b)).map(([dayKey, dayEvents]) => (
                  <div key={dayKey} className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="text-center w-12 shrink-0">
                        <p className="text-[10px] font-black uppercase text-primary leading-none">{format(new Date(dayKey), 'MMM')}</p>
                        <p className="text-3xl font-black tracking-tighter text-foreground">{format(new Date(dayKey), 'dd')}</p>
                      </div>
                      <div className="h-px bg-muted flex-1" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-4 md:ml-16">
                      {dayEvents.map(event => <EventItem key={event.id} event={event} teams={teams} onClick={() => setActiveDetailedEventId(event.id)} />)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <EventDetailDialog 
        event={activeDetailedEvent} 
        isOpen={!!activeDetailedEventId} 
        onOpenChange={(o) => !o && setActiveDetailedEventId(null)} 
      />
    </div>
  );
}
