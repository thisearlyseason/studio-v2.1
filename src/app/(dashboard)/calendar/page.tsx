
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
  addDays,
  startOfDay,
  isToday,
  isPast
} from 'date-fns';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Filter, 
  LayoutGrid, 
  List, 
  Trophy, 
  Zap, 
  Clock, 
  MapPin, 
  MoreVertical,
  CheckCircle2,
  Lock,
  Search,
  Users,
  ChevronRight as ChevronRightIcon
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTeam, TeamEvent, Team, EventType } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collectionGroup, query, where, orderBy, limit } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const EVENT_TYPE_COLORS: Record<EventType, string> = {
  game: 'bg-primary border-primary',
  practice: 'bg-emerald-600 border-emerald-600',
  meeting: 'bg-amber-500 border-amber-500',
  tournament: 'bg-black border-black',
  other: 'bg-slate-600 border-slate-600',
};

export default function MasterCalendarPage() {
  const { teams, user, isStaff, isPro, purchasePro } = useTeam();
  const db = useFirestore();
  const router = useRouter();
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedEventTypes, setSelectedEventTypes] = useState<EventType[]>(['game', 'practice', 'tournament', 'meeting', 'other']);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Sync team selection with available teams on mount
  useEffect(() => {
    if (teams.length > 0 && selectedTeamIds.length === 0) {
      setSelectedTeamIds(teams.map(t => t.id));
    }
  }, [teams, selectedTeamIds.length]);

  // Aggregate fetch for all squad events using collectionGroup
  const eventsQuery = useMemoFirebase(() => {
    if (!db || teams.length === 0) return null;
    const teamIds = teams.map(t => t.id);
    
    return query(
      collectionGroup(db, 'events'),
      where('teamId', 'in', teamIds.slice(0, 30)),
      orderBy('date', 'asc')
    );
  }, [db, teams]);

  const { data: rawEvents, isLoading } = useCollection<TeamEvent>(eventsQuery);
  const allEvents = useMemo(() => rawEvents || [], [rawEvents]);

  const filteredEvents = useMemo(() => {
    return allEvents.filter(event => {
      const matchesTeam = selectedTeamIds.includes(event.teamId);
      const matchesType = selectedEventTypes.includes(event.eventType || 'other');
      const matchesSearch = event.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           event.location.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesTeam && matchesType && matchesSearch;
    });
  }, [allEvents, selectedTeamIds, selectedEventTypes, searchTerm]);

  // Calendar Logic
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const eventsByDay = useMemo(() => {
    const map: Record<string, TeamEvent[]> = {};
    filteredEvents.forEach(event => {
      const dayKey = format(new Date(event.date), 'yyyy-MM-dd');
      if (!map[dayKey]) map[dayKey] = [];
      map[dayKey].push(event);
    });
    return map;
  }, [filteredEvents]);

  const toggleEventType = (type: EventType) => {
    setSelectedEventTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const toggleTeam = (tid: string) => {
    setSelectedTeamIds(prev => 
      prev.includes(tid) ? prev.filter(id => id !== tid) : [...prev, tid]
    );
  };

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  return (
    <div className="space-y-8 pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">Multi-Squad Intelligence</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tight">Master Calendar</h1>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Unified Operational Visibility</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-muted/50 p-1 rounded-xl border-2 flex items-center shadow-inner">
            <Button 
              variant={viewMode === 'grid' ? 'default' : 'ghost'} 
              size="sm" 
              onClick={() => setViewMode('grid')}
              className="h-9 px-4 rounded-lg font-black text-[10px] uppercase"
            >
              <LayoutGrid className="h-3.5 w-3.5 mr-2" /> Grid
            </Button>
            <Button 
              variant={viewMode === 'list' ? 'default' : 'ghost'} 
              size="sm" 
              onClick={() => setViewMode('list')}
              className="h-9 px-4 rounded-lg font-black text-[10px] uppercase"
            >
              <List className="h-3.5 w-3.5 mr-2" /> Agenda
            </Button>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="rounded-xl h-11 border-2 font-black uppercase text-[10px] tracking-widest gap-2">
                <Filter className="h-4 w-4" /> Filters
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 rounded-2xl shadow-2xl p-6 space-y-6" align="end">
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Squad Enrollment</p>
                <ScrollArea className="h-48 pr-2">
                  <div className="space-y-2">
                    {teams.map(team => (
                      <div key={team.id} className="flex items-center space-x-3 p-2 hover:bg-muted/50 rounded-lg transition-colors cursor-pointer" onClick={() => toggleTeam(team.id)}>
                        <Checkbox checked={selectedTeamIds.includes(team.id)} id={`team-${team.id}`} onCheckedChange={() => toggleTeam(team.id)} />
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-6 w-6 rounded-md shrink-0 border">
                            <AvatarImage src={team.teamLogoUrl} />
                            <AvatarFallback className="font-black text-[8px] bg-muted">{team.name[0]}</AvatarFallback>
                          </Avatar>
                          <Label htmlFor={`team-${team.id}`} className="text-xs font-bold truncate cursor-pointer uppercase">{team.name}</Label>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Activity Profile</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['game', 'practice', 'tournament', 'meeting', 'other'] as EventType[]).map(type => (
                    <div key={type} className="flex items-center space-x-2">
                      <Checkbox 
                        checked={selectedEventTypes.includes(type)} 
                        id={`type-${type}`} 
                        onCheckedChange={() => toggleEventType(type)} 
                      />
                      <Label htmlFor={`type-${type}`} className="text-[10px] font-bold uppercase cursor-pointer">{type}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-white">
        <div className="bg-black text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-primary p-2 rounded-xl text-white shadow-lg shadow-primary/20">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tight">{format(currentDate, 'MMMM yyyy')}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={prevMonth} className="text-white hover:bg-white/10 rounded-full h-10 w-10">
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date())} className="text-white hover:bg-white/10 font-black uppercase text-[10px] tracking-widest h-10 px-4 rounded-full">Today</Button>
            <Button variant="ghost" size="icon" onClick={nextMonth} className="text-white hover:bg-white/10 rounded-full h-10 w-10">
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
        </div>

        <CardContent className="p-0">
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-7 border-b bg-muted/10">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="py-4 text-center text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground border-r last:border-r-0">
                  {day}
                </div>
              ))}
            </div>
          ) : null}

          {viewMode === 'grid' ? (
            <div className="grid grid-cols-7 grid-rows-5 auto-rows-fr min-h-[600px]">
              {calendarDays.map((day, i) => {
                const dayKey = format(day, 'yyyy-MM-dd');
                const dayEvents = eventsByDay[dayKey] || [];
                const isCurrentMonth = isSameMonth(day, monthStart);
                const isTodayDate = isToday(day);

                return (
                  <div 
                    key={i} 
                    className={cn(
                      "p-2 border-r border-b min-h-[120px] transition-colors",
                      !isCurrentMonth ? "bg-muted/5 opacity-30" : "bg-white",
                      isTodayDate && "bg-primary/[0.02]"
                    )}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className={cn(
                        "h-7 w-7 flex items-center justify-center rounded-full text-xs font-black transition-all",
                        isTodayDate ? "bg-primary text-white shadow-lg" : "text-muted-foreground"
                      )}>
                        {format(day, 'd')}
                      </span>
                    </div>
                    <div className="space-y-1 overflow-y-auto max-h-[100px] custom-scrollbar">
                      {dayEvents.map(event => {
                        const team = teams.find(t => t.id === event.teamId);
                        const typeColor = EVENT_TYPE_COLORS[event.eventType || 'other'];
                        
                        return (
                          <button 
                            key={event.id}
                            className={cn(
                              "w-full text-left p-1.5 rounded-lg border-l-4 text-[9px] font-black uppercase tracking-tight truncate hover:scale-[1.02] transition-transform",
                              typeColor,
                              "bg-muted/30"
                            )}
                            onClick={() => router.push(`/events`)}
                          >
                            <span className="opacity-60 block text-[7px] leading-none mb-0.5">{team?.name}</span>
                            <span className="truncate">{event.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="p-6 space-y-10">
                {Object.entries(eventsByDay)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([dayKey, dayEvents]) => (
                    <div key={dayKey} className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="text-center w-12 shrink-0">
                          <p className="text-[10px] font-black uppercase text-primary leading-none">{format(new Date(dayKey), 'MMM')}</p>
                          <p className="text-3xl font-black tracking-tighter">{format(new Date(dayKey), 'dd')}</p>
                        </div>
                        <div className="h-px bg-muted flex-1" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-4 md:ml-16">
                        {dayEvents.map(event => {
                          const team = teams.find(t => t.id === event.teamId);
                          const typeColor = EVENT_TYPE_COLORS[event.eventType || 'other'];
                          
                          return (
                            <Card 
                              key={event.id} 
                              className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 hover:shadow-lg transition-all cursor-pointer overflow-hidden group"
                              onClick={() => router.push(`/events`)}
                            >
                              <div className={cn("h-1.5 w-full", typeColor)} />
                              <CardContent className="p-4 flex items-center gap-4">
                                <div className="h-12 w-12 rounded-xl bg-muted/30 flex items-center justify-center shrink-0 border">
                                  <Avatar className="h-8 w-8 rounded-lg">
                                    <AvatarImage src={team?.teamLogoUrl} />
                                    <AvatarFallback className="font-black text-[10px] bg-white">{team?.name?.[0]}</AvatarFallback>
                                  </Avatar>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="outline" className="text-[7px] font-black uppercase px-1.5 h-4 border-none bg-muted/50">{event.eventType}</Badge>
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase">{event.startTime}</span>
                                  </div>
                                  <h4 className="font-black text-sm uppercase truncate group-hover:text-primary transition-colors">{event.title}</h4>
                                  <p className="text-[9px] font-medium text-muted-foreground truncate uppercase flex items-center gap-1 mt-1">
                                    <MapPin className="h-2 w-2" /> {event.location}
                                  </p>
                                </div>
                                <ChevronRightIcon className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all shrink-0" />
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                {Object.keys(eventsByDay).length === 0 && !isLoading && (
                  <div className="text-center py-20 opacity-30 space-y-4">
                    <CalendarIcon className="h-16 w-16 mx-auto mb-2" />
                    <p className="text-sm font-black uppercase tracking-widest">No activities detected for selected filters.</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-primary/5 p-8 rounded-[2.5rem] border-2 border-dashed border-primary/20 space-y-4">
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-primary" />
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Strategic Overview</h4>
          </div>
          <p className="text-xs font-medium leading-relaxed italic text-muted-foreground">
            The Master Calendar synchronizes operational intelligence across all your squads. Use this hub to avoid scheduling conflicts and ensure elite resource allocation across your organization.
          </p>
        </div>

        <div className="bg-black p-8 rounded-[2.5rem] text-white flex items-center justify-between gap-6 group overflow-hidden relative">
          <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none -rotate-12 group-hover:scale-110 transition-transform duration-700">
            <Trophy className="h-32 w-32" />
          </div>
          <div className="relative z-10 space-y-2">
            <h4 className="text-xl font-black uppercase tracking-tight">Need more scale?</h4>
            <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest leading-relaxed">Upgrade to Club Suite to manage unlimited squads and facilities.</p>
          </div>
          <Button variant="secondary" className="relative z-10 rounded-full h-12 px-8 font-black uppercase text-[10px] tracking-widest bg-white text-black hover:bg-primary hover:text-white transition-all shadow-2xl" onClick={purchasePro}>Unlock Elite</Button>
        </div>
      </div>
    </div>
  );
}
