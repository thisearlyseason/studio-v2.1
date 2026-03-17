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
  Users
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTeam, TeamEvent, EventType } from '@/components/providers/team-provider';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  Dialog, 
  DialogContent, 
  DialogTitle, 
  DialogClose
} from '@/components/ui/dialog';

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
          </div>
          <h4 className="font-black text-sm uppercase truncate group-hover:text-primary transition-colors">{event.title}</h4>
          <p className="text-[9px] font-medium text-muted-foreground truncate uppercase flex items-center gap-1 mt-1"><MapPin className="h-2 w-2" /> {event.location}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EventDetailDialog({ event, isOpen, onOpenChange }: { event: TeamEvent | null, isOpen: boolean, onOpenChange: (open: boolean) => void }) {
  const { updateRSVP, user } = useTeam();
  if (!event) return null;

  const myRsvp = event.userRsvps?.[user?.id || ''] || 'no_response';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 sm:rounded-[2.5rem] border-none shadow-2xl overflow-hidden">
        <DialogTitle className="sr-only">Event Details: {event.title}</DialogTitle>
        <div className="flex flex-col lg:flex-row h-full">
          <div className="w-full lg:w-1/2 flex flex-col text-white bg-black p-8 relative">
            <div className="flex justify-between items-start mb-8 relative z-10">
              <Badge className="uppercase font-black tracking-widest text-[9px] h-6 px-3 bg-primary text-white border-none">{(event.eventType || 'other').toUpperCase()}</Badge>
              <DialogClose asChild><X className="h-5 w-5 text-white/40 cursor-pointer hover:text-white" /></DialogClose>
            </div>
            <div className="space-y-6 relative z-10">
              <h2 className="text-3xl font-black tracking-tighter leading-tight uppercase">{event.title}</h2>
              <div className="bg-white/10 p-4 rounded-2xl border border-white/10 space-y-3 font-bold text-sm">
                <div className="flex items-center gap-3"><CalendarDays className="h-4 w-4 text-primary" />{formatDateRange(event.date, event.endDate)}</div>
                <div className="flex items-center gap-3"><Clock className="h-4 w-4 text-primary" />{event.startTime}</div>
                <div className="flex items-center gap-3"><MapPin className="h-4 w-4 text-primary" /><span className="truncate">{event.location}</span></div>
              </div>
              <div className="pt-4 border-t border-white/10">
                <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em] mb-4">Tactical RSVP</p>
                <div className="grid grid-cols-1 gap-2">
                  <Button variant={myRsvp === 'going' ? 'default' : 'outline'} className={cn("h-12 rounded-xl font-black text-xs uppercase", myRsvp === 'going' ? "bg-primary border-none" : "bg-white/5 border-white/10")} onClick={() => updateRSVP(event.id, 'going')}>Going</Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant={myRsvp === 'maybe' ? 'default' : 'outline'} className={cn("h-12 rounded-xl font-black text-xs uppercase", myRsvp === 'maybe' ? "bg-amber-50" : "bg-white/5 border-white/10")} onClick={() => updateRSVP(event.id, 'maybe')}>Maybe</Button>
                    <Button variant={myRsvp === 'declined' ? 'default' : 'outline'} className={cn("h-12 rounded-xl font-black text-xs uppercase", myRsvp === 'declined' ? "bg-red-600" : "bg-white/5 border-white/10")} onClick={() => updateRSVP(event.id, 'declined')}>Decline</Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 p-8 bg-white space-y-6">
            <div className="flex items-center gap-3"><Info className="h-5 w-5 text-primary" /><h3 className="text-xs font-black uppercase tracking-widest">Event Brief</h3></div>
            <p className="text-sm font-medium text-muted-foreground leading-relaxed italic">"{event.description || 'No specific coordination notes provided.'}"</p>
            <div className="pt-6 border-t space-y-4">
              <div className="flex items-center gap-3"><Users className="h-5 w-5 text-primary" /><h3 className="text-xs font-black uppercase tracking-widest">Attendance Pulse</h3></div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(event.userRsvps || {}).map(([uid, status]) => (
                  <Badge key={uid} variant="outline" className={cn(
                    "text-[8px] font-black uppercase border-none h-6",
                    status === 'going' ? "bg-green-100 text-green-700" : status === 'maybe' ? "bg-amber-100 text-amber-700" : status === 'red-100 text-red-700"
                  )}>{status}</Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MasterCalendarPage() {
  const { teams, householdEvents, isParent } = useTeam();
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedEventTypes, setSelectedEventTypes] = useState<EventType[]>(['game', 'practice', 'tournament', 'meeting', 'other']);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeDetailedEvent, setActiveDetailedEvent] = useState<TeamEvent | null>(null);

  const discoveryTeamIds = useMemo(() => {
    const fromTeams = teams.map(t => t.id);
    const fromEvents = (householdEvents || []).map(e => e.teamId);
    return Array.from(new Set([...fromTeams, ...fromEvents]));
  }, [teams, householdEvents]);

  useEffect(() => {
    if (discoveryTeamIds.length > 0 && selectedTeamIds.length === 0) {
      setSelectedTeamIds(discoveryTeamIds);
    }
  }, [discoveryTeamIds, selectedTeamIds.length]);

  const filteredEvents = useMemo(() => {
    if (!householdEvents || !Array.isArray(householdEvents)) return [];
    return householdEvents.filter(event => {
      const matchesTeam = selectedTeamIds.includes(event.teamId);
      const matchesType = selectedEventTypes.includes(event.eventType as EventType || 'other');
      const matchesSearch = (event.title || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchesTeam && matchesType && matchesSearch;
    });
  }, [householdEvents, selectedTeamIds, selectedEventTypes, searchTerm]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const eventsByDay = useMemo(() => {
    const map: Record<string, TeamEvent[]> = {};
    
    // For each day, find events that are active on that day (including ranges)
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

  return (
    <div className="space-y-8 pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">{isParent ? "Household Hub" : "Squad Operations"}</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tight">Master Calendar</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-muted/50 p-1 rounded-xl border-2 flex items-center shadow-inner">
            <Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('grid')} className="h-9 px-4 rounded-lg font-black text-[10px] uppercase"><LayoutGrid className="h-3.5 w-3.5 mr-2" /> Grid</Button>
            <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('list')} className="h-9 px-4 rounded-lg font-black text-[10px] uppercase"><List className="h-3.5 w-3.5 mr-2" /> Agenda</Button>
          </div>
          <Popover>
            <PopoverTrigger asChild><Button variant="outline" className="rounded-xl h-11 border-2 font-black uppercase text-[10px] tracking-widest gap-2"><Filter className="h-4 w-4" /> Filters</Button></PopoverTrigger>
            <PopoverContent className="w-80 rounded-2xl shadow-2xl p-6" align="end">
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Squad Enrollment</p>
                <ScrollArea className="h-48">
                  <div className="space-y-2">
                    {discoveryTeamIds.map(tid => (
                      <div key={tid} className="flex items-center space-x-3 p-2 hover:bg-muted/5 rounded-lg transition-colors cursor-pointer" onClick={() => setSelectedTeamIds(prev => prev.includes(tid) ? prev.filter(id => id !== tid) : [...prev, tid])}>
                        <Checkbox checked={selectedTeamIds.includes(tid)} onCheckedChange={() => {}} />
                        <Label className="text-xs font-bold truncate uppercase">{teams.find(t => t.id === tid)?.name || `Team ${tid.slice(-4)}`}</Label>
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
                      <div className="space-y-1">
                        {dayEvents.map(event => (
                          <div key={event.id} className={cn("w-full h-1.5 rounded-full", EVENT_TYPE_COLORS[event.eventType as EventType || 'other'])} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="p-8 border-t bg-muted/5 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black uppercase tracking-tight">{selectedDay ? format(selectedDay, 'EEEE, MMMM do') : 'Select a day'}</h3>
                  <Badge variant="outline" className="font-black text-[10px] uppercase">{selectedDayEvents.length} Events</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {selectedDayEvents.map(event => <EventItem key={event.id} event={event} teams={teams} onClick={() => setActiveDetailedEvent(event)} />)}
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
                        <p className="text-3xl font-black tracking-tighter">{format(new Date(dayKey), 'dd')}</p>
                      </div>
                      <div className="h-px bg-muted flex-1" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-4 md:ml-16">
                      {dayEvents.map(event => <EventItem key={event.id} event={event} teams={teams} onClick={() => setActiveDetailedEvent(event)} />)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <EventDetailDialog event={activeDetailedEvent} isOpen={!!activeDetailedEvent} onOpenChange={(o) => !o && setActiveDetailedEvent(null)} />
    </div>
  );
}